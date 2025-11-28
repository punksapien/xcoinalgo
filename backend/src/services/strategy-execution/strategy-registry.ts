/**
 * Strategy Registry Service
 *
 * Maintains fast lookups: "Which strategies need BTC_USDT 5m candles?"
 * Uses Redis Sets for O(1) lookups with in-memory cache for super-fast access
 *
 * Pub/Sub Architecture:
 * - When a strategy is registered/unregistered, publishes event to Redis
 * - All backend processes subscribe and update their in-memory cache
 * - This keeps all processes in sync without restart
 */

import { redis } from '../../lib/redis-client'
import { PrismaClient } from '@prisma/client'
import Redis from 'ioredis'

const prisma = new PrismaClient()

// Create separate Redis subscriber client (required for pub/sub)
const redisSubscriber = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
})

interface CandleKey {
  symbol: string
  resolution: string
}

interface StrategyConfig {
  strategyId: string
  symbol: string
  resolution: string
}

interface StrategyRegistrationEvent {
  strategyId: string
  symbol: string
  resolution: string
}

class StrategyRegistry {
  // In-memory cache for ultra-fast lookups
  private cache: Map<string, Set<string>> = new Map()
  private initialized = false
  private pubSubInitialized = false

  /**
   * Initialize the registry from database on startup
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('Strategy registry already initialized')
      return
    }

    console.log('Initializing strategy registry from database...')

    try {
      // Get all active strategies with their execution config
      const strategies = await prisma.strategy.findMany({
        where: {
          isActive: true,
          subscriberCount: { gt: 0 }, // Only strategies with subscribers
        },
        select: {
          id: true,
          name: true,
          executionConfig: true,
        },
      })

      console.log(`Found ${strategies.length} active strategies`)

      // 🔧 AUTO-SYNC: Ensure all strategies have complete config before registration
      for (const strategy of strategies) {
        let config = strategy.executionConfig as any
        const needsSync = !config || !config.pair || !config.resolution

        if (needsSync) {
          console.warn(`⚠️  Strategy ${strategy.name} missing config. Auto-syncing from Python file...`)

          try {
            const fs = await import('fs')
            const path = await import('path')
            const { extractStrategyConfig } = await import('../../utils/strategy-config-extractor')

            const strategiesDir = path.join(__dirname, '../../../strategies')
            const strategyDir = path.join(strategiesDir, strategy.id)

            if (fs.existsSync(strategyDir)) {
              const files = fs.readdirSync(strategyDir)
              const pythonFile = files.find((f: string) => f.endsWith('.py'))

              if (pythonFile) {
                const pythonFilePath = path.join(strategyDir, pythonFile)
                const strategyCode = fs.readFileSync(pythonFilePath, 'utf8')
                const extraction = extractStrategyConfig(strategyCode)

                if (extraction.success && extraction.config) {
                  // Merge: Preserve admin-set values (like minMargin), use Python file for technical params
                  const extractedConfig = extraction.config
                  const existingConfig = (strategy.executionConfig as Record<string, any>) || {}

                  const mergedConfig = {
                    ...extractedConfig,     // Start with Python file defaults
                    ...existingConfig,      // Preserve admin-set values like minMargin
                  }

                  // Critical technical parameters MUST come from Python file (not overrideable)
                  const technicalParams = ['pair', 'resolution', 'margin_currency', 'base_resolution',
                                          'signal_resolution', 'exit_resolution', 'is_multi_resolution',
                                          'dema_len', 'rsi_len', 'rsi_ma_len', 'swing_lookback',
                                          'sl_pct', 'tp_pct', 'trailing_activation_pct', 'trailing_move_pct',
                                          'trailing_pct', 'commission_rate', 'gst_rate']

                  technicalParams.forEach(param => {
                    if (extractedConfig[param] !== undefined) {
                      mergedConfig[param] = extractedConfig[param]
                    }
                  })

                  // Update database with merged config
                  await prisma.strategy.update({
                    where: { id: strategy.id },
                    data: { executionConfig: mergedConfig }
                  })

                  config = mergedConfig
                  console.log(`✅ Auto-synced ${extraction.extractedParams.length} parameters, preserved admin overrides for ${strategy.name}`)
                } else {
                  console.error(`❌ Config extraction failed for ${strategy.name}`)
                }
              }
            }
          } catch (syncError) {
            console.error(`❌ Auto-sync failed for ${strategy.name}:`, syncError)
          }
        }

        // Sync config to Redis via settingsService
        if (config && Object.keys(config).length > 0) {
          const { settingsService } = await import('./settings-service')
          await settingsService.initializeStrategy(strategy.id, config, 1)
        }

        // Register strategy if has required fields
        const symbol = config?.symbol || config?.pair
        if (symbol && config?.resolution) {
          await this.registerStrategy(strategy.id, symbol, config.resolution)
        } else {
          console.error(`❌ Cannot register ${strategy.name} - missing pair/resolution even after sync`)
        }
      }

      this.initialized = true
      console.log('Strategy registry initialized successfully')

      // Initialize pub/sub for real-time updates
      await this.initializePubSub()
    } catch (error) {
      console.error('Failed to initialize strategy registry:', error)
      throw error
    }
  }

  /**
   * Initialize Redis pub/sub to listen for strategy registration events
   * This keeps all backend processes in sync without restart
   */
  private async initializePubSub(): Promise<void> {
    if (this.pubSubInitialized) {
      console.log('Pub/sub already initialized')
      return
    }

    try {
      console.log('🔔 Initializing strategy registry pub/sub...')

      // Subscribe to registration events
      await redisSubscriber.subscribe('strategy:register', 'strategy:unregister', (err, count) => {
        if (err) {
          console.error('❌ Failed to subscribe to strategy events:', err)
          return
        }
        console.log(`✅ Subscribed to ${count} channels for strategy events`)
      })

      // Handle incoming messages
      redisSubscriber.on('message', async (channel, message) => {
        try {
          const event: StrategyRegistrationEvent = JSON.parse(message)

          if (channel === 'strategy:register') {
            console.log(`🔔 Received strategy registration event: ${event.strategyId} for ${event.symbol}/${event.resolution}`)
            await this.handleRegisterEvent(event)
          } else if (channel === 'strategy:unregister') {
            console.log(`🔔 Received strategy unregistration event: ${event.strategyId} from ${event.symbol}/${event.resolution}`)
            await this.handleUnregisterEvent(event)
          }
        } catch (error) {
          console.error('❌ Error handling pub/sub message:', error)
        }
      })

      this.pubSubInitialized = true
      console.log('✅ Strategy registry pub/sub initialized')
    } catch (error) {
      console.error('❌ Failed to initialize pub/sub:', error)
      throw error
    }
  }

  /**
   * Handle strategy registration event from pub/sub
   */
  private async handleRegisterEvent(event: StrategyRegistrationEvent): Promise<void> {
    const candleKey = this.getCandleKey(event.symbol, event.resolution)

    // Update in-memory cache
    if (!this.cache.has(candleKey)) {
      this.cache.set(candleKey, new Set())
    }
    this.cache.get(candleKey)!.add(event.strategyId)

    console.log(`✅ Updated cache: Added ${event.strategyId} to ${candleKey}`)
  }

  /**
   * Handle strategy unregistration event from pub/sub
   */
  private async handleUnregisterEvent(event: StrategyRegistrationEvent): Promise<void> {
    const candleKey = this.getCandleKey(event.symbol, event.resolution)

    // Update in-memory cache
    this.cache.get(candleKey)?.delete(event.strategyId)

    // Clean up empty sets
    if (this.cache.get(candleKey)?.size === 0) {
      this.cache.delete(candleKey)
    }

    console.log(`✅ Updated cache: Removed ${event.strategyId} from ${candleKey}`)
  }

  /**
   * Register a strategy for a specific candle
   */
  async registerStrategy(
    strategyId: string,
    symbol: string,
    resolution: string
  ): Promise<void> {
    // ✅ VALIDATION: Prevent garbage data
    if (!strategyId || strategyId.trim() === '') {
      console.error('❌ Attempted to register strategy with empty/null ID - BLOCKED')
      throw new Error('Strategy ID cannot be empty')
    }
    if (!symbol || symbol.trim() === '') {
      console.error('❌ Attempted to register strategy with empty symbol - BLOCKED')
      throw new Error('Symbol cannot be empty')
    }
    if (!resolution || resolution.toString().trim() === '') {
      console.error('❌ Attempted to register strategy with empty resolution - BLOCKED')
      throw new Error('Resolution cannot be empty')
    }

    const candleKey = this.getCandleKey(symbol, resolution)

    try {
      // Add to Redis
      await redis.sadd(candleKey, strategyId)

      // Update in-memory cache (local process only)
      if (!this.cache.has(candleKey)) {
        this.cache.set(candleKey, new Set())
      }
      this.cache.get(candleKey)!.add(strategyId)

      // Store strategy config in Redis for quick access
      await redis.hset(`strategy:${strategyId}:config`, {
        symbol,
        resolution,
      })

      // 🔔 Publish event to notify other processes
      const event: StrategyRegistrationEvent = {
        strategyId,
        symbol,
        resolution
      }
      await redis.publish('strategy:register', JSON.stringify(event))

      console.log(`✅ Registered strategy ${strategyId} for ${symbol} ${resolution}`)
    } catch (error) {
      console.error(`Failed to register strategy ${strategyId}:`, error)
      throw error
    }
  }

  /**
   * Unregister a strategy from a specific candle
   */
  async unregisterStrategy(
    strategyId: string,
    symbol: string,
    resolution: string
  ): Promise<void> {
    const candleKey = this.getCandleKey(symbol, resolution)

    try {
      // Remove from Redis
      await redis.srem(candleKey, strategyId)

      // Update in-memory cache (local process only)
      this.cache.get(candleKey)?.delete(strategyId)

      // If no strategies left for this candle, clean up
      const count = await redis.scard(candleKey)
      if (count === 0) {
        await redis.del(candleKey)
        this.cache.delete(candleKey)
      }

      // Remove strategy config
      await redis.del(`strategy:${strategyId}:config`)

      // 🔔 Publish event to notify other processes
      const event: StrategyRegistrationEvent = {
        strategyId,
        symbol,
        resolution
      }
      await redis.publish('strategy:unregister', JSON.stringify(event))

      console.log(`✅ Unregistered strategy ${strategyId} from ${symbol} ${resolution}`)
    } catch (error) {
      console.error(`Failed to unregister strategy ${strategyId}:`, error)
      throw error
    }
  }

  /**
   * Get all strategies that need a specific candle
   * Uses in-memory cache for maximum speed
   */
  async getStrategiesForCandle(symbol: string, resolution: string): Promise<string[]> {
    const candleKey = this.getCandleKey(symbol, resolution)

    // Try in-memory cache first
    if (this.cache.has(candleKey)) {
      return Array.from(this.cache.get(candleKey)!)
    }

    // Fall back to Redis
    try {
      const strategies = await redis.smembers(candleKey)

      // Update cache
      this.cache.set(candleKey, new Set(strategies))

      return strategies
    } catch (error) {
      console.error(`Failed to get strategies for ${candleKey}:`, error)
      return []
    }
  }

  /**
   * Get all active candle combinations
   * Returns list of {symbol, resolution} that have registered strategies
   */
  async getActiveCandles(): Promise<CandleKey[]> {
    try {
      // Get all candle keys from Redis
      const keys = await redis.keys('candle:*')

      const candles: CandleKey[] = keys.map((key) => {
        // Parse "candle:BTC_USDT:5m" -> { symbol: "BTC_USDT", resolution: "5" }
        const parts = key.split(':')
        return {
          symbol: parts[1],
          resolution: parts[2]?.replace('m', ''), // "5m" -> "5"
        }
      }).filter(c => c.symbol && c.resolution)

      return candles
    } catch (error) {
      console.error('Failed to get active candles:', error)
      return []
    }
  }

  /**
   * Update strategy registration (when symbol or resolution changes)
   */
  async updateStrategyRegistration(
    strategyId: string,
    oldSymbol: string,
    oldResolution: string,
    newSymbol: string,
    newResolution: string
  ): Promise<void> {
    // Unregister from old candle
    await this.unregisterStrategy(strategyId, oldSymbol, oldResolution)

    // Register for new candle
    await this.registerStrategy(strategyId, newSymbol, newResolution)

    console.log(
      `Updated strategy ${strategyId} registration: ` +
      `${oldSymbol}/${oldResolution} → ${newSymbol}/${newResolution}`
    )
  }

  /**
   * Refresh cache from Redis (useful after registry changes from another worker)
   */
  async refreshCache(): Promise<void> {
    console.log('Refreshing strategy registry cache from Redis...')

    this.cache.clear()

    const candles = await this.getActiveCandles()

    for (const candle of candles) {
      const strategies = await redis.smembers(
        this.getCandleKey(candle.symbol, candle.resolution)
      )
      this.cache.set(
        this.getCandleKey(candle.symbol, candle.resolution),
        new Set(strategies)
      )
    }

    console.log(`Refreshed ${this.cache.size} candle mappings`)
  }

  /**
   * Get statistics about the registry
   */
  async getStats(): Promise<{
    totalCandles: number
    totalStrategies: number
    candleBreakdown: Array<{ candle: string; strategies: number }>
  }> {
    const candles = await this.getActiveCandles()
    const totalCandles = candles.length

    let totalStrategies = 0
    const candleBreakdown: Array<{ candle: string; strategies: number }> = []

    for (const candle of candles) {
      const strategies = await this.getStrategiesForCandle(
        candle.symbol,
        candle.resolution
      )
      totalStrategies += strategies.length
      candleBreakdown.push({
        candle: `${candle.symbol}:${candle.resolution}`,
        strategies: strategies.length,
      })
    }

    return {
      totalCandles,
      totalStrategies,
      candleBreakdown,
    }
  }

  /**
   * Clear all registry data (for testing/reset)
   */
  async clear(): Promise<void> {
    console.log('Clearing strategy registry...')

    const keys = await redis.keys('candle:*')
    if (keys.length > 0) {
      await redis.del(...keys)
    }

    const configKeys = await redis.keys('strategy:*:config')
    if (configKeys.length > 0) {
      await redis.del(...configKeys)
    }

    this.cache.clear()
    this.initialized = false

    console.log('Strategy registry cleared')
  }

  /**
   * 🧹 CLEANUP UTILITY: Remove phantom/garbage entries from Redis sets
   * This removes empty strings, whitespace, and validates strategy IDs exist in DB
   */
  async cleanupGarbageEntries(): Promise<{ cleaned: number; errors: string[] }> {
    console.log('🧹 Starting garbage cleanup...')
    let cleaned = 0
    const errors: string[] = []

    try {
      const candleKeys = await redis.keys('candle:*')

      for (const candleKey of candleKeys) {
        const members = await redis.smembers(candleKey)

        for (const member of members) {
          // Remove empty/whitespace entries
          if (!member || member.trim() === '') {
            await redis.srem(candleKey, member)
            console.log(`  ❌ Removed garbage entry from ${candleKey}: "${member}"`)
            cleaned++
            continue
          }

          // Validate strategy exists in database
          const strategyExists = await prisma.strategy.findUnique({
            where: { id: member },
            select: { id: true }
          })

          if (!strategyExists) {
            await redis.srem(candleKey, member)
            console.log(`  ❌ Removed orphaned strategy ${member} from ${candleKey} (not in DB)`)
            cleaned++
          }
        }

        // Remove the candle key if it's now empty
        const remainingMembers = await redis.smembers(candleKey)
        if (remainingMembers.length === 0) {
          await redis.del(candleKey)
          console.log(`  🗑️  Removed empty candle key: ${candleKey}`)
        }
      }

      console.log(`✅ Cleanup complete. Removed ${cleaned} garbage entries.`)
      return { cleaned, errors }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      errors.push(errorMsg)
      console.error('Cleanup failed:', error)
      return { cleaned, errors }
    }
  }

  /**
   * 🔄 RECONCILIATION: Sync Redis cache with database
   * Validates Redis against DB bidirectionally:
   * 1. Removes entries in Redis but not in DB (orphaned)
   * 2. Adds entries in DB but not in Redis (missing)
   *
   * Called periodically (every 5 min) to auto-heal cache drift
   */
  async reconcileWithDatabase(): Promise<{ orphaned: number; missing: number; errors: string[] }> {
    console.log('🔄 Starting cache reconciliation...')
    let orphanedCount = 0
    let missingCount = 0
    const errors: string[] = []

    try {
      // STEP 1: Remove orphaned entries (in Redis but not in DB)
      const candleKeys = await redis.keys('candle:*')

      for (const candleKey of candleKeys) {
        const members = await redis.smembers(candleKey)

        for (const strategyId of members) {
          // Skip empty/invalid entries
          if (!strategyId || strategyId.trim() === '') {
            await redis.srem(candleKey, strategyId)
            orphanedCount++
            continue
          }

          // Check if strategy exists in DB and is active
          const strategy = await prisma.strategy.findUnique({
            where: { id: strategyId },
            select: {
              id: true,
              isActive: true,
              executionConfig: true
            }
          })

          if (!strategy || !strategy.isActive) {
            await redis.srem(candleKey, strategyId)
            console.log(`  🗑️  Removed orphaned strategy ${strategyId} from ${candleKey}`)
            orphanedCount++
          }
        }

        // Clean up empty candle keys
        const remainingMembers = await redis.smembers(candleKey)
        if (remainingMembers.length === 0) {
          await redis.del(candleKey)
          console.log(`  🗑️  Removed empty candle key: ${candleKey}`)
        }
      }

      // STEP 2: Add missing entries (in DB but not in Redis)
      const activeStrategies = await prisma.strategy.findMany({
        where: {
          isActive: true,
          subscriberCount: { gt: 0 }
        },
        select: {
          id: true,
          executionConfig: true
        }
      })

      for (const strategy of activeStrategies) {
        const config = strategy.executionConfig as any
        const symbol = config?.symbol || config?.pair
        const resolution = config?.resolution

        if (!symbol || !resolution) {
          continue
        }

        const candleKey = this.getCandleKey(symbol, resolution)
        const isMember = await redis.sismember(candleKey, strategy.id)

        if (!isMember) {
          await this.registerStrategy(strategy.id, symbol, resolution)
          console.log(`  ➕ Added missing strategy ${strategy.id} to ${candleKey}`)
          missingCount++
        }
      }

      console.log(`✅ Reconciliation complete. Orphaned: ${orphanedCount}, Missing: ${missingCount}`)
      return { orphaned: orphanedCount, missing: missingCount, errors }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      errors.push(errorMsg)
      console.error('❌ Reconciliation failed:', error)
      return { orphaned: orphanedCount, missing: missingCount, errors }
    }
  }

  /**
   * Generate Redis key for a candle
   */
  private getCandleKey(symbol: string, resolution: string): string {
    // Strip any existing 'm' suffix before adding it back
    // (frontend might send "5m" or backend might send "5")
    const cleanResolution = resolution.replace(/m$/i, '')
    return `candle:${symbol}:${cleanResolution}`
  }
}

// Singleton instance
export const strategyRegistry = new StrategyRegistry()

// Auto-initialize on import (can be disabled for testing)
if (process.env.NODE_ENV !== 'test') {
  strategyRegistry.initialize().catch(console.error)
}
