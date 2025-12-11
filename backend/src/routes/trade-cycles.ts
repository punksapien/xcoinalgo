import { Router } from 'express';
import prisma from '../utils/database';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';

const router = Router();

// GET /api/trade-cycles/subscription/:subscriptionId - Get trade cycles for a subscription
router.get('/subscription/:subscriptionId', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { subscriptionId } = req.params;
    const { status, limit = '50', offset = '0' } = req.query;

    // Verify user owns this subscription
    const subscription = await prisma.strategySubscription.findFirst({
      where: {
        id: subscriptionId,
        userId
      }
    });

    if (!subscription) {
      return res.status(404).json({
        error: 'Subscription not found or access denied'
      });
    }

    // Build filter
    const where: any = { subscriptionId };
    if (status && typeof status === 'string') {
      where.status = status;
    }

    // Fetch trade cycles
    const tradeCycles = await prisma.tradeCycle.findMany({
      where,
      include: {
        orders: {
          orderBy: {
            signalGeneratedAt: 'asc'
          }
        }
      },
      orderBy: {
        cycleNumber: 'desc'
      },
      take: parseInt(limit as string),
      skip: parseInt(offset as string)
    });

    // Get total count
    const totalCount = await prisma.tradeCycle.count({ where });

    res.json({
      tradeCycles,
      pagination: {
        total: totalCount,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      }
    });
  } catch (error) {
    console.error('Error fetching trade cycles:', error);
    next(error);
  }
});

// GET /api/trade-cycles/:cycleId - Get detailed info for a specific cycle
router.get('/:cycleId', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { cycleId } = req.params;

    const cycle = await prisma.tradeCycle.findUnique({
      where: { id: cycleId },
      include: {
        subscription: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true
              }
            },
            strategy: {
              select: {
                id: true,
                name: true,
                code: true
              }
            }
          }
        },
        orders: {
          orderBy: {
            signalGeneratedAt: 'asc'
          }
        }
      }
    });

    if (!cycle) {
      return res.status(404).json({
        error: 'Trade cycle not found'
      });
    }

    // Verify user owns this cycle
    if (cycle.subscription.userId !== userId) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    res.json({ cycle });
  } catch (error) {
    console.error('Error fetching trade cycle:', error);
    next(error);
  }
});

// GET /api/trade-cycles/subscriber/:subscriptionId/summary - Get summary stats for subscriber
router.get('/subscriber/:subscriptionId/summary', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { subscriptionId } = req.params;

    // Verify user owns this subscription
    const subscription = await prisma.strategySubscription.findFirst({
      where: {
        id: subscriptionId,
        userId
      }
    });

    if (!subscription) {
      return res.status(404).json({
        error: 'Subscription not found or access denied'
      });
    }

    // Get all closed cycles
    const closedCycles = await prisma.tradeCycle.findMany({
      where: {
        subscriptionId,
        status: 'CLOSED'
      },
      select: {
        netPnl: true,
        holdingTime: true,
        openedAt: true,
        closedAt: true
      }
    });

    const totalCycles = closedCycles.length;
    const winningCycles = closedCycles.filter(c => (c.netPnl || 0) > 0).length;
    const losingCycles = closedCycles.filter(c => (c.netPnl || 0) < 0).length;
    const totalPnl = closedCycles.reduce((sum, c) => sum + (c.netPnl || 0), 0);
    const avgHoldingTime = totalCycles > 0
      ? closedCycles.reduce((sum, c) => sum + (c.holdingTime || 0), 0) / totalCycles
      : 0;

    const winRate = totalCycles > 0 ? (winningCycles / totalCycles) * 100 : 0;

    // Get equity curve data (daily aggregated P&L)
    const equityCurve = await prisma.$queryRaw<Array<{ date: Date; cumulative_pnl: number }>>`
      SELECT
        DATE("closedAt") as date,
        SUM("netPnl") OVER (ORDER BY DATE("closedAt")) as cumulative_pnl
      FROM trade_cycles
      WHERE "subscriptionId" = ${subscriptionId}
        AND status = 'CLOSED'
        AND "closedAt" IS NOT NULL
      ORDER BY date ASC
    `;

    res.json({
      summary: {
        totalCycles,
        winningCycles,
        losingCycles,
        winRate: parseFloat(winRate.toFixed(2)),
        totalPnl: parseFloat(totalPnl.toFixed(2)),
        avgHoldingTime: parseFloat(avgHoldingTime.toFixed(2))
      },
      equityCurve
    });
  } catch (error) {
    console.error('Error fetching subscriber summary:', error);
    next(error);
  }
});

// POST /api/trade-cycles/export - Export trade cycles as CSV
router.post('/export', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { subscriptionId, format = 'csv' } = req.body;

    // Verify user owns this subscription
    const subscription = await prisma.strategySubscription.findFirst({
      where: {
        id: subscriptionId,
        userId
      }
    });

    if (!subscription) {
      return res.status(404).json({
        error: 'Subscription not found or access denied'
      });
    }

    const cycles = await prisma.tradeCycle.findMany({
      where: { subscriptionId },
      include: {
        orders: true
      },
      orderBy: {
        cycleNumber: 'asc'
      }
    });

    if (format === 'csv') {
      // Generate CSV
      const csvHeaders = 'Cycle,Open Time,Close Time,Signal,Entry Price,Exit Price,Quantity,Gross P&L,Fees,Net P&L,Holding Time (min),Exit Reason\n';
      const csvRows = cycles.map(c => {
        const openTime = c.openedAt.toISOString();
        const closeTime = c.closedAt ? c.closedAt.toISOString() : 'OPEN';
        return [
          `#${c.cycleNumber}`,
          openTime,
          closeTime,
          c.strategySignal || '',
          c.entryPrice.toFixed(2),
          c.exitPrice?.toFixed(2) || '',
          c.totalQuantity.toFixed(4),
          c.grossPnl?.toFixed(2) || '',
          c.fees.toFixed(2),
          c.netPnl?.toFixed(2) || '',
          c.holdingTime?.toFixed(2) || '',
          c.exitReason || ''
        ].join(',');
      }).join('\n');

      const csv = csvHeaders + csvRows;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="trade-cycles-${subscriptionId}.csv"`);
      res.send(csv);
    } else {
      // Return JSON
      res.json({ cycles });
    }
  } catch (error) {
    console.error('Error exporting trade cycles:', error);
    next(error);
  }
});

// POST /api/trade-cycles/export/detailed - Export detailed order logs
router.post('/export/detailed', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { cycleId } = req.body;

    const cycle = await prisma.tradeCycle.findUnique({
      where: { id: cycleId },
      include: {
        subscription: {
          select: { userId: true }
        },
        orders: {
          orderBy: {
            signalGeneratedAt: 'asc'
          }
        }
      }
    });

    if (!cycle) {
      return res.status(404).json({
        error: 'Trade cycle not found'
      });
    }

    // Verify ownership
    if (cycle.subscription.userId !== userId) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    // Generate detailed CSV
    const csvHeaders = 'Timestamp,Event,Order Type,Side,Quantity,Expected Price,Filled Price,Slippage %,Status,Exchange Order ID,Client Order ID,Fees\n';
    const csvRows = cycle.orders.map(order => {
      const timestamp = order.signalGeneratedAt.toISOString();
      const slippage = order.slippage ? order.slippage.toFixed(2) : '';
      return [
        timestamp,
        order.orderType,
        order.orderType,
        order.side,
        order.quantity.toFixed(4),
        order.expectedPrice?.toFixed(2) || '',
        order.filledPrice?.toFixed(2) || '',
        slippage,
        order.status,
        order.exchangeOrderId || '',
        order.clientOrderId || '',
        order.fees.toFixed(2)
      ].join(',');
    }).join('\n');

    const csv = csvHeaders + csvRows;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="cycle-${cycle.cycleNumber}-orders.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting detailed cycle:', error);
    next(error);
  }
});

export { router as tradeCyclesRoutes };
