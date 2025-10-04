import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { ProcessInfo } from '../types';
import { BotStatus } from '@prisma/client';
import prisma from '../utils/database';
import { decrypt } from '../utils/encryption';
import { Logger } from '../utils/logger';

const logger = new Logger('DockerProcessManager');

export interface ContainerInfo {
  containerId: string;
  strategyId: string;
  status: 'running' | 'stopped' | 'error' | 'starting';
  deploymentId: string;
  resourceUsage?: {
    memory: number;
    cpu: number;
  };
}

export class DockerProcessManager {
  private static instance: DockerProcessManager;
  private strategyService: AxiosInstance;

  constructor() {
    this.strategyService = axios.create({
      baseURL: process.env.STRATEGY_RUNNER_URL || 'http://localhost:8002',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request/response interceptors for logging
    this.strategyService.interceptors.request.use(
      (config) => {
        logger.info(`Making request to strategy service: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error('Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    this.strategyService.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('Strategy service request failed:', {
          url: error.config?.url,
          status: error.response?.status,
          message: error.response?.data?.message || error.message,
        });
        return Promise.reject(error);
      }
    );
  }

  public static getInstance(): DockerProcessManager {
    if (!DockerProcessManager.instance) {
      DockerProcessManager.instance = new DockerProcessManager();
    }
    return DockerProcessManager.instance;
  }

  async startBot(deploymentId: string): Promise<ProcessInfo> {
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
        throw new Error('Bot deployment not found');
      }

      if (!deployment.user.brokerCredentials.length) {
        throw new Error('No active broker credentials found');
      }

      // Decrypt credentials
      const credentials = deployment.user.brokerCredentials[0];
      const apiKey = decrypt(credentials.apiKey);
      const apiSecret = decrypt(credentials.apiSecret);

      // Update status to STARTING
      await prisma.botDeployment.update({
        where: { id: deploymentId },
        data: {
          status: BotStatus.STARTING,
          startedAt: new Date()
        }
      });

      // Prepare strategy deployment request
      const strategyDeploymentRequest = {
        user_id: deployment.userId,
        strategy_code: deployment.strategy.strategyPath || `
# Default strategy code if not provided
from base_strategy import SimpleMovingAverageStrategy

if __name__ == "__main__":
    strategy = SimpleMovingAverageStrategy()
    strategy.start()
        `,
        config: {
          name: deployment.strategy.name,
          code: deployment.strategy.code,
          author: deployment.strategy.author,
          description: deployment.strategy.description || '',
          leverage: deployment.leverage,
          risk_per_trade: deployment.riskPerTrade,
          pair: deployment.strategy.instrument,
          margin_currency: deployment.marginCurrency,
          resolution: '5m',
          lookback_period: 200,
          sl_atr_multiplier: 2.0,
          tp_atr_multiplier: 2.5,
          max_positions: 1,
          max_daily_loss: 0.05,
          custom_params: {}
        },
        auto_start: true,
        environment: 'production',
        resource_limits: {
          memory: '512m',
          cpu: '0.5'
        }
      };

      // Deploy strategy to Docker container via strategy service
      const response: AxiosResponse = await this.strategyService.post(
        '/strategies/deploy',
        strategyDeploymentRequest
      );

      const deploymentResult = response.data;

      if (!deploymentResult.success) {
        throw new Error(deploymentResult.message || 'Strategy deployment failed');
      }

      // Update deployment with strategy info
      await prisma.botDeployment.update({
        where: { id: deploymentId },
        data: {
          pm2ProcessName: deploymentResult.strategy_id,
          status: BotStatus.ACTIVE,
          lastHeartbeat: new Date()
        }
      });

      logger.info(`Strategy deployed successfully: ${deploymentResult.strategy_id}`);

      return {
        pid: 0, // Not applicable for Docker containers
        pm2Id: 0, // Not applicable for Docker containers
        name: deploymentResult.strategy_id,
        status: BotStatus.ACTIVE,
        containerId: deploymentResult.strategy_id
      };

    } catch (error) {
      logger.error(`Failed to start bot ${deploymentId}:`, error);

      // Update deployment status to ERROR
      await prisma.botDeployment.update({
        where: { id: deploymentId },
        data: {
          status: BotStatus.ERROR,
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        }
      });

      throw error;
    }
  }

  async stopBot(deploymentId: string): Promise<void> {
    try {
      const deployment = await prisma.botDeployment.findUnique({
        where: { id: deploymentId }
      });

      if (!deployment || !deployment.pm2ProcessName) {
        throw new Error('Bot deployment not found or not running');
      }

      // Stop strategy via strategy service
      await this.strategyService.post(`/strategies/${deployment.pm2ProcessName}/stop`);

      // Update deployment status
      await prisma.botDeployment.update({
        where: { id: deploymentId },
        data: {
          status: BotStatus.STOPPED,
          stoppedAt: new Date(),
          pm2ProcessName: null
        }
      });

      logger.info(`Strategy stopped successfully: ${deployment.pm2ProcessName}`);

    } catch (error) {
      logger.error(`Failed to stop bot ${deploymentId}:`, error);
      throw error;
    }
  }

  async getProcessInfo(strategyId: string): Promise<ProcessInfo | null> {
    try {
      const response = await this.strategyService.get(`/strategies/${strategyId}/status`);
      const strategyStatus = response.data;

      if (!strategyStatus.success) {
        return null;
      }

      let status: BotStatus = BotStatus.STOPPED;
      switch (strategyStatus.status) {
        case 'running':
          status = BotStatus.ACTIVE;
          break;
        case 'starting':
          status = BotStatus.STARTING;
          break;
        case 'stopped':
          status = BotStatus.STOPPED;
          break;
        case 'error':
          status = BotStatus.ERROR;
          break;
      }

      return {
        pid: 0, // Not applicable for Docker containers
        pm2Id: 0, // Not applicable for Docker containers
        name: strategyId,
        status,
        containerId: strategyId,
        uptime: strategyStatus.metrics?.uptime,
        memory: strategyStatus.metrics?.memory,
        cpu: strategyStatus.metrics?.cpu
      };

    } catch (error) {
      logger.error(`Failed to get process info for ${strategyId}:`, error);
      return null;
    }
  }

  async healthCheck(): Promise<void> {
    try {
      // Check if strategy service is healthy
      const healthResponse = await this.strategyService.get('/health');

      if (healthResponse.status !== 200) {
        logger.error('Strategy service health check failed');
        return;
      }

      // Get active deployments
      const activeDeployments = await prisma.botDeployment.findMany({
        where: {
          status: {
            in: [BotStatus.ACTIVE, BotStatus.STARTING, BotStatus.UNHEALTHY]
          },
          pm2ProcessName: {
            not: null
          }
        }
      });

      // Check status of each deployment
      for (const deployment of activeDeployments) {
        if (!deployment.pm2ProcessName) continue;

        try {
          const processInfo = await this.getProcessInfo(deployment.pm2ProcessName);

          if (!processInfo) {
            // Strategy not found, mark as crashed
            await prisma.botDeployment.update({
              where: { id: deployment.id },
              data: {
                status: BotStatus.CRASHED,
                restartCount: { increment: 1 }
              }
            });
            continue;
          }

          // Update status based on container status
          if (processInfo.status !== deployment.status) {
            await prisma.botDeployment.update({
              where: { id: deployment.id },
              data: {
                status: processInfo.status,
                lastHeartbeat: new Date()
              }
            });
          }

          // Check for unhealthy strategies (no heartbeat for 5 minutes)
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
          if (deployment.lastHeartbeat && deployment.lastHeartbeat < fiveMinutesAgo) {
            await prisma.botDeployment.update({
              where: { id: deployment.id },
              data: {
                status: BotStatus.UNHEALTHY
              }
            });
          }

        } catch (error) {
          logger.error(`Failed to check strategy ${deployment.pm2ProcessName}:`, error);
        }
      }

    } catch (error) {
      logger.error('Health check error:', error);
    }
  }

  async listStrategies(): Promise<ContainerInfo[]> {
    try {
      const response = await this.strategyService.get('/strategies');
      const strategies = response.data.strategies || [];

      return strategies.map((strategy: any) => ({
        containerId: strategy.container_id,
        strategyId: strategy.strategy_id,
        status: strategy.status,
        deploymentId: strategy.strategy_id, // Assuming strategy_id maps to deployment
        resourceUsage: strategy.resource_usage
      }));

    } catch (error) {
      logger.error('Failed to list strategies:', error);
      return [];
    }
  }

  async getStrategyMetrics(strategyId: string): Promise<any> {
    try {
      const response = await this.strategyService.get(`/strategies/${strategyId}/status`);
      return response.data.metrics || {};
    } catch (error) {
      logger.error(`Failed to get metrics for strategy ${strategyId}:`, error);
      return {};
    }
  }

  async getStrategySignals(strategyId: string, limit: number = 10): Promise<any[]> {
    try {
      const response = await this.strategyService.get(`/signals/${strategyId}`, {
        params: { limit }
      });
      return response.data.signals || [];
    } catch (error) {
      logger.error(`Failed to get signals for strategy ${strategyId}:`, error);
      return [];
    }
  }

  async validateStrategy(strategyCode: string, config: any): Promise<any> {
    try {
      const response = await this.strategyService.post('/strategies/validate', {
        strategy_code: strategyCode,
        config: config
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to validate strategy:', error);
      throw new Error(`Strategy validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async broadcastMarketData(marketData: any): Promise<void> {
    try {
      await this.strategyService.post('/market-data/feed', marketData);
    } catch (error) {
      logger.error('Failed to broadcast market data:', error);
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Docker Process Manager...');

    try {
      // Get all active deployments
      const activeDeployments = await prisma.botDeployment.findMany({
        where: {
          status: {
            in: [BotStatus.ACTIVE, BotStatus.STARTING]
          },
          pm2ProcessName: {
            not: null
          }
        }
      });

      // Stop all active strategies
      for (const deployment of activeDeployments) {
        try {
          await this.stopBot(deployment.id);
        } catch (error) {
          logger.error(`Failed to stop deployment ${deployment.id} during shutdown:`, error);
        }
      }

    } catch (error) {
      logger.error('Error during shutdown:', error);
    }
  }
}

// Start health check interval for Docker-based strategies
export function startDockerHealthCheckMonitoring(): void {
  const processManager = DockerProcessManager.getInstance();

  // Run health check every 30 seconds
  setInterval(() => {
    processManager.healthCheck().catch((error) => {
      logger.error('Health check failed:', error);
    });
  }, 30000);

  // Cleanup on process exit
  process.on('SIGINT', async () => {
    logger.info('Shutting down Docker process manager...');
    await processManager.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Shutting down Docker process manager...');
    await processManager.shutdown();
    process.exit(0);
  });
}