/**
 * Strategy Registry Service
 *
 * Maintains fast lookups: "Which strategies need BTC_USDT 5m candles?"
 * Uses Redis Sets for O(1) lookups with in-memory cache for super-fast access
 */

import { redis } from '../../lib/redis-client'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface CandleKey {
  symbol: string
  resolution: string
}

interface StrategyConfig {
  strategyId: string
  symbol: string
  resolution: string
}

class StrategyRegistry {
  // In-memory cache for ultra-fast lookups
  private cache: Map<string, Set<string>> = new Map()
  private initialized = false

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
          executionConfig: true,
        },
      })

      console.log(`Found ${strategies.length} active strategies`)

      // Register each strategy
      for (const strategy of strategies) {
        const config = strategy.executionConfig as any
        if (config?.symbol && config?.resolution) {
          await this.registerStrategy(strategy.id, config.symbol, config.resolution)
        }
      }

      this.initialized = true
      console.log('Strategy registry initialized successfully')
    } catch (error) {
      console.error('Failed to initialize strategy registry:', error)
      throw error
    }
  }

  /**
   * Register a strategy for a specific candle
   */
  async registerStrategy(
    strategyId: string,
    symbol: string,
    resolution: string
  ): Promise<void> {
    const candleKey = this.getCandleKey(symbol, resolution)

    try {
      // Add to Redis
      await redis.sadd(candleKey, strategyId)

      // Update in-memory cache
      if (!this.cache.has(candleKey)) {
        this.cache.set(candleKey, new Set())
      }
      this.cache.get(candleKey)!.add(strategyId)

      // Store strategy config in Redis for quick access
      await redis.hset(`strategy:${strategyId}:config`, {
        symbol,
        resolution,
      })

      console.log(`Registered strategy ${strategyId} for ${symbol} ${resolution}`)
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

      // Update in-memory cache
      this.cache.get(candleKey)?.delete(strategyId)

      // If no strategies left for this candle, clean up
      const count = await redis.scard(candleKey)
      if (count === 0) {
        await redis.del(candleKey)
        this.cache.delete(candleKey)
      }

      // Remove strategy config
      await redis.del(`strategy:${strategyId}:config`)

      console.log(`Unregistered strategy ${strategyId} from ${symbol} ${resolution}`)
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
   * Generate Redis key for a candle
   */
  private getCandleKey(symbol: string, resolution: string): string {
    return `candle:${symbol}:${resolution}m`
  }
}

// Singleton instance
export const strategyRegistry = new StrategyRegistry()

// Auto-initialize on import (can be disabled for testing)
if (process.env.NODE_ENV !== 'test') {
  strategyRegistry.initialize().catch(console.error)
}
