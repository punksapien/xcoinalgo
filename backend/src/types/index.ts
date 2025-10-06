import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  file?: any; // Multer file
}

export interface BrokerCredentials {
  apiKey: string;
  apiSecret: string;
}

export interface StrategyMetrics {
  winRate?: number;
  riskReward?: number;
  maxDrawdown?: number;
  roi?: number;
  marginRequired?: number;
}

export interface BotConfiguration {
  leverage: number;
  riskPerTrade: number;
  marginCurrency: string;
}

import { BotStatus } from '@prisma/client';

export { BotStatus };

export interface ProcessInfo {
  pid?: number;
  pm2Id?: number;
  name: string;
  status: BotStatus;
  uptime?: number;
  memory?: number;
  cpu?: number;
  containerId?: string;
}