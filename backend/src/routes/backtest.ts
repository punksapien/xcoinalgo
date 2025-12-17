/**
 * Backtest Routes - API endpoints for strategy backtesting
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { backtestEngine } from '../services/backtest-engine';
import { getBacktestStatus } from '../services/backtest-engine';
import { Logger } from '../utils/logger';

const logger = new Logger('BacktestRoutes');
const router = Router();

/**
 * Run backtest for a strategy
 * POST /api/backtest/run
 */
router.post('/run', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const {
      strategyId,
      symbol,
      resolution,
      startDate,
      endDate,
      initialCapital = 10000,
      riskPerTrade = 0.02,
      leverage = 1,
      commission = 0.001,
    } = req.body;

    // Validate required fields
    if (!strategyId || !symbol || !resolution || !startDate || !endDate) {
      return res.status(400).json({
        error: 'Missing required fields: strategyId, symbol, resolution, startDate, endDate',
      });
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        error: 'Invalid date format',
      });
    }

    if (start >= end) {
      return res.status(400).json({
        error: 'Start date must be before end date',
      });
    }

    // Check if strategy exists (strategies are public/shared)
    const { default: prisma } = await import('../utils/database');
    const strategy = await prisma.strategy.findUnique({
      where: { id: strategyId },
    });

    if (!strategy) {
      return res.status(404).json({
        error: 'Strategy not found',
      });
    }

    logger.info(`Starting backtest for strategy ${strategyId} by user ${userId}`);

    // Run backtest (this can take a while)
    const result = await backtestEngine.runBacktest({
      strategyId,
      symbol,
      resolution,
      startDate: start,
      endDate: end,
      initialCapital,
      riskPerTrade,
      leverage,
      commission,
    });

    // Update Strategy table with latest backtest metrics
    const avgTradeReturn = result.metrics.totalTrades > 0
      ? result.metrics.totalPnl / result.metrics.totalTrades
      : 0;

    await prisma.strategy.update({
      where: { id: strategyId },
      data: {
        winRate: result.metrics.winRate,
        roi: result.metrics.totalPnlPct,
        riskReward: result.metrics.avgLoss > 0 ? result.metrics.avgWin / result.metrics.avgLoss : 0,
        maxDrawdown: result.metrics.maxDrawdownPct,
        sharpeRatio: result.metrics.sharpeRatio,
        totalTrades: result.metrics.totalTrades,
        profitFactor: result.metrics.profitFactor,
        avgTradeReturn,
        updatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      result: {
        metrics: result.metrics,
        totalTrades: result.trades.length,
        executionTime: result.executionTime,
        equityCurve: result.equityCurve.slice(-100), // Last 100 points
        recentTrades: result.trades.slice(-20), // Last 20 trades
        config: {
          initialCapital,
          riskPerTrade,
          leverage,
          commission,
          startDate: start,
          endDate: end,
          symbol,
          resolution,
        },
      },
    });
  } catch (error) {
    logger.error('Backtest failed:', error);
    next(error);
  }
});
/**
 * Get backtest status for a strategy
 * GET /api/backtest/status/:strategyId
 */
router.get('/status/:strategyId', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { strategyId } = req.params
    const { default: prisma } = await import('../utils/database');
    const exists = await prisma.strategy.findUnique({ where: { id: strategyId }, select: { id: true } })
    if (!exists) {
      return res.status(404).json({ error: 'Strategy not found' })
    }
    const status = getBacktestStatus(strategyId)
    res.json({ status })
  } catch (error) {
    next(error)
  }
})


/**
 * Get backtest history for a strategy
 * GET /api/backtest/history/:strategyId
 */
router.get('/history/:strategyId', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { strategyId } = req.params;
    const { limit = 10 } = req.query;

    // Check if strategy exists (strategies are public/shared)
    const { default: prisma } = await import('../utils/database');
    const strategy = await prisma.strategy.findUnique({
      where: { id: strategyId },
    });

    if (!strategy) {
      return res.status(404).json({
        error: 'Strategy not found',
      });
    }

    const results = await backtestEngine.getBacktestResults(
      strategyId,
      Number(limit)
    );

    res.json({
      results: results.map(result => ({
        id: result.id,
        createdAt: result.createdAt,
        startDate: result.startDate,
        endDate: result.endDate,
        totalReturn: result.totalReturn,
        totalReturnPct: result.totalReturnPct,
        winRate: result.winRate,
        totalTrades: result.totalTrades,
        backtestDuration: result.backtestDuration,
      })),
    });
  } catch (error) {
    logger.error('Failed to fetch backtest history:', error);
    next(error);
  }
});

/**
 * Get specific backtest result
 * GET /api/backtest/result/:backtestId
 */
router.get('/result/:backtestId', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { backtestId } = req.params;

    const { default: prisma } = await import('../utils/database');
    const result = await prisma.backtestResult.findUnique({
      where: { id: backtestId },
      include: {
        strategy: {
          select: {
            name: true,
            code: true,
          },
        },
      },
    });

    if (!result) {
      return res.status(404).json({
        error: 'Backtest result not found',
      });
    }

    res.json({
      result: {
        id: result.id,
        createdAt: result.createdAt,
        startDate: result.startDate,
        endDate: result.endDate,
        initialBalance: result.initialBalance,
        finalBalance: result.finalBalance,
        totalReturn: result.totalReturn,
        totalReturnPct: result.totalReturnPct,
        maxDrawdown: result.maxDrawdown,
        sharpeRatio: result.sharpeRatio,
        winRate: result.winRate,
        profitFactor: result.profitFactor,
        totalTrades: result.totalTrades,
        tradeHistory: result.tradeHistory,
        equityCurve: result.equityCurve,
        monthlyReturns: result.monthlyReturns,
        backtestDuration: result.backtestDuration,
        strategy: {
          name: result.strategy.name,
          code: result.strategy.code,
        },
      },
    });
  } catch (error) {
    logger.error('Failed to fetch backtest result:', error);
    next(error);
  }
});

/**
 * Get latest backtest result for a strategy
 * GET /api/backtest/latest/:strategyId
 */
router.get('/latest/:strategyId', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { strategyId } = req.params;

    // Check if strategy exists (strategies are public/shared)
    const { default: prisma } = await import('../utils/database');
    const strategy = await prisma.strategy.findUnique({
      where: { id: strategyId },
    });

    if (!strategy) {
      return res.status(404).json({
        error: 'Strategy not found',
      });
    }

    const result = await backtestEngine.getLatestBacktestResult(strategyId);

    if (!result) {
      return res.json({
        result: null,
        message: 'No backtest results found for this strategy',
      });
    }

    res.json({
      result: {
        id: result.id,
        createdAt: result.createdAt,
        startDate: result.startDate,
        endDate: result.endDate,
        totalReturn: result.totalReturn,
        totalReturnPct: result.totalReturnPct,
        winRate: result.winRate,
        totalTrades: result.totalTrades,
        backtestDuration: result.backtestDuration,
        tradeCount: (result.tradeHistory as any[]).length,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch latest backtest result:', error);
    next(error);
  }
});

/**
 * Delete backtest result
 * DELETE /api/backtest/result/:backtestId
 */
router.delete('/result/:backtestId', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { backtestId } = req.params;

    const { default: prisma } = await import('../utils/database');
    const result = await prisma.backtestResult.findUnique({
      where: { id: backtestId },
      include: {
        strategy: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!result) {
      return res.status(404).json({
        error: 'Backtest result not found',
      });
    }

    await prisma.backtestResult.delete({
      where: { id: backtestId },
    });

    res.json({
      success: true,
      message: 'Backtest result deleted',
    });
  } catch (error) {
    logger.error('Failed to delete backtest result:', error);
    next(error);
  }
});

export { router as backtestRoutes };
