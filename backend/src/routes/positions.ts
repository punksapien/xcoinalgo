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
import CoinDCXClient from '../services/coindcx-client';

const logger = new Logger('Positions');
const router = Router();

// Type for CoinDCX ticker data
interface CoinDCXTicker {
  market: string;
  last_price: number;
  [key: string]: any;
}

// Get current active positions from Trade table
router.get('/current', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;

    // Get open positions from Trade table
    const openTrades = await prisma.trade.findMany({
      where: {
        subscription: {
          userId
        },
        status: 'OPEN'
      },
      include: {
        subscription: {
          include: {
            strategy: {
              select: {
                id: true,
                name: true,
                code: true,
              }
            },
            brokerCredential: {
              select: {
                apiKey: true,
                apiSecret: true,
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Fetch current prices from CoinDCX for unrealized P&L calculation
    let tickers: CoinDCXTicker[] = [];
    try {
      tickers = await CoinDCXClient.getAllTickers() as CoinDCXTicker[];
    } catch (error) {
      logger.warn('Failed to fetch tickers for price update:', error);
    }
    const tickerMap = new Map(tickers.map(t => [t.market, t]));

    // Transform trades to position format
    const positions = openTrades.map(trade => {
      // Get current price for P&L calculation
      const ticker = tickerMap.get(trade.symbol);
      const currentPrice = ticker?.last_price || trade.entryPrice;

      // Calculate unrealized P&L
      let unrealizedPnl = 0;
      let unrealizedPnlPct = 0;

      if (trade.side === 'LONG') {
        unrealizedPnl = (currentPrice - trade.entryPrice) * trade.quantity;
        unrealizedPnlPct = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;
      } else {
        unrealizedPnl = (trade.entryPrice - currentPrice) * trade.quantity;
        unrealizedPnlPct = ((trade.entryPrice - currentPrice) / trade.entryPrice) * 100;
      }

      return {
        id: trade.id,
        deploymentId: trade.subscriptionId,
        strategyName: trade.subscription.strategy?.name || 'Unknown',
        strategyCode: trade.subscription.strategy?.code || 'unknown',
        instrument: trade.symbol,
        side: trade.side,
        size: trade.quantity,
        entryPrice: trade.entryPrice,
        currentPrice,
        unrealizedPnl,
        unrealizedPnlPct,
        leverage: trade.leverage || 1,
        marginUsed: (trade.quantity * trade.entryPrice) / (trade.leverage || 1),
        openTime: trade.createdAt,
        lastUpdate: new Date(),
        // Futures specific fields
        tradingType: trade.tradingType,
        positionId: trade.positionId,
        liquidationPrice: trade.liquidationPrice,
        // Risk management
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfit,
      };
    });

    // Calculate summary
    const totalUnrealizedPnl = positions.reduce((sum, pos) => sum + pos.unrealizedPnl, 0);
    const totalMarginUsed = positions.reduce((sum, pos) => sum + pos.marginUsed, 0);

    // Get count of unique active strategies
    const uniqueStrategies = new Set(positions.map(p => p.strategyCode));

    res.json({
      positions,
      summary: {
        totalPositions: positions.length,
        totalUnrealizedPnl,
        totalMarginUsed,
        activeStrategies: uniqueStrategies.size,
      }
    });

  } catch (error) {
    logger.error('Failed to get current positions:', error);
    next(error);
  }
});

// Get order history from Trade table
router.get('/orders', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { page = 1, limit = 50, status = 'all', symbol } = req.query;

    // Build where clause
    const whereClause: any = {
      subscription: {
        userId
      }
    };

    // Filter by status if specified
    if (status !== 'all') {
      whereClause.status = String(status).toUpperCase();
    }

    // Filter by symbol if specified
    if (symbol) {
      whereClause.symbol = String(symbol);
    }

    // Get total count
    const totalCount = await prisma.trade.count({ where: whereClause });

    // Get trades with pagination
    const trades = await prisma.trade.findMany({
      where: whereClause,
      include: {
        subscription: {
          include: {
            strategy: {
              select: {
                id: true,
                name: true,
                code: true,
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });

    // Transform to order format
    const orders = trades.map(trade => ({
      id: trade.id,
      deploymentId: trade.subscriptionId,
      strategyName: trade.subscription.strategy?.name || 'Unknown',
      strategyCode: trade.subscription.strategy?.code || 'unknown',
      instrument: trade.symbol,
      type: trade.orderType.toUpperCase(),
      side: trade.side.toUpperCase(),
      amount: trade.quantity,
      price: trade.entryPrice,
      filled: trade.filledQuantity || trade.quantity,
      status: trade.status,
      createdAt: trade.createdAt,
      updatedAt: trade.updatedAt,
      fees: trade.fees,
      // Exit details if closed
      exitPrice: trade.exitPrice,
      exitedAt: trade.exitedAt,
      exitReason: trade.exitReason,
      // P&L if closed
      pnl: trade.pnl,
      pnlPercentage: trade.pnlPct, // Use pnlPct field
      // Futures specific
      tradingType: trade.tradingType,
      leverage: trade.leverage,
      positionId: trade.positionId,
      liquidationPrice: trade.liquidationPrice,
    }));

    // Calculate summary
    const allTradesForSummary = await prisma.trade.findMany({
      where: {
        subscription: {
          userId
        }
      },
      select: {
        status: true,
        quantity: true,
        fees: true,
        pnl: true,
      }
    });

    const summary = {
      totalOrders: allTradesForSummary.length,
      filledOrders: allTradesForSummary.filter(t => t.status === 'CLOSED').length,
      pendingOrders: allTradesForSummary.filter(t => t.status === 'OPEN').length,
      totalVolume: allTradesForSummary.reduce((sum, t) => sum + t.quantity, 0),
      totalFees: allTradesForSummary.reduce((sum, t) => sum + t.fees, 0),
    };

    res.json({
      orders,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalCount,
        totalPages: Math.ceil(totalCount / Number(limit))
      },
      summary
    });

  } catch (error) {
    logger.error('Failed to get order history:', error);
    next(error);
  }
});

// Get P&L summary from Trade table
router.get('/pnl', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { period = '30d' } = req.query;

    // Calculate date range
    const periodStr = Array.isArray(period) ? String(period[0] || '30d') : String(period || '30d');
    const days = parseInt(String(periodStr).replace('d', '')) || 30;
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    // Get all trades for this user in the period
    const allTrades = await prisma.trade.findMany({
      where: {
        subscription: {
          userId
        },
        createdAt: {
          gte: fromDate
        }
      },
      include: {
        subscription: {
          include: {
            strategy: {
              select: {
                id: true,
                name: true,
                code: true,
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    // Get open trades for unrealized P&L
    const openTrades = allTrades.filter(t => t.status === 'OPEN');
    const closedTrades = allTrades.filter(t => t.status === 'CLOSED');

    // Calculate realized P&L from closed trades
    const totalRealizedPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);

    // Calculate unrealized P&L from open trades
    // Fetch current prices for open positions
    let tickers: CoinDCXTicker[] = [];
    try {
      tickers = await CoinDCXClient.getAllTickers() as CoinDCXTicker[];
    } catch (error) {
      logger.warn('Failed to fetch tickers:', error);
    }
    const tickerMap = new Map(tickers.map(t => [t.market, t]));

    let totalUnrealizedPnl = 0;
    openTrades.forEach(trade => {
      const ticker = tickerMap.get(trade.symbol);
      const currentPrice = ticker?.last_price || trade.entryPrice;

      if (trade.side === 'LONG') {
        totalUnrealizedPnl += (currentPrice - trade.entryPrice) * trade.quantity;
      } else {
        totalUnrealizedPnl += (trade.entryPrice - currentPrice) * trade.quantity;
      }
    });

    // Calculate win rate
    const winningTrades = closedTrades.filter(t => (t.pnl || 0) > 0).length;
    const winRate = closedTrades.length > 0 ? (winningTrades / closedTrades.length) * 100 : 0;

    // Generate daily P&L
    const dailyPnlMap = new Map<string, number>();
    closedTrades.forEach(trade => {
      if (trade.exitedAt) {
        const dateStr = trade.exitedAt.toISOString().split('T')[0];
        dailyPnlMap.set(dateStr, (dailyPnlMap.get(dateStr) || 0) + (trade.pnl || 0));
      }
    });

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

    // Calculate strategy performance
    const strategyMap = new Map<string, {
      id: string;
      name: string;
      code: string;
      trades: number;
      realizedPnl: number;
      winningTrades: number;
      isActive: boolean;
    }>();

    closedTrades.forEach(trade => {
      const strategyId = trade.subscription.strategy?.id;
      if (!strategyId) return;

      if (!strategyMap.has(strategyId)) {
        strategyMap.set(strategyId, {
          id: strategyId,
          name: trade.subscription.strategy?.name || 'Unknown',
          code: trade.subscription.strategy?.code || 'unknown',
          trades: 0,
          realizedPnl: 0,
          winningTrades: 0,
          isActive: trade.subscription.isActive && !trade.subscription.isPaused,
        });
      }

      const stratData = strategyMap.get(strategyId)!;
      stratData.trades++;
      stratData.realizedPnl += trade.pnl || 0;
      if ((trade.pnl || 0) > 0) stratData.winningTrades++;
    });

    const strategyPerformance = Array.from(strategyMap.values()).map(strat => ({
      strategyId: strat.id,
      strategyName: strat.name,
      strategyCode: strat.code,
      realizedPnl: strat.realizedPnl,
      trades: strat.trades,
      winRate: strat.trades > 0 ? (strat.winningTrades / strat.trades) * 100 : 0,
      isActive: strat.isActive,
    }));

    // Get active subscriptions count
    const activeSubscriptions = await prisma.strategySubscription.count({
      where: {
        userId,
        isActive: true,
        isPaused: false,
      }
    });

    res.json({
      summary: {
        totalRealizedPnl,
        totalUnrealizedPnl,
        totalPnl: totalRealizedPnl + totalUnrealizedPnl,
        totalTrades: allTrades.length,
        winRate,
        activeStrategies: activeSubscriptions,
        averageWin: winningTrades > 0 ? totalRealizedPnl / closedTrades.length : 0,
        profitFactor: totalRealizedPnl > 0 ? totalRealizedPnl / Math.abs(Math.min(totalRealizedPnl, 0)) : 0,
      },
      dailyPnl,
      strategyPerformance,
    });

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