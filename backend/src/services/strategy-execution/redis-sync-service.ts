/**
 * Redis Subscription Sync Service
 *
 * Ensures Redis cache stays in sync with PostgreSQL (source of truth)
 *
 * Features:
 * - Startup hydration: Loads all active subscriptions into Redis on startup
 * - Periodic reconciliation: Syncs Redis with PostgreSQL every 5 minutes
 * - Automatic recovery: Rebuilds Redis cache if discrepancies detected
 */

import { PrismaClient, StrategySubscription } from '@prisma/client'
import Redis from 'ioredis'

const prisma = new PrismaClient()
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => Math.min(times * 50, 2000),
})

interface SubscriptionWithRelations extends StrategySubscription {
  strategy: {
    id: string
    executionConfig: any
  }
  brokerCredential?: {
    id: string
    apiKey: string
    apiSecret: string
  }
}

class RedisSubscriptionSyncService {
  /**
   * Hydrate Redis with all active subscriptions from PostgreSQL
   * Called on backend startup
   */
  async hydrateAllSubscriptions(): Promise<void> {
    console.log('🔄 Hydrating Redis from PostgreSQL (source of truth)...')

    try {
      const subscriptions = await prisma.strategySubscription.findMany({
        where: { isActive: true },
        include: {
          strategy: {
            select: {
              id: true,
              executionConfig: true,
            },
          },
          brokerCredential: {
            select: {
              id: true,
              apiKey: true,
              apiSecret: true,
            },
          },
        },
      }) as SubscriptionWithRelations[]

      console.log(`   Found ${subscriptions.length} active subscriptions`)

      let synced = 0
      for (const sub of subscriptions) {
        await this.syncSubscriptionToRedis(sub)
        synced++
      }

      console.log(`✅ Redis hydration complete: ${synced}/${subscriptions.length} subscriptions synced`)
    } catch (error) {
      console.error('❌ Redis hydration failed:', error)
      throw error
    }
  }

  /**
   * Reconcile Redis with PostgreSQL
   * Finds and fixes discrepancies between Redis cache and database
   */
  async reconcileWithDatabase(): Promise<void> {
    console.log('\n🔄 Reconciling Redis with PostgreSQL...')

    try {
      // Get all active subscriptions from PostgreSQL (source of truth)
      const dbSubscriptions = await prisma.strategySubscription.findMany({
        where: { isActive: true },
        include: {
          strategy: {
            select: {
              id: true,
              executionConfig: true,
            },
          },
          brokerCredential: {
            select: {
              id: true,
              apiKey: true,
              apiSecret: true,
            },
          },
        },
      }) as SubscriptionWithRelations[]

      const dbSubMap = new Map<string, SubscriptionWithRelations>()
      for (const sub of dbSubscriptions) {
        const key = `${sub.userId}:${sub.strategyId}`
        dbSubMap.set(key, sub)
      }

      // Get all subscription keys from Redis
      const redisKeys = await redis.keys('subscription:*')
      const redisSubKeys = new Set<string>()

      for (const key of redisKeys) {
        // Extract userId:strategyId from "subscription:userId:strategyId"
        const parts = key.split(':')
        if (parts.length >= 3) {
          const subKey = `${parts[1]}:${parts[2]}`
          redisSubKeys.add(subKey)
        }
      }

      // Find subscriptions to add (in DB but not in Redis)
      const toAdd: SubscriptionWithRelations[] = []
      for (const [key, sub] of dbSubMap) {
        if (!redisSubKeys.has(key)) {
          toAdd.push(sub)
        }
      }

      // Find subscriptions to remove (in Redis but not in DB)
      const toRemove: string[] = []
      for (const key of redisSubKeys) {
        if (!dbSubMap.has(key)) {
          toRemove.push(key)
        }
      }

      console.log(`   Discrepancies: +${toAdd.length} to add, -${toRemove.length} to remove`)

      // Add missing subscriptions to Redis
      for (const sub of toAdd) {
        await this.syncSubscriptionToRedis(sub)
        console.log(`   ✓ Added ${sub.userId.substring(0, 8)}:${sub.strategyId.substring(0, 8)} to Redis`)
      }

      // Remove stale subscriptions from Redis
      for (const key of toRemove) {
        const [userId, strategyId] = key.split(':')
        await redis.del(`subscription:${key}`)
        await redis.srem(`strategy:${strategyId}:active_subscribers`, userId)
        console.log(`   ✓ Removed ${userId.substring(0, 8)}:${strategyId.substring(0, 8)} from Redis`)
      }

      if (toAdd.length === 0 && toRemove.length === 0) {
        console.log('   ✅ Redis and PostgreSQL are in sync')
      } else {
        console.log(`✅ Reconciliation complete: +${toAdd.length} added, -${toRemove.length} removed`)
      }
    } catch (error) {
      console.error('❌ Redis reconciliation failed:', error)
      // Don't throw - reconciliation should not crash the app
    }
  }

  /**
   * Sync a single subscription to Redis
   * Resolves NULL values using strategy executionConfig defaults
   */
  private async syncSubscriptionToRedis(sub: SubscriptionWithRelations): Promise<void> {
    const config = sub.strategy?.executionConfig as any || {}

    const settings = {
      capital: sub.capital.toString(),
      risk_per_trade: (sub.riskPerTrade ?? config.risk_per_trade ?? 0.02).toString(),
      leverage: (sub.leverage ?? config.leverage ?? 10).toString(),
      max_positions: (sub.maxPositions ?? config.max_positions ?? 1).toString(),
      max_daily_loss: (sub.maxDailyLoss ?? config.max_daily_loss ?? 0.05).toString(),
      broker_credential_id: sub.brokerCredentialId || '',
      is_active: sub.isActive ? 'true' : 'false',
    }

    // Store subscription settings
    await redis.hmset(`subscription:${sub.userId}:${sub.strategyId}`, settings)

    // Add to strategy's active subscribers set
    await redis.sadd(`strategy:${sub.strategyId}:active_subscribers`, sub.userId)
  }

  /**
   * Start periodic reconciliation
   * Runs every 5 minutes by default
   */
  startPeriodicReconciliation(intervalMinutes: number = 5): NodeJS.Timeout {
    console.log(`📅 Scheduling periodic reconciliation every ${intervalMinutes} minutes`)

    return setInterval(async () => {
      await this.reconcileWithDatabase()
    }, intervalMinutes * 60 * 1000)
  }

  /**
   * Clear all subscription data from Redis
   * Useful for debugging or manual resets
   */
  async clearRedisCache(): Promise<void> {
    console.log('🗑️  Clearing Redis subscription cache...')

    const subKeys = await redis.keys('subscription:*')
    const strategyKeys = await redis.keys('strategy:*:active_subscribers')

    const pipeline = redis.pipeline()

    for (const key of [...subKeys, ...strategyKeys]) {
      pipeline.del(key)
    }

    await pipeline.exec()

    console.log(`✅ Cleared ${subKeys.length + strategyKeys.length} keys from Redis`)
  }
}

// Singleton instance
export const redisSyncService = new RedisSubscriptionSyncService()
