/**
 * Order Manager Service
 *
 * Manages stop loss and take profit orders
 * - Monitors order status
 * - Cancels opposite order when one fills
 * - Updates trade records
 */

import { PrismaClient } from '@prisma/client';
import CoinDCXClient from './coindcx-client';
import { Logger } from '../utils/logger';

const prisma = new PrismaClient();
const logger = new Logger('OrderManager');

interface OrderMonitorResult {
  orderId: string;
  status: string;
  filled: boolean;
  orderType: 'ENTRY' | 'STOP_LOSS' | 'TAKE_PROFIT';
}

class OrderManager {
  /**
   * Monitor a trade's orders and handle SL/TP triggers
   */
  async monitorTradeOrders(tradeId: string): Promise<void> {
    try {
      const trade = await prisma.trade.findUnique({
        where: { id: tradeId },
        include: {
          subscription: {
            include: {
              brokerCredential: true,
            },
          },
        },
      });

      if (!trade || !trade.subscription.brokerCredential) {
        logger.warn(`Trade ${tradeId} not found or missing broker credentials`);
        return;
      }

      const metadata = trade.metadata as any;
      if (!metadata || !metadata.allOrderIds) {
        logger.warn(`Trade ${tradeId} missing order metadata`);
        return;
      }

      const { apiKey, apiSecret } = trade.subscription.brokerCredential;

      // Check status of all orders
      const orderStatuses = await Promise.all(
        metadata.allOrderIds.map(async (orderId: string) => {
          try {
            const order = await CoinDCXClient.getOrderStatus(apiKey, apiSecret, orderId);

            const orderType = orderId === metadata.stopLossOrderId ? 'STOP_LOSS' :
                             orderId === metadata.takeProfitOrderId ? 'TAKE_PROFIT' :
                             'ENTRY';

            return {
              orderId,
              status: order.status,
              filled: order.status === 'filled',
              orderType,
            } as OrderMonitorResult;
          } catch (error) {
            logger.error(`Failed to check order ${orderId}:`, error);
            return null;
          }
        })
      );

      const validStatuses = orderStatuses.filter(s => s !== null) as OrderMonitorResult[];

      // Check if SL or TP was triggered
      const stopLossFilled = validStatuses.find(
        s => s.orderType === 'STOP_LOSS' && s.filled
      );
      const takeProfitFilled = validStatuses.find(
        s => s.orderType === 'TAKE_PROFIT' && s.filled
      );

      if (stopLossFilled) {
        logger.info(`Stop loss triggered for trade ${tradeId}`);
        await this.handleOrderFilled(
          trade,
          'STOP_LOSS',
          metadata.stopLoss || trade.stopLoss,
          apiKey,
          apiSecret
        );
      } else if (takeProfitFilled) {
        logger.info(`Take profit triggered for trade ${tradeId}`);
        await this.handleOrderFilled(
          trade,
          'TAKE_PROFIT',
          metadata.takeProfit || trade.takeProfit,
          apiKey,
          apiSecret
        );
      }
    } catch (error) {
      logger.error(`Failed to monitor trade ${tradeId}:`, error);
    }
  }

  /**
   * Handle when SL or TP order is filled
   */
  private async handleOrderFilled(
    trade: any,
    exitType: 'STOP_LOSS' | 'TAKE_PROFIT',
    exitPrice: number,
    apiKey: string,
    apiSecret: string
  ): Promise<void> {
    try {
      const metadata = trade.metadata as any;

      // Cancel the opposite order
      if (exitType === 'STOP_LOSS' && metadata.takeProfitOrderId) {
        try {
          await CoinDCXClient.cancelOrder(apiKey, apiSecret, metadata.takeProfitOrderId);
          logger.info(`Cancelled take profit order ${metadata.takeProfitOrderId}`);
        } catch (error) {
          logger.error('Failed to cancel take profit order:', error);
        }
      } else if (exitType === 'TAKE_PROFIT' && metadata.stopLossOrderId) {
        try {
          await CoinDCXClient.cancelOrder(apiKey, apiSecret, metadata.stopLossOrderId);
          logger.info(`Cancelled stop loss order ${metadata.stopLossOrderId}`);
        } catch (error) {
          logger.error('Failed to cancel stop loss order:', error);
        }
      }

      // Calculate P&L
      const pnl = this.calculatePnl(
        trade.side,
        trade.entryPrice,
        exitPrice,
        trade.quantity
      );

      // Update trade record
      await prisma.trade.update({
        where: { id: trade.id },
        data: {
          status: 'CLOSED',
          exitPrice,
          exitedAt: new Date(),
          pnl,
          pnlPct: (pnl / (trade.entryPrice * trade.quantity)) * 100,
          metadata: {
            ...metadata,
            exitType,
            closedBy: exitType === 'STOP_LOSS' ? 'stop_loss' : 'take_profit',
            exitOrderId: exitType === 'STOP_LOSS' ? metadata.stopLossOrderId : metadata.takeProfitOrderId,
          },
        },
      });

      logger.info(
        `Trade ${trade.id} closed via ${exitType}: ` +
        `P&L ${pnl.toFixed(2)} (${((pnl / (trade.entryPrice * trade.quantity)) * 100).toFixed(2)}%)`
      );
    } catch (error) {
      logger.error('Failed to handle order filled:', error);
    }
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
   * Monitor all open trades
   * Should be called periodically (e.g., every minute)
   */
  async monitorAllOpenTrades(): Promise<void> {
    try {
      const openTrades = await prisma.trade.findMany({
        where: {
          status: 'OPEN',
        },
      });

      logger.info(`Monitoring ${openTrades.length} open trades`);

      // Monitor each trade
      await Promise.all(
        openTrades.map(trade => this.monitorTradeOrders(trade.id))
      );
    } catch (error) {
      logger.error('Failed to monitor open trades:', error);
    }
  }

  /**
   * Cancel all orders for a trade (manual close)
   */
  async cancelTradeOrders(
    tradeId: string,
    apiKey: string,
    apiSecret: string
  ): Promise<void> {
    try {
      const trade = await prisma.trade.findUnique({
        where: { id: tradeId },
      });

      if (!trade) {
        throw new Error(`Trade ${tradeId} not found`);
      }

      const metadata = trade.metadata as any;
      if (!metadata || !metadata.allOrderIds) {
        return;
      }

      // Cancel all orders
      await Promise.all(
        metadata.allOrderIds.map(async (orderId: string) => {
          try {
            await CoinDCXClient.cancelOrder(apiKey, apiSecret, orderId);
            logger.info(`Cancelled order ${orderId} for trade ${tradeId}`);
          } catch (error) {
            logger.error(`Failed to cancel order ${orderId}:`, error);
          }
        })
      );
    } catch (error) {
      logger.error(`Failed to cancel trade orders for ${tradeId}:`, error);
      throw error;
    }
  }

  /**
   * Get order status for a trade
   */
  async getTradeOrderStatus(tradeId: string): Promise<{
    entryOrder: any;
    stopLossOrder: any;
    takeProfitOrder: any;
  }> {
    const trade = await prisma.trade.findUnique({
      where: { id: tradeId },
      include: {
        subscription: {
          include: {
            brokerCredential: true,
          },
        },
      },
    });

    if (!trade || !trade.subscription.brokerCredential) {
      throw new Error('Trade not found or missing credentials');
    }

    const { apiKey, apiSecret } = trade.subscription.brokerCredential;
    const metadata = trade.metadata as any;

    const [entryOrder, stopLossOrder, takeProfitOrder] = await Promise.all([
      metadata.orderId ? CoinDCXClient.getOrderStatus(apiKey, apiSecret, metadata.orderId) : null,
      metadata.stopLossOrderId ? CoinDCXClient.getOrderStatus(apiKey, apiSecret, metadata.stopLossOrderId) : null,
      metadata.takeProfitOrderId ? CoinDCXClient.getOrderStatus(apiKey, apiSecret, metadata.takeProfitOrderId) : null,
    ]);

    return {
      entryOrder,
      stopLossOrder,
      takeProfitOrder,
    };
  }
}

// Singleton instance
export const orderManager = new OrderManager();
export default orderManager;
