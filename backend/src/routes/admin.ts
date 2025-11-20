import { Router } from 'express';
import { authenticate, requireAdminRole } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import prisma from '../utils/database';
import bcrypt from 'bcrypt';
import * as CoinDCXClient from '../services/coindcx-client';

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

/**
 * ========================================
 * STRATEGY MONITORING & OBSERVABILITY
 * ========================================
 */

/**
 * GET /api/admin/strategy-health
 * Get health metrics for all strategies
 */
router.get('/strategy-health', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { hours = '24' } = req.query;
    const hoursAgo = new Date();
    hoursAgo.setHours(hoursAgo.getHours() - parseInt(hours as string));

    // Get all active strategies with their latest execution data
    const strategies = await prisma.strategy.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        subscriberCount: true,
        isActive: true,
        executionConfig: true,
        executions: {
          where: {
            executedAt: { gte: hoursAgo }
          },
          orderBy: { executedAt: 'desc' },
          take: 100,
          select: {
            id: true,
            executedAt: true,
            status: true,
            subscribersCount: true,
            tradesGenerated: true,
            duration: true,
            error: true
          }
        },
        _count: {
          select: {
            subscriptions: { where: { isActive: true } }
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    // Calculate health metrics for each strategy
    const healthData = strategies.map(strategy => {
      const executions = strategy.executions;
      const totalExecutions = executions.length;
      const successfulExecutions = executions.filter(e => e.status === 'SUCCESS').length;
      const failedExecutions = executions.filter(e => e.status === 'FAILED').length;
      const skippedExecutions = executions.filter(e => e.status === 'SKIPPED').length;

      const successRate = totalExecutions > 0
        ? (successfulExecutions / totalExecutions) * 100
        : 0;

      const lastExecution = executions.length > 0 ? executions[0] : null;
      const lastExecutedAt = lastExecution?.executedAt || null;

      // Calculate time since last execution
      const minutesSinceLastExecution = lastExecutedAt
        ? Math.floor((Date.now() - new Date(lastExecutedAt).getTime()) / (1000 * 60))
        : null;

      // Determine health status
      let healthStatus: 'healthy' | 'warning' | 'critical' | 'unknown';

      if (!lastExecutedAt) {
        healthStatus = 'unknown';
      } else if (minutesSinceLastExecution! > 30) {
        healthStatus = 'critical'; // No execution in 30+ minutes
      } else if (successRate < 50 && totalExecutions >= 3) {
        healthStatus = 'critical'; // Less than 50% success rate
      } else if (successRate < 80 && totalExecutions >= 5) {
        healthStatus = 'warning'; // Less than 80% success rate
      } else if (minutesSinceLastExecution! > 15) {
        healthStatus = 'warning'; // No execution in 15+ minutes
      } else {
        healthStatus = 'healthy';
      }

      // Get execution config for display
      const execConfig = strategy.executionConfig as any || {};
      const symbol = execConfig.symbol || execConfig.pair || 'N/A';
      const resolution = execConfig.resolution || 'N/A';

      return {
        id: strategy.id,
        name: strategy.name,
        code: strategy.code,
        symbol,
        resolution,
        isActive: strategy.isActive,
        healthStatus,
        metrics: {
          subscriberCount: strategy.subscriberCount,
          activeSubscribers: strategy._count.subscriptions,
          totalExecutions,
          successfulExecutions,
          failedExecutions,
          skippedExecutions,
          successRate: parseFloat(successRate.toFixed(1)),
          lastExecutedAt,
          minutesSinceLastExecution,
          lastExecutionStatus: lastExecution?.status || null,
          lastExecutionDuration: lastExecution?.duration || null,
          lastExecutionError: lastExecution?.error || null,
          avgDuration: totalExecutions > 0
            ? executions.reduce((sum, e) => sum + (e.duration || 0), 0) / totalExecutions
            : 0
        },
        recentFailures: executions
          .filter(e => e.status === 'FAILED')
          .slice(0, 3)
          .map(e => ({
            executedAt: e.executedAt,
            error: e.error,
            duration: e.duration
          }))
      };
    });

    // Calculate platform-wide stats
    const totalStrategies = healthData.length;
    const healthyStrategies = healthData.filter(s => s.healthStatus === 'healthy').length;
    const warningStrategies = healthData.filter(s => s.healthStatus === 'warning').length;
    const criticalStrategies = healthData.filter(s => s.healthStatus === 'critical').length;
    const unknownStrategies = healthData.filter(s => s.healthStatus === 'unknown').length;

    const totalSubscribers = healthData.reduce((sum, s) => sum + s.metrics.subscriberCount, 0);
    const totalExecutions = healthData.reduce((sum, s) => sum + s.metrics.totalExecutions, 0);
    const avgSuccessRate = healthData.length > 0
      ? healthData.reduce((sum, s) => sum + s.metrics.successRate, 0) / healthData.length
      : 0;

    res.json({
      success: true,
      period: `Last ${hours} hours`,
      platformStats: {
        totalStrategies,
        healthyStrategies,
        warningStrategies,
        criticalStrategies,
        unknownStrategies,
        totalSubscribers,
        totalExecutions,
        avgSuccessRate: parseFloat(avgSuccessRate.toFixed(1))
      },
      strategies: healthData
    });

  } catch (error) {
    console.error('Failed to fetch strategy health:', error);
    next(error);
  }
});

/**
 * GET /api/admin/strategy-executions
 * Get recent strategy executions across all strategies
 */
router.get('/strategy-executions', async (req: AuthenticatedRequest, res, next) => {
  try {
    const {
      limit = '50',
      offset = '0',
      status,
      strategyId,
      hours = '24'
    } = req.query;

    const hoursAgo = new Date();
    hoursAgo.setHours(hoursAgo.getHours() - parseInt(hours as string));

    // Build where clause
    const where: any = {
      executedAt: { gte: hoursAgo }
    };
    if (status) where.status = status;
    if (strategyId) where.strategyId = strategyId;

    // Fetch executions
    const [executions, total] = await Promise.all([
      prisma.strategyExecution.findMany({
        where,
        include: {
          strategy: {
            select: {
              id: true,
              name: true,
              code: true
            }
          }
        },
        orderBy: { executedAt: 'desc' },
        take: parseInt(limit as string),
        skip: parseInt(offset as string)
      }),
      prisma.strategyExecution.count({ where })
    ]);

    res.json({
      success: true,
      executions: executions.map(exec => ({
        id: exec.id,
        executedAt: exec.executedAt,
        status: exec.status,
        duration: exec.duration,
        subscribersCount: exec.subscribersCount,
        tradesGenerated: exec.tradesGenerated,
        error: exec.error,
        strategy: exec.strategy
      })),
      pagination: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: (parseInt(offset as string) + parseInt(limit as string)) < total
      }
    });

  } catch (error) {
    console.error('Failed to fetch strategy executions:', error);
    next(error);
  }
});

/**
 * GET /api/admin/scheduler-health
 * Get scheduler health metrics (requires SSH/PM2 access, placeholder for now)
 */
router.get('/scheduler-health', async (req: AuthenticatedRequest, res, next) => {
  try {
    // This would require integration with PM2 or server monitoring
    // For now, return basic info from database

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const recentExecutions = await prisma.strategyExecution.count({
      where: {
        executedAt: { gte: fiveMinutesAgo }
      }
    });

    const isHealthy = recentExecutions > 0;

    res.json({
      success: true,
      scheduler: {
        isHealthy,
        recentExecutions,
        lastChecked: new Date(),
        status: isHealthy ? 'running' : 'possibly_down',
        message: isHealthy
          ? 'Scheduler is executing strategies'
          : 'No executions in the last 5 minutes - scheduler may be down'
      }
    });

  } catch (error) {
    console.error('Failed to fetch scheduler health:', error);
    next(error);
  }
});

/**
 * POST /api/admin/users/bulk-create
 * Bulk create user accounts with broker credentials validation
 */
router.post('/users/bulk-create', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { users } = req.body as {
      users: Array<{
        email: string;
        name: string;
        password: string;
        phoneNumber?: string;
        role?: 'REGULAR' | 'QUANT' | 'CLIENT' | 'ADMIN';
        apiKey?: string;
        apiSecret?: string;
      }>;
    };

    // Validation
    if (!Array.isArray(users) || users.length === 0) {
      return res.status(400).json({
        error: 'users array is required and must not be empty'
      });
    }

    if (users.length > 100) {
      return res.status(400).json({
        error: 'Maximum 100 users can be created at once'
      });
    }

    const SALT_ROUNDS = 12;
    const results: Array<{
      email: string;
      status: 'success' | 'failed';
      userId?: string;
      credentialsStored: boolean;
      credentialValidation?: 'valid' | 'invalid' | 'skipped' | 'error';
      error?: string;
    }> = [];

    // Process each user
    for (const userData of users) {
      const result: any = {
        email: userData.email,
        status: 'failed',
        credentialsStored: false,
      };

      try {
        // Validate required fields
        if (!userData.email || !userData.name || !userData.password) {
          throw new Error('Missing required fields: email, name, or password');
        }

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
          where: { email: userData.email },
        });

        if (existingUser) {
          throw new Error('User with this email already exists');
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(userData.password, SALT_ROUNDS);

        // Create user
        const user = await prisma.user.create({
          data: {
            email: userData.email,
            name: userData.name,
            phoneNumber: userData.phoneNumber || null,
            password: hashedPassword,
            role: userData.role || 'REGULAR',
            emailVerified: new Date(), // Auto-verify bulk created users
            verificationToken: null,
            verificationTokenExpiry: null,
          },
        });

        result.status = 'success';
        result.userId = user.id;

        // Handle broker credentials if provided
        if (userData.apiKey && userData.apiSecret) {
          const trimmedApiKey = userData.apiKey.trim();
          const trimmedApiSecret = userData.apiSecret.trim();

          // Skip only if completely empty (after trim)
          if (trimmedApiKey === '' || trimmedApiSecret === '') {
            result.credentialValidation = 'skipped';
            console.log(`Skipping empty credentials for ${userData.email}`);
          } else {
            // ALWAYS validate with CoinDCX API - let CoinDCX be the source of truth
            try {
              await CoinDCXClient.getBalances(trimmedApiKey, trimmedApiSecret);

              // Credentials are valid, store them
              await prisma.brokerCredential.create({
                data: {
                  userId: user.id,
                  brokerName: 'coindcx',
                  apiKey: trimmedApiKey,
                  apiSecret: trimmedApiSecret,
                  isActive: true,
                },
              });

              result.credentialsStored = true;
              result.credentialValidation = 'valid';
              console.log(`Stored valid credentials for ${userData.email}`);
            } catch (credError) {
              // Credentials are invalid (CoinDCX rejected them)
              result.credentialValidation = 'invalid';
              console.log(`CoinDCX rejected credentials for ${userData.email}:`, credError instanceof Error ? credError.message : String(credError));
            }
          }
        } else {
          result.credentialValidation = 'skipped';
        }

      } catch (error: any) {
        result.error = error.message;
        console.error(`Failed to create user ${userData.email}:`, error.message);
      }

      results.push(result);
    }

    // Calculate summary
    const summary = {
      total: results.length,
      successful: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'failed').length,
      credentialsStored: results.filter(r => r.credentialsStored).length,
      credentialsInvalid: results.filter(r => r.credentialValidation === 'invalid').length,
      credentialsSkipped: results.filter(r => r.credentialValidation === 'skipped').length,
    };

    console.log(`Bulk creation complete: ${summary.successful}/${summary.total} users created, ${summary.credentialsStored} credentials stored`);

    res.json({
      success: true,
      summary,
      results,
    });

  } catch (error) {
    console.error('Bulk creation error:', error);
    next(error);
  }
});

/**
 * POST /api/admin/users/validate-bulk
 * Validate users and credentials without creating them
 */
router.post('/users/validate-bulk', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { users } = req.body as {
      users: Array<{
        email: string;
        apiKey?: string;
        apiSecret?: string;
      }>;
    };

    if (!Array.isArray(users) || users.length === 0) {
      return res.status(400).json({ error: 'users array is required' });
    }

    const results = await Promise.all(users.map(async (user) => {
      const result: any = {
        email: user.email,
        emailExists: false,
        credentialsValid: null,
      };

      // Check email existence
      if (user.email) {
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email },
          select: { id: true }
        });
        if (existingUser) {
          result.emailExists = true;
        }
      }

      // Check credentials if provided
      if (user.apiKey && user.apiSecret) {
        const trimmedApiKey = user.apiKey.trim();
        const trimmedApiSecret = user.apiSecret.trim();

        if (trimmedApiKey && trimmedApiSecret && trimmedApiKey.length > 10) {
          try {
            await CoinDCXClient.getBalances(trimmedApiKey, trimmedApiSecret);
            result.credentialsValid = true;
          } catch (error) {
            result.credentialsValid = false;
          }
        } else {
          result.credentialsValid = false; // Malformed
        }
      }

      return result;
    }));

    res.json({ results });
  } catch (error) {
    console.error('Bulk validation error:', error);
    next(error);
  }
});

export { router as adminRoutes };
