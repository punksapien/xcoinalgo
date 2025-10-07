/**
 * Backtest Routes - API endpoints for strategy backtesting
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { backtestEngine } from '../../services/backtest-engine';
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

    // Check if user owns the strategy
    const { default: prisma } = await import('../utils/database');
    const strategy = await prisma.strategy.findFirst({
      where: {
        id: strategyId,
        userId,
      },
    });

    if (!strategy) {
      return res.status(404).json({
        error: 'Strategy not found or access denied',
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

    res.json({
      success: true,
      result: {
        metrics: result.metrics,
        totalTrades: result.trades.length,
        executionTime: result.executionTime,
        equityCurve: result.equityCurve.slice(-100), // Last 100 points
        recentTrades: result.trades.slice(-20), // Last 20 trades
      },
    });
  } catch (error) {
    logger.error('Backtest failed:', error);
    next(error);
  }
});

/**
 * Get backtest history for a strategy
 * GET /api/backtest/history/:strategyId
 */
router.get('/history/:strategyId', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { strategyId } = req.params;
    const { limit = 10 } = req.query;

    // Check if user owns the strategy
    const { default: prisma } = await import('../utils/database');
    const strategy = await prisma.strategy.findFirst({
      where: {
        id: strategyId,
        userId,
      },
    });

    if (!strategy) {
      return res.status(404).json({
        error: 'Strategy not found or access denied',
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
        config: result.config,
        metrics: result.metrics,
        executionTime: result.executionTime,
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
            userId: true,
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

    // Check if user owns the strategy
    if (result.strategy.userId !== userId) {
      return res.status(403).json({
        error: 'Access denied',
      });
    }

    res.json({
      result: {
        id: result.id,
        createdAt: result.createdAt,
        config: result.config,
        metrics: result.metrics,
        tradeHistory: result.tradeHistory,
        equityCurve: result.equityCurve,
        executionTime: result.executionTime,
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

    // Check if user owns the strategy
    const { default: prisma } = await import('../utils/database');
    const strategy = await prisma.strategy.findFirst({
      where: {
        id: strategyId,
        userId,
      },
    });

    if (!strategy) {
      return res.status(404).json({
        error: 'Strategy not found or access denied',
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
        config: result.config,
        metrics: result.metrics,
        executionTime: result.executionTime,
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
            userId: true,
          },
        },
      },
    });

    if (!result) {
      return res.status(404).json({
        error: 'Backtest result not found',
      });
    }

    // Check if user owns the strategy
    if (result.strategy.userId !== userId) {
      return res.status(403).json({
        error: 'Access denied',
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
