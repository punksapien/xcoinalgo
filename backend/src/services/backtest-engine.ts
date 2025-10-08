/**
 * Backtest Engine Service
 *
 * Simulates strategy execution on historical data to evaluate performance
 * before live deployment.
 *
 * Features:
 * - Fetches historical OHLCV data from CoinDCX
 * - Executes strategy logic on each candle
 * - Simulates order fills with realistic assumptions
 * - Calculates performance metrics (Sharpe, drawdown, win rate, etc.)
 * - Stores results in database
 */

import { PrismaClient } from '@prisma/client';
import CoinDCXClient from './coindcx-client';
import { Logger } from '../utils/logger';
import { spawn } from 'child_process';
import path from 'path';

const prisma = new PrismaClient();
const logger = new Logger('BacktestEngine');

interface BacktestConfig {
  strategyId: string;
  symbol: string;
  resolution: '1m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '6h' | '8h' | '1d' | '1w' | '1M';
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  riskPerTrade: number;
  leverage: number;
  commission: number; // e.g., 0.001 for 0.1%
}

interface Trade {
  entryTime: Date;
  exitTime: Date;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPct: number;
  commission: number;
  reason: 'SIGNAL' | 'STOP_LOSS' | 'TAKE_PROFIT';
}

interface BacktestResult {
  config: BacktestConfig;
  trades: Trade[];
  metrics: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    totalPnl: number;
    totalPnlPct: number;
    avgWin: number;
    avgLoss: number;
    largestWin: number;
    largestLoss: number;
    profitFactor: number;
    sharpeRatio: number;
    maxDrawdown: number;
    maxDrawdownPct: number;
    avgTradeDuration: number; // in minutes
    totalCommission: number;
    netPnl: number;
    finalCapital: number;
  };
  equityCurve: Array<{
    time: Date;
    equity: number;
    drawdown: number;
  }>;
  executionTime: number;
}

interface StrategySignal {
  signal: 'LONG' | 'SHORT' | 'HOLD' | 'EXIT_LONG' | 'EXIT_SHORT';
  price: number;
  quantity?: number;
  stopLoss?: number;
  takeProfit?: number;
}

class BacktestEngine {
  /**
   * Run backtest for a strategy
   */
  async runBacktest(config: BacktestConfig): Promise<BacktestResult> {
    const startTime = Date.now();

    logger.info(`Starting backtest for strategy ${config.strategyId}`);
    logger.info(`Period: ${config.startDate.toISOString()} to ${config.endDate.toISOString()}`);
    logger.info(`Market: ${config.symbol} ${config.resolution}`);

    try {
      // Fetch strategy from database
      const strategy = await prisma.strategy.findUnique({
        where: { id: config.strategyId },
      });

      if (!strategy) {
        throw new Error(`Strategy ${config.strategyId} not found`);
      }

      // Fetch historical data
      const historicalData = await this.fetchHistoricalData(
        config.symbol,
        config.resolution,
        config.startDate,
        config.endDate
      );

      logger.info(`Fetched ${historicalData.length} candles for backtesting`);

      // Run simulation
      const trades: Trade[] = [];
      const equityCurve: Array<{ time: Date; equity: number; drawdown: number }> = [];

      let capital = config.initialCapital;
      let maxEquity = capital;
      let currentPosition: {
        side: 'LONG' | 'SHORT';
        entryPrice: number;
        entryTime: Date;
        quantity: number;
        stopLoss?: number;
        takeProfit?: number;
      } | null = null;

      // Process each candle
      for (let i = 50; i < historicalData.length; i++) {
        const currentCandle = historicalData[i];
        const historicalWindow = historicalData.slice(Math.max(0, i - 200), i + 1);

        // Execute strategy on this candle
        const signal = await this.executeStrategyOnCandle(
          strategy.code,
          historicalWindow,
          config
        );

        if (!signal) {
          continue;
        }

        // Check if we need to close existing position first
        if (currentPosition) {
          const shouldExit = this.shouldExitPosition(
            currentPosition,
            currentCandle,
            signal
          );

          if (shouldExit) {
            const exitPrice = currentCandle.close;
            const pnl = this.calculatePnl(
              currentPosition.side,
              currentPosition.entryPrice,
              exitPrice,
              currentPosition.quantity
            );

            const commission = (currentPosition.entryPrice * currentPosition.quantity * config.commission) +
                              (exitPrice * currentPosition.quantity * config.commission);

            const netPnl = pnl - commission;
            capital += netPnl;

            trades.push({
              entryTime: currentPosition.entryTime,
              exitTime: new Date(currentCandle.time),
              side: currentPosition.side,
              entryPrice: currentPosition.entryPrice,
              exitPrice,
              quantity: currentPosition.quantity,
              pnl: netPnl,
              pnlPct: (netPnl / (currentPosition.entryPrice * currentPosition.quantity)) * 100,
              commission,
              reason: shouldExit.reason,
            });

            currentPosition = null;

            logger.debug(`Closed position: ${netPnl.toFixed(2)} (${trades[trades.length - 1].pnlPct.toFixed(2)}%)`);
          }
        }

        // Open new position if signal indicates
        if (!currentPosition && (signal.signal === 'LONG' || signal.signal === 'SHORT')) {
          const positionSize = this.calculatePositionSize(
            capital,
            config.riskPerTrade,
            currentCandle.close,
            signal.stopLoss,
            config.leverage
          );

          if (positionSize > 0) {
            currentPosition = {
              side: signal.signal,
              entryPrice: currentCandle.close,
              entryTime: new Date(currentCandle.time),
              quantity: positionSize,
              stopLoss: signal.stopLoss,
              takeProfit: signal.takeProfit,
            };

            logger.debug(`Opened ${signal.signal} position: ${positionSize.toFixed(4)} @ ${currentCandle.close}`);
          }
        }

        // Update equity curve
        let currentEquity = capital;
        if (currentPosition) {
          const unrealizedPnl = this.calculatePnl(
            currentPosition.side,
            currentPosition.entryPrice,
            currentCandle.close,
            currentPosition.quantity
          );
          currentEquity += unrealizedPnl;
        }

        maxEquity = Math.max(maxEquity, currentEquity);
        const drawdown = maxEquity - currentEquity;

        equityCurve.push({
          time: new Date(currentCandle.time),
          equity: currentEquity,
          drawdown,
        });
      }

      // Close any remaining open position
      if (currentPosition) {
        const lastCandle = historicalData[historicalData.length - 1];
        const exitPrice = lastCandle.close;
        const pnl = this.calculatePnl(
          currentPosition.side,
          currentPosition.entryPrice,
          exitPrice,
          currentPosition.quantity
        );

        const commission = (currentPosition.entryPrice * currentPosition.quantity * config.commission) +
                          (exitPrice * currentPosition.quantity * config.commission);

        const netPnl = pnl - commission;
        capital += netPnl;

        trades.push({
          entryTime: currentPosition.entryTime,
          exitTime: new Date(lastCandle.time),
          side: currentPosition.side,
          entryPrice: currentPosition.entryPrice,
          exitPrice,
          quantity: currentPosition.quantity,
          pnl: netPnl,
          pnlPct: (netPnl / (currentPosition.entryPrice * currentPosition.quantity)) * 100,
          commission,
          reason: 'SIGNAL',
        });
      }

      // Calculate metrics
      const metrics = this.calculateMetrics(trades, config.initialCapital, capital, equityCurve);

      const result: BacktestResult = {
        config,
        trades,
        metrics,
        equityCurve,
        executionTime: Date.now() - startTime,
      };

      // Store result in database
      await this.storeBacktestResult(config.strategyId, result);

      logger.info(`Backtest completed in ${result.executionTime}ms`);
      logger.info(`Total Trades: ${metrics.totalTrades}, Win Rate: ${metrics.winRate.toFixed(2)}%`);
      logger.info(`Total P&L: ${metrics.totalPnl.toFixed(2)} (${metrics.totalPnlPct.toFixed(2)}%)`);
      logger.info(`Sharpe Ratio: ${metrics.sharpeRatio.toFixed(2)}, Max Drawdown: ${metrics.maxDrawdownPct.toFixed(2)}%`);

      return result;
    } catch (error) {
      logger.error('Backtest failed:', error);
      throw error;
    }
  }

  /**
   * Fetch historical OHLCV data from CoinDCX
   */
  private async fetchHistoricalData(
    symbol: string,
    resolution: string,
    startDate: Date,
    endDate: Date
  ): Promise<Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>> {
    const market = CoinDCXClient.normalizeMarket(symbol) + 'INR';

    // Calculate how many candles we need
    const candles = await CoinDCXClient.getHistoricalCandles(
      market,
      resolution as any,
      1000 // Max limit
    );

    // Filter by date range
    const filtered = candles.filter(candle => {
      const candleTime = new Date(candle.time);
      return candleTime >= startDate && candleTime <= endDate;
    });

    return filtered;
  }

  /**
   * Execute strategy code on a single candle
   */
  private async executeStrategyOnCandle(
    strategyCode: string,
    historicalData: any[],
    config: BacktestConfig
  ): Promise<StrategySignal | null> {
    return new Promise((resolve) => {
      const pythonScriptPath = path.join(
        __dirname,
        '../../python/strategy_runner.py'
      );

      const input = JSON.stringify({
        strategy_code: strategyCode,
        historical_data: historicalData,
        config: {
          symbol: config.symbol,
          resolution: config.resolution,
        },
      });

      const pythonProcess = spawn('python3', [pythonScriptPath], {
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          resolve(null);
          return;
        }

        try {
          const result = JSON.parse(stdout);
          resolve(result.signal || null);
        } catch (error) {
          resolve(null);
        }
      });

      pythonProcess.stdin.write(input);
      pythonProcess.stdin.end();

      // Timeout
      setTimeout(() => {
        pythonProcess.kill();
        resolve(null);
      }, 5000);
    });
  }

  /**
   * Check if position should be exited
   */
  private shouldExitPosition(
    position: any,
    currentCandle: any,
    signal: StrategySignal
  ): { should: boolean; reason: 'SIGNAL' | 'STOP_LOSS' | 'TAKE_PROFIT' } | null {
    // Check stop loss
    if (position.stopLoss) {
      if (position.side === 'LONG' && currentCandle.low <= position.stopLoss) {
        return { should: true, reason: 'STOP_LOSS' };
      }
      if (position.side === 'SHORT' && currentCandle.high >= position.stopLoss) {
        return { should: true, reason: 'STOP_LOSS' };
      }
    }

    // Check take profit
    if (position.takeProfit) {
      if (position.side === 'LONG' && currentCandle.high >= position.takeProfit) {
        return { should: true, reason: 'TAKE_PROFIT' };
      }
      if (position.side === 'SHORT' && currentCandle.low <= position.takeProfit) {
        return { should: true, reason: 'TAKE_PROFIT' };
      }
    }

    // Check if signal says to exit
    if (
      (position.side === 'LONG' && (signal.signal === 'EXIT_LONG' || signal.signal === 'SHORT')) ||
      (position.side === 'SHORT' && (signal.signal === 'EXIT_SHORT' || signal.signal === 'LONG'))
    ) {
      return { should: true, reason: 'SIGNAL' };
    }

    return null;
  }

  /**
   * Calculate P&L for a trade
   */
  private calculatePnl(
    side: 'LONG' | 'SHORT',
    entryPrice: number,
    exitPrice: number,
    quantity: number
  ): number {
    if (side === 'LONG') {
      return (exitPrice - entryPrice) * quantity;
    } else {
      return (entryPrice - exitPrice) * quantity;
    }
  }

  /**
   * Calculate position size based on risk parameters
   */
  private calculatePositionSize(
    capital: number,
    riskPerTrade: number,
    entryPrice: number,
    stopLoss?: number,
    leverage: number = 1
  ): number {
    if (!stopLoss) {
      const riskAmount = capital * riskPerTrade;
      return (riskAmount * leverage) / entryPrice;
    }

    const riskAmount = capital * riskPerTrade;
    const stopLossDistance = Math.abs(entryPrice - stopLoss);
    const riskPerUnit = stopLossDistance;

    if (riskPerUnit === 0) {
      return 0;
    }

    return (riskAmount / riskPerUnit) * leverage;
  }

  /**
   * Calculate performance metrics
   */
  private calculateMetrics(
    trades: Trade[],
    initialCapital: number,
    finalCapital: number,
    equityCurve: any[]
  ): BacktestResult['metrics'] {
    const totalTrades = trades.length;
    const winningTrades = trades.filter(t => t.pnl > 0).length;
    const losingTrades = trades.filter(t => t.pnl < 0).length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    const totalPnl = finalCapital - initialCapital;
    const totalPnlPct = (totalPnl / initialCapital) * 100;

    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl < 0);

    const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length) : 0;

    const largestWin = wins.length > 0 ? Math.max(...wins.map(t => t.pnl)) : 0;
    const largestLoss = losses.length > 0 ? Math.min(...losses.map(t => t.pnl)) : 0;

    const totalWins = wins.reduce((sum, t) => sum + t.pnl, 0);
    const totalLosses = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

    // Calculate Sharpe Ratio (simplified - using trade returns)
    const returns = trades.map(t => t.pnlPct / 100);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const stdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    );
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized

    // Calculate max drawdown
    let maxDrawdown = 0;
    let maxDrawdownPct = 0;
    let peak = initialCapital;

    equityCurve.forEach(point => {
      if (point.equity > peak) {
        peak = point.equity;
      }
      const drawdown = peak - point.equity;
      const drawdownPct = (drawdown / peak) * 100;

      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPct = drawdownPct;
      }
    });

    // Average trade duration
    const avgTradeDuration = trades.length > 0
      ? trades.reduce((sum, t) => sum + (t.exitTime.getTime() - t.entryTime.getTime()), 0) / trades.length / 60000
      : 0;

    const totalCommission = trades.reduce((sum, t) => sum + t.commission, 0);
    const netPnl = totalPnl - totalCommission;

    return {
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      totalPnl,
      totalPnlPct,
      avgWin,
      avgLoss,
      largestWin,
      largestLoss,
      profitFactor,
      sharpeRatio,
      maxDrawdown,
      maxDrawdownPct,
      avgTradeDuration,
      totalCommission,
      netPnl,
      finalCapital,
    };
  }

  /**
   * Store backtest result in database
   */
  private async storeBacktestResult(
    strategyId: string,
    result: BacktestResult
  ): Promise<void> {
    try {
      await prisma.backtestResult.create({
        data: {
          strategyId,
          version: '1.0.0',
          startDate: result.config.startDate,
          endDate: result.config.endDate,
          initialBalance: result.config.initialCapital,
          timeframe: result.config.resolution,
          finalBalance: result.metrics.finalCapital,
          totalReturn: result.metrics.netPnl,
          totalReturnPct: result.metrics.totalPnlPct,
          maxDrawdown: result.metrics.maxDrawdown,
          sharpeRatio: result.metrics.sharpeRatio,
          winRate: result.metrics.winRate,
          profitFactor: result.metrics.profitFactor,
          totalTrades: result.metrics.totalTrades,
          avgTrade: result.metrics.totalPnl / result.metrics.totalTrades,
          equityCurve: result.equityCurve as any,
          tradeHistory: result.trades as any,
          monthlyReturns: {} as any, // TODO: Calculate monthly returns
          backtestDuration: result.executionTime / 1000, // Convert ms to seconds
        },
      });

      logger.info(`Backtest result stored for strategy ${strategyId}`);
    } catch (error) {
      logger.error('Failed to store backtest result:', error);
    }
  }

  /**
   * Get backtest results for a strategy
   */
  async getBacktestResults(strategyId: string, limit: number = 10) {
    return await prisma.backtestResult.findMany({
      where: { strategyId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get latest backtest result for a strategy
   */
  async getLatestBacktestResult(strategyId: string) {
    return await prisma.backtestResult.findFirst({
      where: { strategyId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

// Singleton instance
export const backtestEngine = new BacktestEngine();
export default backtestEngine;
