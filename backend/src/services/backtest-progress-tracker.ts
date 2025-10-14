/**
 * Backtest Progress Tracker
 * Tracks backtest progress for real-time updates via SSE
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export interface BacktestProgress {
  strategyId: string;
  stage: 'fetching_data' | 'data_fetched' | 'running_backtest' | 'calculating_metrics' | 'complete' | 'error';
  progress: number; // 0.0 to 1.0
  message: string;

  // Optional metadata
  totalCandles?: number;
  fetchDuration?: number;
  backtestDuration?: number;
  totalDuration?: number;
  error?: string;
  metrics?: any;
  trades?: any[];
  totalTrades?: number;
}

export class BacktestProgressTracker extends EventEmitter {
  private progressMap: Map<string, BacktestProgress> = new Map();

  /**
   * Update progress for a strategy's backtest
   */
  updateProgress(strategyId: string, update: Partial<BacktestProgress>): void {
    const current = this.progressMap.get(strategyId) || {
      strategyId,
      stage: 'fetching_data' as const,
      progress: 0,
      message: 'Starting backtest...'
    };

    const updated: BacktestProgress = {
      ...current,
      ...update,
      strategyId // Ensure strategyId is always set
    };

    this.progressMap.set(strategyId, updated);

    // Emit event for SSE listeners
    this.emit(`progress:${strategyId}`, updated);
    this.emit('progress', updated);

    logger.debug(`Backtest progress [${strategyId}]: ${updated.stage} (${(updated.progress * 100).toFixed(0)}%)`);
  }

  /**
   * Get current progress for a strategy
   */
  getProgress(strategyId: string): BacktestProgress | null {
    return this.progressMap.get(strategyId) || null;
  }

  /**
   * Mark backtest as complete
   */
  markComplete(strategyId: string, result: { metrics?: any; trades?: any[]; totalTrades?: number }): void {
    this.updateProgress(strategyId, {
      stage: 'complete',
      progress: 1.0,
      message: `Backtest complete! ${result.totalTrades || 0} trades executed`,
      metrics: result.metrics,
      trades: result.trades,
      totalTrades: result.totalTrades
    });

    // Keep progress for 5 minutes after completion for SSE clients
    setTimeout(() => {
      this.progressMap.delete(strategyId);
      logger.debug(`Cleaned up progress data for strategy ${strategyId}`);
    }, 5 * 60 * 1000);
  }

  /**
   * Mark backtest as failed
   */
  markError(strategyId: string, error: string): void {
    this.updateProgress(strategyId, {
      stage: 'error',
      progress: 0,
      message: `Backtest failed: ${error}`,
      error
    });

    // Keep error for 5 minutes
    setTimeout(() => {
      this.progressMap.delete(strategyId);
    }, 5 * 60 * 1000);
  }

  /**
   * Remove progress data for a strategy
   */
  clearProgress(strategyId: string): void {
    this.progressMap.delete(strategyId);
  }

  /**
   * Get all active backtests
   */
  getActiveBacktests(): BacktestProgress[] {
    return Array.from(this.progressMap.values());
  }

  /**
   * Subscribe to progress updates for a specific strategy
   */
  subscribeToStrategy(strategyId: string, callback: (progress: BacktestProgress) => void): () => void {
    const listener = (progress: BacktestProgress) => callback(progress);
    this.on(`progress:${strategyId}`, listener);

    // Return unsubscribe function
    return () => {
      this.off(`progress:${strategyId}`, listener);
    };
  }
}

// Export singleton instance
export const backtestProgressTracker = new BacktestProgressTracker();
