/**
 * Subscription Service
 *
 * Manages user subscription lifecycle and coordinates with strategy registry
 */

import { PrismaClient, StrategySubscription, Prisma } from '@prisma/client'
import { strategyRegistry } from './strategy-registry'
import { settingsService } from './settings-service'
import { eventBus } from '../../lib/event-bus'

const prisma = new PrismaClient()

interface CreateSubscriptionParams {
  userId: string
  strategyId: string
  capital: number
  riskPerTrade?: number  // Optional - NULL means use strategy default
  leverage?: number       // Optional - NULL means use strategy default
  maxPositions?: number   // Optional - NULL means use strategy default
  maxDailyLoss?: number   // Optional - NULL means use strategy default
  slAtrMultiplier?: number
  tpAtrMultiplier?: number
  brokerCredentialId: string
  tradingType?: 'spot' | 'futures'
  marginCurrency?: string
}

interface SubscriptionWithStrategy extends StrategySubscription {
  strategy?: {
    id: string
    name: string
    executionConfig: any
  }
  brokerCredential?: {
    id: string
    apiKey: string
    apiSecret: string
  }
}

class SubscriptionService {
  /**
   * Resolve subscription settings by merging user overrides with strategy defaults
   * NULL values = use strategy config default
   *
   * CRITICAL: NO HARDCODED FALLBACKS - Strategy MUST have config or we throw error
   */
  private resolveSubscriptionSettings(
    subscription: StrategySubscription & { strategy?: { executionConfig: any } }
  ): {
    riskPerTrade: number
    leverage: number
    maxPositions: number
    maxDailyLoss: number
  } {
    const strategyConfig = subscription.strategy?.executionConfig as any || {}

    // Resolve values: subscription override > strategy config > ERROR (no fallback)
    const riskPerTrade = subscription.riskPerTrade ?? strategyConfig.risk_per_trade
    const leverage = subscription.leverage ?? strategyConfig.leverage
    const maxPositions = subscription.maxPositions ?? strategyConfig.max_positions
    const maxDailyLoss = subscription.maxDailyLoss ?? strategyConfig.max_daily_loss

    // STRICT VALIDATION: Ensure strategy has required fields
    if (riskPerTrade === undefined || riskPerTrade === null) {
      throw new Error(
        `Strategy ${subscription.strategyId} has no risk_per_trade configured. ` +
        `Cannot execute without this critical parameter.`
      )
    }

    if (leverage === undefined || leverage === null) {
      throw new Error(
        `Strategy ${subscription.strategyId} has no leverage configured. ` +
        `Cannot execute without this critical parameter.`
      )
    }

    return {
      riskPerTrade,
      leverage,
      maxPositions: maxPositions ?? 1,  // These can have defaults as they're less critical
      maxDailyLoss: maxDailyLoss ?? 0.05,
    }
  }

  /**
   * Create a new subscription for a user
   */
  async createSubscription(
    params: CreateSubscriptionParams
  ): Promise<{ subscriptionId: string; isFirstSubscriber: boolean }> {
    const {
      userId,
      strategyId,
      capital,
      riskPerTrade,  // Can be undefined = use strategy default
      leverage,       // Can be undefined = use strategy default
      maxPositions,   // Can be undefined = use strategy default
      maxDailyLoss,   // Can be undefined = use strategy default
      slAtrMultiplier,
      tpAtrMultiplier,
      brokerCredentialId,
      tradingType,
      marginCurrency,
    } = params

    try {
      // Check if subscription already exists
      const existing = await prisma.strategySubscription.findUnique({
        where: {
          userId_strategyId: {
            userId,
            strategyId,
          },
        },
      })

      // Get strategy to check if this is first subscriber
      const strategy = await prisma.strategy.findUnique({
        where: { id: strategyId },
        select: {
          id: true,
          subscriberCount: true,
          executionConfig: true,
        },
      })

      if (!strategy) {
        throw new Error(`Strategy ${strategyId} not found`)
      }

      // Infer trading type if not provided
      const execCfg: any = (strategy?.executionConfig as any) || {}
      const inferredTradingType: 'spot' | 'futures' = tradingType
        ? tradingType
        : (execCfg.symbol?.startsWith('B-') || !!execCfg.supportsFutures)
          ? 'futures' : 'spot'

      let subscription: StrategySubscription
      let isReactivation = false

      if (existing) {
        // If subscription exists and is active, throw error
        if (existing.isActive) {
          throw new Error(
            `User ${userId} is already subscribed to strategy ${strategyId}`
          )
        }

        // If subscription exists but is cancelled (isActive: false), reactivate it
        console.log(
          `Reactivating cancelled subscription ${existing.id} for user ${userId} ` +
          `to strategy ${strategyId}`
        )

        subscription = await prisma.strategySubscription.update({
          where: { id: existing.id },
          data: {
            // Update all settings - undefined = NULL = use strategy default
            capital,
            riskPerTrade: riskPerTrade !== undefined ? riskPerTrade : null,
            leverage: leverage !== undefined ? leverage : null,
            maxPositions: maxPositions !== undefined ? maxPositions : null,
            maxDailyLoss: maxDailyLoss !== undefined ? maxDailyLoss : null,
            slAtrMultiplier,
            tpAtrMultiplier,
            brokerCredentialId,
            tradingType: inferredTradingType,
            marginCurrency: marginCurrency || 'USDT',
            // Reactivate subscription
            isActive: true,
            isPaused: false,
            subscribedAt: new Date(),
            unsubscribedAt: null,
            pausedAt: null,
            // Reset stats for new subscription period
            totalTrades: 0,
            winningTrades: 0,
            losingTrades: 0,
            totalPnl: 0,
          },
        })

        isReactivation = true
      } else {
        // Create new subscription
        // Store NULL for undefined values = use strategy default
        subscription = await prisma.strategySubscription.create({
          data: {
            userId,
            strategyId,
            capital,
            riskPerTrade: riskPerTrade !== undefined ? riskPerTrade : null,
            leverage: leverage !== undefined ? leverage : null,
            maxPositions: maxPositions !== undefined ? maxPositions : null,
            maxDailyLoss: maxDailyLoss !== undefined ? maxDailyLoss : null,
            slAtrMultiplier,
            tpAtrMultiplier,
            brokerCredentialId,
            tradingType: inferredTradingType,
            marginCurrency: marginCurrency || 'USDT',
            isActive: true,
            isPaused: false,
          },
        })
      }

      const isFirstSubscriber = strategy.subscriberCount === 0

      // Increment subscriber count
      await prisma.strategy.update({
        where: { id: strategyId },
        data: {
          subscriberCount: { increment: 1 },
        },
      })

      // Resolve final settings (merge user overrides with strategy defaults)
      const resolvedSettings = this.resolveSubscriptionSettings({
        ...subscription,
        strategy: { executionConfig: strategy.executionConfig }
      })

      // Initialize subscription settings in Redis with resolved values
      await settingsService.initializeSubscription(userId, strategyId, {
        capital,
        risk_per_trade: resolvedSettings.riskPerTrade,
        leverage: resolvedSettings.leverage,
        max_positions: resolvedSettings.maxPositions,
        max_daily_loss: resolvedSettings.maxDailyLoss,
        sl_atr_multiplier: slAtrMultiplier,
        tp_atr_multiplier: tpAtrMultiplier,
        broker_credential_id: brokerCredentialId,
        is_active: true,
      })

      console.log(
        `📊 Subscription settings initialized for ${userId}:\n` +
        `   Risk/Trade: ${resolvedSettings.riskPerTrade} ${subscription.riskPerTrade === null ? '(strategy default)' : '(custom)'}\n` +
        `   Leverage: ${resolvedSettings.leverage}x ${subscription.leverage === null ? '(strategy default)' : '(custom)'}`
      )

      // If first subscriber, register strategy in registry
      if (isFirstSubscriber) {
        let config = strategy.executionConfig as any

        // 🔧 AUTO-SYNC: If executionConfig is missing or incomplete, extract from Python file
        const needsSync = !config || !config.pair || !config.resolution

        if (needsSync) {
          console.warn(
            `⚠️  Strategy ${strategyId} missing executionConfig or pair/resolution. ` +
            `Attempting auto-sync from Python file...`
          )

          try {
            // Import dependencies
            const fs = await import('fs')
            const path = await import('path')
            const { extractStrategyConfig } = await import('../../utils/strategy-config-extractor')

            // Find Python file
            const strategiesDir = path.join(__dirname, '../../../strategies')
            const strategyDir = path.join(strategiesDir, strategyId)

            if (fs.existsSync(strategyDir)) {
              const files = fs.readdirSync(strategyDir)
              const pythonFile = files.find((f: string) => f.endsWith('.py'))

              if (pythonFile) {
                const pythonFilePath = path.join(strategyDir, pythonFile)
                const strategyCode = fs.readFileSync(pythonFilePath, 'utf8')

                // Extract config
                const configExtraction = extractStrategyConfig(strategyCode)

                if (configExtraction.success && configExtraction.config) {
                  // Merge extracted config with existing (preserve things like minMargin)
                  const extractedConfig = configExtraction.config
                  const mergedConfig = {
                    ...extractedConfig,
                    ...(config || {})
                  }

                  // Ensure pair/resolution are from extracted config
                  if (extractedConfig.pair) mergedConfig.pair = extractedConfig.pair
                  if (extractedConfig.resolution) mergedConfig.resolution = extractedConfig.resolution

                  // Update database
                  await prisma.strategy.update({
                    where: { id: strategyId },
                    data: { executionConfig: mergedConfig }
                  })

                  config = mergedConfig
                  console.log(
                    `✅ Auto-synced config from Python file: ` +
                    `pair=${config.pair}, resolution=${config.resolution}`
                  )
                } else {
                  console.error(
                    `❌ Failed to extract STRATEGY_CONFIG from ${pythonFile}. ` +
                    `Strategy will NOT be registered with scheduler.`
                  )
                }
              } else {
                console.error(
                  `❌ No Python file found in ${strategyDir}. ` +
                  `Strategy will NOT be registered with scheduler.`
                )
              }
            } else {
              console.error(
                `❌ Strategy directory not found: ${strategyDir}. ` +
                `Strategy will NOT be registered with scheduler.`
              )
            }
          } catch (syncError) {
            console.error(
              `❌ Auto-sync failed for strategy ${strategyId}:`,
              syncError instanceof Error ? syncError.message : String(syncError)
            )
          }
        }

        // Proceed with registration if we now have valid config
        if (config) {
          // Support both 'symbol' and 'pair' fields
          const symbol = config.symbol || config.pair

          if (symbol && config.resolution) {
            try {
              // ✅ Initialize strategy settings in Redis with ALL parameters from executionConfig
              await settingsService.initializeStrategy(
                strategyId,
                config,  // This includes ALL STRATEGY_CONFIG parameters (st_period, ema_fast_len, etc.)
                1
              )

              console.log(
                `Initialized strategy ${strategyId} settings in Redis with ${Object.keys(config).length} parameters`
              )

              await strategyRegistry.registerStrategy(
                strategyId,
                symbol,
                config.resolution
              )

              console.log(
                `✅ Registered strategy ${strategyId} for ${symbol}/${config.resolution} ` +
                `(first subscriber)`
              )
            } catch (regError) {
              console.error(
                `❌ Failed to register strategy ${strategyId} with scheduler:`,
                regError instanceof Error ? regError.message : String(regError)
              )
              console.error(
                `⚠️  WARNING: Subscription created but strategy will NOT execute! ` +
                `Manual intervention required.`
              )
              // Don't throw - subscription is still created, just not scheduled
            }
          } else {
            console.error(
              `❌ Strategy ${strategyId} missing pair (${symbol}) or resolution (${config.resolution}). ` +
              `Cannot register with scheduler. Subscription created but strategy will NOT execute!`
            )
          }
        } else {
          console.error(
            `❌ Strategy ${strategyId} has no executionConfig even after auto-sync attempt. ` +
            `Subscription created but strategy will NOT execute!`
          )
        }
      }

      // Emit event
      eventBus.emit('subscription.created', {
        subscriptionId: subscription.id,
        strategyId,
        userId,
      })

      console.log(
        `${isReactivation ? 'Reactivated' : 'Created'} subscription ${subscription.id} for user ${userId} ` +
        `on strategy ${strategyId}`
      )

      return {
        subscriptionId: subscription.id,
        isFirstSubscriber,
      }
    } catch (error) {
      console.error('Failed to create subscription:', error)
      throw error
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(subscriptionId: string): Promise<boolean> {
    try {
      // Get subscription
      const subscription = await prisma.strategySubscription.findUnique({
        where: { id: subscriptionId },
        include: {
          strategy: {
            select: {
              id: true,
              subscriberCount: true,
              executionConfig: true,
            },
          },
        },
      })

      if (!subscription) {
        console.warn(`Subscription ${subscriptionId} not found`)
        return false
      }

      // Check if already inactive - prevent double unsubscribe
      if (!subscription.isActive) {
        console.warn(`Subscription ${subscriptionId} is already inactive`)
        return true // Already unsubscribed, nothing to do
      }

      // Mark as inactive and set unsubscribedAt
      await prisma.strategySubscription.update({
        where: { id: subscriptionId },
        data: {
          isActive: false,
          unsubscribedAt: new Date(),
        },
      })

      // Decrement subscriber count (only if > 0 to prevent negative counts)
      if (subscription.strategy.subscriberCount > 0) {
        await prisma.strategy.update({
          where: { id: subscription.strategyId },
          data: {
            subscriberCount: { decrement: 1 },
          },
        })
      }

      // Remove from Redis
      await settingsService.updateSubscriptionSettings(
        subscription.userId,
        subscription.strategyId,
        { is_active: false }
      )

      // If last subscriber, unregister strategy from registry
      const isLastSubscriber = subscription.strategy.subscriberCount <= 1

      if (isLastSubscriber && subscription.strategy.executionConfig) {
        const config = subscription.strategy.executionConfig as any

        // Support both 'symbol' and 'pair' fields
        const symbol = config.symbol || config.pair

        if (symbol && config.resolution) {
          await strategyRegistry.unregisterStrategy(
            subscription.strategyId,
            symbol,
            config.resolution
          )

          console.log(
            `Unregistered strategy ${subscription.strategyId} from ` +
            `${symbol}/${config.resolution} (last subscriber)`
          )
        }
      }

      // Emit event
      eventBus.emit('subscription.cancelled', {
        subscriptionId,
        strategyId: subscription.strategyId,
        userId: subscription.userId,
      })

      console.log(`Cancelled subscription ${subscriptionId}`)

      return true
    } catch (error) {
      console.error(`Failed to cancel subscription ${subscriptionId}:`, error)
      throw error
    }
  }

  /**
   * Pause a subscription (stops trade execution but keeps subscription active)
   */
  async pauseSubscription(subscriptionId: string): Promise<boolean> {
    try {
      const subscription = await prisma.strategySubscription.update({
        where: { id: subscriptionId },
        data: {
          isPaused: true,
          pausedAt: new Date(),
        },
      })

      console.log(`Paused subscription ${subscriptionId}`)

      return true
    } catch (error) {
      console.error(`Failed to pause subscription ${subscriptionId}:`, error)
      return false
    }
  }

  /**
   * Resume a paused subscription
   */
  async resumeSubscription(subscriptionId: string): Promise<boolean> {
    try {
      await prisma.strategySubscription.update({
        where: { id: subscriptionId },
        data: {
          isPaused: false,
          pausedAt: null,
        },
      })

      console.log(`Resumed subscription ${subscriptionId}`)

      return true
    } catch (error) {
      console.error(`Failed to resume subscription ${subscriptionId}:`, error)
      return false
    }
  }

  /**
   * Get active subscribers for a strategy
   * Includes strategy executionConfig for resolving defaults
   *
   * NOTE: This method reads from PostgreSQL (source of truth)
   * Redis sync service ensures Redis cache stays in sync
   */
  async getActiveSubscribers(
    strategyId: string
  ): Promise<SubscriptionWithStrategy[]> {
    try {
      const subscriptions = await prisma.strategySubscription.findMany({
        where: {
          strategyId,
          isActive: true,
          isPaused: false,
        },
        include: {
          strategy: {
            select: {
              id: true,
              name: true,
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
      })

      return subscriptions as SubscriptionWithStrategy[]
    } catch (error) {
      console.error(`Failed to get active subscribers for strategy ${strategyId}:`, error)
      return []
    }
  }

  /**
   * Get all subscriptions for a user
   */
  async getUserSubscriptions(userId: string): Promise<SubscriptionWithStrategy[]> {
    try {
      const subscriptions = await prisma.strategySubscription.findMany({
        where: { userId },
        include: {
          strategy: {
            select: {
              id: true,
              name: true,
              executionConfig: true,
            },
          },
        },
        orderBy: {
          subscribedAt: 'desc',
        },
      })

      return subscriptions as SubscriptionWithStrategy[]
    } catch (error) {
      console.error(`Failed to get subscriptions for user ${userId}:`, error)
      return []
    }
  }

  /**
   * Get subscription by ID
   */
  async getSubscriptionById(
    subscriptionId: string
  ): Promise<SubscriptionWithStrategy | null> {
    try {
      const subscription = await prisma.strategySubscription.findUnique({
        where: { id: subscriptionId },
        include: {
          strategy: {
            select: {
              id: true,
              name: true,
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
      })

      return subscription as SubscriptionWithStrategy | null
    } catch (error) {
      console.error(`Failed to get subscription ${subscriptionId}:`, error)
      return null
    }
  }

  /**
   * Update subscription settings
   */
  async updateSettings(
    subscriptionId: string,
    updates: Partial<{
      capital: number
      riskPerTrade: number
      leverage: number
      maxPositions: number
      maxDailyLoss: number
      slAtrMultiplier: number
      tpAtrMultiplier: number
    }>
  ): Promise<boolean> {
    try {
      // Update in database
      const subscription = await prisma.strategySubscription.update({
        where: { id: subscriptionId },
        data: updates,
      })

      // Update in Redis
      const redisUpdates: Record<string, any> = {}
      if (updates.capital !== undefined) redisUpdates.capital = updates.capital
      if (updates.riskPerTrade !== undefined) redisUpdates.risk_per_trade = updates.riskPerTrade
      if (updates.leverage !== undefined) redisUpdates.leverage = updates.leverage
      if (updates.maxPositions !== undefined) redisUpdates.max_positions = updates.maxPositions
      if (updates.maxDailyLoss !== undefined) redisUpdates.max_daily_loss = updates.maxDailyLoss
      if (updates.slAtrMultiplier !== undefined)
        redisUpdates.sl_atr_multiplier = updates.slAtrMultiplier
      if (updates.tpAtrMultiplier !== undefined)
        redisUpdates.tp_atr_multiplier = updates.tpAtrMultiplier

      await settingsService.updateSubscriptionSettings(
        subscription.userId,
        subscription.strategyId,
        redisUpdates
      )

      console.log(
        `Updated subscription ${subscriptionId} settings: ${Object.keys(updates).join(', ')}`
      )

      return true
    } catch (error) {
      console.error(`Failed to update subscription ${subscriptionId}:`, error)
      return false
    }
  }

  /**
   * Get subscription statistics
   */
  async getStats(subscriptionId: string): Promise<{
    totalTrades: number
    winningTrades: number
    losingTrades: number
    winRate: number
    totalPnl: number
  } | null> {
    try {
      const subscription = await prisma.strategySubscription.findUnique({
        where: { id: subscriptionId },
        select: {
          totalTrades: true,
          winningTrades: true,
          losingTrades: true,
          totalPnl: true,
        },
      })

      if (!subscription) {
        return null
      }

      const winRate =
        subscription.totalTrades > 0
          ? subscription.winningTrades / subscription.totalTrades
          : 0

      return {
        totalTrades: subscription.totalTrades,
        winningTrades: subscription.winningTrades,
        losingTrades: subscription.losingTrades,
        winRate,
        totalPnl: subscription.totalPnl,
      }
    } catch (error) {
      console.error(`Failed to get stats for subscription ${subscriptionId}:`, error)
      return null
    }
  }
}

// Singleton instance
export const subscriptionService = new SubscriptionService()
