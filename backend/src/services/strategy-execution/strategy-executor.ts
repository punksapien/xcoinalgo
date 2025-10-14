/**
 * Strategy Executor Service
 * Orchestrates strategy execution in both backtest and live modes
 * Handles multi-tenant execution with encrypted API key management
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import logger from '../../config/logger';
import { strategyEnvironmentManager } from '../strategy-environment-manager';
import { decrypt } from '../../utils/encryption';
import { prisma } from '../../config/database';

export interface StrategySettings {
  strategy_id: string;
  pair: string;
  capital: number;
  leverage: number;
  risk_per_trade: number;
  resolution?: string;
  commission_rate?: number;
  gst_rate?: number;
  sl_rate?: number;
  tp_rate?: number;
  start_date?: string;
  end_date?: string;
}

export interface Subscriber {
  user_id: string;
  api_key: string;      // Decrypted in memory only
  api_secret: string;   // Decrypted in memory only
  capital: number;
  leverage: number;
  risk_per_trade: number;
}

export interface BacktestResult {
  success: boolean;
  mode: 'backtest';
  metrics?: any;
  trades?: any[];
  total_trades?: number;
  error?: string;
  traceback?: string;
}

export interface LiveExecutionResult {
  success: boolean;
  mode: 'live';
  result?: any;
  subscribers_count?: number;
  error?: string;
  traceback?: string;
}

export type ExecutionResult = BacktestResult | LiveExecutionResult;

export class StrategyExecutor {
  /**
   * Get the strategy file path for a given strategy ID
   */
  private async getStrategyFilePath(strategyId: string): Promise<string> {
    const strategiesDir = path.join(__dirname, '../../../strategies');
    const strategyDir = path.join(strategiesDir, strategyId);

    // Find the .py file in the strategy directory
    const files = await fs.readdir(strategyDir);
    const pyFile = files.find(f => f.endsWith('.py'));

    if (!pyFile) {
      throw new Error(`No Python file found in strategy directory: ${strategyDir}`);
    }

    return path.join(strategyDir, pyFile);
  }

  /**
   * Execute strategy in backtest mode
   */
  async executeBacktest(
    strategyId: string,
    settings: StrategySettings
  ): Promise<BacktestResult> {
    logger.info(`Executing backtest for strategy ${strategyId}`);

    try {
      // Ensure environment exists
      const envExists = await strategyEnvironmentManager.environmentExists(strategyId);
      if (!envExists) {
        logger.info(`Environment not found for strategy ${strategyId}, creating...`);
        await strategyEnvironmentManager.createEnvironment(strategyId);
      }

      // Get environment info
      const envInfo = await strategyEnvironmentManager.getEnvironmentInfo(strategyId);
      if (envInfo.status !== 'ready') {
        throw new Error(`Environment is not ready for strategy ${strategyId}: ${envInfo.status}`);
      }

      // Get strategy file path
      const strategyFilePath = await this.getStrategyFilePath(strategyId);

      // Prepare input for Python executor
      const input = {
        mode: 'backtest',
        strategy_file: strategyFilePath,
        settings: {
          ...settings,
          strategy_id: strategyId,
        },
      };

      // Execute in isolated environment
      const result = await this.executePythonScript(
        envInfo.pythonPath,
        path.join(__dirname, '../../../python/strategy_executor.py'),
        input
      );

      // Parse result
      const parsedResult = JSON.parse(result.stdout);

      // Log result
      if (parsedResult.success) {
        logger.info(`Backtest completed successfully for strategy ${strategyId}`);
        logger.info(`Total trades: ${parsedResult.total_trades}`);
      } else {
        logger.error(`Backtest failed for strategy ${strategyId}: ${parsedResult.error}`);
      }

      return parsedResult as BacktestResult;

    } catch (error) {
      logger.error(`Failed to execute backtest for strategy ${strategyId}:`, error);
      return {
        success: false,
        mode: 'backtest',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Fetch active subscribers with decrypted credentials
   */
  private async fetchActiveSubscribers(strategyId: string): Promise<Subscriber[]> {
    logger.info(`Fetching active subscribers for strategy ${strategyId}`);

    try {
      // Fetch subscriptions with broker credentials
      const subscriptions = await prisma.strategySubscription.findMany({
        where: {
          strategyId,
          isActive: true,
          isPaused: false,
        },
        include: {
          brokerCredential: {
            select: {
              apiKey: true,     // Encrypted in DB
              apiSecret: true,  // Encrypted in DB
            },
          },
        },
      });

      // Decrypt credentials in memory
      const subscribers: Subscriber[] = subscriptions.map((sub) => ({
        user_id: sub.userId,
        api_key: decrypt(sub.brokerCredential.apiKey),      // Decrypt in memory
        api_secret: decrypt(sub.brokerCredential.apiSecret), // Decrypt in memory
        capital: sub.capital,
        leverage: sub.leverage,
        risk_per_trade: sub.riskPerTrade,
      }));

      logger.info(`Found ${subscribers.length} active subscribers for strategy ${strategyId}`);

      return subscribers;

    } catch (error) {
      logger.error(`Failed to fetch subscribers for strategy ${strategyId}:`, error);
      throw error;
    }
  }

  /**
   * Execute strategy in live mode
   */
  async executeLive(
    strategyId: string,
    settings: StrategySettings
  ): Promise<LiveExecutionResult> {
    logger.info(`Executing live trading for strategy ${strategyId}`);

    try {
      // Fetch active subscribers with decrypted credentials
      const subscribers = await this.fetchActiveSubscribers(strategyId);

      if (subscribers.length === 0) {
        logger.warn(`No active subscribers found for strategy ${strategyId}`);
        return {
          success: false,
          mode: 'live',
          error: 'No active subscribers found',
        };
      }

      // Ensure environment exists
      const envExists = await strategyEnvironmentManager.environmentExists(strategyId);
      if (!envExists) {
        throw new Error(`Environment not found for strategy ${strategyId}. Strategy must be validated first.`);
      }

      // Get environment info
      const envInfo = await strategyEnvironmentManager.getEnvironmentInfo(strategyId);
      if (envInfo.status !== 'ready') {
        throw new Error(`Environment is not ready for strategy ${strategyId}: ${envInfo.status}`);
      }

      // Get strategy file path
      const strategyFilePath = await this.getStrategyFilePath(strategyId);

      // Prepare input for Python executor
      const input = {
        mode: 'live',
        strategy_file: strategyFilePath,
        settings: {
          ...settings,
          strategy_id: strategyId,
        },
        subscribers,
      };

      // Execute in isolated environment
      const result = await this.executePythonScript(
        envInfo.pythonPath,
        path.join(__dirname, '../../../python/strategy_executor.py'),
        input
      );

      // Parse result
      const parsedResult = JSON.parse(result.stdout);

      // Log result
      if (parsedResult.success) {
        logger.info(`Live execution completed successfully for strategy ${strategyId}`);
        logger.info(`Executed for ${parsedResult.subscribers_count} subscribers`);
      } else {
        logger.error(`Live execution failed for strategy ${strategyId}: ${parsedResult.error}`);
      }

      // Update trade statistics in database
      if (parsedResult.success) {
        await this.updateTradeStatistics(strategyId, subscribers.length);
      }

      return parsedResult as LiveExecutionResult;

    } catch (error) {
      logger.error(`Failed to execute live trading for strategy ${strategyId}:`, error);
      return {
        success: false,
        mode: 'live',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Execute Python script with JSON input/output
   */
  private executePythonScript(
    pythonPath: string,
    scriptPath: string,
    input: any
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const process = spawn(pythonPath, [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      // Send input as JSON to stdin
      process.stdin.write(JSON.stringify(input));
      process.stdin.end();

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Process exited with code ${code}\nStderr: ${stderr}\nStdout: ${stdout}`));
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Update trade statistics after successful execution
   */
  private async updateTradeStatistics(strategyId: string, subscriberCount: number): Promise<void> {
    try {
      // Update strategy statistics
      await prisma.strategy.update({
        where: { id: strategyId },
        data: {
          lastExecutedAt: new Date(),
          // You can add more statistics here as needed
        },
      });

      logger.info(`Updated trade statistics for strategy ${strategyId}`);
    } catch (error) {
      logger.error(`Failed to update trade statistics for strategy ${strategyId}:`, error);
      // Don't throw - this is non-critical
    }
  }

  /**
   * Get strategy resolution from STRATEGY_CONFIG in the Python file
   */
  async getStrategyResolution(strategyId: string): Promise<string> {
    try {
      const strategyFilePath = await this.getStrategyFilePath(strategyId);
      const content = await fs.readFile(strategyFilePath, 'utf-8');

      // Simple regex to find STRATEGY_CONFIG['resolution'] or STRATEGY_CONFIG["resolution"]
      const resolutionMatch = content.match(/STRATEGY_CONFIG\s*=\s*{[^}]*['"]resolution['"]\s*:\s*['"](\w+)['"]/);

      if (resolutionMatch && resolutionMatch[1]) {
        const resolution = resolutionMatch[1];
        logger.info(`Found resolution '${resolution}' for strategy ${strategyId}`);
        return resolution;
      }

      // Default to 5 minutes if not found
      logger.warn(`No resolution found in STRATEGY_CONFIG for strategy ${strategyId}, defaulting to '5m'`);
      return '5m';

    } catch (error) {
      logger.error(`Failed to get resolution for strategy ${strategyId}:`, error);
      return '5m'; // Default fallback
    }
  }
}

// Export singleton instance
export const strategyExecutor = new StrategyExecutor();
