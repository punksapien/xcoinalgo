import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as CoinDCXClient from '../services/coindcx-client';
import prisma from '../utils/database';
import { AuthenticatedRequest } from '../types';
import { subscriptionService } from '../services/strategy-execution/subscription-service';
import { settingsService } from '../services/strategy-execution/settings-service';
import { executionCoordinator } from '../services/strategy-execution/execution-coordinator';

const router = Router();

/**
 * POST /api/strategies/deploy
 * Deploy a new strategy to the execution system
 */
router.post('/deploy', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { strategyId } = req.body;
    const userId = req.userId!;

    if (!strategyId) {
      return res.status(400).json({
        error: 'Strategy ID is required'
      });
    }

    // Validate strategy exists
    const strategy = await prisma.strategy.findUnique({
      where: { id: strategyId },
      select: {
        id: true,
        name: true,
        isActive: true,
        executionConfig: true
      }
    });

    if (!strategy || !strategy.isActive) {
      return res.status(404).json({
        error: 'Strategy not found or not active'
      });
    }

    // Extract execution config
    const executionConfig = strategy.executionConfig as any;

    if (!executionConfig || !executionConfig.symbol || !executionConfig.resolution) {
      return res.status(400).json({
        error: 'Strategy execution config is invalid. Must contain symbol and resolution.'
      });
    }

    // Initialize strategy settings in Redis
    const initialized = await settingsService.initializeStrategy(
      strategyId,
      {
        symbol: executionConfig.symbol,
        resolution: executionConfig.resolution,
        lookback_period: executionConfig.lookbackPeriod || 200,
        ...executionConfig
      },
      1
    );

    if (!initialized) {
      return res.status(500).json({
        error: 'Failed to initialize strategy settings'
      });
    }

    res.json({
      message: 'Strategy deployed successfully',
      strategy: {
        id: strategy.id,
        name: strategy.name,
        symbol: executionConfig.symbol,
        resolution: executionConfig.resolution
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/strategies/:id/subscribe
 * Subscribe user to a strategy
 */
router.post('/:id/subscribe', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id: strategyId } = req.params;
    const userId = req.userId!;
    const {
      capital,
      riskPerTrade,
      leverage = 1,
      maxPositions = 1,
      maxDailyLoss = 0.05,
      slAtrMultiplier,
      tpAtrMultiplier,
      brokerCredentialId,
      tradingType,
      marginCurrency
    } = req.body;

    // Validate required fields
    if (!capital || !riskPerTrade || !brokerCredentialId) {
      return res.status(400).json({
        error: 'Missing required fields: capital, riskPerTrade, brokerCredentialId'
      });
    }

    // Validate broker credentials exist and belong to user
    const brokerCredential = await prisma.brokerCredential.findFirst({
      where: {
        id: brokerCredentialId,
        userId,
        isActive: true
      }
    });

    if (!brokerCredential) {
      return res.status(404).json({
        error: 'Broker credentials not found or inactive'
      });
    }

    // Server-side balance check (futures by default for B- pairs or supportsFutures)
    try {
      const strategy = await prisma.strategy.findUnique({
        where: { id: strategyId },
        select: { executionConfig: true }
      });

      const execCfg: any = (strategy?.executionConfig as any) || {};
      const symbol: string | undefined = execCfg.executionConfig?.symbol || execCfg.pair;
      const supportsFutures: boolean = !!(execCfg.supportsFutures ?? true);
      const inferredType: 'spot' | 'futures' = (tradingType as any) || (symbol?.startsWith('B-') || supportsFutures ? 'futures' : 'spot');

      if (inferredType === 'futures') {
        const wallets = await CoinDCXClient.getFuturesWallets(
          brokerCredential.apiKey,
          brokerCredential.apiSecret
        );
        const margin = (marginCurrency || 'USDT').toUpperCase();
        const w = wallets.find(w => (w as any).margin_currency_short_name === margin);
        const available = w ? Number((w as any).available_balance || 0) : 0;
        if (!isFinite(available) || available <= 0 || available < Number(capital)) {
          return res.status(400).json({
            error: `Insufficient ${margin} futures wallet balance. Required: ${capital}, Available: ${available}`
          });
        }
      }
    } catch (balanceErr) {
      return res.status(400).json({ error: 'Failed to validate broker balance', details: String(balanceErr) });
    }

    // Create subscription
    const result = await subscriptionService.createSubscription({
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
      tradingType,
      marginCurrency
    });

    res.json({
      message: 'Successfully subscribed to strategy',
      subscription: {
        id: result.subscriptionId,
        strategyId,
        isFirstSubscriber: result.isFirstSubscriber,
        capital,
        riskPerTrade,
        leverage
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/strategies/:id/settings
 * Update strategy settings (affects all subscribers)
 */
router.put('/:id/settings', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id: strategyId } = req.params;
    const userId = req.userId!;
    const updates = req.body;

    // Verify strategy exists and is active
    const strategy = await prisma.strategy.findUnique({
      where: { id: strategyId },
      select: { isActive: true }
    });

    if (!strategy) {
      return res.status(404).json({
        error: 'Strategy not found'
      });
    }

    if (!strategy.isActive) {
      return res.status(400).json({
        error: 'Cannot update inactive strategy'
      });
    }

    // Update strategy settings in Redis
    const updated = await settingsService.updateStrategySettings(
      strategyId,
      updates,
      true // Publish update notification
    );

    if (!updated) {
      return res.status(500).json({
        error: 'Failed to update strategy settings'
      });
    }

    // Get updated settings
    const newSettings = await settingsService.getStrategySettings(strategyId, false);

    res.json({
      message: 'Strategy settings updated successfully',
      settings: newSettings
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/strategies/subscriptions/:id
 * Update user subscription settings
 */
router.put('/subscriptions/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id: subscriptionId } = req.params;
    const userId = req.userId!;
    const {
      capital,
      riskPerTrade,
      leverage,
      maxPositions,
      maxDailyLoss,
      slAtrMultiplier,
      tpAtrMultiplier
    } = req.body;

    // Verify subscription belongs to user
    const subscription = await prisma.strategySubscription.findFirst({
      where: {
        id: subscriptionId,
        userId
      }
    });

    if (!subscription) {
      return res.status(404).json({
        error: 'Subscription not found'
      });
    }

    // Prepare updates
    const updates: any = {};
    if (capital !== undefined) updates.capital = capital;
    if (riskPerTrade !== undefined) updates.riskPerTrade = riskPerTrade;
    if (leverage !== undefined) updates.leverage = leverage;
    if (maxPositions !== undefined) updates.maxPositions = maxPositions;
    if (maxDailyLoss !== undefined) updates.maxDailyLoss = maxDailyLoss;
    if (slAtrMultiplier !== undefined) updates.slAtrMultiplier = slAtrMultiplier;
    if (tpAtrMultiplier !== undefined) updates.tpAtrMultiplier = tpAtrMultiplier;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'No updates provided'
      });
    }

    // Update subscription settings
    const updated = await subscriptionService.updateSettings(subscriptionId, updates);

    if (!updated) {
      return res.status(500).json({
        error: 'Failed to update subscription settings'
      });
    }

    // Get updated subscription
    const updatedSubscription = await subscriptionService.getSubscriptionById(subscriptionId);

    res.json({
      message: 'Subscription settings updated successfully',
      subscription: updatedSubscription
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/strategies/subscriptions/:id/pause
 * Pause a subscription
 */
router.post('/subscriptions/:id/pause', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id: subscriptionId } = req.params;
    const userId = req.userId!;

    // Verify subscription belongs to user
    const subscription = await prisma.strategySubscription.findFirst({
      where: {
        id: subscriptionId,
        userId
      }
    });

    if (!subscription) {
      return res.status(404).json({
        error: 'Subscription not found'
      });
    }

    const paused = await subscriptionService.pauseSubscription(subscriptionId);

    if (!paused) {
      return res.status(500).json({
        error: 'Failed to pause subscription'
      });
    }

    res.json({
      message: 'Subscription paused successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/strategies/subscriptions/:id/resume
 * Resume a paused subscription
 */
router.post('/subscriptions/:id/resume', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id: subscriptionId } = req.params;
    const userId = req.userId!;

    // Verify subscription belongs to user
    const subscription = await prisma.strategySubscription.findFirst({
      where: {
        id: subscriptionId,
        userId
      }
    });

    if (!subscription) {
      return res.status(404).json({
        error: 'Subscription not found'
      });
    }

    const resumed = await subscriptionService.resumeSubscription(subscriptionId);

    if (!resumed) {
      return res.status(500).json({
        error: 'Failed to resume subscription'
      });
    }

    res.json({
      message: 'Subscription resumed successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/strategies/subscriptions/:id
 * Cancel a subscription
 */
router.delete('/subscriptions/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id: subscriptionId } = req.params;
    const userId = req.userId!;

    // Verify subscription belongs to user
    const subscription = await prisma.strategySubscription.findFirst({
      where: {
        id: subscriptionId,
        userId
      }
    });

    if (!subscription) {
      return res.status(404).json({
        error: 'Subscription not found'
      });
    }

    const cancelled = await subscriptionService.cancelSubscription(subscriptionId);

    if (!cancelled) {
      return res.status(500).json({
        error: 'Failed to cancel subscription'
      });
    }

    res.json({
      message: 'Subscription cancelled successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/strategies/subscriptions/:id/stats
 * Get subscription statistics
 */
router.get('/subscriptions/:id/stats', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id: subscriptionId } = req.params;
    const userId = req.userId!;

    // Verify subscription belongs to user
    const subscription = await prisma.strategySubscription.findFirst({
      where: {
        id: subscriptionId,
        userId
      }
    });

    if (!subscription) {
      return res.status(404).json({
        error: 'Subscription not found'
      });
    }

    const stats = await subscriptionService.getStats(subscriptionId);

    res.json({
      subscription: {
        id: subscriptionId,
        strategyId: subscription.strategyId
      },
      stats
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/strategies/subscriptions
 * Get user's subscriptions
 */
router.get('/subscriptions', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;

    const subscriptions = await subscriptionService.getUserSubscriptions(userId);

    res.json({
      subscriptions
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/strategies/:id/stats
 * Get strategy execution statistics
 */
router.get('/:id/stats', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id: strategyId } = req.params;

    const stats = await executionCoordinator.getExecutionStats(strategyId);

    res.json({
      strategyId,
      stats
    });
  } catch (error) {
    next(error);
  }
});

export { router as strategyExecutionRoutes };
