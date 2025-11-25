import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as CoinDCXClient from '../services/coindcx-client';
import prisma from '../utils/database';
import { AuthenticatedRequest } from '../types';
import { subscriptionService } from '../services/strategy-execution/subscription-service';
import { settingsService } from '../services/strategy-execution/settings-service';
import { executionCoordinator } from '../services/strategy-execution/execution-coordinator';
import { logger } from '../utils/logger';

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
      leverage,  // No default - let it be undefined to inherit strategy default
      maxPositions,  // No default - let it be undefined to inherit strategy default
      maxDailyLoss,  // No default - let it be undefined to inherit strategy default
      slAtrMultiplier,
      tpAtrMultiplier,
      brokerCredentialId,
      tradingType,
      marginCurrency
    } = req.body;

    // Validate required fields (only capital and broker required - others use strategy defaults)
    if (!capital || !brokerCredentialId) {
      return res.status(400).json({
        error: 'Missing required fields: capital, brokerCredentialId'
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

    // Fetch strategy to get defaults and validate balance
    const strategy = await prisma.strategy.findUnique({
      where: { id: strategyId },
      select: {
        executionConfig: true,
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { configData: true }
        }
      }
    });

    if (!strategy) {
      return res.status(404).json({
        error: 'Strategy not found'
      });
    }

    // Get strategy defaults for optional parameters
    const execCfg: any = (strategy.executionConfig as any) || {};
    const latestVersion = strategy.versions[0];
    const configData = (latestVersion?.configData as any) || {};

    // Use provided values or fall back to strategy defaults
    const finalRiskPerTrade = riskPerTrade ?? configData.risk_per_trade ?? execCfg.risk_per_trade ?? 0.02;
    const finalLeverage = leverage ?? configData.leverage ?? execCfg.leverage ?? 10;
    const finalMaxPositions = maxPositions ?? configData.max_positions ?? execCfg.max_positions ?? 1;
    const finalMaxDailyLoss = maxDailyLoss ?? configData.max_daily_loss ?? execCfg.max_daily_loss ?? 0.05;

    // Futures-only balance check (all strategies use futures)
    try {

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

    // Create subscription (use final values with defaults)
    const result = await subscriptionService.createSubscription({
      userId,
      strategyId,
      capital,
      riskPerTrade: finalRiskPerTrade,
      leverage: finalLeverage,
      maxPositions: finalMaxPositions,
      maxDailyLoss: finalMaxDailyLoss,
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
        riskPerTrade: finalRiskPerTrade,
        leverage: finalLeverage
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
        // Resolve subscription settings (merge user overrides with strategy defaults)
        const strategyConfig = sub.strategy?.executionConfig as any || {};
        const resolvedSettings = {
          riskPerTrade: sub.riskPerTrade ?? strategyConfig.risk_per_trade ?? 0.02,
          leverage: sub.leverage ?? strategyConfig.leverage ?? 10,
          maxPositions: sub.maxPositions ?? strategyConfig.max_positions ?? 1,
          maxDailyLoss: sub.maxDailyLoss ?? strategyConfig.max_daily_loss ?? 0.05,
        };

        // Get all trades for this subscription
        const trades = await prisma.trade.findMany({
          where: { subscriptionId: sub.id },
          select: {
            pnl: true,
            status: true,
            createdAt: true,
            side: true,
            entryPrice: true,
            quantity: true,
            symbol: true,
          }
        });

        const totalTrades = trades.length;
        const openTrades = trades.filter(t => t.status === 'OPEN');
        const closedTrades = trades.filter(t => t.status === 'CLOSED');

        // Calculate realized P&L (only from closed trades)
        const realizedPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);

        // Calculate unrealized P&L (from open positions)
        let unrealizedPnl = 0;
        try {
          const { websocketTicker } = require('../services/websocket-ticker');

          for (const trade of openTrades) {
            try {
              // Use WebSocket service with fallback to REST API
              const currentPrice = await websocketTicker.getPrice(trade.symbol);

              // Calculate unrealized P&L
              if (trade.side === 'LONG') {
                unrealizedPnl += (currentPrice - trade.entryPrice) * trade.quantity;
              } else {
                unrealizedPnl += (trade.entryPrice - currentPrice) * trade.quantity;
              }
            } catch (error) {
              // If we can't get current price, skip this trade
              console.warn(`Could not get price for ${trade.symbol}:`, error);
            }
          }
        } catch (error) {
          console.error('Failed to calculate unrealized P&L:', error);
        }

        // Total P&L = realized + unrealized
        const totalPnl = realizedPnl + unrealizedPnl;

        // Calculate win rate (only from closed trades with non-null pnl)
        const closedTradesWithPnl = closedTrades.filter(t => t.pnl !== null);
        const winningTrades = closedTradesWithPnl.filter(t => t.pnl! > 0).length;
        const winRate = closedTradesWithPnl.length > 0
          ? (winningTrades / closedTradesWithPnl.length) * 100
          : 0;

        return {
          ...sub,
          // Override with resolved settings
          riskPerTrade: resolvedSettings.riskPerTrade,
          leverage: resolvedSettings.leverage,
          maxPositions: resolvedSettings.maxPositions,
          maxDailyLoss: resolvedSettings.maxDailyLoss,
          liveStats: {
            totalTrades,
            openPositions: openTrades.length,
            totalPnl,
            realizedPnl,
            unrealizedPnl,
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
 * GET /api/strategies/subscriptions/:id/equity-curve
 * Get equity curve and stats - tries DB first, then falls back to CoinDCX API
 */
router.get('/subscriptions/:id/equity-curve', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id: subscriptionId } = req.params;
    const userId = req.userId!;
    const { forceRefresh } = req.query;

    logger.info(`[Equity Curve] Request for subscription ${subscriptionId} by user ${userId}`);

    // Verify subscription belongs to user
    const subscription = await prisma.strategySubscription.findFirst({
      where: { id: subscriptionId, userId },
      include: {
        strategy: { select: { id: true, executionConfig: true } },
        brokerCredential: { select: { apiKey: true, apiSecret: true } }
      }
    });

    if (!subscription) {
      logger.warn(`[Equity Curve] Subscription ${subscriptionId} not found for user ${userId}`);
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const executionConfig = subscription.strategy.executionConfig as any;
    const pair = executionConfig?.symbol || executionConfig?.pair;

    // ====================================================================
    // STEP 1: Try to get trades from database first (fast, reliable)
    // ====================================================================
    if (forceRefresh !== 'true') {
      const dbTrades = await prisma.trade.findMany({
        where: { subscriptionId },
        orderBy: { createdAt: 'asc' }
      });

      if (dbTrades.length > 0) {
        logger.info(`[Equity Curve] Found ${dbTrades.length} trades in database`);

        // Calculate stats from DB trades
        const closedTrades = dbTrades.filter(t => t.status === 'CLOSED');
        const grossPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
        const totalFees = closedTrades.reduce((sum, t) => sum + (t.fees || 0), 0);
        const netPnl = grossPnl - totalFees;
        const winningTrades = closedTrades.filter(t => (t.pnl || 0) > 0).length;
        const losingTrades = closedTrades.filter(t => (t.pnl || 0) < 0).length;
        const winRate = closedTrades.length > 0 ? (winningTrades / closedTrades.length) * 100 : 0;

        // Calculate max drawdown
        const initialCapital = subscription.capital;
        let runningPnl = 0;
        let maxDrawdown = 0;
        let peak = initialCapital;
        const pnlSequence = closedTrades.map(t => t.pnl || 0);

        pnlSequence.forEach(tradePnl => {
          runningPnl += tradePnl;
          const currentCapital = initialCapital + runningPnl;
          if (currentCapital > peak) peak = currentCapital;
          const drawdown = peak - currentCapital;
          maxDrawdown = Math.max(maxDrawdown, drawdown);
        });

        const maxDrawdownPct = initialCapital > 0 ? (maxDrawdown / initialCapital) * 100 : 0;

        // Build equity curve from DB trades
        const dailyData: { [key: string]: number } = {};
        closedTrades.forEach(trade => {
          if (trade.exitedAt && trade.pnl) {
            const date = trade.exitedAt.toISOString().split('T')[0];
            if (!dailyData[date]) dailyData[date] = 0;
            dailyData[date] += trade.pnl;
          }
        });

        let cumulativePnl = 0;
        const startDate = subscription.subscribedAt.toISOString().split('T')[0];
        const equityCurve: Array<{ date: string; dailyPnl: number; cumulativePnl: number }> = [
          { date: startDate, dailyPnl: 0, cumulativePnl: 0 }
        ];

        Object.keys(dailyData).sort().forEach(date => {
          const dailyPnl = dailyData[date];
          cumulativePnl += dailyPnl;
          equityCurve.push({
            date,
            dailyPnl: parseFloat(dailyPnl.toFixed(2)),
            cumulativePnl: parseFloat(cumulativePnl.toFixed(2))
          });
        });

        return res.json({
          subscriptionId,
          source: 'database',
          equityCurve,
          stats: {
            grossPnl: parseFloat(grossPnl.toFixed(2)),
            netPnl: parseFloat(netPnl.toFixed(2)),
            totalFees: parseFloat(totalFees.toFixed(2)),
            totalTrades: closedTrades.length,
            openTrades: dbTrades.filter(t => t.status === 'OPEN').length,
            winRate: parseFloat(winRate.toFixed(2)),
            maxDrawdownPct: parseFloat(maxDrawdownPct.toFixed(4))
          }
        });
      }
    }

    // ====================================================================
    // STEP 2: Fallback to CoinDCX API (for historical data)
    // ====================================================================
    logger.info(`[Equity Curve] No DB trades found, falling back to CoinDCX API`);

    if (!subscription.brokerCredential) {
      logger.warn(`[Equity Curve] No broker credentials for subscription ${subscriptionId}`);
      return res.status(400).json({ error: 'No broker credentials found' });
    }

    if (!pair) {
      logger.error(`[Equity Curve] No trading pair in executionConfig: ${JSON.stringify(executionConfig)}`);
      return res.status(400).json({ error: 'Trading pair not found in strategy config' });
    }

    const minTimestamp = subscription.subscribedAt.getTime();

    // Get margin currency from strategy executionConfig (this is what's actually used for trading)
    const marginCurrency = (executionConfig?.margin_currency || subscription.marginCurrency || 'USDT').toUpperCase();

    // Calculate date range for trades API (from subscription start to tomorrow)
    // Note: CoinDCX trades API needs to_date to be tomorrow to include today's trades
    const fromDate = new Date(minTimestamp).toISOString().split('T')[0]; // YYYY-MM-DD
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const toDate = tomorrow.toISOString().split('T')[0]; // Tomorrow

    logger.info(`[Equity Curve] Fetching trades for pair=${pair}, marginCurrency=${marginCurrency}, from=${fromDate}, to=${toDate}`);

    // Fetch filled ORDERS (not trades) from CoinDCX - orders have client_order_id, trades don't
    let allOrders: any[] = [];
    let page = 1;

    while (true) {
      const orders = await CoinDCXClient.listFuturesOrders(
        subscription.brokerCredential.apiKey,
        subscription.brokerCredential.apiSecret,
        {
          timestamp: Date.now(),
          status: 'filled',
          side: 'buy,sell',
          page: String(page),
          size: '100',
          margin_currency_short_name: [marginCurrency]
        }
      );

      if (!orders || orders.length === 0) break;
      allOrders.push(...orders);
      page++;
      if (orders.length < 100) break;
    }

    logger.info(`[Equity Curve] Fetched ${allOrders.length} total filled orders from CoinDCX`);

    // Debug: Count orders by pair and client_order_id prefix
    const pairCounts: { [key: string]: number } = {};
    const platformOrders: { [key: string]: number } = {};
    allOrders.forEach(order => {
      const p = order.pair || 'unknown';
      pairCounts[p] = (pairCounts[p] || 0) + 1;

      const clientOrderId = order.client_order_id || '';
      if (clientOrderId.toLowerCase().startsWith('xc')) {
        platformOrders[p] = (platformOrders[p] || 0) + 1;
      }
    });
    logger.info(`[Equity Curve] Orders by pair: ${JSON.stringify(pairCounts)}`);
    logger.info(`[Equity Curve] Platform orders (xc prefix) by pair: ${JSON.stringify(platformOrders)}`);

    if (allOrders.length > 0) {
      const samplePlatformOrder = allOrders.find(o => (o.client_order_id || '').toLowerCase().startsWith('xc'));
      if (samplePlatformOrder) {
        logger.info(`[Equity Curve] Sample platform order: ${JSON.stringify(samplePlatformOrder)}`);
      }
    }

    // Filter for our platform orders:
    // 1. After subscription start time
    // 2. client_order_id starts with 'xc' (covers xc_, xcoin_, xc_manish, etc.)
    // Note: We're NOT filtering by pair anymore since strategies may trade multiple pairs
    //       or the subscription's configured pair may not match actual orders
    const filteredTrades = allOrders.filter(order => {
      const orderTime = new Date(order.updated_at).getTime();
      const clientOrderId = order.client_order_id || '';
      const isOurTrade = clientOrderId.toLowerCase().startsWith('xc');
      return orderTime >= minTimestamp && isOurTrade;
    });

    logger.info(`[Equity Curve] After filtering: ${filteredTrades.length} platform orders (xc prefix), excluded ${allOrders.length - filteredTrades.length} non-platform orders`);

    if (filteredTrades.length === 0) {
      return res.json({
        subscriptionId,
        equityCurve: [],
        stats: {
          grossPnl: 0,
          netPnl: 0,
          totalFees: 0,
          totalTrades: 0,
          winRate: 0,
          maxDrawdownPct: 0
        }
      });
    }

    // Sort orders by updated_at timestamp
    const sortedTrades = filteredTrades.sort((a, b) =>
      new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
    );

    // Calculate P&L by tracking positions PER PAIR (since we may have multiple pairs)
    interface Position {
      entryPrice: number;
      quantity: number;
      side: 'buy' | 'sell';
      entryTime: Date;
    }

    const positions: { [pair: string]: Position | null } = {};
    let totalFees = 0;
    let grossPnl = 0;
    let completedTrades = 0;
    let winningTrades = 0;
    let losingTrades = 0;
    const pnlSequence: number[] = [];
    const dailyData: { [key: string]: number } = {};

    // USDT to INR conversion rate on CoinDCX (changes ~every 6 months)
    // Current rate: 96 INR = 1 USDT (as of Nov 2025)
    // TODO: Can fetch dynamically from CoinDCX API if needed
    const USDT_INR_RATE = 96;
    const conversionRate = marginCurrency === 'INR' ? USDT_INR_RATE : 1;

    sortedTrades.forEach(order => {
      const orderPair = order.pair;
      const side = order.side.toLowerCase();
      const price = parseFloat(order.avg_price);  // Orders use avg_price
      const quantity = parseFloat(order.total_quantity);  // Orders use total_quantity
      const fee = parseFloat(order.fee_amount || order.total_fee || 0);
      const tradeDate = new Date(order.updated_at).toISOString().split('T')[0];

      // Convert fee to margin currency (fees from CoinDCX are in USDT)
      totalFees += fee * conversionRate;

      const position = positions[orderPair];

      if (!position) {
        // Opening a new position for this pair
        positions[orderPair] = {
          entryPrice: price,
          quantity,
          side: side as 'buy' | 'sell',
          entryTime: new Date(order.updated_at)
        };
      } else {
        // Closing or modifying existing position for this pair
        if ((position.side === 'buy' && side === 'sell') || (position.side === 'sell' && side === 'buy')) {
          // Closing trade - calculate P&L in USDT then convert to margin currency
          let tradePnl = 0;
          if (position.side === 'buy') {
            // Long position: profit when sell price > entry price
            tradePnl = (price - position.entryPrice) * Math.min(quantity, position.quantity) * conversionRate;
          } else {
            // Short position: profit when sell price < entry price
            tradePnl = (position.entryPrice - price) * Math.min(quantity, position.quantity) * conversionRate;
          }

          grossPnl += tradePnl;
          pnlSequence.push(tradePnl);
          completedTrades++;

          if (tradePnl > 0) winningTrades++;
          else if (tradePnl < 0) losingTrades++;

          // Add to daily data
          if (!dailyData[tradeDate]) dailyData[tradeDate] = 0;
          dailyData[tradeDate] += tradePnl;

          // Update or close position for this pair
          if (quantity >= position.quantity) {
            positions[orderPair] = null; // Position fully closed
          } else {
            position.quantity -= quantity; // Partial close
          }
        }
      }
    });

    const openPositions = Object.entries(positions).filter(([_, pos]) => pos !== null);
    logger.info(`[Equity Curve] Processed trades: completedTrades=${completedTrades}, grossPnl=${grossPnl}, totalFees=${totalFees}, openPositions=${openPositions.length}, marginCurrency=${marginCurrency}, conversionRate=${conversionRate}`);
    if (openPositions.length > 0) {
      openPositions.forEach(([pairName, pos]) => {
        if (pos) logger.info(`[Equity Curve] Open position for ${pairName}: side=${pos.side}, quantity=${pos.quantity}, entryPrice=${pos.entryPrice}`);
      });
    }

    const netPnl = grossPnl - totalFees;
    const winRate = completedTrades > 0 ? (winningTrades / completedTrades) * 100 : 0;

    // Calculate max drawdown
    const initialCapital = subscription.capital;
    let runningPnl = 0;
    let maxDrawdown = 0;
    let peak = initialCapital;

    pnlSequence.forEach(tradePnl => {
      runningPnl += tradePnl;
      const currentCapital = initialCapital + runningPnl;

      if (currentCapital > peak) {
        peak = currentCapital;
      }

      const drawdown = peak - currentCapital;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    });

    const maxDrawdownPct = initialCapital > 0 ? (maxDrawdown / initialCapital) * 100 : 0;

    // Calculate cumulative P&L with starting point
    let cumulativePnl = 0;
    const equityCurve: Array<{ date: string; dailyPnl: number; cumulativePnl: number }> = [];

    // Always add a starting point at subscription start date with 0 P&L
    const startDate = new Date(minTimestamp).toISOString().split('T')[0];
    equityCurve.push({
      date: startDate,
      dailyPnl: 0,
      cumulativePnl: 0
    });

    // Add all trading days
    Object.keys(dailyData)
      .sort()
      .forEach(date => {
        const dailyPnl = dailyData[date];
        cumulativePnl += dailyPnl;
        equityCurve.push({
          date,
          dailyPnl: parseFloat(dailyPnl.toFixed(2)),
          cumulativePnl: parseFloat(cumulativePnl.toFixed(2))
        });
      });

    logger.info(`[Equity Curve] Returning ${equityCurve.length} equity curve data points, stats: ${JSON.stringify({grossPnl, netPnl, totalFees, completedTrades, winRate})}`);

    res.json({
      subscriptionId,
      equityCurve,
      stats: {
        grossPnl: parseFloat(grossPnl.toFixed(2)),
        netPnl: parseFloat(netPnl.toFixed(2)),
        totalFees: parseFloat(totalFees.toFixed(2)),
        totalTrades: completedTrades,
        winRate: parseFloat(winRate.toFixed(2)),
        maxDrawdownPct: parseFloat(maxDrawdownPct.toFixed(4))
      }
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

/**
 * POST /api/strategies/:id/admin/bulk-subscribe
 * Bulk subscribe multiple users to a strategy (admin only)
 */
router.post('/:id/admin/bulk-subscribe', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id: strategyId } = req.params;
    const { users, capital, riskPerTrade, leverage } = req.body;
    const userId = req.userId!;

    // Check admin role
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (!Array.isArray(users) || users.length === 0) {
      return res.status(400).json({ error: 'users array is required (array of email addresses)' });
    }

    if (!capital) {
      return res.status(400).json({ error: 'capital is required' });
    }

    const results = await Promise.all(users.map(async (email: string) => {
      const result: any = { email, status: 'failed', error: null, subscriptionId: null };

      try {
        const targetUser = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
        if (!targetUser) {
          result.error = 'User not found';
          return result;
        }

        const brokerCredential = await prisma.brokerCredential.findFirst({
          where: { userId: targetUser.id, isActive: true }
        });
        if (!brokerCredential) {
          result.error = 'No active broker credentials';
          return result;
        }

        const existing = await prisma.strategySubscription.findFirst({
          where: { userId: targetUser.id, strategyId, isActive: true }
        });
        if (existing) {
          result.status = 'already_subscribed';
          result.subscriptionId = existing.id;
          return result;
        }

        const wallets = await CoinDCXClient.getFuturesWallets(brokerCredential.apiKey, brokerCredential.apiSecret);
        const calculateAvailable = (w: any) => Number(w.balance || 0) - (Number(w.cross_order_margin || 0) + Number(w.cross_user_margin || 0));
        const primaryWallet = wallets.find((w: any) => w.currency_short_name === 'INR') || wallets.find((w: any) => w.currency_short_name === 'USDT');

        if (!primaryWallet) {
          result.error = 'No futures wallet found';
          return result;
        }

        const available = calculateAvailable(primaryWallet);
        if (!isFinite(available) || available < Number(capital)) {
          result.error = `Insufficient funds: ${available.toFixed(2)} < ${capital}`;
          return result;
        }

        const subscription = await subscriptionService.createSubscription({
          userId: targetUser.id,
          strategyId,
          capital: Number(capital),
          riskPerTrade: riskPerTrade || 0.1,
          leverage: leverage || 10,
          brokerCredentialId: brokerCredential.id,
          maxPositions: 1,
          maxDailyLoss: 0.05
        });

        result.status = 'success';
        result.subscriptionId = subscription.subscriptionId;
      } catch (error: any) {
        result.error = error.message || String(error);
      }
      return result;
    }));

    const summary = {
      total: results.length,
      success: results.filter((r: any) => r.status === 'success').length,
      already_subscribed: results.filter((r: any) => r.status === 'already_subscribed').length,
      failed: results.filter((r: any) => r.status === 'failed').length
    };

    res.json({ summary, results });
  } catch (error) {
    console.error('Bulk subscribe error:', error);
    next(error);
  }
});

/**
 * POST /api/strategies/trades
 * Internal endpoint for Python executor to report trades
 * Secured with internal API key (not user auth)
 */
router.post('/trades', async (req, res, next) => {
  try {
    const internalKey = req.headers['x-internal-key'];
    const expectedKey = process.env.INTERNAL_API_KEY || 'xcoinalgo-internal-key-2024';

    if (internalKey !== expectedKey) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      subscriptionId,
      strategyId,
      userId,
      // Order details
      symbol,
      side,
      quantity,
      entryPrice,
      leverage,
      orderType,
      stopLoss,
      takeProfit,
      // CoinDCX response
      orderId,
      clientOrderId,
      status,
      filledPrice,
      filledQuantity,
      // Exit details (optional - for exit trades)
      exitPrice,
      exitReason,
      pnl,
      fees,
      // Metadata
      metadata
    } = req.body;

    if (!subscriptionId || !symbol || !side) {
      return res.status(400).json({
        error: 'Missing required fields: subscriptionId, symbol, side'
      });
    }

    // Determine if this is an entry or exit trade
    const isExit = exitPrice !== undefined || exitReason !== undefined;

    if (isExit) {
      // Update existing open trade with exit details
      const openTrade = await prisma.trade.findFirst({
        where: {
          subscriptionId,
          symbol,
          status: 'OPEN'
        },
        orderBy: { createdAt: 'desc' }
      });

      if (openTrade) {
        const updatedTrade = await prisma.trade.update({
          where: { id: openTrade.id },
          data: {
            status: 'CLOSED',
            exitPrice: exitPrice || filledPrice,
            exitedAt: new Date(),
            exitReason: exitReason || 'signal',
            pnl: pnl,
            fees: fees || 0,
            metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined
          }
        });

        // Update subscription stats
        await prisma.strategySubscription.update({
          where: { id: subscriptionId },
          data: {
            totalTrades: { increment: 1 },
            winningTrades: pnl && pnl > 0 ? { increment: 1 } : undefined,
            losingTrades: pnl && pnl < 0 ? { increment: 1 } : undefined,
            totalPnl: { increment: pnl || 0 }
          }
        });

        logger.info(`[Trade Reporter] Exit trade recorded: ${updatedTrade.id}, PnL: ${pnl}`);

        return res.json({
          success: true,
          trade: updatedTrade,
          type: 'exit'
        });
      } else {
        logger.warn(`[Trade Reporter] No open trade found for exit: ${subscriptionId}, ${symbol}`);
      }
    }

    // Create new entry trade
    const trade = await prisma.trade.create({
      data: {
        subscriptionId,
        symbol,
        side: side.toUpperCase(),
        quantity: quantity || 0,
        entryPrice: entryPrice || filledPrice || 0,
        leverage,
        orderType: orderType || 'market',
        stopLoss,
        takeProfit,
        orderId,
        status: 'OPEN',
        filledPrice,
        filledQuantity,
        filledAt: new Date(),
        tradingType: 'futures',
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined
      }
    });

    logger.info(`[Trade Reporter] Entry trade recorded: ${trade.id}, ${side} ${quantity} ${symbol} @ ${entryPrice || filledPrice}`);

    res.json({
      success: true,
      trade,
      type: 'entry'
    });

  } catch (error) {
    logger.error('[Trade Reporter] Error recording trade:', error);
    next(error);
  }
});

/**
 * GET /api/strategies/subscriptions/:id/trades
 * Get trades for a subscription (from DB + CoinDCX fallback for historical)
 */
router.get('/subscriptions/:id/trades', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id: subscriptionId } = req.params;
    const userId = req.userId!;
    const { includeHistorical } = req.query;

    // Verify subscription belongs to user
    const subscription = await prisma.strategySubscription.findFirst({
      where: { id: subscriptionId, userId },
      include: {
        strategy: { select: { executionConfig: true } },
        brokerCredential: { select: { apiKey: true, apiSecret: true } }
      }
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    // Get trades from database
    const dbTrades = await prisma.trade.findMany({
      where: { subscriptionId },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    // If we have DB trades or don't want historical, return DB trades
    if (dbTrades.length > 0 || includeHistorical !== 'true') {
      return res.json({
        trades: dbTrades,
        source: 'database',
        count: dbTrades.length
      });
    }

    // Fallback: Fetch from CoinDCX for historical trades (using xc_ prefix)
    if (subscription.brokerCredential) {
      try {
        const executionConfig = subscription.strategy.executionConfig as any;
        const pair = executionConfig?.symbol || executionConfig?.pair;
        const marginCurrency = executionConfig?.margin_currency || subscription.marginCurrency || 'USDT';

        // Calculate date range
        const fromDate = subscription.subscribedAt.toISOString().split('T')[0];
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const toDate = tomorrow.toISOString().split('T')[0];

        // Fetch filled orders from CoinDCX
        let allOrders: any[] = [];
        let page = 1;

        while (true) {
          const orders = await CoinDCXClient.listFuturesOrders(
            subscription.brokerCredential.apiKey,
            subscription.brokerCredential.apiSecret,
            {
              timestamp: Date.now(),
              status: 'filled',
              side: 'buy,sell',
              page: String(page),
              size: '100',
              margin_currency_short_name: [marginCurrency]
            }
          );

          if (!orders || orders.length === 0) break;
          allOrders.push(...orders);
          page++;
          if (orders.length < 100) break;
        }

        // Filter for our trades (xc_ prefix) and this pair
        const ourTrades = allOrders.filter((order: any) =>
          order.pair === pair &&
          order.client_order_id?.startsWith('xc_') &&
          new Date(order.updated_at) >= subscription.subscribedAt
        );

        // Sort by time
        ourTrades.sort((a: any, b: any) => a.updated_at - b.updated_at);

        // Pair entries with exits
        const pairedTrades: any[] = [];
        let currentEntry: any = null;

        for (const order of ourTrades) {
          if (!currentEntry) {
            currentEntry = order;
          } else if (order.side !== currentEntry.side) {
            // This is an exit
            const entryPrice = currentEntry.avg_price;
            const exitPrice = order.avg_price;
            const qty = currentEntry.total_quantity;
            const pnl = currentEntry.side === 'buy'
              ? (exitPrice - entryPrice) * qty
              : (entryPrice - exitPrice) * qty;

            pairedTrades.push({
              id: currentEntry.id,
              symbol: pair,
              side: currentEntry.side.toUpperCase(),
              quantity: qty,
              entryPrice,
              exitPrice,
              pnl,
              status: 'CLOSED',
              createdAt: new Date(currentEntry.updated_at),
              exitedAt: new Date(order.updated_at),
              leverage: currentEntry.leverage,
              clientOrderId: currentEntry.client_order_id
            });
            currentEntry = null;
          } else {
            // Same side - new entry
            currentEntry = order;
          }
        }

        // Add any open position
        if (currentEntry) {
          pairedTrades.push({
            id: currentEntry.id,
            symbol: pair,
            side: currentEntry.side.toUpperCase(),
            quantity: currentEntry.total_quantity,
            entryPrice: currentEntry.avg_price,
            status: 'OPEN',
            createdAt: new Date(currentEntry.updated_at),
            leverage: currentEntry.leverage,
            clientOrderId: currentEntry.client_order_id
          });
        }

        return res.json({
          trades: pairedTrades,
          source: 'coindcx',
          count: pairedTrades.length
        });

      } catch (coindcxError) {
        logger.error('[Trades] CoinDCX fallback failed:', coindcxError);
        return res.json({
          trades: [],
          source: 'database',
          count: 0,
          error: 'Could not fetch historical trades from CoinDCX'
        });
      }
    }

    res.json({
      trades: dbTrades,
      source: 'database',
      count: dbTrades.length
    });

  } catch (error) {
    next(error);
  }
});

export { router as strategyExecutionRoutes };
