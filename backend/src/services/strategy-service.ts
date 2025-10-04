/**
 * Strategy Service - Communication layer between the main platform and strategy runner service
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { Logger } from '../utils/logger';

const logger = new Logger('StrategyService');

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

export interface StrategyDeploymentRequest {
  user_id: string;
  strategy_code: string;
  config: StrategyConfig;
  auto_start?: boolean;
  environment?: string;
  resource_limits?: Record<string, any>;
}

export interface StrategyResponse {
  success: boolean;
  message: string;
  strategy_id?: string;
  status?: string;
  metrics?: any;
  data?: any;
  error_code?: string;
  error_details?: any;
}

export interface StrategyMetrics {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  total_pnl: number;
  total_pnl_pct: number;
  win_rate: number;
  max_drawdown: number;
  max_drawdown_pct: number;
  sharpe_ratio?: number;
  current_position: string;
  unrealized_pnl: number;
  started_at?: string;
  last_signal_at?: string;
  last_update_at: string;
}

export interface StrategyInfo {
  strategy_id: string;
  user_id: string;
  config: StrategyConfig;
  status: string;
  deployed_at: string;
  started_at?: string;
  stopped_at?: string;
  metrics?: StrategyMetrics;
  process_id?: number;
  memory_usage?: number;
  cpu_usage?: number;
  last_error?: string;
  error_count: number;
}

export interface MarketData {
  symbol: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  bid?: number;
  ask?: number;
  spread?: number;
  exchange?: string;
  data_type?: string;
}

export class StrategyService {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(baseUrl: string = process.env.STRATEGY_RUNNER_URL || 'http://localhost:8002') {
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.info(`Making request to strategy service: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error('Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
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

  /**
   * Check if the strategy service is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.status === 200 && response.data.status === 'healthy';
    } catch (error) {
      logger.error('Strategy service health check failed:', error);
      return false;
    }
  }

  /**
   * Deploy a new strategy
   */
  async deployStrategy(request: StrategyDeploymentRequest): Promise<StrategyResponse> {
    try {
      const response: AxiosResponse<StrategyResponse> = await this.client.post('/strategies/deploy', request);
      logger.info(`Strategy deployed: ${response.data.strategy_id}`);
      return response.data;
    } catch (error: any) {
      logger.error('Failed to deploy strategy:', error);
      throw new Error(`Strategy deployment failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get strategy status
   */
  async getStrategyStatus(strategyId: string): Promise<StrategyResponse> {
    try {
      const response: AxiosResponse<StrategyResponse> = await this.client.get(`/strategies/${strategyId}/status`);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(`Strategy ${strategyId} not found`);
      }
      logger.error(`Failed to get strategy status for ${strategyId}:`, error);
      throw new Error(`Failed to get strategy status: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Stop a running strategy
   */
  async stopStrategy(strategyId: string): Promise<boolean> {
    try {
      const response = await this.client.post(`/strategies/${strategyId}/stop`);
      logger.info(`Strategy ${strategyId} stopped`);
      return response.data.success;
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(`Strategy ${strategyId} not found`);
      }
      logger.error(`Failed to stop strategy ${strategyId}:`, error);
      throw new Error(`Failed to stop strategy: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * List all strategies
   */
  async listStrategies(): Promise<StrategyInfo[]> {
    try {
      const response = await this.client.get('/strategies');
      return response.data.strategies;
    } catch (error: any) {
      logger.error('Failed to list strategies:', error);
      throw new Error(`Failed to list strategies: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Send market data to strategy service
   */
  async sendMarketData(marketData: MarketData): Promise<boolean> {
    try {
      const response = await this.client.post('/market-data/feed', marketData);
      return response.data.success;
    } catch (error: any) {
      logger.error('Failed to send market data:', error);
      throw new Error(`Failed to send market data: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get strategy signals
   */
  async getStrategySignals(strategyId: string, limit: number = 10): Promise<any[]> {
    try {
      const response = await this.client.get(`/signals/${strategyId}`, {
        params: { limit }
      });
      return response.data.signals;
    } catch (error: any) {
      logger.error(`Failed to get signals for strategy ${strategyId}:`, error);
      throw new Error(`Failed to get strategy signals: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Validate strategy code
   */
  async validateStrategy(strategyCode: string, config: StrategyConfig): Promise<any> {
    try {
      // This would typically be a separate endpoint on the strategy service
      // For now, we'll use the deploy endpoint with a dry-run flag
      const response = await this.client.post('/strategies/validate', {
        strategy_code: strategyCode,
        config: config
      });
      return response.data;
    } catch (error: any) {
      logger.error('Failed to validate strategy:', error);
      throw new Error(`Strategy validation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get strategy service metrics
   */
  async getServiceMetrics(): Promise<any> {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (error: any) {
      logger.error('Failed to get service metrics:', error);
      throw new Error(`Failed to get service metrics: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Batch operation to get status of multiple strategies
   */
  async getMultipleStrategyStatus(strategyIds: string[]): Promise<Record<string, StrategyResponse>> {
    const results: Record<string, StrategyResponse> = {};

    // Execute requests in parallel with limited concurrency
    const batchSize = 5;
    for (let i = 0; i < strategyIds.length; i += batchSize) {
      const batch = strategyIds.slice(i, i + batchSize);
      const promises = batch.map(async (strategyId) => {
        try {
          const status = await this.getStrategyStatus(strategyId);
          return { strategyId, status };
        } catch (error) {
          logger.error(`Failed to get status for strategy ${strategyId}:`, error);
          return {
            strategyId,
            status: {
              success: false,
              message: error instanceof Error ? error.message : 'Unknown error',
              strategy_id: strategyId,
              status: 'error'
            } as StrategyResponse
          };
        }
      });

      const batchResults = await Promise.all(promises);
      batchResults.forEach(({ strategyId, status }) => {
        results[strategyId] = status;
      });
    }

    return results;
  }
}

// Singleton instance
export const strategyService = new StrategyService();