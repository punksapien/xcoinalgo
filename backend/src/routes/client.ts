import { Router } from 'express';
import { authenticate, requireClientRole } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import prisma from '../utils/database';
import crypto from 'crypto';

const router = Router();

// All routes require authentication and CLIENT/ADMIN role
router.use(authenticate);
router.use(requireClientRole);

/**
 * GET /api/client/strategies
 * Get all strategies owned by the client
 */
router.get('/strategies', async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;

    const strategies = await prisma.strategy.findMany({
      where: { clientId: userId },
      include: {
        _count: {
          select: {
            subscriptions: { where: { isActive: true } },
            inviteLinks: { where: { isActive: true } },
            accessRequests: { where: { status: 'PENDING' } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      strategies: strategies.map(strategy => ({
        id: strategy.id,
        name: strategy.name,
        code: strategy.code,
        description: strategy.description,
        author: strategy.author,
        isPublic: strategy.isPublic,
        isActive: strategy.isActive,
        subscriberCount: strategy.subscriberCount,
        activeInviteLinks: strategy._count.inviteLinks,
        pendingRequests: strategy._count.accessRequests,
        createdAt: strategy.createdAt,
        updatedAt: strategy.updatedAt
      }))
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/client/strategies/:id/visibility
 * Toggle strategy between public and private
 */
router.put('/strategies/:id/visibility', async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { isPublic } = req.body;

    // Verify ownership
    const strategy = await prisma.strategy.findFirst({
      where: { id, clientId: userId }
    });

    if (!strategy) {
      return res.status(404).json({
        error: 'Strategy not found or you do not have permission to modify it'
      });
    }

    // Update visibility
    const updated = await prisma.strategy.update({
      where: { id },
      data: { isPublic: Boolean(isPublic) }
    });

    res.json({
      message: `Strategy is now ${updated.isPublic ? 'public' : 'private'}`,
      strategy: {
        id: updated.id,
        name: updated.name,
        isPublic: updated.isPublic
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/client/strategies/:id/invite-links
 * Generate a new invite link for a private strategy
 */
router.post('/strategies/:id/invite-links', async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { id: strategyId } = req.params;
    const { type } = req.body; // ONE_TIME or PERMANENT

    // Verify ownership
    const strategy = await prisma.strategy.findFirst({
      where: { id: strategyId, clientId: userId }
    });

    if (!strategy) {
      return res.status(404).json({
        error: 'Strategy not found or you do not have permission to modify it'
      });
    }

    // Validate type
    if (type && !['ONE_TIME', 'PERMANENT'].includes(type)) {
      return res.status(400).json({
        error: 'Invalid invite link type. Must be ONE_TIME or PERMANENT'
      });
    }

    // Generate unique invite code (12 characters, URL-safe)
    const inviteCode = crypto.randomBytes(9).toString('base64url').substring(0, 12);

    const inviteLink = await prisma.strategyInviteLink.create({
      data: {
        strategyId,
        inviteCode,
        type: type || 'PERMANENT',
        createdByUserId: userId
      }
    });

    res.json({
      message: 'Invite link created successfully',
      inviteLink: {
        id: inviteLink.id,
        inviteCode: inviteLink.inviteCode,
        type: inviteLink.type,
        inviteUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/invite/${inviteLink.inviteCode}`,
        isActive: inviteLink.isActive,
        usageCount: inviteLink.usageCount,
        createdAt: inviteLink.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/client/strategies/:id/invite-links
 * Get all invite links for a strategy
 */
router.get('/strategies/:id/invite-links', async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { id: strategyId } = req.params;

    // Verify ownership
    const strategy = await prisma.strategy.findFirst({
      where: { id: strategyId, clientId: userId }
    });

    if (!strategy) {
      return res.status(404).json({
        error: 'Strategy not found or you do not have permission to view it'
      });
    }

    const inviteLinks = await prisma.strategyInviteLink.findMany({
      where: { strategyId },
      include: {
        _count: {
          select: { accessRequests: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      inviteLinks: inviteLinks.map(link => ({
        id: link.id,
        inviteCode: link.inviteCode,
        type: link.type,
        inviteUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/invite/${link.inviteCode}`,
        isActive: link.isActive,
        usageCount: link.usageCount,
        requestCount: link._count.accessRequests,
        revokedAt: link.revokedAt,
        createdAt: link.createdAt
      }))
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/client/invite-links/:id
 * Revoke an invite link
 */
router.delete('/invite-links/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { id: inviteLinkId } = req.params;

    // Verify ownership through strategy
    const inviteLink = await prisma.strategyInviteLink.findUnique({
      where: { id: inviteLinkId },
      include: { strategy: true }
    });

    if (!inviteLink) {
      return res.status(404).json({
        error: 'Invite link not found'
      });
    }

    if (inviteLink.strategy.clientId !== userId) {
      return res.status(403).json({
        error: 'You do not have permission to revoke this invite link'
      });
    }

    // Revoke the link
    await prisma.strategyInviteLink.update({
      where: { id: inviteLinkId },
      data: {
        isActive: false,
        revokedAt: new Date()
      }
    });

    res.json({
      message: 'Invite link revoked successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/client/access-requests
 * Get access requests for client's strategies (with optional status filter)
 */
router.get('/access-requests', async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { status } = req.query;

    // Build where conditions
    const whereConditions: any = {
      strategy: { clientId: userId }
    };

    // Filter by status if provided
    if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status as string)) {
      whereConditions.status = status;
    }

    const requests = await prisma.strategyAccessRequest.findMany({
      where: whereConditions,
      include: {
        strategy: {
          select: { id: true, name: true, code: true }
        },
        user: {
          select: { id: true, name: true, email: true, createdAt: true }
        },
        inviteLink: {
          select: { inviteCode: true, type: true }
        },
        respondedBy: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { requestedAt: 'desc' }
    });

    res.json({
      requests: requests.map(req => ({
        id: req.id,
        strategy: req.strategy,
        user: req.user,
        inviteCode: req.inviteLink.inviteCode,
        inviteLinkType: req.inviteLink.type,
        status: req.status,
        requestedAt: req.requestedAt,
        respondedAt: req.respondedAt,
        respondedBy: req.respondedBy,
        rejectionReason: req.rejectionReason
      }))
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/client/access-requests/:id/approve
 * Approve an access request
 */
router.post('/access-requests/:id/approve', async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { id: requestId } = req.params;

    // Get the request and verify ownership
    const request = await prisma.strategyAccessRequest.findUnique({
      where: { id: requestId },
      include: { strategy: true }
    });

    if (!request) {
      return res.status(404).json({
        error: 'Access request not found'
      });
    }

    if (request.strategy.clientId !== userId) {
      return res.status(403).json({
        error: 'You do not have permission to approve this request'
      });
    }

    if (request.status !== 'PENDING') {
      return res.status(400).json({
        error: `This request has already been ${request.status.toLowerCase()}`
      });
    }

    // Approve the request
    const updated = await prisma.strategyAccessRequest.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED',
        respondedAt: new Date(),
        respondedByUserId: userId
      },
      include: {
        user: { select: { email: true } },
        strategy: { select: { name: true } }
      }
    });

    res.json({
      message: 'Access request approved',
      request: {
        id: updated.id,
        userEmail: updated.user.email,
        strategyName: updated.strategy.name,
        status: updated.status,
        approvedAt: updated.respondedAt
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/client/access-requests/:id/reject
 * Reject an access request
 */
router.post('/access-requests/:id/reject', async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { id: requestId } = req.params;
    const { reason } = req.body;

    // Get the request and verify ownership
    const request = await prisma.strategyAccessRequest.findUnique({
      where: { id: requestId },
      include: { strategy: true }
    });

    if (!request) {
      return res.status(404).json({
        error: 'Access request not found'
      });
    }

    if (request.strategy.clientId !== userId) {
      return res.status(403).json({
        error: 'You do not have permission to reject this request'
      });
    }

    if (request.status !== 'PENDING') {
      return res.status(400).json({
        error: `This request has already been ${request.status.toLowerCase()}`
      });
    }

    // Reject the request
    const updated = await prisma.strategyAccessRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        respondedAt: new Date(),
        respondedByUserId: userId,
        rejectionReason: reason || null
      },
      include: {
        user: { select: { email: true } },
        strategy: { select: { name: true } }
      }
    });

    res.json({
      message: 'Access request rejected',
      request: {
        id: updated.id,
        userEmail: updated.user.email,
        strategyName: updated.strategy.name,
        status: updated.status,
        rejectedAt: updated.respondedAt,
        reason: updated.rejectionReason
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/client/subscribers
 * Get all subscribers across client's strategies
 */
router.get('/subscribers', async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { strategyId, status } = req.query;

    // Build filter conditions
    const whereConditions: any = {
      strategy: { clientId: userId }
    };

    // Filter by specific strategy
    if (strategyId) {
      whereConditions.strategyId = strategyId;
    }

    // Filter by subscription status
    if (status === 'active') {
      whereConditions.isActive = true;
      whereConditions.isPaused = false;
    } else if (status === 'paused') {
      whereConditions.isPaused = true;
    } else if (status === 'inactive') {
      whereConditions.isActive = false;
    }

    const subscriptions = await prisma.strategySubscription.findMany({
      where: whereConditions,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true
          }
        },
        strategy: {
          select: {
            id: true,
            name: true,
            code: true,
            isPublic: true,
            executionConfig: true
          }
        },
        trades: {
          select: {
            id: true,
            side: true,
            quantity: true,
            entryPrice: true,
            exitPrice: true,
            pnl: true,
            status: true
          }
        }
      },
      orderBy: { subscribedAt: 'desc' }
    });

    // Calculate net PnL for each subscriber from their trades
    const subscribersWithPnl = subscriptions.map(sub => {
      let calculatedPnl = 0;
      let closedTrades = 0;
      let openTrades = 0;

      for (const trade of sub.trades) {
        if (trade.status === 'OPEN') {
          openTrades++;
          continue;
        }
        closedTrades++;
        if (trade.pnl) {
          calculatedPnl += trade.pnl;
        } else if (trade.entryPrice && trade.exitPrice) {
          const priceDiff = trade.side === 'BUY'
            ? trade.exitPrice - trade.entryPrice
            : trade.entryPrice - trade.exitPrice;
          calculatedPnl += priceDiff * (trade.quantity || 0);
        }
      }

      return {
        id: sub.id,
        user: sub.user,
        strategy: sub.strategy,
        // Subscription config
        capital: sub.capital,
        riskPerTrade: sub.riskPerTrade,
        leverage: sub.leverage,
        maxPositions: sub.maxPositions,
        maxDailyLoss: sub.maxDailyLoss,
        tradingType: sub.tradingType,
        marginCurrency: sub.marginCurrency,
        // Status
        isActive: sub.isActive,
        isPaused: sub.isPaused,
        subscribedAt: sub.subscribedAt,
        pausedAt: sub.pausedAt,
        unsubscribedAt: sub.unsubscribedAt,
        // Performance (calculated from trades)
        totalTrades: sub.trades.length,
        closedTrades,
        openTrades,
        winningTrades: sub.winningTrades,
        losingTrades: sub.losingTrades,
        totalPnl: Math.round(calculatedPnl * 100) / 100, // Calculated net PnL
        winRate: sub.trades.length > 0 ? (sub.winningTrades / sub.trades.length) * 100 : 0
      };
    });

    res.json({ subscribers: subscribersWithPnl });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/client/subscribers/:id/trades
 * Get trades for a specific subscriber (client viewing their subscriber's trades)
 * Falls back to CoinDCX exchange API if database has no trades
 */
router.get('/subscribers/:id/trades', async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { id: subscriptionId } = req.params;
    const { includeExchange, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));

    // Verify the subscription belongs to a strategy owned by this client
    const subscription = await prisma.strategySubscription.findFirst({
      where: {
        id: subscriptionId,
        strategy: { clientId: userId }
      },
      include: {
        brokerCredential: {
          select: { apiKey: true, apiSecret: true }
        },
        strategy: {
          select: { executionConfig: true }
        }
      }
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found or not authorized' });
    }

    // Get trades from database
    const dbTrades = await prisma.trade.findMany({
      where: { subscriptionId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        symbol: true,
        side: true,
        quantity: true,
        entryPrice: true,
        exitPrice: true,
        status: true,
        pnl: true,
        createdAt: true,
        exitedAt: true,
        positionId: true,
        orderId: true,
        leverage: true,
        orderType: true
      }
    });

    // If we have trades in DB and user didn't explicitly request exchange data, return DB trades
    if (dbTrades.length > 0 && includeExchange !== 'true') {
      const totalCount = dbTrades.length;
      const totalPages = Math.ceil(totalCount / limitNum);
      const startIndex = (pageNum - 1) * limitNum;
      const paginatedTrades = dbTrades.slice(startIndex, startIndex + limitNum);

      // Calculate net PnL for DB trades
      let netPnl = 0;
      let closedTradesCount = 0;
      let openTradesCount = 0;
      for (const trade of dbTrades) {
        if (trade.status === 'OPEN') {
          openTradesCount++;
          continue;
        }
        closedTradesCount++;
        if (trade.pnl) {
          netPnl += trade.pnl;
        } else if (trade.entryPrice && trade.exitPrice) {
          const priceDiff = trade.side === 'BUY'
            ? trade.exitPrice - trade.entryPrice
            : trade.entryPrice - trade.exitPrice;
          netPnl += priceDiff * (trade.quantity || 0);
        }
      }

      return res.json({
        trades: paginatedTrades.map(t => ({ ...t, source: 'database' })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalCount,
          totalPages,
          hasMore: pageNum < totalPages
        },
        summary: {
          netPnl: Math.round(netPnl * 100) / 100,
          closedTrades: closedTradesCount,
          openTrades: openTradesCount
        },
        meta: {
          dbCount: totalCount,
          exchangeCount: 0,
          source: 'database'
        }
      });
    }

    // If DB is empty or user wants exchange data, fetch from CoinDCX
    let exchangeTrades: any[] = [];
    if (subscription.brokerCredential?.apiKey && subscription.brokerCredential?.apiSecret) {
      try {
        const CoinDCXClient = await import('../services/coindcx-client');
        const tradingType = subscription.tradingType || 'futures';
        const executionConfig = subscription.strategy?.executionConfig as any;
        const pair = executionConfig?.pair || executionConfig?.symbol;
        const marginCurrency = subscription.marginCurrency || 'USDT';

        if (tradingType === 'futures') {
          // Fetch futures orders from exchange
          const orders = await CoinDCXClient.listFuturesOrders(
            subscription.brokerCredential.apiKey,
            subscription.brokerCredential.apiSecret,
            {
              timestamp: Date.now(),
              status: 'all',
              side: 'all',
              page: '1',
              size: '100',
              margin_currency_short_name: [marginCurrency]
            }
          );

          // Transform exchange orders to trade format
          // Filter for OUR orders only (xc_ or xcoin_ prefix in client_order_id)
          exchangeTrades = orders
            .filter((order: any) => {
              const clientOrderId = (order.client_order_id || '').toLowerCase();
              const isOurOrder = clientOrderId.startsWith('xc_') || clientOrderId.startsWith('xcoin_');
              const matchesPair = !pair || order.pair === pair;
              return isOurOrder && matchesPair;
            })
            .map((order: any) => ({
              id: `exchange_${order.id}`,
              orderId: order.id,
              symbol: order.pair,
              side: order.side?.toUpperCase(),
              quantity: parseFloat(order.total_quantity || order.quantity || 0),
              entryPrice: parseFloat(order.avg_price || order.price || 0),
              exitPrice: null,
              status: order.status === 'filled' ? 'CLOSED' : (order.status === 'open' ? 'OPEN' : order.status?.toUpperCase()),
              pnl: parseFloat(order.realized_pnl || 0),
              createdAt: order.created_at || order.timestamp,
              exitedAt: order.updated_at,
              positionId: order.position_id,
              source: 'exchange',
              leverage: order.leverage,
              orderType: order.order_type,
              clientOrderId: order.client_order_id
            }));
        }
      } catch (exchangeError) {
        console.error('Failed to fetch from exchange:', exchangeError);
        // Don't fail the request, just return DB trades
      }
    }

    // Merge DB trades and exchange trades, removing duplicates by orderId
    const dbOrderIds = new Set(dbTrades.map(t => (t as any).orderId).filter(Boolean));
    const uniqueExchangeTrades = exchangeTrades.filter(t => !dbOrderIds.has(t.orderId));

    // Combine: DB trades first (more accurate), then exchange-only trades
    const allTrades = [
      ...dbTrades.map(t => ({ ...t, source: 'database' as const })),
      ...uniqueExchangeTrades
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Calculate net PnL across ALL trades (not just current page)
    let netPnl = 0;
    let closedTradesCount = 0;
    let openTradesCount = 0;
    for (const trade of allTrades) {
      if (trade.status === 'OPEN') {
        openTradesCount++;
        continue;
      }
      closedTradesCount++;
      // Use provided PnL or calculate from prices
      if (trade.pnl) {
        netPnl += trade.pnl;
      } else if (trade.entryPrice && trade.exitPrice) {
        const priceDiff = trade.side === 'BUY'
          ? trade.exitPrice - trade.entryPrice
          : trade.entryPrice - trade.exitPrice;
        netPnl += priceDiff * (trade.quantity || 0);
      }
    }

    // Apply pagination
    const totalCount = allTrades.length;
    const totalPages = Math.ceil(totalCount / limitNum);
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedTrades = allTrades.slice(startIndex, startIndex + limitNum);

    res.json({
      trades: paginatedTrades,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages,
        hasMore: pageNum < totalPages
      },
      summary: {
        netPnl: Math.round(netPnl * 100) / 100, // Round to 2 decimal places
        closedTrades: closedTradesCount,
        openTrades: openTradesCount
      },
      meta: {
        dbCount: dbTrades.length,
        exchangeCount: uniqueExchangeTrades.length,
        source: dbTrades.length > 0
          ? (uniqueExchangeTrades.length > 0 ? 'database+exchange' : 'database')
          : 'exchange'
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/client/subscribers/:id/parameters
 * Update individual subscriber's trading parameters
 */
router.put('/subscribers/:id/parameters', async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { id: subscriptionId } = req.params;
    const { capital, riskPerTrade, leverage, maxPositions, maxDailyLoss } = req.body;

    // Get subscription and verify ownership through strategy
    const subscription = await prisma.strategySubscription.findUnique({
      where: { id: subscriptionId },
      include: { strategy: true }
    });

    if (!subscription) {
      return res.status(404).json({
        error: 'Subscription not found'
      });
    }

    if (subscription.strategy.clientId !== userId) {
      return res.status(403).json({
        error: 'You do not have permission to modify this subscription'
      });
    }

    // Update parameters
    const updateData: any = {};
    if (capital !== undefined) updateData.capital = parseFloat(capital);
    if (riskPerTrade !== undefined) updateData.riskPerTrade = parseFloat(riskPerTrade);
    if (leverage !== undefined) updateData.leverage = parseInt(leverage);
    if (maxPositions !== undefined) updateData.maxPositions = parseInt(maxPositions);
    if (maxDailyLoss !== undefined) updateData.maxDailyLoss = parseFloat(maxDailyLoss);

    const updated = await prisma.strategySubscription.update({
      where: { id: subscriptionId },
      data: updateData,
      include: {
        user: { select: { name: true, email: true } }
      }
    });

    res.json({
      message: 'Subscription parameters updated successfully',
      subscription: {
        id: updated.id,
        userName: updated.user.name || updated.user.email,
        capital: updated.capital,
        riskPerTrade: updated.riskPerTrade,
        leverage: updated.leverage,
        maxPositions: updated.maxPositions,
        maxDailyLoss: updated.maxDailyLoss
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/client/subscribers/:id
 * Remove/revoke a subscriber's access to a strategy
 * Only the strategy owner (client) can remove subscribers
 */
router.delete('/subscribers/:id', authenticate, requireClientRole, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const subscriptionId = req.params.id;

    // Find subscription and verify ownership
    const subscription = await prisma.strategySubscription.findFirst({
      where: {
        id: subscriptionId,
        strategy: {
          clientId: userId  // Ensure user owns the strategy
        }
      },
      include: {
        user: { select: { name: true, email: true } },
        strategy: { select: { name: true } }
      }
    });

    if (!subscription) {
      return res.status(404).json({
        error: 'Subscription not found or you do not have permission to remove it'
      });
    }

    // Check if already unsubscribed
    if (!subscription.isActive || subscription.unsubscribedAt) {
      return res.status(400).json({
        error: 'Subscriber has already been removed'
      });
    }

    // Revoke access
    const updated = await prisma.strategySubscription.update({
      where: { id: subscriptionId },
      data: {
        isActive: false,
        isPaused: false,
        unsubscribedAt: new Date()
      }
    });

    res.json({
      message: `Successfully removed ${subscription.user.name || subscription.user.email} from ${subscription.strategy.name}`,
      subscription: updated
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/client/dashboard
 * Get enhanced dashboard data with real P&L calculations for strategy owner
 */
router.get('/dashboard', async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;

    // Get all strategies owned by this client with subscriber data
    const strategies = await prisma.strategy.findMany({
      where: { clientId: userId },
      include: {
        subscriptions: {
          where: { isActive: true },
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        },
        _count: {
          select: {
            subscriptions: { where: { isActive: true } },
            inviteLinks: { where: { isActive: true } },
            accessRequests: { where: { status: 'PENDING' } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Get trades for last 30 days only (for performance)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const strategyIds = strategies.map(s => s.id);

    // Get trades for client's strategies - LIMITED to last 30 days + open positions
    const allTrades = await prisma.trade.findMany({
      where: {
        subscription: {
          strategyId: { in: strategyIds }
        },
        // Only get trades from last 30 days OR still open
        OR: [
          { createdAt: { gte: thirtyDaysAgo } },
          { status: 'OPEN' }
        ]
      },
      select: {
        id: true,
        status: true,
        side: true,
        quantity: true,
        entryPrice: true,
        exitPrice: true,
        pnl: true,
        createdAt: true,
        exitedAt: true,
        updatedAt: true,
        subscription: {
          select: {
            strategyId: true,
            capital: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Get today's date range
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Helper to calculate PnL from trade data (use stored pnl or calculate from prices)
    const getTradePnl = (trade: typeof allTrades[0]): number => {
      if (trade.pnl) return trade.pnl;
      if (trade.entryPrice && trade.exitPrice && trade.quantity) {
        const priceDiff = trade.side === 'BUY'
          ? trade.exitPrice - trade.entryPrice
          : trade.entryPrice - trade.exitPrice;
        return priceDiff * trade.quantity;
      }
      return 0;
    };

    // Process each strategy
    const enhancedStrategies = strategies.map(strategy => {
      // Get trades for this strategy
      const strategyTrades = allTrades.filter(t => t.subscription.strategyId === strategy.id);
      const openTrades = strategyTrades.filter(t => t.status === 'OPEN');
      const closedTrades = strategyTrades.filter(t => t.status === 'CLOSED');

      // Today's closed trades
      const todayClosedTrades = closedTrades.filter(t =>
        t.exitedAt && t.exitedAt >= todayStart && t.exitedAt <= todayEnd
      );

      // Calculate P&L metrics (use helper to get actual PnL)
      const totalRealizedPnl = closedTrades.reduce((sum, t) => sum + getTradePnl(t), 0);
      const todayRealizedPnl = todayClosedTrades.reduce((sum, t) => sum + getTradePnl(t), 0);

      // Calculate unrealized P&L (simplified - would need current prices from exchange)
      const totalUnrealizedPnl = openTrades.reduce((sum, t) => {
        // For now, return 0 as we don't have live prices here
        // In production, fetch current prices and calculate
        return sum;
      }, 0);

      // Win/Loss calculations (use getTradePnl for accurate calculations)
      const winningTrades = closedTrades.filter(t => getTradePnl(t) > 0).length;
      const losingTrades = closedTrades.filter(t => getTradePnl(t) < 0).length;
      const winRate = closedTrades.length > 0 ? (winningTrades / closedTrades.length) * 100 : 0;

      // Calculate max drawdown (simplified)
      let maxDrawdown = 0;
      let peak = 0;
      let runningPnl = 0;
      closedTrades
        .sort((a, b) => (a.exitedAt?.getTime() || 0) - (b.exitedAt?.getTime() || 0))
        .forEach(trade => {
          runningPnl += getTradePnl(trade);
          if (runningPnl > peak) peak = runningPnl;
          const drawdown = peak - runningPnl;
          if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        });

      // Calculate max drawdown percentage (relative to peak)
      const maxDrawdownPct = peak > 0 ? (maxDrawdown / peak) * 100 : 0;

      // Calculate Sharpe Ratio (simplified - daily returns)
      const dailyReturns: number[] = [];
      const dailyPnlMap = new Map<string, number>();
      closedTrades.forEach(trade => {
        if (trade.exitedAt) {
          const dateStr = trade.exitedAt.toISOString().split('T')[0];
          dailyPnlMap.set(dateStr, (dailyPnlMap.get(dateStr) || 0) + getTradePnl(trade));
        }
      });
      dailyPnlMap.forEach(pnl => dailyReturns.push(pnl));

      let sharpeRatio = 0;
      if (dailyReturns.length > 1) {
        const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
        const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / dailyReturns.length;
        const stdDev = Math.sqrt(variance);
        sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized
      }

      // Calculate average trade duration
      let avgTradeDurationMs = 0;
      const tradesWithDuration = closedTrades.filter(t => t.exitedAt && t.createdAt);
      if (tradesWithDuration.length > 0) {
        avgTradeDurationMs = tradesWithDuration.reduce((sum, t) => {
          return sum + ((t.exitedAt?.getTime() || 0) - t.createdAt.getTime());
        }, 0) / tradesWithDuration.length;
      }

      // Format duration
      const avgDurationHours = Math.floor(avgTradeDurationMs / (1000 * 60 * 60));
      const avgDurationMinutes = Math.floor((avgTradeDurationMs % (1000 * 60 * 60)) / (1000 * 60));
      const avgTradeDuration = avgDurationHours > 0
        ? `${avgDurationHours}h ${avgDurationMinutes}m`
        : `${avgDurationMinutes}m`;

      // Generate sparkline data (last 7 days)
      const sparklineData = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        sparklineData.push({
          date: dateStr,
          pnl: dailyPnlMap.get(dateStr) || 0,
          cumulativePnl: Array.from(dailyPnlMap.entries())
            .filter(([d]) => d <= dateStr)
            .reduce((sum, [, pnl]) => sum + pnl, 0),
        });
      }

      // Calculate today's P&L percentage
      const totalCapital = strategy.subscriptions.reduce((sum, sub) => sum + sub.capital, 0);
      const todayPnlPercent = totalCapital > 0 ? (todayRealizedPnl / totalCapital) * 100 : 0;

      // Subscriber health check (simplified - would need state file comparison)
      const activeSubscribers = strategy.subscriptions.filter(s => !s.isPaused).length;
      const pausedSubscribers = strategy.subscriptions.filter(s => s.isPaused).length;

      // Determine health status based on recent errors/issues
      // For now, base it on whether there are open positions matching expectations
      let healthStatus: 'healthy' | 'warning' | 'error' = 'healthy';
      let healthMessage = 'All systems normal';
      const healthErrors: string[] = [];

      // Check for stale positions (open > 24 hours without update)
      const staleThreshold = Date.now() - 24 * 60 * 60 * 1000;
      const staleTrades = openTrades.filter(t => t.updatedAt.getTime() < staleThreshold);
      if (staleTrades.length > 0) {
        healthStatus = 'warning';
        healthMessage = `${staleTrades.length} position(s) not updated recently`;
      }

      return {
        id: strategy.id,
        name: strategy.name,
        code: strategy.code,
        description: strategy.description,
        isPublic: strategy.isPublic,
        isActive: strategy.isActive,
        subscriberCount: strategy._count.subscriptions,
        activeSubscribers,
        pausedSubscribers,
        pendingRequests: strategy._count.accessRequests,
        activeInviteLinks: strategy._count.inviteLinks,
        // P&L data
        todayPnl: todayRealizedPnl,
        todayPnlPercent,
        unrealizedPnl: totalUnrealizedPnl,
        totalPnl: totalRealizedPnl,
        // Health
        health: {
          status: healthStatus,
          message: healthMessage,
          errors: healthErrors,
        },
        // Performance metrics
        sparklineData,
        totalTrades: closedTrades.length,
        winRate,
        maxDrawdown: maxDrawdownPct,
        sharpeRatio,
        avgTradeDuration,
        openPositions: openTrades.length,
        lastSignalTime: strategyTrades[0]?.createdAt?.toISOString() || null,
        // Capital
        totalCapital,
      };
    });

    // Calculate overall summary
    const summary = {
      totalStrategies: strategies.length,
      activeStrategies: strategies.filter(s => s.isActive).length,
      totalSubscribers: enhancedStrategies.reduce((sum, s) => sum + s.subscriberCount, 0),
      totalTodayPnl: enhancedStrategies.reduce((sum, s) => sum + s.todayPnl, 0),
      totalPnl: enhancedStrategies.reduce((sum, s) => sum + s.totalPnl, 0),
      pendingRequests: enhancedStrategies.reduce((sum, s) => sum + s.pendingRequests, 0),
    };

    res.json({
      strategies: enhancedStrategies,
      summary,
    });
  } catch (error) {
    next(error);
  }
});

export { router as clientRoutes };
