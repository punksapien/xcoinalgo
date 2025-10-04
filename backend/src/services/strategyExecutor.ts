/**
 * Strategy Executor Client - Communicates with Python strategy executor service
 * Replaces PM2/Docker-based process management
 */

import axios, { AxiosInstance } from 'axios';
import { BotStatus } from '@prisma/client';
import prisma from '../utils/database';
import { decrypt } from '../utils/encryption';
import { Logger } from '../utils/logger';

const logger = new Logger('StrategyExecutor');

export interface StrategyConfig {
  name: string;
  code: string;
  author: string;
  description?: string;
  leverage: number;
  risk_per_trade: number;
  pair: string;
  margin_currency: string;
  resolution: string;
  lookback_period: number;
  sl_atr_multiplier: number;
  tp_atr_multiplier: number;
  max_positions: number;
  max_daily_loss: number;
  custom_params?: Record<string, any>;
}

export interface DeployStrategyRequest {
  strategy_id: string;
  user_id: string;
  deployment_id: string;
  strategy_code: string;
  config: StrategyConfig;
  execution_interval: number;
  api_key: string;
  api_secret: string;
  auto_start: boolean;
}

export interface StrategyExecutionStats {
  total_executions: number;
  successful_executions: number;
  failed_executions: number;
  avg_execution_time: number;
  last_execution_at?: string;
  last_error?: string;
}

export class StrategyExecutorClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(baseUrl: string = process.env.STRATEGY_EXECUTOR_URL || 'http://localhost:8003') {
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request logging
    this.client.interceptors.request.use(
      (config) => {
        logger.info(`Strategy executor request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error('Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Response error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('Strategy executor request failed:', {
          url: error.config?.url,
          status: error.response?.status,
          message: error.response?.data?.message || error.message,
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Check if strategy executor service is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.status === 200 && response.data.status === 'healthy';
    } catch (error) {
      logger.error('Strategy executor health check failed:', error);
      return false;
    }
  }

  /**
   * Deploy and start a strategy
   */
  async deployStrategy(deploymentId: string): Promise<{ success: boolean; strategy_id: string; message: string }> {
    try {
      // Get deployment details
      const deployment = await prisma.botDeployment.findUnique({
        where: { id: deploymentId },
        include: {
          user: {
            include: {
              brokerCredentials: {
                where: {
                  brokerName: 'coindcx',
                  isActive: true
                }
              }
            }
          },
          strategy: true
        }
      });

      if (!deployment) {
        throw new Error('Deployment not found');
      }

      if (!deployment.user.brokerCredentials.length) {
        throw new Error('No active broker credentials found');
      }

      // Decrypt credentials
      const credentials = deployment.user.brokerCredentials[0];
      const apiKey = decrypt(credentials.apiKey);
      const apiSecret = decrypt(credentials.apiSecret);

      // Prepare strategy configuration
      const config: StrategyConfig = {
        name: deployment.strategy.name,
        code: deployment.strategy.code,
        author: deployment.strategy.author,
        description: deployment.strategy.description || undefined,
        leverage: deployment.leverage,
        risk_per_trade: deployment.riskPerTrade,
        pair: deployment.strategy.instrument,
        margin_currency: deployment.marginCurrency,
        resolution: '5', // Default, should come from strategy config
        lookback_period: 200,
        sl_atr_multiplier: 2.0,
        tp_atr_multiplier: 3.0,
        max_positions: 1,
        max_daily_loss: 0.05,
      };

      const strategyId = `strategy-${deployment.userId}-${deployment.strategyId}`;

      // Deploy to Python executor
      const request: DeployStrategyRequest = {
        strategy_id: strategyId,
        user_id: deployment.userId,
        deployment_id: deploymentId,
        strategy_code: deployment.strategy.code,
        config,
        execution_interval: deployment.executionInterval,
        api_key: apiKey,
        api_secret: apiSecret,
        auto_start: true
      };

      const response = await this.client.post('/strategies/deploy', request);

      // Update deployment status
      await prisma.botDeployment.update({
        where: { id: deploymentId },
        data: {
          status: BotStatus.ACTIVE,
          startedAt: new Date(),
          nextExecutionAt: new Date(Date.now() + deployment.executionInterval * 1000),
          lastHeartbeat: new Date()
        }
      });

      logger.info(`Strategy deployed successfully: ${strategyId}`);

      return {
        success: true,
        strategy_id: strategyId,
        message: response.data.message
      };

    } catch (error: any) {
      logger.error('Failed to deploy strategy:', error);

      // Update deployment with error
      await prisma.botDeployment.update({
        where: { id: deploymentId },
        data: {
          status: BotStatus.ERROR,
          errorMessage: error.response?.data?.detail || error.message
        }
      });

      throw new Error(`Strategy deployment failed: ${error.response?.data?.detail || error.message}`);
    }
  }

  /**
   * Stop a running strategy
   */
  async stopStrategy(deploymentId: string): Promise<void> {
    try {
      const deployment = await prisma.botDeployment.findUnique({
        where: { id: deploymentId }
      });

      if (!deployment) {
        throw new Error('Deployment not found');
      }

      const strategyId = `strategy-${deployment.userId}-${deployment.strategyId}`;

      // Stop strategy in executor
      await this.client.post(`/strategies/${strategyId}/stop`);

      // Update deployment status
      await prisma.botDeployment.update({
        where: { id: deploymentId },
        data: {
          status: BotStatus.STOPPED,
          stoppedAt: new Date()
        }
      });

      logger.info(`Strategy stopped: ${strategyId}`);

    } catch (error: any) {
      logger.error('Failed to stop strategy:', error);
      throw new Error(`Failed to stop strategy: ${error.response?.data?.detail || error.message}`);
    }
  }

  /**
   * Delete a strategy
   */
  async deleteStrategy(deploymentId: string): Promise<void> {
    try {
      const deployment = await prisma.botDeployment.findUnique({
        where: { id: deploymentId }
      });

      if (!deployment) {
        throw new Error('Deployment not found');
      }

      const strategyId = `strategy-${deployment.userId}-${deployment.strategyId}`;

      // Delete from executor
      await this.client.delete(`/strategies/${strategyId}`);

      logger.info(`Strategy deleted: ${strategyId}`);

    } catch (error: any) {
      // If strategy not found in executor, that's okay
      if (error.response?.status !== 404) {
        logger.error('Failed to delete strategy:', error);
        throw new Error(`Failed to delete strategy: ${error.response?.data?.detail || error.message}`);
      }
    }
  }

  /**
   * Get strategy status and stats
   */
  async getStrategyStatus(deploymentId: string): Promise<{
    status: string;
    stats: StrategyExecutionStats;
  } | null> {
    try {
      const deployment = await prisma.botDeployment.findUnique({
        where: { id: deploymentId }
      });

      if (!deployment) {
        return null;
      }

      const strategyId = `strategy-${deployment.userId}-${deployment.strategyId}`;

      const response = await this.client.get(`/strategies/${strategyId}/status`);

      return {
        status: response.data.status,
        stats: response.data.stats
      };

    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      logger.error('Failed to get strategy status:', error);
      return null;
    }
  }

  /**
   * Sync deployment status with executor service
   */
  async syncDeploymentStatus(deploymentId: string): Promise<void> {
    try {
      const statusData = await this.getStrategyStatus(deploymentId);

      if (!statusData) {
        // Strategy not found in executor, mark as crashed
        await prisma.botDeployment.update({
          where: { id: deploymentId },
          data: {
            status: BotStatus.CRASHED
          }
        });
        return;
      }

      // Map executor status to BotStatus
      let botStatus: BotStatus = BotStatus.ACTIVE;
      if (statusData.status === 'stopped') {
        botStatus = BotStatus.STOPPED;
      } else if (statusData.status === 'error') {
        botStatus = BotStatus.ERROR;
      }

      // Update deployment with latest stats
      await prisma.botDeployment.update({
        where: { id: deploymentId },
        data: {
          status: botStatus,
          executionCount: statusData.stats.total_executions,
          successfulExecutions: statusData.stats.successful_executions,
          failedExecutions: statusData.stats.failed_executions,
          avgExecutionTime: statusData.stats.avg_execution_time,
          errorMessage: statusData.stats.last_error || null,
          lastHeartbeat: new Date()
        }
      });

    } catch (error) {
      logger.error('Failed to sync deployment status:', error);
    }
  }

  /**
   * Health check for all active deployments
   */
  async healthCheckDeployments(): Promise<void> {
    try {
      const activeDeployments = await prisma.botDeployment.findMany({
        where: {
          status: {
            in: [BotStatus.ACTIVE, BotStatus.STARTING]
          }
        }
      });

      for (const deployment of activeDeployments) {
        await this.syncDeploymentStatus(deployment.id);
      }

      logger.info(`Health check completed for ${activeDeployments.length} deployments`);

    } catch (error) {
      logger.error('Health check failed:', error);
    }
  }
}

// Singleton instance
export const strategyExecutor = new StrategyExecutorClient();

/**
 * Start periodic health check monitoring
 */
export function startHealthCheckMonitoring(): void {
  // Run health check every 30 seconds
  setInterval(async () => {
    try {
      await strategyExecutor.healthCheckDeployments();
    } catch (error) {
      logger.error('Health check monitoring error:', error);
    }
  }, 30000);

  logger.info('Strategy executor health check monitoring started');
}
