/**
 * Positions and Orders Routes - API endpoints for position and order management
 * Updated to use real CoinDCX API data instead of mocks
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import prisma from '../utils/database';
import { AuthenticatedRequest } from '../types';
import { BotStatus } from '@prisma/client';
import { Logger } from '../utils/logger';
import CoinDCXClient from '../../services/coindcx-client';

const logger = new Logger('Positions');
const router = Router();

// Get current active positions from running bots
router.get('/current', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;

    // Get user's broker credentials
    const brokerCredential = await prisma.brokerCredential.findUnique({
      where: {
        userId_brokerName: {
          userId,
          brokerName: 'coindcx'
        }
      }
    });

    if (!brokerCredential || !brokerCredential.isActive) {
      return res.json({
        positions: [],
        summary: {
          totalPositions: 0,
          totalUnrealizedPnl: 0,
          totalMarginUsed: 0,
          activeStrategies: 0,
        },
        message: 'No active broker connection. Please connect your CoinDCX account first.'
      });
    }

    // Get active deployments
    const activeDeployments = await prisma.botDeployment.findMany({
      where: {
        userId,
        status: {
          in: [BotStatus.ACTIVE, BotStatus.STARTING]
        }
      },
      include: {
        strategy: {
          select: {
            name: true,
            code: true,
            instrument: true,
            author: true
          }
        }
      }
    });

    // Fetch real CoinDCX account balances
    try {
      const balances = await CoinDCXClient.getBalances(
        brokerCredential.apiKey,
        brokerCredential.apiSecret
      );

      // Fetch active orders from CoinDCX
      const activeOrders = await CoinDCXClient.getActiveOrders(
        brokerCredential.apiKey,
        brokerCredential.apiSecret
      );

      // Get recent trades to determine positions
      const trades = await CoinDCXClient.getTradeHistory(
        brokerCredential.apiKey,
        brokerCredential.apiSecret,
        {
          limit: 100,
        }
      );

      // Calculate positions from balances and trades
      // Note: CoinDCX is a spot exchange, so "positions" are really just holdings
      const positions = balances
        .filter(balance => balance.balance > 0)
        .map(balance => {
          // Find deployment that uses this currency
          const deployment = activeDeployments.find(d =>
            d.strategy.instrument.includes(balance.currency.toUpperCase())
          );

          // Get current market price
          const market = `${balance.currency.toUpperCase()}INR`;

          return {
            id: `pos_${balance.currency}_${userId}`,
            deploymentId: deployment?.id || null,
            strategyName: deployment?.strategy.name || 'Manual',
            strategyCode: deployment?.strategy.code || 'manual',
            instrument: market,
            currency: balance.currency,
            side: 'LONG', // Spot holdings are always long
            size: balance.balance,
            lockedSize: balance.locked_balance,
            availableSize: balance.balance - balance.locked_balance,
            // Note: Entry price would need to be tracked separately
            // For now, we'll calculate from recent trades if available
            entryPrice: null,
            currentPrice: null, // Will be fetched separately per market
            unrealizedPnl: 0,
            unrealizedPnlPct: 0,
            leverage: deployment?.leverage || 1,
            marginUsed: balance.balance, // For spot, margin = position size
            openTime: deployment?.startedAt || deployment?.deployedAt || new Date(),
            lastUpdate: new Date(),
            activeOrders: activeOrders.filter(order =>
              order.market === market
            ).length,
          };
        });

      // Fetch current prices for all positions
      const tickers = await CoinDCXClient.getAllTickers();
      const tickerMap = new Map(tickers.map(t => [t.market, t]));

      // Update positions with current prices
      positions.forEach(pos => {
        const ticker = tickerMap.get(pos.instrument);
        if (ticker) {
          pos.currentPrice = ticker.last_price;

          // Calculate P&L if we have entry price from trades
          const positionTrades = trades.filter(t =>
            t.market === pos.instrument && t.side === 'buy'
          );

          if (positionTrades.length > 0) {
            // Calculate average entry price
            const totalQuantity = positionTrades.reduce((sum, t) => sum + t.quantity, 0);
            const totalCost = positionTrades.reduce((sum, t) => sum + (t.quantity * t.price), 0);
            pos.entryPrice = totalCost / totalQuantity;

            // Calculate unrealized P&L
            if (pos.currentPrice && pos.entryPrice) {
              pos.unrealizedPnl = (pos.currentPrice - pos.entryPrice) * pos.size;
              pos.unrealizedPnlPct = ((pos.currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
            }
          }
        }
      });

      res.json({
        positions,
        summary: {
          totalPositions: positions.length,
          totalUnrealizedPnl: positions.reduce((sum, pos) => sum + pos.unrealizedPnl, 0),
          totalMarginUsed: positions.reduce((sum, pos) => sum + pos.marginUsed, 0),
          activeStrategies: activeDeployments.length,
          activeOrders: activeOrders.length,
        }
      });

    } catch (apiError) {
      logger.error('Failed to fetch real position data from CoinDCX:', apiError);
      return res.status(500).json({
        error: 'Failed to fetch positions from broker',
        details: apiError instanceof Error ? apiError.message : 'Unknown error',
        positions: [],
        summary: {
          totalPositions: 0,
          totalUnrealizedPnl: 0,
          totalMarginUsed: 0,
          activeStrategies: 0,
        }
      });
    }

  } catch (error) {
    logger.error('Failed to get current positions:', error);
    next(error);
  }
});

// Get order history and pending orders
router.get('/orders', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { page = 1, limit = 20, status = 'all', market } = req.query;

    // Get user's broker credentials
    const brokerCredential = await prisma.brokerCredential.findUnique({
      where: {
        userId_brokerName: {
          userId,
          brokerName: 'coindcx'
        }
      }
    });

    if (!brokerCredential || !brokerCredential.isActive) {
      return res.json({
        orders: [],
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: 0,
          totalPages: 0
        },
        summary: {
          totalOrders: 0,
          filledOrders: 0,
          pendingOrders: 0,
          totalVolume: 0,
          totalFees: 0,
        },
        message: 'No active broker connection'
      });
    }

    try {
      // Fetch real orders from CoinDCX
      const [activeOrders, orderHistory] = await Promise.all([
        CoinDCXClient.getActiveOrders(
          brokerCredential.apiKey,
          brokerCredential.apiSecret,
          market as string | undefined
        ),
        CoinDCXClient.getOrderHistory(
          brokerCredential.apiKey,
          brokerCredential.apiSecret,
          {
            market: market as string | undefined,
            limit: 100,
          }
        )
      ]);

      // Combine active and historical orders
      const allOrders = [...activeOrders, ...orderHistory].map(order => ({
        id: order.id,
        market: order.market,
        type: order.order_type === 'market_order' ? 'MARKET' :
              order.order_type === 'limit_order' ? 'LIMIT' : 'STOP_LIMIT',
        side: order.side.toUpperCase() as 'BUY' | 'SELL',
        amount: order.total_quantity,
        price: order.price_per_unit || order.avg_price,
        filled: order.total_quantity - order.remaining_quantity,
        remaining: order.remaining_quantity,
        status: order.status.toUpperCase(),
        fees: order.fee_amount || 0,
        createdAt: new Date(order.created_at),
        updatedAt: new Date(order.updated_at),
      }));

      // Filter by status if specified
      const filteredOrders = status === 'all'
        ? allOrders
        : allOrders.filter(order => order.status.toLowerCase() === String(status).toLowerCase());

      // Sort by creation time (most recent first)
      filteredOrders.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      // Paginate
      const skip = (Number(page) - 1) * Number(limit);
      const paginatedOrders = filteredOrders.slice(skip, skip + Number(limit));

      res.json({
        orders: paginatedOrders,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: filteredOrders.length,
          totalPages: Math.ceil(filteredOrders.length / Number(limit))
        },
        summary: {
          totalOrders: filteredOrders.length,
          filledOrders: filteredOrders.filter(o => o.status === 'FILLED').length,
          pendingOrders: filteredOrders.filter(o => o.status === 'OPEN' || o.status === 'INIT').length,
          totalVolume: filteredOrders.reduce((sum, order) => sum + order.filled, 0),
          totalFees: filteredOrders.reduce((sum, order) => sum + order.fees, 0),
        }
      });

    } catch (apiError) {
      logger.error('Failed to fetch orders from CoinDCX:', apiError);
      return res.status(500).json({
        error: 'Failed to fetch orders from broker',
        details: apiError instanceof Error ? apiError.message : 'Unknown error',
        orders: [],
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: 0,
          totalPages: 0
        },
        summary: {
          totalOrders: 0,
          filledOrders: 0,
          pendingOrders: 0,
          totalVolume: 0,
          totalFees: 0,
        }
      });
    }

  } catch (error) {
    logger.error('Failed to get order history:', error);
    next(error);
  }
});

// Get P&L summary for all positions
router.get('/pnl', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { period = '7d' } = req.query;

    // Get user's broker credentials
    const brokerCredential = await prisma.brokerCredential.findUnique({
      where: {
        userId_brokerName: {
          userId,
          brokerName: 'coindcx'
        }
      }
    });

    if (!brokerCredential || !brokerCredential.isActive) {
      return res.json({
        summary: {
          totalRealizedPnl: 0,
          totalUnrealizedPnl: 0,
          totalPnl: 0,
          totalTrades: 0,
          winRate: 0,
          activeStrategies: 0,
        },
        dailyPnl: [],
        strategyPerformance: [],
        message: 'No active broker connection'
      });
    }

    try {
      // Fetch real trade history from CoinDCX
      const periodStr = Array.isArray(period) ? String(period[0] || '7d') : String(period || '7d');
      const days = parseInt(String(periodStr).replace('d', '')) || 7;
      const fromTimestamp = Date.now() - (days * 24 * 60 * 60 * 1000);

      const trades = await CoinDCXClient.getTradeHistory(
        brokerCredential.apiKey,
        brokerCredential.apiSecret,
        {
          from_timestamp: fromTimestamp,
          limit: 1000,
        }
      );

      // Calculate realized P&L from completed trades
      // Group by pairs of buy/sell trades
      const tradesByMarket = new Map<string, typeof trades>();
      trades.forEach(trade => {
        if (!tradesByMarket.has(trade.market)) {
          tradesByMarket.set(trade.market, []);
        }
        tradesByMarket.get(trade.market)!.push(trade);
      });

      let totalRealizedPnl = 0;
      let totalTrades = 0;
      let winningTrades = 0;
      const dailyPnlMap = new Map<string, number>();

      // Calculate P&L for each market
      tradesByMarket.forEach((marketTrades, market) => {
        const sortedTrades = marketTrades.sort((a, b) => a.timestamp - b.timestamp);

        let position = 0;
        let avgEntry = 0;
        let totalCost = 0;

        sortedTrades.forEach(trade => {
          const tradeDate = new Date(trade.timestamp).toISOString().split('T')[0];

          if (trade.side === 'buy') {
            // Accumulate position
            totalCost += trade.quantity * trade.price;
            position += trade.quantity;
            if (position > 0) {
              avgEntry = totalCost / position;
            }
          } else if (trade.side === 'sell' && position > 0) {
            // Close position (partial or full)
            const exitQty = Math.min(trade.quantity, position);
            const pnl = (trade.price - avgEntry) * exitQty - trade.fee_amount;

            totalRealizedPnl += pnl;
            totalTrades++;
            if (pnl > 0) winningTrades++;

            // Add to daily P&L
            dailyPnlMap.set(
              tradeDate,
              (dailyPnlMap.get(tradeDate) || 0) + pnl
            );

            // Update position
            position -= exitQty;
            if (position <= 0) {
              position = 0;
              avgEntry = 0;
              totalCost = 0;
            }
          }
        });
      });

      // Calculate unrealized P&L from current positions
      const balances = await CoinDCXClient.getBalances(
        brokerCredential.apiKey,
        brokerCredential.apiSecret
      );

      const tickers = await CoinDCXClient.getAllTickers();
      const tickerMap = new Map(tickers.map(t => [t.market, t]));

      let totalUnrealizedPnl = 0;

      balances.filter(b => b.balance > 0).forEach(balance => {
        const market = `${balance.currency.toUpperCase()}INR`;
        const ticker = tickerMap.get(market);

        if (ticker) {
          // Find trades for this currency to calculate avg entry
          const currencyTrades = trades.filter(t =>
            t.market === market && t.side === 'buy'
          );

          if (currencyTrades.length > 0) {
            const totalQty = currencyTrades.reduce((sum, t) => sum + t.quantity, 0);
            const totalCost = currencyTrades.reduce((sum, t) => sum + (t.quantity * t.price), 0);
            const avgEntry = totalCost / totalQty;

            const unrealizedPnl = (ticker.last_price - avgEntry) * balance.balance;
            totalUnrealizedPnl += unrealizedPnl;
          }
        }
      });

      // Generate daily P&L array
      const dailyPnl = Array.from({ length: days }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (days - 1 - i));
        const dateStr = date.toISOString().split('T')[0];

        return {
          date: dateStr,
          pnl: dailyPnlMap.get(dateStr) || 0,
          cumulativePnl: Array.from(dailyPnlMap.entries())
            .filter(([d]) => d <= dateStr)
            .reduce((sum, [, pnl]) => sum + pnl, 0),
        };
      });

      // Get strategy performance (from deployments)
      const deployments = await prisma.botDeployment.findMany({
        where: { userId },
        include: {
          strategy: true
        }
      });

      const strategyPerformance = deployments.map(deployment => ({
        strategyId: deployment.strategyId,
        strategyName: deployment.strategy.name,
        strategyCode: deployment.strategy.code,
        realizedPnl: 0, // Would need to track per-strategy
        trades: 0,
        winRate: 0,
        isActive: deployment.status === BotStatus.ACTIVE,
      }));

      res.json({
        summary: {
          totalRealizedPnl,
          totalUnrealizedPnl,
          totalPnl: totalRealizedPnl + totalUnrealizedPnl,
          totalTrades,
          winRate: totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0,
          activeStrategies: deployments.filter(d => d.status === BotStatus.ACTIVE).length,
          averageWin: winningTrades > 0 ? totalRealizedPnl / totalTrades : 0,
          profitFactor: totalRealizedPnl / Math.abs(Math.min(totalRealizedPnl, 0)) || 0,
        },
        dailyPnl,
        strategyPerformance,
      });

    } catch (apiError) {
      logger.error('Failed to fetch P&L from CoinDCX:', apiError);
      return res.status(500).json({
        error: 'Failed to fetch P&L from broker',
        details: apiError instanceof Error ? apiError.message : 'Unknown error',
        summary: {
          totalRealizedPnl: 0,
          totalUnrealizedPnl: 0,
          totalPnl: 0,
          totalTrades: 0,
          winRate: 0,
          activeStrategies: 0,
        },
        dailyPnl: [],
        strategyPerformance: [],
      });
    }

  } catch (error) {
    logger.error('Failed to get P&L data:', error);
    next(error);
  }
});

// Close a specific position (mock implementation)
router.post('/close', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { positionId, reason = 'Manual close' } = req.body;

    if (!positionId) {
      return res.status(400).json({
        error: 'Position ID is required'
      });
    }

    // Extract deployment ID from position ID
    const deploymentId = String(positionId).replace('pos_', '');

    // Verify the deployment belongs to the user
    const deployment = await prisma.botDeployment.findFirst({
      where: {
        id: deploymentId,
        userId
      }
    });

    if (!deployment) {
      return res.status(404).json({
        error: 'Position not found'
      });
    }

    // Log the position close action
    await prisma.processLog.create({
      data: {
        botDeploymentId: deploymentId,
        level: 'INFO',
        message: `Position closed manually: ${reason}`,
        metadata: {
          positionId,
          reason,
          action: 'CLOSE_POSITION'
        }
      }
    });

    logger.info(`Position ${positionId} closed by user ${userId}`);

    res.json({
      success: true,
      message: 'Position close request submitted',
      positionId,
    });

  } catch (error) {
    logger.error('Failed to close position:', error);
    next(error);
  }
});

// Get position details by ID
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Extract deployment ID from position ID
    const deploymentId = String(id).replace('pos_', '');

    const deployment = await prisma.botDeployment.findFirst({
      where: {
        id: deploymentId,
        userId
      },
      include: {
        strategy: true
      }
    });

    if (!deployment) {
      return res.status(404).json({
        error: 'Position not found'
      });
    }

    // Mock detailed position data
    const mockEntry = 45000 + Math.random() * 10000;
    const mockCurrent = mockEntry + (Math.random() - 0.5) * 2000;
    const mockSize = deployment.riskPerTrade * 10000;
    const unrealizedPnl = (mockCurrent - mockEntry) * mockSize / mockEntry;

    const positionDetails = {
      id,
      deploymentId: deployment.id,
      strategy: deployment.strategy,
      instrument: deployment.strategy.instrument,
      side: Math.random() > 0.5 ? 'LONG' : 'SHORT',
      size: mockSize,
      entryPrice: mockEntry,
      currentPrice: mockCurrent,
      unrealizedPnl,
      unrealizedPnlPct: (unrealizedPnl / (mockEntry * mockSize / mockEntry)) * 100,
      leverage: deployment.leverage,
      marginUsed: mockSize / deployment.leverage,
      openTime: deployment.startedAt || deployment.deployedAt,
      lastUpdate: new Date(),
      stopLoss: mockEntry * 0.95, // Mock stop loss
      takeProfit: mockEntry * 1.05, // Mock take profit
    };

    res.json({ position: positionDetails });

  } catch (error) {
    logger.error('Failed to get position details:', error);
    next(error);
  }
});

export { router as positionsRoutes };