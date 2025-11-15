import { Router } from 'express';
import { authenticate, requireAdminRole } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import prisma from '../utils/database';

const router = Router();

// All routes require authentication and ADMIN role
router.use(authenticate);
router.use(requireAdminRole);

/**
 * GET /api/admin/users
 * Get all users in the system
 */
router.get('/users', async (req: AuthenticatedRequest, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            ownedStrategies: true,
            strategySubscriptions: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      users: users.map(user => ({
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        strategiesOwned: user._count.ownedStrategies,
        subscriptions: user._count.strategySubscriptions
      }))
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/admin/users/:id/role
 * Update a user's role
 */
router.put('/users/:id/role', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['REGULAR', 'QUANT', 'CLIENT', 'ADMIN'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, email: true, role: true }
    });

    res.json({
      message: 'User role updated successfully',
      user
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/admin/users/:id
 * Delete a user account with safety checks
 */
router.delete('/users/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id: userIdToDelete } = req.params;
    const currentAdminId = req.userId!;

    // Safety Check 1: Cannot delete yourself
    if (userIdToDelete === currentAdminId) {
      return res.status(400).json({
        error: 'You cannot delete your own account. Please ask another admin to delete your account if needed.'
      });
    }

    // Fetch user to delete with all related data
    const userToDelete = await prisma.user.findUnique({
      where: { id: userIdToDelete },
      include: {
        _count: {
          select: {
            ownedStrategies: true,
            strategySubscriptions: { where: { isActive: true } },
            brokerCredentials: true,
            apiKeys: true,
            strategyReviews: true
          }
        },
        ownedStrategies: {
          select: {
            id: true,
            name: true,
            code: true,
            subscriberCount: true
          }
        },
        strategySubscriptions: {
          where: { isActive: true },
          select: {
            id: true,
            strategy: {
              select: {
                name: true,
                code: true
              }
            }
          }
        }
      }
    });

    if (!userToDelete) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Safety Check 2: Cannot delete the last admin
    if (userToDelete.role === 'ADMIN') {
      const adminCount = await prisma.user.count({
        where: { role: 'ADMIN' }
      });

      if (adminCount <= 1) {
        return res.status(400).json({
          error: 'Cannot delete the last admin user. Platform must have at least one admin.'
        });
      }
    }

    // Prepare deletion impact summary
    const deletionImpact = {
      email: userToDelete.email,
      role: userToDelete.role,
      willDelete: {
        activeSubscriptions: userToDelete._count.strategySubscriptions,
        brokerCredentials: userToDelete._count.brokerCredentials,
        apiKeys: userToDelete._count.apiKeys,
        reviews: userToDelete._count.strategyReviews
      },
      willUnassign: {
        strategies: userToDelete.ownedStrategies.map(s => ({
          name: s.name,
          code: s.code,
          activeSubscribers: s.subscriberCount
        }))
      },
      activeSubscriptionDetails: userToDelete.strategySubscriptions.map(sub => ({
        strategyName: sub.strategy.name,
        strategyCode: sub.strategy.code
      }))
    };

    // Warning if user has active subscriptions (will terminate active trades)
    if (userToDelete._count.strategySubscriptions > 0) {
      console.warn(`[ADMIN DELETE] User ${userToDelete.email} has ${userToDelete._count.strategySubscriptions} active subscriptions that will be terminated`);
    }

    // Warning if user owns strategies (will become unassigned)
    if (userToDelete._count.ownedStrategies > 0) {
      console.warn(`[ADMIN DELETE] User ${userToDelete.email} owns ${userToDelete._count.ownedStrategies} strategies that will become unassigned`);
    }

    // Perform deletion (Prisma cascade will handle related records)
    await prisma.user.delete({
      where: { id: userIdToDelete }
    });

    console.log(`[ADMIN DELETE] User ${userToDelete.email} (${userToDelete.role}) deleted by admin ${currentAdminId}`);

    res.json({
      message: 'User deleted successfully',
      deletionImpact
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/strategies
 * Get all strategies in the system
 */
router.get('/strategies', async (req: AuthenticatedRequest, res, next) => {
  try {
    const strategies = await prisma.strategy.findMany({
      include: {
        client: {
          select: { id: true, email: true }
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

    res.json({
      strategies: strategies.map(strategy => ({
        id: strategy.id,
        name: strategy.name,
        code: strategy.code,
        description: strategy.description,
        author: strategy.author,
        isPublic: strategy.isPublic,
        isActive: strategy.isActive,
        client: strategy.client,
        subscriberCount: strategy.subscriberCount,
        activeInviteLinks: strategy._count.inviteLinks,
        pendingRequests: strategy._count.accessRequests,
        createdAt: strategy.createdAt,
        executionConfig: strategy.executionConfig
      }))
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/admin/strategies/:id/assign
 * Assign a strategy to a client user
 */
router.put('/strategies/:id/assign', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id: strategyId } = req.params;
    const { clientId } = req.body;

    // Verify the user is a CLIENT or ADMIN
    const client = await prisma.user.findUnique({
      where: { id: clientId },
      select: { role: true }
    });

    if (!client || (client.role !== 'CLIENT' && client.role !== 'ADMIN')) {
      return res.status(400).json({ error: 'User must have CLIENT or ADMIN role' });
    }

    const strategy = await prisma.strategy.update({
      where: { id: strategyId },
      data: { clientId },
      include: {
        client: {
          select: { id: true, email: true }
        }
      }
    });

    res.json({
      message: 'Strategy assigned successfully',
      strategy: {
        id: strategy.id,
        name: strategy.name,
        client: strategy.client
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/admin/strategies/:id/unassign
 * Unassign a strategy from a client
 */
router.delete('/strategies/:id/unassign', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id: strategyId } = req.params;

    const strategy = await prisma.strategy.update({
      where: { id: strategyId },
      data: { clientId: null }
    });

    res.json({
      message: 'Strategy unassigned successfully',
      strategy: {
        id: strategy.id,
        name: strategy.name
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/stats
 * Get platform-wide statistics
 */
router.get('/stats', async (req: AuthenticatedRequest, res, next) => {
  try {
    const [
      totalUsers,
      totalStrategies,
      totalDeployments,
      pendingRequests,
      usersByRole
    ] = await Promise.all([
      prisma.user.count(),
      prisma.strategy.count(),
      prisma.strategySubscription.count({ where: { isActive: true } }),
      prisma.strategyAccessRequest.count({ where: { status: 'PENDING' } }),
      prisma.user.groupBy({
        by: ['role'],
        _count: true
      })
    ]);

    res.json({
      totalUsers,
      totalStrategies,
      totalDeployments,
      pendingRequests,
      usersByRole: usersByRole.reduce((acc, { role, _count }) => {
        acc[role] = _count;
        return acc;
      }, {} as Record<string, number>)
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/access-requests
 * Get all access requests across all strategies
 */
router.get('/access-requests', async (req: AuthenticatedRequest, res, next) => {
  try {
    const requests = await prisma.strategyAccessRequest.findMany({
      where: { status: 'PENDING' },
      include: {
        strategy: {
          select: { id: true, name: true, code: true }
        },
        user: {
          select: { id: true, email: true, createdAt: true }
        },
        inviteLink: {
          select: { inviteCode: true }
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
        status: req.status,
        requestedAt: req.requestedAt
      }))
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/admin/strategies/:id
 * Update strategy metadata (name, code, description, author)
 */
router.put('/strategies/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id: strategyId } = req.params;
    const { name, code, description, author, minMargin, defaultLeverage, defaultRiskPerTrade } = req.body;

    // Validate required fields
    if (!name || !code || !author) {
      return res.status(400).json({ error: 'Name, code, and author are required' });
    }

    // Build execution config if any values provided
    let executionConfig: any = undefined;
    if (minMargin !== undefined || defaultLeverage !== undefined || defaultRiskPerTrade !== undefined) {
      executionConfig = {};
      if (minMargin !== undefined) executionConfig.minMargin = parseFloat(minMargin);
      if (defaultLeverage !== undefined) executionConfig.defaultLeverage = parseInt(defaultLeverage);
      if (defaultRiskPerTrade !== undefined) executionConfig.defaultRiskPerTrade = parseFloat(defaultRiskPerTrade);
    }

    // Update the strategy
    const strategy = await prisma.strategy.update({
      where: { id: strategyId },
      data: {
        name,
        code,
        description: description || null,
        author,
        ...(executionConfig && { executionConfig })
      },
      select: {
        id: true,
        name: true,
        code: true,
        description: true,
        author: true,
        executionConfig: true
      }
    });

    res.json({
      message: 'Strategy updated successfully',
      strategy
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/admin/strategies/:id
 * Delete a strategy (only if no active subscribers)
 */
router.delete('/strategies/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id: strategyId } = req.params;

    // Check if strategy has active subscribers
    const strategy = await prisma.strategy.findUnique({
      where: { id: strategyId },
      select: {
        subscriberCount: true,
        name: true
      }
    });

    if (!strategy) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    if (strategy.subscriberCount > 0) {
      return res.status(400).json({
        error: 'Cannot delete strategy with active subscribers. Please wait for all subscriptions to end.'
      });
    }

    // Delete the strategy
    await prisma.strategy.delete({
      where: { id: strategyId }
    });

    res.json({
      message: 'Strategy deleted successfully',
      strategyName: strategy.name
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// Email Monitoring Endpoints
// ============================================

/**
 * GET /api/admin/email-logs
 * Get email delivery logs with filtering
 */
router.get('/email-logs', async (req: AuthenticatedRequest, res, next) => {
  try {
    const {
      status,
      emailType,
      limit = '50',
      offset = '0',
      email,
      userId
    } = req.query;

    const where: any = {};
    if (status) where.status = status;
    if (emailType) where.emailType = emailType;
    if (email) where.email = { contains: email as string };
    if (userId) where.userId = userId;

    const [logs, total] = await Promise.all([
      prisma.emailLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true
            }
          }
        },
        orderBy: { sentAt: 'desc' },
        take: parseInt(limit as string),
        skip: parseInt(offset as string)
      }),
      prisma.emailLog.count({ where })
    ]);

    res.json({
      logs,
      pagination: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/email-stats
 * Get email delivery statistics
 */
router.get('/email-stats', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { days = '7' } = req.query;
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(days as string));

    const [
      totalSent,
      byStatus,
      byType,
      failedEmails
    ] = await Promise.all([
      // Total emails sent in period
      prisma.emailLog.count({
        where: { sentAt: { gte: daysAgo } }
      }),

      // Group by status
      prisma.emailLog.groupBy({
        by: ['status'],
        where: { sentAt: { gte: daysAgo } },
        _count: true
      }),

      // Group by type
      prisma.emailLog.groupBy({
        by: ['emailType'],
        where: { sentAt: { gte: daysAgo } },
        _count: true
      }),

      // Failed emails with details
      prisma.emailLog.findMany({
        where: {
          status: 'FAILED',
          sentAt: { gte: daysAgo }
        },
        select: {
          id: true,
          email: true,
          emailType: true,
          statusMessage: true,
          sentAt: true
        },
        orderBy: { sentAt: 'desc' },
        take: 10
      })
    ]);

    res.json({
      period: `Last ${days} days`,
      totalSent,
      byStatus: byStatus.reduce((acc, item) => {
        acc[item.status] = item._count;
        return acc;
      }, {} as Record<string, number>),
      byType: byType.reduce((acc, item) => {
        acc[item.emailType] = item._count;
        return acc;
      }, {} as Record<string, number>),
      recentFailures: failedEmails
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/unverified-users
 * Get users who requested verification emails but haven't verified yet
 * Only shows users who actually have email logs (requested emails from system)
 */
router.get('/unverified-users', async (req: AuthenticatedRequest, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        emailVerified: null,
        password: { not: null }, // Only email/password users
        emailLogs: {
          some: {
            emailType: 'VERIFICATION' // Only users who actually requested verification emails
          }
        }
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        verificationToken: true,
        verificationTokenExpiry: true,
        emailLogs: {
          where: { emailType: 'VERIFICATION' },
          orderBy: { sentAt: 'desc' },
          take: 1,
          select: {
            status: true,
            statusMessage: true,
            sentAt: true,
            resendEmailId: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      total: users.length,
      users: users.map(user => ({
        ...user,
        lastEmailStatus: user.emailLogs[0] || null,
        isExpired: user.verificationTokenExpiry
          ? user.verificationTokenExpiry < new Date()
          : true
      }))
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/resend-verification
 * Manually resend verification email to a user
 */
router.post('/resend-verification', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: 'User email is already verified' });
    }

    // Generate new OTP (copy logic from email.service.ts)
    const crypto = require('crypto');
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Update user with new OTP
    await prisma.user.update({
      where: { id: userId },
      data: {
        verificationToken: otp,
        verificationTokenExpiry: otpExpiry
      }
    });

    // Send email
    const { sendVerificationEmail } = require('../services/email.service');
    await sendVerificationEmail(user.email, otp, user.id);

    res.json({
      message: 'Verification email resent successfully',
      email: user.email
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/verify-user-manually
 * Manually verify a user's email (bypass verification)
 */
router.post('/verify-user-manually', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        emailVerified: new Date(),
        verificationToken: null,
        verificationTokenExpiry: null
      },
      select: {
        id: true,
        email: true,
        emailVerified: true
      }
    });

    res.json({
      message: 'User verified successfully',
      user
    });
  } catch (error) {
    next(error);
  }
});

export { router as adminRoutes };
