#!/usr/bin/env ts-node
/**
 * Strategy Scheduler Worker
 *
 * Background process that schedules strategy executions at candle boundaries.
 * Uses node-cron for scheduling and calls execution-coordinator for each run.
 *
 * Run this as a separate process:
 *   ts-node backend/workers/strategy-scheduler.ts
 *
 * Or with PM2:
 *   pm2 start backend/workers/strategy-scheduler.ts --name strategy-scheduler
 */

import * as cron from 'node-cron';
import dotenv from 'dotenv';
import { strategyRegistry } from '../services/strategy-execution/strategy-registry';
import { executionCoordinator } from '../services/strategy-execution/execution-coordinator';
import { resolutionToCron, computeNextCandleClose } from '../lib/time-utils';

// Load environment variables
dotenv.config();

interface ScheduledJob {
  symbol: string;
  resolution: string;
  cronPattern: string;
  job: cron.ScheduledTask;
}

class StrategyScheduler {
  private scheduledJobs: Map<string, ScheduledJob> = new Map();
  private workerId: string;
  private isShuttingDown = false;

  constructor() {
    this.workerId = process.env.WORKER_ID || `scheduler-${process.pid}`;
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Strategy Scheduler Worker Started`);
    console.log(`Worker ID: ${this.workerId}`);
    console.log(`PID: ${process.pid}`);
    console.log(`${'='.repeat(80)}\n`);
  }

  /**
   * Initialize scheduler - load all active candles and schedule them
   */
  async initialize(): Promise<void> {
    try {
      console.log('Initializing strategy scheduler...');

      // 🔄 STARTUP CACHE REBUILD: Clear Redis and rebuild from DB
      // Guarantees clean state on deployment/restart
      console.log('🔄 Performing startup cache rebuild...');
      await strategyRegistry.clear();
      await strategyRegistry.initialize();
      console.log('✅ Cache rebuilt from database\n');

      // Get all active candles
      const activeCandles = await strategyRegistry.getActiveCandles();

      console.log(`Found ${activeCandles.length} active candles to schedule`);

      // Schedule each candle
      for (const candle of activeCandles) {
        await this.scheduleCandle(candle.symbol, candle.resolution);
      }

      console.log(`\nScheduler initialized with ${this.scheduledJobs.size} scheduled jobs\n`);

      // Refresh schedules every 1 minute in case new strategies are registered
      this.scheduleRefresh();

      // 🔄 PERIODIC RECONCILIATION: Validate cache every 5 minutes
      this.scheduleReconciliation();

    } catch (error) {
      console.error('Failed to initialize scheduler:', error);
      throw error;
    }
  }

  /**
   * Schedule a specific candle for execution
   */
  async scheduleCandle(symbol: string, resolution: string): Promise<void> {
    const candleKey = `${symbol}:${resolution}`;

    // Check if already scheduled
    if (this.scheduledJobs.has(candleKey)) {
      console.log(`Candle ${candleKey} already scheduled, skipping`);
      return;
    }

    try {
      // Convert resolution to cron pattern
      const cronPattern = resolutionToCron(resolution);

      console.log(`Scheduling ${candleKey} with cron: ${cronPattern}`);

      // Create cron job
      const job = cron.schedule(cronPattern, async () => {
        if (this.isShuttingDown) {
          console.log('Scheduler is shutting down, skipping execution');
          return;
        }

        await this.executeCandle(symbol, resolution);
      });

      // Store job info
      this.scheduledJobs.set(candleKey, {
        symbol,
        resolution,
        cronPattern,
        job
      });

      console.log(`✓ Scheduled ${candleKey} successfully`);

    } catch (error) {
      console.error(`Failed to schedule ${candleKey}:`, error);
    }
  }

  /**
   * Unschedule a specific candle
   */
  async unscheduleCandle(symbol: string, resolution: string): Promise<void> {
    const candleKey = `${symbol}:${resolution}`;

    const scheduledJob = this.scheduledJobs.get(candleKey);
    if (!scheduledJob) {
      console.log(`Candle ${candleKey} not scheduled, nothing to unschedule`);
      return;
    }

    console.log(`Unscheduling ${candleKey}...`);

    // Stop cron job
    scheduledJob.job.stop();

    // Remove from map
    this.scheduledJobs.delete(candleKey);

    console.log(`✓ Unscheduled ${candleKey} successfully`);
  }

  /**
   * Execute all strategies for a specific candle
   */
  private async executeCandle(symbol: string, resolution: string): Promise<void> {
    const candleKey = `${symbol}:${resolution}`;

    try {
      // Calculate scheduled time (next candle close)
      const scheduledTime = computeNextCandleClose(new Date(), resolution);

      console.log(
        `\n${'─'.repeat(80)}\n` +
        `Executing strategies for ${candleKey} at ${scheduledTime.toISOString()}\n` +
        `${'─'.repeat(80)}`
      );

      // Call execution coordinator
      await executionCoordinator.executeCandleStrategies(
        symbol,
        resolution,
        scheduledTime
      );

      console.log(`${'─'.repeat(80)}\n`);

    } catch (error) {
      console.error(`Error executing ${candleKey}:`, error);
    }
  }

  /**
   * Schedule periodic refresh of schedules (every 1 minute)
   */
  private scheduleRefresh(): void {
    console.log('Scheduling periodic refresh every 1 minute');

    cron.schedule('* * * * *', async () => {
      if (this.isShuttingDown) {
        return;
      }

      console.log('\n📋 Refreshing schedules...');

      try {
        // Refresh registry cache from Redis
        await strategyRegistry.refreshCache();

        // Get current active candles
        const activeCandles = await strategyRegistry.getActiveCandles();
        const activeCandleKeys = new Set(
          activeCandles.map(c => `${c.symbol}:${c.resolution}`)
        );

        // Remove schedules for candles that are no longer active
        const currentKeys = Array.from(this.scheduledJobs.keys());
        for (const key of currentKeys) {
          if (!activeCandleKeys.has(key)) {
            const [symbol, resolution] = key.split(':');
            console.log(`Removing inactive schedule: ${key}`);
            await this.unscheduleCandle(symbol, resolution);
          }
        }

        // Add schedules for new candles
        for (const candle of activeCandles) {
          const key = `${candle.symbol}:${candle.resolution}`;
          if (!this.scheduledJobs.has(key)) {
            console.log(`Adding new schedule: ${key}`);
            await this.scheduleCandle(candle.symbol, candle.resolution);
          }
        }

        console.log(`✓ Refresh complete. Active schedules: ${this.scheduledJobs.size}\n`);

      } catch (error) {
        console.error('Error refreshing schedules:', error);
      }
    });
  }

  /**
   * Schedule periodic cache reconciliation (every 5 minutes)
   * Auto-heals cache drift by validating Redis against database
   */
  private scheduleReconciliation(): void {
    console.log('Scheduling periodic cache reconciliation every 5 minutes\n');

    cron.schedule('*/5 * * * *', async () => {
      if (this.isShuttingDown) {
        return;
      }

      console.log('\n🔄 Running periodic cache reconciliation...');

      try {
        const result = await strategyRegistry.reconcileWithDatabase();

        if (result.orphaned > 0 || result.missing > 0) {
          console.warn(
            `⚠️  Cache drift detected! Orphaned: ${result.orphaned}, Missing: ${result.missing}`
          );
        } else {
          console.log('✅ Cache is in sync with database');
        }

        if (result.errors.length > 0) {
          console.error('Reconciliation errors:', result.errors);
        }

      } catch (error) {
        console.error('Error during reconciliation:', error);
      }
    });
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    workerId: string;
    pid: number;
    scheduledJobs: number;
    candles: string[];
  } {
    return {
      workerId: this.workerId,
      pid: process.pid,
      scheduledJobs: this.scheduledJobs.size,
      candles: Array.from(this.scheduledJobs.keys())
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;

    console.log('\n🛑 Shutting down strategy scheduler...');

    // Stop all cron jobs
    for (const [candleKey, scheduledJob] of this.scheduledJobs) {
      console.log(`Stopping job for ${candleKey}...`);
      scheduledJob.job.stop();
    }

    this.scheduledJobs.clear();

    console.log('✓ All jobs stopped. Shutdown complete.\n');
  }
}

// Create and start scheduler
const scheduler = new StrategyScheduler();

// Initialize scheduler
scheduler.initialize().catch((error) => {
  console.error('Fatal error initializing scheduler:', error);
  process.exit(1);
});

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM signal');
  await scheduler.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT signal');
  await scheduler.shutdown();
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  scheduler.shutdown().then(() => {
    process.exit(1);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  scheduler.shutdown().then(() => {
    process.exit(1);
  });
});

// Status endpoint (optional - can be exposed via HTTP if needed)
setInterval(() => {
  const status = scheduler.getStatus();
  console.log(
    `\n💓 Scheduler Heartbeat: ${status.scheduledJobs} jobs running | ` +
    `Worker: ${status.workerId} | PID: ${status.pid}`
  );
}, 60000); // Every minute

export { scheduler };
