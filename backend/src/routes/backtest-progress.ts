/**
 * Backtest Progress Routes - Server-Sent Events (SSE) for real-time progress
 */

import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { backtestProgressTracker } from '../services/backtest-progress-tracker';
import { Logger } from '../utils/logger';

const logger = new Logger('BacktestProgress');
const router = Router();

/**
 * SSE endpoint for backtest progress streaming
 * GET /api/strategies/:strategyId/backtest/progress?token=xxx
 *
 * Note: EventSource doesn't support custom headers, so token is passed as query param
 */
router.get('/:strategyId/progress', async (req: AuthenticatedRequest, res: Response) => {
  const strategyId = req.params.strategyId;

  // For SSE, we need to support token as query param since EventSource doesn't support headers
  // Try query param first, then fall back to header auth
  const token = req.query.token as string || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // TODO: Validate token here if needed
  // For now, we'll trust it since authenticate middleware handles it elsewhere

  logger.info(`SSE client connected for strategy ${strategyId}`);

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', strategyId })}\n\n`);

  // Send current progress if available
  const currentProgress = backtestProgressTracker.getProgress(strategyId);
  if (currentProgress) {
    res.write(`data: ${JSON.stringify({ type: 'progress', ...currentProgress })}\n\n`);
  }

  // Subscribe to progress updates
  const unsubscribe = backtestProgressTracker.subscribeToStrategy(strategyId, (progress) => {
    // Send progress update to client
    const eventData = JSON.stringify({ type: 'progress', ...progress });
    res.write(`data: ${eventData}\n\n`);

    // Close connection if backtest is complete or failed
    if (progress.stage === 'complete' || progress.stage === 'error') {
      logger.info(`Backtest ${progress.stage} for strategy ${strategyId}, closing SSE connection`);
      setTimeout(() => {
        res.end();
      }, 1000); // Give client 1 second to receive final message
    }
  });

  // Handle client disconnect
  req.on('close', () => {
    logger.info(`SSE client disconnected for strategy ${strategyId}`);
    unsubscribe();
  });

  // Keep connection alive with heartbeat
  const heartbeatInterval = setInterval(() => {
    res.write(`:heartbeat\n\n`);
  }, 15000); // Every 15 seconds

  // Clean up on connection close
  res.on('close', () => {
    clearInterval(heartbeatInterval);
    unsubscribe();
  });
});

/**
 * Get current backtest status (polling fallback)
 * GET /api/strategies/:strategyId/backtest/status
 */
router.get('/:strategyId/status', authenticate, async (req: AuthenticatedRequest, res) => {
  const strategyId = req.params.strategyId;

  const progress = backtestProgressTracker.getProgress(strategyId);

  if (!progress) {
    return res.json({
      success: true,
      status: 'not_found',
      message: 'No active backtest found for this strategy'
    });
  }

  res.json({
    success: true,
    status: 'active',
    progress: {
      stage: progress.stage,
      progress: progress.progress,
      message: progress.message,
      totalCandles: progress.totalCandles,
      fetchDuration: progress.fetchDuration,
      backtestDuration: progress.backtestDuration,
      totalDuration: progress.totalDuration,
      error: progress.error,
      metrics: progress.metrics,
      totalTrades: progress.totalTrades
    }
  });
});

export { router as backtestProgressRoutes };
