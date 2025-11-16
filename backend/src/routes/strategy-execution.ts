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

    // Futures-only balance check (all strategies use futures)
    try {
      const strategy = await prisma.strategy.findUnique({
        where: { id: strategyId },
        select: { executionConfig: true }
      });

      const execCfg: any = (strategy?.executionConfig as any) || {};
      const symbol: string | undefined = execCfg.executionConfig?.symbol || execCfg.pair;

      // Fetch futures wallets and determine which currency user has (INR or USDT)
      try {
        const wallets = await CoinDCXClient.getFuturesWallets(
          brokerCredential.apiKey,
          brokerCredential.apiSecret
        );

        // Calculate available balance
        // Note: CoinDCX's 'balance' field already represents AVAILABLE balance (not locked in positions)
        // 'locked_balance' is separate funds locked in open positions/orders
        const calculateAvailable = (wallet: any): number => {
          const balance = Number(wallet.balance || 0);
          const crossOrder = Number(wallet.cross_order_margin || 0);
          const crossUser = Number(wallet.cross_user_margin || 0);
          return balance - (crossOrder + crossUser);
        };

        // Find which wallet user has (prefer INR for Indian users, fallback to USDT)
        const usdtWallet = wallets.find(w => (w as any).currency_short_name === 'USDT');
        const inrWallet = wallets.find(w => (w as any).currency_short_name === 'INR');
        const primaryWallet = inrWallet || usdtWallet;

        if (!primaryWallet) {
          return res.status(400).json({
            error: 'No futures wallet found. Please ensure you have a USDT or INR futures wallet on CoinDCX.'
          });
        }

        const currency = (primaryWallet as any).currency_short_name;
        const symbol = currency === 'INR' ? '₹' : '$';
        const available = calculateAvailable(primaryWallet);

        if (!isFinite(available) || available < Number(capital)) {
          return res.status(400).json({
            error: `Insufficient ${currency} futures wallet balance. Required: ${symbol}${capital}, Available: ${symbol}${available.toFixed(2)}. Please deposit ${currency} to your CoinDCX futures wallet.`
          });
        }
      } catch (walletErr: any) {
        // Provide specific error message based on failure reason
        const errorMsg = walletErr.message || String(walletErr);

        if (errorMsg.includes('not_found') || errorMsg.includes('404')) {
          return res.status(400).json({
            error: 'Unable to access CoinDCX futures wallet. Please ensure your API key has futures trading permissions enabled.',
            details: 'Go to CoinDCX → Settings → API Management → Edit your API key → Enable "Futures Trading" permission'
          });
        }

        if (errorMsg.includes('401') || errorMsg.includes('Authentication')) {
          return res.status(400).json({
            error: 'Invalid API credentials. Please reconnect your broker account.',
            details: errorMsg
          });
        }

        // Generic wallet fetch error
        return res.status(400).json({
          error: 'Failed to validate futures wallet balance',
          details: errorMsg
        });
      }
    } catch (balanceErr) {
      return res.status(400).json({
        error: 'Failed to validate broker balance',
        details: String(balanceErr)
      });
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
 * Get user's subscriptions with trading results
 */
router.get('/subscriptions', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;

    const subscriptions = await subscriptionService.getUserSubscriptions(userId);

    // Fetch trading results for each subscription
    const subscriptionsWithStats = await Promise.all(
      subscriptions.map(async (sub) => {
        // Get all trades for this subscription
        const trades = await prisma.trade.findMany({
          where: { subscriptionId: sub.id },
          select: {
            pnl: true,
            status: true,
            createdAt: true,
          }
        });

        const totalTrades = trades.length;
        const openPositions = trades.filter(t => t.status === 'OPEN').length;
        const closedTrades = trades.filter(t => t.status === 'CLOSED');

        // Calculate P&L (only from closed trades)
        const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);

        // Calculate win rate
        const winningTrades = closedTrades.filter(t => (t.pnl || 0) > 0).length;
        const winRate = closedTrades.length > 0 ? (winningTrades / closedTrades.length) * 100 : 0;

        return {
          ...sub,
          liveStats: {
            totalTrades,
            openPositions,
            totalPnl,
            winRate,
            closedTrades: closedTrades.length,
          }
        };
      })
    );

    res.json({
      subscriptions: subscriptionsWithStats
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

/**
 * GET /api/strategies/subscription/:id/verify-live
 * Verify if subscription is actually live on CoinDCX
 */
router.get('/subscription/:id/verify-live', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id: subscriptionId } = req.params;
    const userId = req.userId!;

    // Get subscription details
    const subscription = await prisma.strategySubscription.findFirst({
      where: {
        id: subscriptionId,
        userId
      },
      include: {
        strategy: {
          select: {
            name: true,
            executionConfig: true
          }
        },
        brokerCredential: {
          select: {
            apiKey: true,
            apiSecret: true
          }
        }
      }
    });

    if (!subscription) {
      return res.status(404).json({
        error: 'Subscription not found'
      });
    }

    if (!subscription.brokerCredential) {
      return res.status(400).json({
        error: 'No broker credentials found for this subscription'
      });
    }

    // Get execution config to determine trading pair
    const executionConfig = subscription.strategy?.executionConfig as any;
    const tradingPair = executionConfig?.symbol || executionConfig?.pair || 'UNKNOWN';

    // Check for open orders on CoinDCX
    try {
      const timestamp = Date.now();
      const body = {
        timestamp,
        status: 'open',
        side: 'buy,sell',
        page: '1',
        size: '100',
        margin_currency_short_name: ['INR', 'USDT']
      };

      const orders = await CoinDCXClient.listFuturesOrders(
        subscription.brokerCredential.apiKey,
        subscription.brokerCredential.apiSecret,
        body
      );

      // Filter orders for this specific trading pair
      const strategyOrders = orders.filter((order: any) =>
        order.pair === tradingPair && order.status === 'open'
      );

      res.json({
        subscriptionId,
        strategyName: subscription.strategy?.name,
        tradingPair,
        isLiveOnCoinDCX: strategyOrders.length > 0,
        openOrdersCount: strategyOrders.length,
        totalOpenOrders: orders.length,
        orders: strategyOrders.map((order: any) => ({
          id: order.id,
          pair: order.pair,
          side: order.side,
          orderType: order.order_type,
          price: order.price,
          quantity: order.total_quantity,
          remaining: order.remaining_quantity,
          leverage: order.leverage,
          createdAt: order.created_at
        }))
      });
    } catch (coindcxError: any) {
      return res.status(500).json({
        error: 'Failed to verify with CoinDCX',
        details: coindcxError.message,
        subscriptionId,
        strategyName: subscription.strategy?.name
      });
    }
  } catch (error) {
    next(error);
  }
});

export { router as strategyExecutionRoutes };
