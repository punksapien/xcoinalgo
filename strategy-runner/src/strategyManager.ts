import Docker from 'dockerode';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import tar from 'tar';
import { logger } from './utils/logger';

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
  resource_limits?: {
    memory?: string; // e.g., "512m"
    cpu?: string;    // e.g., "0.5"
  };
}

export interface StrategyInfo {
  strategy_id: string;
  container_id: string;
  user_id: string;
  config: StrategyConfig;
  status: 'running' | 'stopped' | 'error' | 'starting';
  deployed_at: string;
  started_at?: string;
  stopped_at?: string;
  last_error?: string;
  resource_usage?: {
    memory: number;
    cpu: number;
  };
}

export class StrategyManager {
  private docker: Docker;
  private strategies: Map<string, StrategyInfo> = new Map();
  private baseImageName = 'coindcx-strategy-base';

  constructor() {
    this.docker = new Docker();
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Strategy Manager...');

    try {
      // Ensure base strategy image exists
      await this.ensureBaseImage();

      // Clean up any orphaned containers
      await this.cleanupOrphanedContainers();

      logger.info('Strategy Manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Strategy Manager:', error);
      throw error;
    }
  }

  async deployStrategy(request: StrategyDeploymentRequest): Promise<{
    success: boolean;
    message: string;
    strategy_id?: string;
    status?: string;
  }> {
    const strategyId = `strategy-${request.user_id}-${uuidv4().slice(0, 8)}`;

    try {
      logger.info(`Deploying strategy ${strategyId}...`);

      // Create strategy workspace
      const workspaceDir = path.join('/tmp', strategyId);
      await fs.mkdir(workspaceDir, { recursive: true });

      // Write strategy files
      await this.createStrategyFiles(workspaceDir, request);

      // Build strategy container
      const containerId = await this.buildAndStartContainer(strategyId, workspaceDir, request);

      // Store strategy info
      const strategyInfo: StrategyInfo = {
        strategy_id: strategyId,
        container_id: containerId,
        user_id: request.user_id,
        config: request.config,
        status: 'starting',
        deployed_at: new Date().toISOString()
      };

      this.strategies.set(strategyId, strategyInfo);

      // Start monitoring
      this.monitorStrategy(strategyId);

      logger.info(`Strategy ${strategyId} deployed successfully`);

      return {
        success: true,
        message: 'Strategy deployed successfully',
        strategy_id: strategyId,
        status: 'starting'
      };

    } catch (error) {
      logger.error(`Failed to deploy strategy ${strategyId}:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getStrategyStatus(strategyId: string): Promise<{
    success: boolean;
    strategy_id: string;
    status: string;
    metrics?: any;
  }> {
    const strategy = this.strategies.get(strategyId);

    if (!strategy) {
      throw new Error(`Strategy ${strategyId} not found`);
    }

    try {
      const container = this.docker.getContainer(strategy.container_id);
      const containerInfo = await container.inspect();

      // Update status based on container state
      const isRunning = containerInfo.State.Running;
      const status = isRunning ? 'running' : 'stopped';

      // Update strategy info
      strategy.status = status as any;
      this.strategies.set(strategyId, strategy);

      return {
        success: true,
        strategy_id: strategyId,
        status: status,
        metrics: {
          uptime: containerInfo.State.StartedAt,
          restart_count: containerInfo.RestartCount
        }
      };

    } catch (error) {
      logger.error(`Failed to get strategy status for ${strategyId}:`, error);
      return {
        success: false,
        strategy_id: strategyId,
        status: 'error'
      };
    }
  }

  async stopStrategy(strategyId: string): Promise<void> {
    const strategy = this.strategies.get(strategyId);

    if (!strategy) {
      throw new Error(`Strategy ${strategyId} not found`);
    }

    try {
      const container = this.docker.getContainer(strategy.container_id);
      await container.stop();
      await container.remove();

      strategy.status = 'stopped';
      strategy.stopped_at = new Date().toISOString();
      this.strategies.set(strategyId, strategy);

      logger.info(`Strategy ${strategyId} stopped successfully`);
    } catch (error) {
      logger.error(`Failed to stop strategy ${strategyId}:`, error);
      throw error;
    }
  }

  async listStrategies(): Promise<StrategyInfo[]> {
    return Array.from(this.strategies.values());
  }

  async validateStrategy(request: { strategy_code: string; config: StrategyConfig }): Promise<{
    success: boolean;
    message: string;
    errors?: string[];
  }> {
    try {
      // Basic validation
      const errors: string[] = [];

      if (!request.strategy_code.trim()) {
        errors.push('Strategy code cannot be empty');
      }

      if (!request.config.name) {
        errors.push('Strategy name is required');
      }

      if (!request.config.pair) {
        errors.push('Trading pair is required');
      }

      if (request.config.leverage < 1 || request.config.leverage > 100) {
        errors.push('Leverage must be between 1 and 100');
      }

      if (errors.length > 0) {
        return {
          success: false,
          message: 'Validation failed',
          errors
        };
      }

      return {
        success: true,
        message: 'Strategy validation passed'
      };

    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Validation error'
      };
    }
  }

  async getStrategySignals(strategyId: string, limit: number): Promise<any[]> {
    // Implementation would depend on how signals are stored/communicated
    // For now, return empty array
    return [];
  }

  async broadcastMarketData(marketData: any): Promise<void> {
    // Broadcast market data to all running strategies
    const runningStrategies = Array.from(this.strategies.values())
      .filter(s => s.status === 'running');

    for (const strategy of runningStrategies) {
      try {
        // Send market data to strategy container via HTTP endpoint or shared volume
        // Implementation depends on how strategies consume market data
        logger.debug(`Broadcasting market data to strategy ${strategy.strategy_id}`);
      } catch (error) {
        logger.error(`Failed to send market data to ${strategy.strategy_id}:`, error);
      }
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Strategy Manager...');

    for (const [strategyId, strategy] of this.strategies) {
      try {
        await this.stopStrategy(strategyId);
      } catch (error) {
        logger.error(`Failed to stop strategy ${strategyId} during shutdown:`, error);
      }
    }
  }

  private async ensureBaseImage(): Promise<void> {
    try {
      await this.docker.getImage(this.baseImageName).inspect();
      logger.info('Base strategy image found');
    } catch (error) {
      logger.info('Base strategy image not found, creating...');
      await this.buildBaseImage();
    }
  }

  private async buildBaseImage(): Promise<void> {
    // Create Dockerfile for base strategy image
    const baseImageDir = '/tmp/strategy-base';
    await fs.mkdir(baseImageDir, { recursive: true });

    const dockerfile = `
FROM python:3.11-slim

# Install required system packages
RUN apt-get update && apt-get install -y \\
    gcc \\
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Create non-root user
RUN useradd -m -u 1000 strategy

# Install common Python packages
RUN pip install --no-cache-dir \\
    pandas \\
    numpy \\
    requests \\
    websocket-client \\
    python-dotenv

# Switch to non-root user
USER strategy

# Default command
CMD ["python", "strategy.py"]
`;

    await fs.writeFile(path.join(baseImageDir, 'Dockerfile'), dockerfile);

    // Build the image
    const tarStream = tar.create({ cwd: baseImageDir }, ['Dockerfile']);

    await this.docker.buildImage(tarStream, {
      t: this.baseImageName
    });

    logger.info('Base strategy image built successfully');
  }

  private async createStrategyFiles(workspaceDir: string, request: StrategyDeploymentRequest): Promise<void> {
    // Create strategy.py file
    await fs.writeFile(
      path.join(workspaceDir, 'strategy.py'),
      request.strategy_code
    );

    // Create config.json file
    await fs.writeFile(
      path.join(workspaceDir, 'config.json'),
      JSON.stringify(request.config, null, 2)
    );

    // Create requirements.txt if needed
    const requirements = 'requests\nwebsocket-client\npandas\nnumpy\n';
    await fs.writeFile(
      path.join(workspaceDir, 'requirements.txt'),
      requirements
    );

    // Create Dockerfile
    const dockerfile = `
FROM ${this.baseImageName}

WORKDIR /app

# Copy strategy files
COPY requirements.txt .
COPY strategy.py .
COPY config.json .

# Install strategy-specific requirements
RUN pip install --no-cache-dir -r requirements.txt

# Switch to non-root user
USER strategy

# Run the strategy
CMD ["python", "strategy.py"]
`;

    await fs.writeFile(path.join(workspaceDir, 'Dockerfile'), dockerfile);
  }

  private async buildAndStartContainer(strategyId: string, workspaceDir: string, request: StrategyDeploymentRequest): Promise<string> {
    // Build strategy image
    const tarStream = tar.create({ cwd: workspaceDir }, ['.']);

    logger.info(`Building Docker image for ${strategyId}...`);

    const stream = await this.docker.buildImage(tarStream, {
      t: strategyId
    });

    // Wait for build to complete
    await new Promise((resolve, reject) => {
      this.docker.modem.followProgress(stream, (err: any, res: any) => {
        if (err) {
          logger.error(`Failed to build image for ${strategyId}:`, err);
          reject(err);
        } else {
          logger.info(`Successfully built image for ${strategyId}`);
          resolve(res);
        }
      }, (event: any) => {
        if (event.stream) {
          logger.info(`Build log: ${event.stream.trim()}`);
        }
        if (event.error) {
          logger.error(`Build error: ${event.error}`);
        }
      });
    });

    // Create and start container
    const container = await this.docker.createContainer({
      Image: strategyId,
      name: strategyId,
      Env: [
        `DEPLOYMENT_ID=${strategyId}`,
        `USER_ID=${request.user_id}`,
        `API_KEY=${process.env.COINDCX_API_KEY || ''}`,
        `API_SECRET=${process.env.COINDCX_API_SECRET || ''}`,
        'STRATEGY_MODE=live'
      ],
      HostConfig: {
        Memory: this.parseMemoryLimit(request.resource_limits?.memory || '512m'),
        CpuQuota: this.parseCpuLimit(request.resource_limits?.cpu || '0.5'),
        RestartPolicy: {
          Name: 'unless-stopped'
        },
        NetworkMode: 'coindcx-network'
      },
      NetworkingConfig: {
        EndpointsConfig: {
          'coindcx-network': {}
        }
      }
    });

    if (request.auto_start !== false) {
      await container.start();
    }

    return container.id;
  }

  private async monitorStrategy(strategyId: string): Promise<void> {
    // Monitor strategy health and update status
    const strategy = this.strategies.get(strategyId);
    if (!strategy) return;

    setTimeout(async () => {
      try {
        const container = this.docker.getContainer(strategy.container_id);
        const containerInfo = await container.inspect();

        if (containerInfo.State.Running) {
          strategy.status = 'running';
          strategy.started_at = containerInfo.State.StartedAt;
        } else {
          strategy.status = 'error';
          strategy.last_error = containerInfo.State.Error || 'Container stopped unexpectedly';
        }

        this.strategies.set(strategyId, strategy);
      } catch (error) {
        logger.error(`Failed to monitor strategy ${strategyId}:`, error);
      }
    }, 5000); // Check after 5 seconds
  }

  private async cleanupOrphanedContainers(): Promise<void> {
    try {
      const containers = await this.docker.listContainers({ all: true });

      for (const containerInfo of containers) {
        const name = containerInfo.Names[0]?.replace('/', '');
        if (name?.startsWith('strategy-')) {
          // Check if this is an orphaned strategy container
          if (!this.strategies.has(name)) {
            try {
              const container = this.docker.getContainer(containerInfo.Id);
              await container.remove({ force: true });
              logger.info(`Cleaned up orphaned container: ${name}`);
            } catch (error) {
              logger.error(`Failed to cleanup container ${name}:`, error);
            }
          }
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup orphaned containers:', error);
    }
  }

  private parseMemoryLimit(memory: string): number {
    const match = memory.match(/^(\d+)([kmg]?)$/i);
    if (!match) return 512 * 1024 * 1024; // Default 512MB

    const value = parseInt(match[1]);
    const unit = match[2]?.toLowerCase() || '';

    switch (unit) {
      case 'k': return value * 1024;
      case 'm': return value * 1024 * 1024;
      case 'g': return value * 1024 * 1024 * 1024;
      default: return value;
    }
  }

  private parseCpuLimit(cpu: string): number {
    const value = parseFloat(cpu);
    return Math.floor(value * 100000); // Convert to CPU quota (microseconds)
  }
}