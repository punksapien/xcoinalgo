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
    const { name, code, description, author, minMargin } = req.body;

    // Validate required fields
    if (!name || !code || !author) {
      return res.status(400).json({ error: 'Name, code, and author are required' });
    }

    // Build execution config if minMargin is provided
    let executionConfig: any = undefined;
    if (minMargin !== undefined) {
      executionConfig = {
        minMargin: parseFloat(minMargin)
      };
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

/**
 * ========================================
 * STRATEGY SUBSCRIBER MANAGEMENT
 * ========================================
 */

/**
 * GET /api/admin/strategies/:id/subscribers
 * Get all subscribers of a strategy with their settings
 */
router.get('/strategies/:id/subscribers', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id: strategyId } = req.params;

    // Verify strategy exists
    const strategy = await prisma.strategy.findUnique({
      where: { id: strategyId },
      select: {
        id: true,
        name: true,
        executionConfig: true
      }
    });

    if (!strategy) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    // Get all active subscribers with their settings
    const subscribers = await prisma.strategySubscription.findMany({
      where: {
        strategyId,
        isActive: true
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true
          }
        },
        brokerCredential: {
          select: {
            id: true,
            brokerName: true
          }
        }
      },
      orderBy: { subscribedAt: 'desc' }
    });

    // Get strategy defaults
    const execConfig = strategy.executionConfig as any || {};
    const strategyDefaults = {
      riskPerTrade: execConfig.risk_per_trade || 0.02,
      leverage: execConfig.leverage || 10,
      maxPositions: execConfig.max_positions || 1,
      maxDailyLoss: execConfig.max_daily_loss || 0.05
    };

    // Format response
    const subscriberData = subscribers.map(sub => ({
      id: sub.id,
      user: {
        id: sub.user.id,
        email: sub.user.email,
        name: sub.user.name
      },
      settings: {
        capital: sub.capital,
        riskPerTrade: sub.riskPerTrade,
        leverage: sub.leverage,
        maxPositions: sub.maxPositions,
        maxDailyLoss: sub.maxDailyLoss,
        slAtrMultiplier: sub.slAtrMultiplier,
        tpAtrMultiplier: sub.tpAtrMultiplier
      },
      effectiveSettings: {
        riskPerTrade: sub.riskPerTrade ?? strategyDefaults.riskPerTrade,
        leverage: sub.leverage ?? strategyDefaults.leverage,
        maxPositions: sub.maxPositions ?? strategyDefaults.maxPositions,
        maxDailyLoss: sub.maxDailyLoss ?? strategyDefaults.maxDailyLoss
      },
      usingDefaults: {
        riskPerTrade: sub.riskPerTrade === null,
        leverage: sub.leverage === null,
        maxPositions: sub.maxPositions === null,
        maxDailyLoss: sub.maxDailyLoss === null
      },
      tradingType: sub.tradingType,
      marginCurrency: sub.marginCurrency,
      brokerCredential: sub.brokerCredential,
      isPaused: sub.isPaused,
      subscribedAt: sub.subscribedAt,
      stats: {
        totalTrades: sub.totalTrades,
        winningTrades: sub.winningTrades,
        losingTrades: sub.losingTrades,
        totalPnl: sub.totalPnl
      }
    }));

    res.json({
      success: true,
      strategy: {
        id: strategy.id,
        name: strategy.name,
        defaults: strategyDefaults
      },
      subscribers: subscriberData,
      count: subscriberData.length
    });

  } catch (error) {
    console.error('Failed to fetch strategy subscribers:', error);
    next(error);
  }
});

/**
 * PATCH /api/admin/strategies/:id/subscribers/:subscriptionId
 * Update a single subscriber's settings
 */
router.patch('/strategies/:id/subscribers/:subscriptionId', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id: strategyId, subscriptionId } = req.params;
    const { riskPerTrade, leverage, maxPositions, maxDailyLoss, capital } = req.body;

    // Validation
    const errors: string[] = [];

    if (riskPerTrade !== undefined && riskPerTrade !== null) {
      if (typeof riskPerTrade !== 'number' || riskPerTrade <= 0 || riskPerTrade > 1) {
        errors.push('riskPerTrade must be a number between 0 and 1');
      }
    }

    if (leverage !== undefined && leverage !== null) {
      if (!Number.isInteger(leverage) || leverage < 1 || leverage > 125) {
        errors.push('leverage must be an integer between 1 and 125');
      }
    }

    if (maxPositions !== undefined && maxPositions !== null) {
      if (!Number.isInteger(maxPositions) || maxPositions < 1 || maxPositions > 10) {
        errors.push('maxPositions must be an integer between 1 and 10');
      }
    }

    if (maxDailyLoss !== undefined && maxDailyLoss !== null) {
      if (typeof maxDailyLoss !== 'number' || maxDailyLoss <= 0 || maxDailyLoss > 1) {
        errors.push('maxDailyLoss must be a number between 0 and 1');
      }
    }

    if (capital !== undefined && capital !== null) {
      if (typeof capital !== 'number' || capital <= 0) {
        errors.push('capital must be a positive number');
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    // Verify subscription exists and belongs to this strategy
    const subscription = await prisma.strategySubscription.findUnique({
      where: { id: subscriptionId },
      include: {
        user: { select: { email: true } }
      }
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    if (subscription.strategyId !== strategyId) {
      return res.status(400).json({ error: 'Subscription does not belong to this strategy' });
    }

    // Build update data
    const updateData: any = {};
    if (riskPerTrade !== undefined) updateData.riskPerTrade = riskPerTrade;
    if (leverage !== undefined) updateData.leverage = leverage;
    if (maxPositions !== undefined) updateData.maxPositions = maxPositions;
    if (maxDailyLoss !== undefined) updateData.maxDailyLoss = maxDailyLoss;
    if (capital !== undefined) updateData.capital = capital;

    // Update database
    const updatedSubscription = await prisma.strategySubscription.update({
      where: { id: subscriptionId },
      data: updateData
    });

    // Update Redis cache
    try {
      const { settingsService } = await import('../services/strategy-execution/settings-service');
      await settingsService.updateSubscriptionSettings(
        subscription.userId,
        strategyId,
        {
          ...(riskPerTrade !== undefined && { risk_per_trade: riskPerTrade }),
          ...(leverage !== undefined && { leverage }),
          ...(maxPositions !== undefined && { max_positions: maxPositions }),
          ...(maxDailyLoss !== undefined && { max_daily_loss: maxDailyLoss }),
          ...(capital !== undefined && { capital })
        }
      );
      console.log(`✅ Updated Redis cache for subscription ${subscriptionId}`);
    } catch (redisError) {
      console.error(`⚠️ Failed to update Redis cache for subscription ${subscriptionId}:`, redisError);
      // Don't fail the request if Redis update fails
    }

    console.log(
      `[ADMIN] Updated subscription ${subscriptionId} for user ${subscription.user.email}: ` +
      `${Object.keys(updateData).join(', ')}`
    );

    res.json({
      success: true,
      message: 'Subscription settings updated successfully',
      subscription: updatedSubscription
    });

  } catch (error) {
    console.error('Failed to update subscription:', error);
    next(error);
  }
});

/**
 * PATCH /api/admin/strategies/:id/subscribers/bulk
 * Bulk update subscribers' settings
 */
router.patch('/strategies/:id/subscribers/bulk', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id: strategyId } = req.params;
    const {
      subscriptionIds,
      updates,
      resetToDefaults
    } = req.body;

    // Validation
    if (!Array.isArray(subscriptionIds) || subscriptionIds.length === 0) {
      return res.status(400).json({ error: 'subscriptionIds must be a non-empty array' });
    }

    if (subscriptionIds.length > 100) {
      return res.status(400).json({ error: 'Cannot update more than 100 subscriptions at once' });
    }

    // Verify strategy exists
    const strategy = await prisma.strategy.findUnique({
      where: { id: strategyId },
      select: { id: true, name: true }
    });

    if (!strategy) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    let updateData: any = {};

    if (resetToDefaults) {
      // Reset to NULL (use strategy defaults)
      updateData = {
        riskPerTrade: null,
        leverage: null,
        maxPositions: null,
        maxDailyLoss: null
      };
    } else {
      // Apply specific updates
      if (updates.riskPerTrade !== undefined) {
        if (updates.riskPerTrade !== null && (typeof updates.riskPerTrade !== 'number' || updates.riskPerTrade <= 0 || updates.riskPerTrade > 1)) {
          return res.status(400).json({ error: 'riskPerTrade must be a number between 0 and 1 or null' });
        }
        updateData.riskPerTrade = updates.riskPerTrade;
      }

      if (updates.leverage !== undefined) {
        if (updates.leverage !== null && (!Number.isInteger(updates.leverage) || updates.leverage < 1 || updates.leverage > 125)) {
          return res.status(400).json({ error: 'leverage must be an integer between 1 and 125 or null' });
        }
        updateData.leverage = updates.leverage;
      }

      if (updates.maxPositions !== undefined) {
        if (updates.maxPositions !== null && (!Number.isInteger(updates.maxPositions) || updates.maxPositions < 1 || updates.maxPositions > 10)) {
          return res.status(400).json({ error: 'maxPositions must be an integer between 1 and 10 or null' });
        }
        updateData.maxPositions = updates.maxPositions;
      }

      if (updates.maxDailyLoss !== undefined) {
        if (updates.maxDailyLoss !== null && (typeof updates.maxDailyLoss !== 'number' || updates.maxDailyLoss <= 0 || updates.maxDailyLoss > 1)) {
          return res.status(400).json({ error: 'maxDailyLoss must be a number between 0 and 1 or null' });
        }
        updateData.maxDailyLoss = updates.maxDailyLoss;
      }

      if (updates.capital !== undefined) {
        if (updates.capital !== null && (typeof updates.capital !== 'number' || updates.capital <= 0)) {
          return res.status(400).json({ error: 'capital must be a positive number' });
        }
        updateData.capital = updates.capital;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid updates provided' });
    }

    // Verify all subscriptions belong to this strategy
    const subscriptions = await prisma.strategySubscription.findMany({
      where: {
        id: { in: subscriptionIds },
        strategyId
      },
      select: {
        id: true,
        userId: true,
        user: { select: { email: true } }
      }
    });

    if (subscriptions.length !== subscriptionIds.length) {
      return res.status(400).json({
        error: 'Some subscriptions not found or do not belong to this strategy',
        found: subscriptions.length,
        requested: subscriptionIds.length
      });
    }

    // Perform bulk update in transaction
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.strategySubscription.updateMany({
        where: {
          id: { in: subscriptionIds }
        },
        data: updateData
      });

      return updated;
    });

    // Update Redis cache for each subscription
    try {
      const { settingsService } = await import('../services/strategy-execution/settings-service');

      for (const sub of subscriptions) {
        try {
          const redisUpdates: any = {};
          if (updateData.riskPerTrade !== undefined) redisUpdates.risk_per_trade = updateData.riskPerTrade;
          if (updateData.leverage !== undefined) redisUpdates.leverage = updateData.leverage;
          if (updateData.maxPositions !== undefined) redisUpdates.max_positions = updateData.maxPositions;
          if (updateData.maxDailyLoss !== undefined) redisUpdates.max_daily_loss = updateData.maxDailyLoss;
          if (updateData.capital !== undefined) redisUpdates.capital = updateData.capital;

          await settingsService.updateSubscriptionSettings(
            sub.userId,
            strategyId,
            redisUpdates
          );
        } catch (subError) {
          console.error(`⚠️ Failed to update Redis for user ${sub.userId}:`, subError);
        }
      }

      console.log(`✅ Updated Redis cache for ${subscriptions.length} subscriptions`);
    } catch (redisError) {
      console.error('⚠️ Failed to update Redis cache:', redisError);
    }

    console.log(
      `[ADMIN] Bulk updated ${result.count} subscriptions for strategy ${strategy.name}: ` +
      `${Object.keys(updateData).join(', ')}`
    );

    res.json({
      success: true,
      message: `Successfully updated ${result.count} subscriptions`,
      updated: result.count,
      affectedUsers: subscriptions.map(s => s.user.email)
    });

  } catch (error) {
    console.error('Failed to bulk update subscriptions:', error);
    next(error);
  }
});

export { router as adminRoutes };
