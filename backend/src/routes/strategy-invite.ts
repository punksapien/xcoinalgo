import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import prisma from '../utils/database';

const router = Router();

/**
 * GET /api/strategies/join/:inviteCode
 * Validate invite code and preview strategy (no auth required)
 */
router.get('/join/:inviteCode', async (req, res, next) => {
  try {
    const { inviteCode } = req.params;

    const inviteLink = await prisma.strategyInviteLink.findUnique({
      where: { inviteCode },
      include: {
        strategy: {
          select: {
            id: true,
            name: true,
            code: true,
            description: true,
            detailedDescription: true,
            author: true,
            instrument: true,
            tags: true,
            winRate: true,
            roi: true,
            maxDrawdown: true,
            sharpeRatio: true,
            totalTrades: true,
            subscriberCount: true,
            isActive: true,
            isPublic: true,
            createdAt: true
          }
        }
      }
    });

    if (!inviteLink) {
      return res.status(404).json({
        error: 'Invalid invite code'
      });
    }

    if (!inviteLink.isActive) {
      return res.status(410).json({
        error: 'This invite link has been revoked'
      });
    }

    if (inviteLink.strategy.isPublic) {
      return res.status(400).json({
        error: 'This strategy is public. You can deploy it directly without requesting access.',
        strategyId: inviteLink.strategy.id
      });
    }

    res.json({
      inviteCode: inviteLink.inviteCode,
      linkType: inviteLink.type,
      strategy: inviteLink.strategy,
      message: 'Valid invite link. You can request access to this private strategy.'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/strategies/join/:inviteCode
 * Submit an access request (requires authentication)
 */
router.post('/join/:inviteCode', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { inviteCode } = req.params;

    // Get the invite link
    const inviteLink = await prisma.strategyInviteLink.findUnique({
      where: { inviteCode },
      include: {
        strategy: {
          select: { id: true, name: true, isPublic: true, clientId: true }
        }
      }
    });

    if (!inviteLink) {
      return res.status(404).json({
        error: 'Invalid invite code'
      });
    }

    if (!inviteLink.isActive) {
      return res.status(410).json({
        error: 'This invite link has been revoked'
      });
    }

    // Check if user is the strategy owner
    if (inviteLink.strategy.clientId === userId) {
      return res.status(400).json({
        error: 'You own this strategy. No need to request access.'
      });
    }

    // Check if strategy is public
    if (inviteLink.strategy.isPublic) {
      return res.status(400).json({
        error: 'This strategy is public. You can deploy it directly without requesting access.',
        strategyId: inviteLink.strategy.id
      });
    }

    // Check if user already has a subscription
    const existingSubscription = await prisma.strategySubscription.findUnique({
      where: {
        userId_strategyId: {
          userId,
          strategyId: inviteLink.strategy.id
        }
      }
    });

    if (existingSubscription) {
      return res.status(400).json({
        error: 'You already have access to this strategy',
        subscriptionId: existingSubscription.id
      });
    }

    // Check if user already requested access
    const existingRequest = await prisma.strategyAccessRequest.findUnique({
      where: {
        userId_strategyId: {
          userId,
          strategyId: inviteLink.strategy.id
        }
      }
    });

    if (existingRequest) {
      if (existingRequest.status === 'PENDING') {
        return res.status(400).json({
          error: 'You have already requested access to this strategy. Waiting for approval.',
          requestId: existingRequest.id,
          requestedAt: existingRequest.requestedAt
        });
      } else if (existingRequest.status === 'APPROVED') {
        return res.status(400).json({
          error: 'Your access request was already approved. You can now deploy this strategy.',
          requestId: existingRequest.id
        });
      } else if (existingRequest.status === 'REJECTED') {
        return res.status(400).json({
          error: 'Your previous access request was rejected.',
          requestId: existingRequest.id,
          reason: existingRequest.rejectionReason
        });
      }
    }

    // Create the access request
    const accessRequest = await prisma.$transaction(async (tx) => {
      // Increment usage count and deactivate if ONE_TIME
      const updateData: any = { usageCount: { increment: 1 } };

      // If it's a ONE_TIME link, deactivate it after first use
      if (inviteLink.type === 'ONE_TIME') {
        updateData.isActive = false;
        updateData.revokedAt = new Date();
      }

      await tx.strategyInviteLink.update({
        where: { id: inviteLink.id },
        data: updateData
      });

      // Create access request
      return tx.strategyAccessRequest.create({
        data: {
          userId,
          strategyId: inviteLink.strategy.id,
          inviteLinkId: inviteLink.id,
          status: 'PENDING'
        },
        include: {
          strategy: {
            select: { id: true, name: true, code: true }
          }
        }
      });
    });

    res.json({
      message: 'Access request submitted successfully. You will be notified when the request is reviewed.',
      request: {
        id: accessRequest.id,
        strategyId: accessRequest.strategy.id,
        strategyName: accessRequest.strategy.name,
        status: accessRequest.status,
        requestedAt: accessRequest.requestedAt
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/strategies/my-requests
 * Get user's access requests
 */
router.get('/my-requests', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;

    const requests = await prisma.strategyAccessRequest.findMany({
      where: { userId },
      include: {
        strategy: {
          select: {
            id: true,
            name: true,
            code: true,
            description: true,
            author: true
          }
        },
        inviteLink: {
          select: { inviteCode: true, isActive: true }
        },
        respondedBy: {
          select: { email: true }
        }
      },
      orderBy: { requestedAt: 'desc' }
    });

    res.json({
      requests: requests.map(req => ({
        id: req.id,
        strategy: req.strategy,
        inviteCode: req.inviteLink.inviteCode,
        inviteLinkActive: req.inviteLink.isActive,
        status: req.status,
        requestedAt: req.requestedAt,
        respondedAt: req.respondedAt,
        respondedBy: req.respondedBy?.email,
        rejectionReason: req.rejectionReason
      }))
    });
  } catch (error) {
    next(error);
  }
});

export { router as strategyInviteRoutes };
