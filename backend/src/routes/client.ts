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
            isPublic: true
          }
        }
      },
      orderBy: { subscribedAt: 'desc' }
    });

    res.json({
      subscribers: subscriptions.map(sub => ({
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
        // Performance
        totalTrades: sub.totalTrades,
        winningTrades: sub.winningTrades,
        losingTrades: sub.losingTrades,
        totalPnl: sub.totalPnl,
        winRate: sub.totalTrades > 0 ? (sub.winningTrades / sub.totalTrades) * 100 : 0
      }))
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

export { router as clientRoutes };
