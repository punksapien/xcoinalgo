/**
 * Order Monitor Worker
 *
 * Background worker that monitors open trades and their SL/TP orders
 * Runs every minute to check if stop loss or take profit has been triggered
 */

import cron from 'node-cron';
import { orderManager } from '../services/order-manager';
import { Logger } from '../utils/logger';

const logger = new Logger('OrderMonitor');

/**
 * Start order monitoring cron job
 * Runs every 1 minute
 */
export function startOrderMonitoring(): void {
  logger.info('Starting order monitoring service...');

  // Run every minute: "0 * * * * *" (at the start of every minute)
  cron.schedule('0 * * * * *', async () => {
    try {
      logger.debug('Running order monitor check...');
      await orderManager.monitorAllOpenTrades();
    } catch (error) {
      logger.error('Order monitoring failed:', error);
    }
  });

  logger.info('✓ Order monitoring service started (runs every minute)');
}

/**
 * Manual trigger for testing
 */
export async function triggerOrderMonitor(): Promise<void> {
  logger.info('Manually triggering order monitor...');
  await orderManager.monitorAllOpenTrades();
  logger.info('✓ Manual order monitor complete');
}

export default {
  startOrderMonitoring,
  triggerOrderMonitor,
};
