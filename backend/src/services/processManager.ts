import pm2 from 'pm2';
import { promisify } from 'util';
import path from 'path';
import { ProcessInfo } from '../types';
import { BotStatus } from '@prisma/client';
import prisma from '../utils/database';
import { decrypt } from '../utils/encryption';

// Promisify PM2 methods
const pm2Connect = promisify(pm2.connect.bind(pm2));
const pm2Start = promisify(pm2.start.bind(pm2));
const pm2Stop = promisify(pm2.stop.bind(pm2));
const pm2Delete = promisify(pm2.delete.bind(pm2));
const pm2List = promisify(pm2.list.bind(pm2));
const pm2Disconnect = promisify(pm2.disconnect.bind(pm2));

export class ProcessManager {
  private static instance: ProcessManager;
  private isConnected = false;

  public static getInstance(): ProcessManager {
    if (!ProcessManager.instance) {
      ProcessManager.instance = new ProcessManager();
    }
    return ProcessManager.instance;
  }

  private async ensureConnection(): Promise<void> {
    if (!this.isConnected) {
      await pm2Connect();
      this.isConnected = true;
    }
  }

  async startBot(deploymentId: string): Promise<ProcessInfo> {
    await this.ensureConnection();

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

      const processName = `bot-${deployment.userId}-${deployment.strategyId}`;

      // Update status to STARTING
      await prisma.botDeployment.update({
        where: { id: deploymentId },
        data: {
          status: BotStatus.STARTING,
          pm2ProcessName: processName,
          startedAt: new Date()
        }
      });

      // PM2 configuration
      const pm2Config = {
        name: processName,
        script: path.resolve(deployment.strategy.strategyPath || 'strategy.py'),
        args: [
          `--api-key=${apiKey}`,
          `--api-secret=${apiSecret}`,
          `--deployment-id=${deploymentId}`,
          `--leverage=${deployment.leverage}`,
          `--risk-per-trade=${deployment.riskPerTrade}`,
          `--margin-currency=${deployment.marginCurrency}`
        ],
        instances: 1,
        autorestart: true,
        max_restarts: 10,
        restart_delay: 5000,
        env: {
          NODE_ENV: process.env.NODE_ENV || 'production',
          DEPLOYMENT_ID: deploymentId
        },
        output: `./logs/${processName}-out.log`,
        error: `./logs/${processName}-error.log`,
        log: `./logs/${processName}-combined.log`,
        time: true
      };

      const proc = await pm2Start(pm2Config) as any[];

      // Update deployment with process info
      await prisma.botDeployment.update({
        where: { id: deploymentId },
        data: {
          processId: proc[0].process.pid.toString(),
          status: BotStatus.ACTIVE,
          lastHeartbeat: new Date()
        }
      });

      return {
        pid: proc[0].process.pid,
        pm2Id: proc[0].pm_id,
        name: processName,
        status: BotStatus.ACTIVE
      };
    } catch (error) {
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
    await this.ensureConnection();

    try {
      const deployment = await prisma.botDeployment.findUnique({
        where: { id: deploymentId }
      });

      if (!deployment || !deployment.pm2ProcessName) {
        throw new Error('Bot deployment not found or not running');
      }

      // Stop PM2 process
      await pm2Stop(deployment.pm2ProcessName);

      // Give it a moment then delete
      setTimeout(async () => {
        try {
          await pm2Delete(deployment.pm2ProcessName!);
        } catch (error) {
          console.error('Error deleting PM2 process:', error);
        }
      }, 2000);

      // Update deployment status
      await prisma.botDeployment.update({
        where: { id: deploymentId },
        data: {
          status: BotStatus.STOPPED,
          stoppedAt: new Date(),
          processId: null,
          pm2ProcessName: null
        }
      });
    } catch (error) {
      console.error('Error stopping bot:', error);
      throw error;
    }
  }

  async getProcessInfo(processName: string): Promise<ProcessInfo | null> {
    await this.ensureConnection();

    try {
      const list = await pm2List() as any[];
      const process = list.find(proc => proc.name === processName);

      if (!process) {
        return null;
      }

      let status: BotStatus = BotStatus.STOPPED;
      if (process.pm2_env.status === 'online') {
        status = BotStatus.ACTIVE;
      } else if (process.pm2_env.status === 'stopping') {
        status = BotStatus.STOPPED;
      } else if (process.pm2_env.status === 'errored') {
        status = BotStatus.ERROR;
      } else if (process.pm2_env.status === 'launching') {
        status = BotStatus.STARTING;
      }

      return {
        pid: process.pid,
        pm2Id: process.pm_id,
        name: process.name,
        status,
        uptime: process.pm2_env.pm_uptime,
        memory: process.monit?.memory,
        cpu: process.monit?.cpu
      };
    } catch (error) {
      console.error('Error getting process info:', error);
      return null;
    }
  }

  async healthCheck(): Promise<void> {
    await this.ensureConnection();

    try {
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

      for (const deployment of activeDeployments) {
        if (!deployment.pm2ProcessName) continue;

        const processInfo = await this.getProcessInfo(deployment.pm2ProcessName);

        if (!processInfo) {
          // Process not found, mark as crashed
          await prisma.botDeployment.update({
            where: { id: deployment.id },
            data: {
              status: BotStatus.CRASHED,
              restartCount: { increment: 1 }
            }
          });
          continue;
        }

        // Update status based on PM2 status
        if (processInfo.status !== deployment.status) {
          await prisma.botDeployment.update({
            where: { id: deployment.id },
            data: {
              status: processInfo.status,
              lastHeartbeat: new Date()
            }
          });
        }

        // Check for unhealthy processes (no heartbeat for 5 minutes)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        if (deployment.lastHeartbeat && deployment.lastHeartbeat < fiveMinutesAgo) {
          await prisma.botDeployment.update({
            where: { id: deployment.id },
            data: {
              status: BotStatus.UNHEALTHY
            }
          });
        }
      }
    } catch (error) {
      console.error('Health check error:', error);
    }
  }

  async shutdown(): Promise<void> {
    if (this.isConnected) {
      await pm2Disconnect();
      this.isConnected = false;
    }
  }
}

// Start health check interval
export function startHealthCheckMonitoring(): void {
  const processManager = ProcessManager.getInstance();

  // Run health check every 30 seconds
  setInterval(() => {
    processManager.healthCheck().catch(console.error);
  }, 30000);

  // Cleanup on process exit
  process.on('SIGINT', async () => {
    console.log('Shutting down process manager...');
    await processManager.shutdown();
    process.exit(0);
  });
}