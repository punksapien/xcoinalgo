/**
 * Positions and Orders Routes - API endpoints for position and order management
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import prisma from '../utils/database';
import { AuthenticatedRequest } from '../types';
import { BotStatus } from '@prisma/client';
import { Logger } from '../utils/logger';

const logger = new Logger('Positions');
const router = Router();

// Get current active positions from running bots
router.get('/current', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;

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

    // Mock position data - in a real implementation, this would come from the broker API
    const positions = activeDeployments.map(deployment => {
      // Generate mock position data based on deployment
      const mockEntry = 45000 + Math.random() * 10000; // Mock entry price
      const mockCurrent = mockEntry + (Math.random() - 0.5) * 2000; // Mock current price
      const mockSize = deployment.riskPerTrade * 10000; // Mock position size
      const unrealizedPnl = (mockCurrent - mockEntry) * mockSize / mockEntry;

      return {
        id: `pos_${deployment.id}`,
        deploymentId: deployment.id,
        strategyName: deployment.strategy.name,
        strategyCode: deployment.strategy.code,
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
      };
    });

    res.json({
      positions,
      summary: {
        totalPositions: positions.length,
        totalUnrealizedPnl: positions.reduce((sum, pos) => sum + pos.unrealizedPnl, 0),
        totalMarginUsed: positions.reduce((sum, pos) => sum + pos.marginUsed, 0),
        activeStrategies: new Set(positions.map(p => p.strategyCode)).size,
      }
    });

  } catch (error) {
    logger.error('Failed to get current positions:', error);
    next(error);
  }
});

// Get order history and pending orders
router.get('/orders', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { page = 1, limit = 20, status = 'all', strategyId } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    // Get deployment IDs for the user
    const whereConditions: any = { userId };
    if (strategyId) {
      whereConditions.strategyId = strategyId;
    }

    const deployments = await prisma.botDeployment.findMany({
      where: whereConditions,
      include: {
        strategy: {
          select: {
            name: true,
            code: true,
            instrument: true
          }
        }
      }
    });

    // Mock order data - in a real implementation, this would come from trading logs
    const mockOrders = deployments.flatMap(deployment => {
      const orderCount = Math.floor(Math.random() * 5) + 1;
      return Array.from({ length: orderCount }, (_, i) => {
        const orderTime = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000);
        const orderPrice = 45000 + Math.random() * 10000;
        const orderSize = deployment.riskPerTrade * 1000 * (1 + Math.random());
        const orderStatus = ['FILLED', 'PENDING', 'CANCELLED', 'PARTIALLY_FILLED'][Math.floor(Math.random() * 4)];

        return {
          id: `order_${deployment.id}_${i}`,
          deploymentId: deployment.id,
          strategyName: deployment.strategy.name,
          strategyCode: deployment.strategy.code,
          instrument: deployment.strategy.instrument,
          type: ['MARKET', 'LIMIT', 'STOP'][Math.floor(Math.random() * 3)],
          side: Math.random() > 0.5 ? 'BUY' : 'SELL',
          amount: orderSize,
          price: orderPrice,
          filled: orderStatus === 'FILLED' ? orderSize :
                 orderStatus === 'PARTIALLY_FILLED' ? orderSize * 0.7 : 0,
          status: orderStatus,
          createdAt: orderTime,
          updatedAt: orderTime,
          fees: orderStatus === 'FILLED' ? orderSize * 0.001 : 0, // 0.1% fee
        };
      });
    });

    // Filter by status if specified
    const filteredOrders = status === 'all'
      ? mockOrders
      : mockOrders.filter(order => order.status.toLowerCase() === String(status).toLowerCase());

    // Sort by creation time
    filteredOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Paginate
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
        pendingOrders: filteredOrders.filter(o => o.status === 'PENDING').length,
        totalVolume: filteredOrders.reduce((sum, order) => sum + order.filled, 0),
        totalFees: filteredOrders.reduce((sum, order) => sum + order.fees, 0),
      }
    });

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

    // Get user's deployments and their backtest results for historical P&L
    const deployments = await prisma.botDeployment.findMany({
      where: { userId },
      include: {
        strategy: {
          include: {
            backtestResults: {
              orderBy: {
                createdAt: 'desc'
              },
              take: 1
            }
          }
        }
      }
    });

    // Calculate P&L metrics from backtest results and mock live data
    let totalRealizedPnl = 0;
    let totalUnrealizedPnl = 0;
    let totalTrades = 0;
    let winningTrades = 0;
    const strategyPerformance: any[] = [];

    deployments.forEach(deployment => {
      const latestBacktest = deployment.strategy.backtestResults[0];

      if (latestBacktest) {
        const tradeHistory = latestBacktest.tradeHistory as any[];
        const strategyPnl = tradeHistory?.reduce((sum: number, trade: any) => sum + (trade.pnl || 0), 0) || 0;
        const strategyTrades = tradeHistory?.length || 0;
        const strategyWins = tradeHistory?.filter((trade: any) => (trade.pnl || 0) > 0).length || 0;

        totalRealizedPnl += strategyPnl;
        totalTrades += strategyTrades;
        winningTrades += strategyWins;

        strategyPerformance.push({
          strategyId: deployment.strategyId,
          strategyName: deployment.strategy.name,
          strategyCode: deployment.strategy.code,
          realizedPnl: strategyPnl,
          trades: strategyTrades,
          winRate: strategyTrades > 0 ? (strategyWins / strategyTrades) * 100 : 0,
          isActive: deployment.status === BotStatus.ACTIVE,
        });
      }

      // Add mock unrealized P&L for active deployments
      if (deployment.status === BotStatus.ACTIVE) {
        totalUnrealizedPnl += (Math.random() - 0.5) * 1000; // Mock unrealized P&L
      }
    });

    // Generate mock daily P&L for the chart
    const periodStr = Array.isArray(period) ? String(period[0] || '7d') : String(period || '7d');
    const days = parseInt(String(periodStr).replace('d', '')) || 7;
    const dailyPnl = Array.from({ length: days }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (days - 1 - i));
      return {
        date: date.toISOString().split('T')[0],
        pnl: (Math.random() - 0.5) * 500,
        cumulativePnl: totalRealizedPnl * ((i + 1) / days),
      };
    });

    res.json({
      summary: {
        totalRealizedPnl,
        totalUnrealizedPnl,
        totalPnl: totalRealizedPnl + totalUnrealizedPnl,
        totalTrades,
        winRate: totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0,
        activeStrategies: deployments.filter(d => d.status === BotStatus.ACTIVE).length,
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