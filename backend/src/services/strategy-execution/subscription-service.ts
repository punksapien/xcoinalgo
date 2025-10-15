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
  riskPerTrade: number
  leverage?: number
  maxPositions?: number
  maxDailyLoss?: number
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
   * Create a new subscription for a user
   */
  async createSubscription(
    params: CreateSubscriptionParams
  ): Promise<{ subscriptionId: string; isFirstSubscriber: boolean }> {
    const {
      userId,
      strategyId,
      capital,
      riskPerTrade,
      leverage = 1,
      maxPositions = 1,
      maxDailyLoss = 0.05,
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

      if (existing) {
        throw new Error(
          `User ${userId} is already subscribed to strategy ${strategyId}`
        )
      }

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

      const isFirstSubscriber = strategy.subscriberCount === 0

      // Infer trading type if not provided
      const execCfg: any = (strategy?.executionConfig as any) || {}
      const inferredTradingType: 'spot' | 'futures' = tradingType
        ? tradingType
        : (execCfg.symbol?.startsWith('B-') || !!execCfg.supportsFutures)
          ? 'futures' : 'spot'

      // Create subscription in database
      const subscription = await prisma.strategySubscription.create({
        data: {
          userId,
          strategyId,
          capital,
          riskPerTrade,
          leverage,
          maxPositions,
          maxDailyLoss,
          slAtrMultiplier,
          tpAtrMultiplier,
          brokerCredentialId,
          tradingType: inferredTradingType,
          marginCurrency: marginCurrency || 'USDT',
          isActive: true,
          isPaused: false,
        },
      })

      // Increment subscriber count
      await prisma.strategy.update({
        where: { id: strategyId },
        data: {
          subscriberCount: { increment: 1 },
        },
      })

      // Initialize subscription settings in Redis
      await settingsService.initializeSubscription(userId, strategyId, {
        capital,
        risk_per_trade: riskPerTrade,
        leverage,
        max_positions: maxPositions,
        max_daily_loss: maxDailyLoss,
        sl_atr_multiplier: slAtrMultiplier,
        tp_atr_multiplier: tpAtrMultiplier,
        broker_credential_id: brokerCredentialId,
        is_active: true,
      })

      // If first subscriber, register strategy in registry
      if (isFirstSubscriber && strategy.executionConfig) {
        const config = strategy.executionConfig as any

        // Support both 'symbol' and 'pair' fields
        const symbol = config.symbol || config.pair

        if (symbol && config.resolution) {
          // ✅ NEW: Initialize strategy settings in Redis with ALL parameters from executionConfig
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
            `Registered strategy ${strategyId} for ${symbol}/${config.resolution} ` +
            `(first subscriber)`
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
        `Created subscription ${subscription.id} for user ${userId} ` +
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

      // Mark as inactive and set unsubscribedAt
      await prisma.strategySubscription.update({
        where: { id: subscriptionId },
        data: {
          isActive: false,
          unsubscribedAt: new Date(),
        },
      })

      // Decrement subscriber count
      await prisma.strategy.update({
        where: { id: subscription.strategyId },
        data: {
          subscriberCount: { decrement: 1 },
        },
      })

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
