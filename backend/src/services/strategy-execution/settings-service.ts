/**
 * Settings Service
 *
 * Redis-backed configuration management with live updates
 * Ported from Python version with TypeScript enhancements
 */

import { redis } from '../../lib/redis-client'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface StrategySettings {
  version: number
  updated_at: string
  symbol: string
  resolution: string
  lookback_period: number
  // Additional strategy-specific settings
  [key: string]: any
}

interface SubscriptionSettings {
  capital: number
  risk_per_trade: number
  leverage: number
  max_positions: number
  max_daily_loss: number
  sl_atr_multiplier?: number
  tp_atr_multiplier?: number
  broker_credential_id: string
  is_active: boolean
  // Additional user-specific settings
  [key: string]: any
}

interface ExecutionStatus {
  last_run: string
  subscribers: number
  duration: number
  last_signal?: string
  worker_id: string
  execution_count: number
}

class SettingsService {
  /**
   * Initialize strategy settings in Redis
   */
  async initializeStrategy(
    strategyId: string,
    config: Partial<StrategySettings>,
    version: number = 1
  ): Promise<boolean> {
    try {
      const key = `strategy:${strategyId}:settings`

      const settings = {
        version: version.toString(),
        updated_at: new Date().toISOString(),
        ...this.serializeSettings(config),
      }

      await redis.hset(key, settings)

      console.log(`Initialized strategy ${strategyId} settings: version=${version}`)
      return true
    } catch (error) {
      console.error(`Failed to initialize strategy ${strategyId}:`, error)
      return false
    }
  }

  /**
   * Get strategy settings from Redis (with DB fallback)
   */
  async getStrategySettings(
    strategyId: string,
    fallbackToDb: boolean = true
  ): Promise<StrategySettings | null> {
    try {
      const key = `strategy:${strategyId}:settings`

      // Try Redis first
      const settings = await redis.hgetall(key)

      if (settings && Object.keys(settings).length > 0) {
        return this.deserializeSettings(settings) as StrategySettings
      }

      // Cache miss - fallback to DB if enabled
      if (fallbackToDb) {
        console.log(`Cache miss for strategy ${strategyId}, loading from DB`)
        const dbSettings = await this.loadFromDatabase(strategyId)

        if (dbSettings) {
          // Write back to cache
          await this.initializeStrategy(
            strategyId,
            dbSettings,
            parseInt(dbSettings.version?.toString() || '1', 10)
          )
          return dbSettings
        }
      }

      console.warn(`Strategy ${strategyId} settings not found`)
      return null
    } catch (error) {
      console.error(`Failed to get strategy ${strategyId} settings:`, error)
      return null
    }
  }

  /**
   * Update strategy settings and publish change notification
   */
  async updateStrategySettings(
    strategyId: string,
    updates: Partial<StrategySettings>,
    publishUpdate: boolean = true
  ): Promise<boolean> {
    try {
      const key = `strategy:${strategyId}:settings`

      // Get current version
      const currentVersion = await redis.hget(key, 'version')
      const newVersion = parseInt(currentVersion || '0', 10) + 1

      // Prepare updates
      const updateData = {
        version: newVersion.toString(),
        updated_at: new Date().toISOString(),
        ...this.serializeSettings(updates),
      }

      // Apply updates
      await redis.hset(key, updateData)

      console.log(
        `Updated strategy ${strategyId} settings: ` +
        `version=${newVersion}, fields=${Object.keys(updates).join(', ')}`
      )

      // Publish update notification
      if (publishUpdate) {
        await this.publishSettingsUpdate(
          strategyId,
          newVersion,
          Object.keys(updates)
        )
      }

      return true
    } catch (error) {
      console.error(`Failed to update strategy ${strategyId} settings:`, error)
      return false
    }
  }

  /**
   * Initialize subscription settings for a user
   */
  async initializeSubscription(
    userId: string,
    strategyId: string,
    settings: Partial<SubscriptionSettings>
  ): Promise<boolean> {
    try {
      const key = `subscription:${userId}:${strategyId}:settings`

      const subscriptionData = this.serializeSettings(settings)
      await redis.hset(key, subscriptionData)

      // Set TTL (24 hours, refreshed on access)
      await redis.expire(key, 86400)

      console.log(`Initialized subscription for user ${userId} on strategy ${strategyId}`)
      return true
    } catch (error) {
      console.error(`Failed to initialize subscription for user ${userId}:`, error)
      return false
    }
  }

  /**
   * Get subscription settings for a user
   */
  async getSubscriptionSettings(
    userId: string,
    strategyId: string
  ): Promise<SubscriptionSettings | null> {
    try {
      const key = `subscription:${userId}:${strategyId}:settings`

      const settings = await redis.hgetall(key)

      if (settings && Object.keys(settings).length > 0) {
        // Refresh TTL
        await redis.expire(key, 86400)
        return this.deserializeSettings(settings) as SubscriptionSettings
      }

      return null
    } catch (error) {
      console.error(
        `Failed to get subscription settings for user ${userId}, strategy ${strategyId}:`,
        error
      )
      return null
    }
  }

  /**
   * Update subscription settings
   */
  async updateSubscriptionSettings(
    userId: string,
    strategyId: string,
    updates: Partial<SubscriptionSettings>
  ): Promise<boolean> {
    try {
      const key = `subscription:${userId}:${strategyId}:settings`

      const updateData = this.serializeSettings(updates)
      await redis.hset(key, updateData)

      // Refresh TTL
      await redis.expire(key, 86400)

      console.log(
        `Updated subscription for user ${userId} on strategy ${strategyId}: ` +
        `${Object.keys(updates).join(', ')}`
      )

      return true
    } catch (error) {
      console.error(`Failed to update subscription settings:`, error)
      return false
    }
  }

  /**
   * Acquire distributed execution lock
   */
  async acquireExecutionLock(
    strategyId: string,
    intervalKey: string,
    ttlSeconds: number,
    workerId: string = process.env.WORKER_ID || 'worker-default'
  ): Promise<boolean> {
    try {
      const lockKey = `lock:strategy:${strategyId}:run:${intervalKey}`

      // Atomic set with NX (only if not exists) and EX (expiry)
      const acquired = await redis.set(lockKey, workerId, 'EX', ttlSeconds, 'NX')

      if (acquired === 'OK') {
        console.log(
          `Acquired lock for strategy ${strategyId} at ${intervalKey} ` +
          `(worker=${workerId}, ttl=${ttlSeconds}s)`
        )
        return true
      } else {
        const holder = await redis.get(lockKey)
        console.log(
          `Lock already held for strategy ${strategyId} at ${intervalKey} ` +
          `by worker ${holder}`
        )
        return false
      }
    } catch (error) {
      console.error(`Failed to acquire lock for strategy ${strategyId}:`, error)
      return false
    }
  }

  /**
   * Release execution lock (optional - usually let it expire)
   */
  async releaseExecutionLock(
    strategyId: string,
    intervalKey: string
  ): Promise<boolean> {
    try {
      const lockKey = `lock:strategy:${strategyId}:run:${intervalKey}`
      await redis.del(lockKey)

      console.log(`Released lock for strategy ${strategyId} at ${intervalKey}`)
      return true
    } catch (error) {
      console.error(`Failed to release lock for strategy ${strategyId}:`, error)
      return false
    }
  }

  /**
   * Update execution status metadata
   */
  async updateExecutionStatus(
    strategyId: string,
    status: Partial<ExecutionStatus>
  ): Promise<boolean> {
    try {
      const key = `strategy:${strategyId}:execution:status`

      const statusData = this.serializeSettings(status)
      await redis.hset(key, statusData)

      // Set TTL (7 days)
      await redis.expire(key, 604800)

      return true
    } catch (error) {
      console.error(`Failed to update execution status for strategy ${strategyId}:`, error)
      return false
    }
  }

  /**
   * Get execution status metadata
   */
  async getExecutionStatus(strategyId: string): Promise<ExecutionStatus | null> {
    try {
      const key = `strategy:${strategyId}:execution:status`
      const status = await redis.hgetall(key)

      if (status && Object.keys(status).length > 0) {
        return this.deserializeSettings(status) as ExecutionStatus
      }

      return null
    } catch (error) {
      console.error(`Failed to get execution status for strategy ${strategyId}:`, error)
      return null
    }
  }

  /**
   * Publish settings update notification
   */
  private async publishSettingsUpdate(
    strategyId: string,
    version: number,
    changedFields: string[]
  ): Promise<void> {
    try {
      const channel = `channel:strategy:${strategyId}:settings:updated`
      const message = JSON.stringify({
        version,
        updated_at: new Date().toISOString(),
        changed_fields: changedFields,
      })

      await redis.publish(channel, message)

      console.log(
        `Published settings update for strategy ${strategyId}: ` +
        `version=${version}, fields=${changedFields.join(', ')}`
      )
    } catch (error) {
      console.error(`Failed to publish settings update:`, error)
    }
  }

  /**
   * Serialize settings to Redis (convert all values to strings)
   */
  private serializeSettings(settings: Record<string, any>): Record<string, string> {
    const serialized: Record<string, string> = {}

    for (const [key, value] of Object.entries(settings)) {
      if (value === null || value === undefined) {
        continue
      }

      serialized[key] = String(value)
    }

    return serialized
  }

  /**
   * Deserialize settings from Redis (convert strings back to appropriate types)
   */
  private deserializeSettings(redisData: Record<string, string>): Record<string, any> {
    const result: Record<string, any> = {}

    for (const [key, value] of Object.entries(redisData)) {
      // Convert based on field name patterns
      if (
        key === 'version' ||
        key === 'leverage' ||
        key === 'max_positions' ||
        key === 'lookback_period' ||
        key === 'execution_count' ||
        key === 'subscribers' ||
        // Strategy-specific integer parameters
        key === 'st_period' ||
        key === 'ema_fast_len' ||
        key === 'ema_slow_len' ||
        key === 'bb_len' ||
        key === 'rsi_len' ||
        key === 'rsi_oversold' ||
        key === 'rsi_overbought' ||
        key === 'atr_len' ||
        key === 'vol_ma_len' ||
        key === 'bbw_zscore_len' ||
        key === 'hold_trend' ||
        key === 'hold_reversion' ||
        // Additional strategy parameters
        key === 'Factor' ||
        key === 'Pd' ||
        key === 'prd'
      ) {
        result[key] = parseInt(value, 10)
      } else if (
        key === 'capital' ||
        key === 'risk_per_trade' ||
        key === 'max_daily_loss' ||
        key === 'sl_atr_multiplier' ||
        key === 'tp_atr_multiplier' ||
        key === 'duration' ||
        key === 'currency_conversion_rate' ||
        // Strategy-specific float parameters
        key === 'st_multiplier' ||
        key === 'bb_std' ||
        key === 'zscore_thresh' ||
        key === 'sl_atr_trend' ||
        key === 'tp_atr_trend' ||
        key === 'sl_atr_reversion' ||
        key === 'tp_atr_reversion' ||
        // Additional strategy float parameters
        key === 'sl_pct' ||
        key === 'tp_pct_level_1' ||
        key === 'tp_pct_level_2' ||
        key === 'commission_rate' ||
        key === 'gst_rate' ||
        key === 'tp_level_1_pct_exit' ||
        key === 'initial_capital'
      ) {
        result[key] = parseFloat(value)
      } else if (key === 'is_active') {
        result[key] = value.toLowerCase() === 'true'
      } else {
        result[key] = value
      }
    }

    return result
  }

  /**
   * Load strategy settings from Prisma database
   */
  private async loadFromDatabase(strategyId: string): Promise<StrategySettings | null> {
    try {
      const strategy = await prisma.strategy.findUnique({
        where: { id: strategyId },
        select: {
          executionConfig: true,
        },
      })

      if (!strategy || !strategy.executionConfig) {
        return null
      }

      const config = strategy.executionConfig as any

      // Support both 'symbol' and 'pair' fields
      const symbol = config.symbol || config.pair

      return {
        version: 1,
        updated_at: new Date().toISOString(),
        strategy_id: strategyId,
        symbol,  // Normalize to 'symbol'
        pair: symbol,  // Keep 'pair' for backward compatibility
        resolution: config.resolution,
        lookback_period: config.lookbackPeriod || 200,
        ...config,
      }
    } catch (error) {
      console.error(`Failed to load strategy ${strategyId} from database:`, error)
      return null
    }
  }
}

// Singleton instance
export const settingsService = new SettingsService()
