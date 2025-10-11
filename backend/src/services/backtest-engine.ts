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
import fs from 'fs';
import os from 'os';

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
      // Fetch strategy with latest version from database
      const strategy = await prisma.strategy.findUnique({
        where: { id: config.strategyId },
        include: {
          versions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!strategy) {
        throw new Error(`Strategy ${config.strategyId} not found`);
      }

      if (!strategy.versions || strategy.versions.length === 0) {
        throw new Error(`Strategy ${config.strategyId} has no uploaded code versions`);
      }

      const latestVersion = strategy.versions[0];
      const strategyCode = latestVersion.strategyCode;

      if (!strategyCode) {
        throw new Error(`Strategy ${config.strategyId} version ${latestVersion.version} has no code`);
      }

      logger.info(`Using strategy version ${latestVersion.version} (${strategyCode.length} bytes)`);

      // Fetch historical data
      const historicalData = await this.fetchHistoricalData(
        config.symbol,
        config.resolution,
        config.startDate,
        config.endDate
      );

      logger.info(`Fetched ${historicalData.length} candles for backtesting`);

      // Run batch backtest using optimized Python processor
      logger.info('Running batch backtest (single-pass processing)...');

      const batchResult = await this.executeBatchBacktest(
        strategyCode,
        historicalData,
        config
      );

      if (!batchResult.success) {
        throw new Error(`Batch backtest failed: ${batchResult.error}`);
      }

      // Convert Python result to TypeScript format
      const trades: Trade[] = batchResult.trades.map((trade: any) => ({
        entryTime: new Date(trade.entry_time),
        exitTime: new Date(trade.exit_time),
        side: trade.side as 'LONG' | 'SHORT',
        entryPrice: trade.entry_price,
        exitPrice: trade.exit_price,
        quantity: trade.quantity,
        pnl: trade.pnl,
        pnlPct: trade.pnl_pct,
        commission: trade.commission,
        reason: trade.reason as 'SIGNAL' | 'STOP_LOSS' | 'TAKE_PROFIT',
      }));

      const equityCurve: Array<{ time: Date; equity: number; drawdown: number }> =
        batchResult.equity_curve.map((point: any) => ({
          time: new Date(point.time),
          equity: point.equity,
          drawdown: point.drawdown,
        }));

      // Convert Python metrics to TypeScript format
      const pythonMetrics = batchResult.metrics;
      const metrics: BacktestResult['metrics'] = {
        totalTrades: pythonMetrics.totalTrades,
        winningTrades: pythonMetrics.winningTrades,
        losingTrades: pythonMetrics.losingTrades,
        winRate: pythonMetrics.winRate,
        totalPnl: pythonMetrics.totalPnl,
        totalPnlPct: pythonMetrics.totalPnlPct,
        avgWin: trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0) / Math.max(1, pythonMetrics.winningTrades),
        avgLoss: Math.abs(trades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0)) / Math.max(1, pythonMetrics.losingTrades),
        largestWin: trades.length > 0 ? Math.max(...trades.filter(t => t.pnl > 0).map(t => t.pnl), 0) : 0,
        largestLoss: trades.length > 0 ? Math.min(...trades.filter(t => t.pnl < 0).map(t => t.pnl), 0) : 0,
        profitFactor: pythonMetrics.profitFactor,
        sharpeRatio: pythonMetrics.sharpeRatio,
        maxDrawdown: pythonMetrics.maxDrawdown,
        maxDrawdownPct: pythonMetrics.maxDrawdownPct,
        avgTradeDuration: trades.length > 0
          ? trades.reduce((sum, t) => sum + (t.exitTime.getTime() - t.entryTime.getTime()), 0) / trades.length / 60000
          : 0,
        totalCommission: trades.reduce((sum, t) => sum + t.commission, 0),
        netPnl: pythonMetrics.totalPnl,
        finalCapital: pythonMetrics.finalCapital,
      };

      logger.info(`Batch backtest completed: ${trades.length} trades, ${pythonMetrics.winRate.toFixed(2)}% win rate`);

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
   * Map resolution format to CoinDCX API format
   * Input: "5m", "1h", "1d"
   * Output: "5", "60", "1D"
   */
  private mapResolution(resolution: string): string {
    const mapping: Record<string, string> = {
      '1m': '1',
      '5m': '5',
      '15m': '15',
      '30m': '30',
      '1h': '60',
      '2h': '120',
      '4h': '240',
      '6h': '360',
      '8h': '480',
      '1d': '1D',
      '1w': '1W',
      '1M': '1M',
    };

    return mapping[resolution] || resolution;
  }

  /**
   * Fetch historical OHLCV data from CoinDCX
   * Automatically detects futures vs spot and calls appropriate API
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
    // Check if this is a futures symbol (starts with "B-")
    const isFutures = symbol.startsWith('B-');

    if (isFutures) {
      // Futures trading - use getFuturesCandles
      logger.info(`Fetching futures data for ${symbol} from ${startDate.toISOString()} to ${endDate.toISOString()}`);

      const fromTimestamp = Math.floor(startDate.getTime() / 1000);
      const toTimestamp = Math.floor(endDate.getTime() / 1000);
      const apiResolution = this.mapResolution(resolution);

      const candles = await CoinDCXClient.getFuturesCandles(
        symbol,
        fromTimestamp,
        toTimestamp,
        apiResolution as any
      );

      logger.info(`Fetched ${candles.length} futures candles for ${symbol}`);
      return candles;

    } else {
      // Spot trading - use getHistoricalCandles
      logger.info(`Fetching spot data for ${symbol}`);

      const market = CoinDCXClient.normalizeMarket(symbol) + 'INR';
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

      logger.info(`Fetched ${filtered.length} spot candles for ${symbol}`);
      return filtered;
    }
  }

  /**
   * Execute batch backtest using optimized Python processor
   * Spawns Python ONCE and processes ALL candles in a single execution
   */
  private async executeBatchBacktest(
    strategyCode: string,
    historicalData: any[],
    config: BacktestConfig
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const pythonScriptPath = path.join(
        __dirname,
        '../../python/batch_backtest.py'
      );

      const input = JSON.stringify({
        strategy_code: strategyCode,
        historical_data: historicalData,
        config: {
          symbol: config.symbol,
          resolution: config.resolution,
          lookback_period: 200,
        },
        initial_capital: config.initialCapital,
        risk_per_trade: config.riskPerTrade,
        leverage: config.leverage,
        commission: config.commission,
      });

      // Write input to temporary file to avoid stdin buffer overflow with large datasets
      const tempFilePath = path.join(os.tmpdir(), `backtest-${Date.now()}-${Math.random().toString(36).substring(7)}.json`);
      fs.writeFileSync(tempFilePath, input);

      logger.info(`Wrote ${input.length} bytes to temp file: ${tempFilePath}`);

      const pythonProcess = spawn('python3', [pythonScriptPath, tempFilePath], {
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
        // Clean up temp file
        try {
          fs.unlinkSync(tempFilePath);
        } catch (e) {
          logger.warn(`Failed to delete temp file ${tempFilePath}: ${e}`);
        }

        if (code !== 0) {
          logger.error(`Batch backtest failed with code ${code}`);
          logger.error(`stderr: ${stderr}`);
          resolve({
            success: false,
            error: `Python process exited with code ${code}`,
            trades: [],
            metrics: {},
          });
          return;
        }

        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (error) {
          logger.error(`Failed to parse batch backtest result: ${error}`);
          logger.error(`stdout: ${stdout}`);
          resolve({
            success: false,
            error: `Failed to parse Python output: ${error}`,
            trades: [],
            metrics: {},
          });
        }
      });

      // Longer timeout for batch processing (10 minutes for 1 year of data)
      setTimeout(() => {
        pythonProcess.kill();
        // Clean up temp file on timeout
        try {
          fs.unlinkSync(tempFilePath);
        } catch (e) {
          // Ignore
        }
        resolve({
          success: false,
          error: 'Batch backtest timed out after 10 minutes',
          trades: [],
          metrics: {},
        });
      }, 600000); // 10 minutes
    });
  }

  /**
   * Execute strategy code on a single candle (used for live execution, not backtesting)
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
   * Calculate monthly returns from trades
   */
  private calculateMonthlyReturns(trades: Trade[]): Record<string, number> {
    const monthlyReturns: Record<string, number> = {};

    trades.forEach(trade => {
      const year = trade.exitTime.getFullYear();
      const month = trade.exitTime.getMonth() + 1; // 1-12
      const key = `${year}-${month.toString().padStart(2, '0')}`;

      if (!monthlyReturns[key]) {
        monthlyReturns[key] = 0;
      }
      monthlyReturns[key] += trade.pnl;
    });

    return monthlyReturns;
  }

  /**
   * Transform backend trade format to frontend expected format
   * Frontend expects specific field names and formats for the Full Trade Report UI
   */
  private transformTradesForFrontend(trades: Trade[]): any[] {
    return trades.map((trade, index) => {
      // Format dates
      const entryDate = trade.entryTime.toISOString().split('T')[0]; // "2024-09-18"
      const exitDate = trade.exitTime.toISOString().split('T')[0];   // "2024-09-18"
      const entryTime = trade.entryTime.toISOString().split('T')[1].split('.')[0]; // "09:30:00"
      const exitTime = trade.exitTime.toISOString().split('T')[1].split('.')[0];   // "10:30:00"

      // Map reason to remarks
      const remarksMap: Record<string, string> = {
        'SIGNAL': 'Strategy signal',
        'STOP_LOSS': 'Stop loss hit',
        'TAKE_PROFIT': 'Take profit reached',
      };

      return {
        index: index + 1, // 1-indexed for display
        entryTime,
        exitTime,
        entryDate,
        exitDate,
        orderType: 'Market', // Default to market orders for backtests
        strike: 'N/A', // Not applicable for futures/spot trading
        action: trade.side === 'LONG' ? 'buy' : 'sell', // Convert "LONG" -> "buy", "SHORT" -> "sell"
        quantity: trade.quantity,
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice,
        profitLoss: trade.pnl,
        charges: trade.commission,
        remarks: remarksMap[trade.reason] || trade.reason,
      };
    });
  }

  /**
   * Store backtest result in database
   */
  private async storeBacktestResult(
    strategyId: string,
    result: BacktestResult
  ): Promise<void> {
    try {
      const monthlyReturns = this.calculateMonthlyReturns(result.trades);

      // Transform trades to frontend expected format before saving
      const transformedTrades = this.transformTradesForFrontend(result.trades);

      await prisma.backtestResult.create({
        data: {
          strategy: {
            connect: { id: strategyId }
          },
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
          avgTrade: result.metrics.totalTrades > 0 ? result.metrics.totalPnl / result.metrics.totalTrades : 0,
          equityCurve: result.equityCurve as any,
          tradeHistory: transformedTrades as any, // Use transformed trades
          monthlyReturns: monthlyReturns as any,
          backtestDuration: result.executionTime / 1000, // Convert ms to seconds
        },
      });

      logger.info(`Backtest result stored for strategy ${strategyId} with ${transformedTrades.length} trades`);
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
