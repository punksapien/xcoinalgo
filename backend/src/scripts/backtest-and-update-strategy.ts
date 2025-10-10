#!/usr/bin/env ts-node
/**
 * Backtest and Update Strategy Script
 *
 * Runs a backtest for a strategy and updates its metrics in the database.
 * This populates the dashboard cards with real backtested performance data.
 *
 * Usage:
 *   npx ts-node src/scripts/backtest-and-update-strategy.ts <strategyId>
 *
 * Example:
 *   npx ts-node src/scripts/backtest-and-update-strategy.ts cmgkvewuv000dp9w3al31fyez
 */

import { PrismaClient } from '@prisma/client';
import { backtestEngine } from '../services/backtest-engine';
import { Logger } from '../utils/logger';

const prisma = new PrismaClient();
const logger = new Logger('BacktestScript');

interface StrategyExecutionConfig {
  symbol?: string;
  resolution?: string;
  lookbackPeriod?: number;
  [key: string]: any;
}

async function main() {
  try {
    // Get strategy ID from command line args
    const strategyId = process.argv[2];

    if (!strategyId) {
      logger.error('Usage: npx ts-node src/scripts/backtest-and-update-strategy.ts <strategyId>');
      process.exit(1);
    }

    logger.info(`Starting backtest for strategy: ${strategyId}`);

    // Fetch strategy from database
    const strategy = await prisma.strategy.findUnique({
      where: { id: strategyId },
      include: {
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!strategy) {
      logger.error(`Strategy not found: ${strategyId}`);
      process.exit(1);
    }

    logger.info(`Found strategy: ${strategy.name} (${strategy.code})`);

    // Get execution config
    const executionConfig = strategy.executionConfig as StrategyExecutionConfig | null;

    if (!executionConfig || !executionConfig.symbol || !executionConfig.resolution) {
      logger.error('Strategy execution config is missing required fields (symbol, resolution)');
      process.exit(1);
    }

    // Determine backtest parameters
    const symbol = executionConfig.symbol; // e.g., "B-SOL_USDT"
    const resolution = executionConfig.resolution; // e.g., "5"

    // Use last 30 days for backtest
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // 30 days ago

    // Default backtest config
    const initialCapital = 10000; // $10,000 USDT
    const riskPerTrade = 0.02; // 2% risk per trade
    const leverage = 10; // 10x leverage (can be overridden from strategy config)
    const commission = 0.0004; // 0.04% CoinDCX futures fee

    logger.info(`Backtest parameters:`);
    logger.info(`  Symbol: ${symbol}`);
    logger.info(`  Resolution: ${resolution} minutes`);
    logger.info(`  Period: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    logger.info(`  Initial Capital: $${initialCapital}`);
    logger.info(`  Risk per Trade: ${riskPerTrade * 100}%`);
    logger.info(`  Leverage: ${leverage}x`);

    // Run backtest
    logger.info('Running backtest... This may take a few minutes.');

    const backtestResult = await backtestEngine.runBacktest({
      strategyId,
      symbol,
      resolution: `${resolution}m` as any, // Convert "5" to "5m"
      startDate,
      endDate,
      initialCapital,
      riskPerTrade,
      leverage,
      commission,
    });

    logger.info('Backtest completed successfully!');
    logger.info('Results:');
    logger.info(`  Total Trades: ${backtestResult.metrics.totalTrades}`);
    logger.info(`  Win Rate: ${backtestResult.metrics.winRate.toFixed(2)}%`);
    logger.info(`  ROI: ${backtestResult.metrics.totalPnlPct.toFixed(2)}%`);
    logger.info(`  Max Drawdown: ${backtestResult.metrics.maxDrawdownPct.toFixed(2)}%`);
    logger.info(`  Sharpe Ratio: ${backtestResult.metrics.sharpeRatio.toFixed(2)}`);
    logger.info(`  Profit Factor: ${backtestResult.metrics.profitFactor.toFixed(2)}`);

    // Calculate risk/reward ratio
    const riskReward = backtestResult.metrics.avgLoss > 0
      ? backtestResult.metrics.avgWin / backtestResult.metrics.avgLoss
      : 0;

    // Update strategy metrics
    logger.info('Updating strategy metrics in database...');

    await prisma.strategy.update({
      where: { id: strategyId },
      data: {
        winRate: backtestResult.metrics.winRate,
        roi: backtestResult.metrics.totalPnlPct,
        maxDrawdown: backtestResult.metrics.maxDrawdownPct,
        sharpeRatio: backtestResult.metrics.sharpeRatio,
        profitFactor: backtestResult.metrics.profitFactor,
        totalTrades: backtestResult.metrics.totalTrades,
        riskReward: riskReward,
        avgTradeReturn: backtestResult.metrics.totalTrades > 0
          ? backtestResult.metrics.totalPnl / backtestResult.metrics.totalTrades
          : 0,
        updatedAt: new Date(),
      },
    });

    logger.info('✅ Strategy metrics updated successfully!');
    logger.info('The strategy dashboard will now display these backtested metrics.');

    process.exit(0);
  } catch (error) {
    logger.error('Backtest script failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error);
  process.exit(1);
});

// Run the script
main();
