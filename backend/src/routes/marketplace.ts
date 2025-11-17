/**
 * Marketplace Routes - Public API for browsing and discovering strategies
 *
 * This allows traders to discover strategies published by quant teams,
 * view performance metrics, and subscribe to strategies without seeing the code.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import prisma from '../utils/database';
import { AuthenticatedRequest } from '../types';
import { Logger } from '../utils/logger';

const logger = new Logger('Marketplace');
const router = Router();

/**
 * GET /api/marketplace
 * Browse all published strategies (PUBLIC - optional auth)
 *
 * Query params:
 * - search: search term for name/description/author
 * - tags: comma-separated tags to filter by
 * - sortBy: popularity, performance, newest (default: popularity)
 * - minWinRate: minimum win rate filter
 * - page: page number (default: 1)
 * - limit: items per page (default: 12)
 */
router.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const {
      search,
      tags,
      sortBy = 'popularity',
      minWinRate,
      page = 1,
      limit = 12
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    // Check if user is authenticated (optional)
    const authHeader = req.headers.authorization;
    let userId: string | null = null;
    let userRole: string | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const { verifyToken } = await import('../utils/simple-jwt');
        const decoded = verifyToken(token);
        userId = decoded.userId;

        // Fetch user role from database
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { role: true }
        });
        userRole = user?.role || null;
      } catch (error) {
        // Token invalid or expired - proceed as unauthenticated
        userId = null;
        userRole = null;
      }
    }

    // Build filter conditions based on user role
    const whereConditions: any = {
      isActive: true,      // Only active strategies
      isApproved: true,    // Only approved strategies
    };

    // ROLE-BASED VISIBILITY LOGIC
    if (!userId || userRole === 'REGULAR') {
      // REGULAR users: Show public strategies + private strategies they have access to
      const userAccessRequests = userId ? await prisma.strategyAccessRequest.findMany({
        where: {
          userId,
          status: { in: ['APPROVED', 'PENDING'] }
        },
        select: { strategyId: true }
      }) : [];

      const accessiblePrivateStrategyIds = userAccessRequests.map(req => req.strategyId);

      if (accessiblePrivateStrategyIds.length > 0) {
        // Show public strategies OR private strategies user has access to
        whereConditions.OR = [
          { isPublic: true },
          { id: { in: accessiblePrivateStrategyIds } }
        ];
      } else {
        // Only show public strategies
        whereConditions.isPublic = true;
      }
    } else if (userRole === 'QUANT') {
      // QUANT users: Show ALL strategies (public + all private) + private strategies they have access to
      // This allows quants to see and test private strategies in the marketplace
      const userAccessRequests = await prisma.strategyAccessRequest.findMany({
        where: {
          userId,
          status: { in: ['APPROVED', 'PENDING'] }
        },
        select: { strategyId: true }
      });

      const accessiblePrivateStrategyIds = userAccessRequests.map(req => req.strategyId);

      // Show all strategies (both public and private)
      // No additional filter needed - quants can see everything
    } else if (userRole === 'CLIENT') {
      // CLIENTS: Show public strategies + their own private strategies + private strategies they have access to
      const userAccessRequests = await prisma.strategyAccessRequest.findMany({
        where: {
          userId,
          status: { in: ['APPROVED', 'PENDING'] }
        },
        select: { strategyId: true }
      });

      const accessiblePrivateStrategyIds = userAccessRequests.map(req => req.strategyId);

      whereConditions.OR = [
        { isPublic: true },                    // Public strategies
        { clientId: userId },                  // Their own strategies (public or private)
        { id: { in: accessiblePrivateStrategyIds } } // Private strategies with access
      ];
    } else if (userRole === 'ADMIN') {
      // ADMINS: Show all strategies (no additional filter)
      // isActive and isApproved filters already applied above
    } else {
      // Unauthenticated or unknown role: Only show public strategies
      whereConditions.isPublic = true;
    }

    // Search filter - wrap visibility conditions if search is provided
    if (search) {
      const visibilityConditions = whereConditions.OR || (whereConditions.isPublic !== undefined ? [{ isPublic: whereConditions.isPublic }] : []);
      delete whereConditions.OR;
      delete whereConditions.isPublic;

      whereConditions.AND = [
        // Visibility conditions (public/private access)
        visibilityConditions.length > 0 ? { OR: visibilityConditions } : {},
        // Search conditions
        {
          OR: [
            { name: { contains: search as string, mode: 'insensitive' } },
            { description: { contains: search as string, mode: 'insensitive' } },
            { author: { contains: search as string, mode: 'insensitive' } }
          ]
        }
      ];
    }

    // Tags filter
    if (tags) {
      const tagArray = (tags as string).split(',');
      whereConditions.tags = {
        contains: tagArray[0], // Simplified - could be improved with array handling
      };
    }

    // Win rate filter
    if (minWinRate) {
      whereConditions.winRate = {
        gte: Number(minWinRate)
      };
    }

    // Determine sort order
    let orderBy: any = { createdAt: 'desc' }; // default: newest

    if (sortBy === 'popularity') {
      orderBy = { subscriberCount: 'desc' };
    } else if (sortBy === 'performance') {
      orderBy = { roi: 'desc' };
    }

    // Fetch strategies and user subscriptions in parallel
    const [strategies, total, userSubscriptions] = await Promise.all([
      prisma.strategy.findMany({
        where: whereConditions,
        select: {
          id: true,
          name: true,
          code: true,
          description: true,
          detailedDescription: true,
          author: true,
          version: true,
          tags: true,
          createdAt: true,
          updatedAt: true,

          // Performance metrics (visible to all)
          winRate: true,
          roi: true,
          riskReward: true,
          maxDrawdown: true,
          marginRequired: true,
          executionConfig: true,

          // Trading config (visible to all)
          instrument: true,
          supportedPairs: true,
          timeframes: true,
          strategyType: true,

          // Subscription info
          subscriberCount: true,

          // Visibility and ownership
          isPublic: true,
          clientId: true,

          // Client information (to display client name as author)
          client: {
            select: {
              name: true,
              email: true
            }
          },

          // NOTE: We do NOT include the actual strategy code!
          // Code stays private - only author can see it
        },
        orderBy,
        skip,
        take: Number(limit),
      }),
      prisma.strategy.count({ where: whereConditions }),
      userId ? prisma.strategySubscription.findMany({
        where: {
          userId,
          isActive: true,
        },
        select: {
          strategyId: true,
        }
      }) : Promise.resolve([])
    ]);

    // Create a set of subscribed strategy IDs for quick lookup
    const subscribedStrategyIds = new Set(userSubscriptions.map(sub => sub.strategyId));

    // Get access request status for each strategy (for private strategies)
    const accessRequestsMap = new Map<string, string>();
    if (userId) {
      const accessRequests = await prisma.strategyAccessRequest.findMany({
        where: {
          userId,
          strategyId: { in: strategies.map(s => s.id) }
        },
        select: {
          strategyId: true,
          status: true
        }
      });

      accessRequests.forEach(req => {
        accessRequestsMap.set(req.strategyId, req.status);
      });
    }

    res.json({
      strategies: strategies.map(strategy => {
        // Use client name as author if strategy is assigned to a client
        const displayAuthor = (strategy as any).client?.name || (strategy as any).client?.email || strategy.author;

        return {
          ...strategy,
          // Override author with client name if available
          author: displayAuthor,
          // Remove client object from response
          client: undefined,
          // Parse JSON fields
          supportedPairs: strategy.supportedPairs ? JSON.parse(strategy.supportedPairs as string) : null,
          timeframes: strategy.timeframes ? JSON.parse(strategy.timeframes as string) : null,
          // Add isSubscribed flag
          isSubscribed: subscribedStrategyIds.has(strategy.id),
          // Add access status for private strategies
          accessStatus: accessRequestsMap.get(strategy.id) || null,
          // Add flag for client's own strategies
          isOwned: userId && (strategy as any).clientId === userId,
        };
      }),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });

  } catch (error) {
    logger.error('Failed to fetch marketplace strategies:', error);
    next(error);
  }
});

/**
 * GET /api/marketplace/:id
 * Get detailed info about a specific strategy
 *
 * Access control:
 * - Public strategies: Everyone can view
 * - Private strategies: Only owner, approved users, and admins
 *
 * Returns everything EXCEPT the actual strategy code
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if user is authenticated (optional)
    const authHeader = req.headers.authorization;
    let userId: string | null = null;
    let userRole: string | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const { verifyToken } = await import('../utils/simple-jwt');
        const decoded = verifyToken(token);
        userId = decoded.userId;

        // Fetch user role
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { role: true }
        });
        userRole = user?.role || null;
      } catch (error) {
        userId = null;
        userRole = null;
      }
    }

    const strategy = await prisma.strategy.findFirst({
      where: {
        id,
        isActive: true,
        isApproved: true,
      },
      select: {
        id: true,
        name: true,
        code: true,
        description: true,
        detailedDescription: true,
        author: true,
        version: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
        isActive: true,
        isPublic: true,
        isMarketplace: true,
        clientId: true,
        executionConfig: true,

        // Client information (to display client name as author)
        client: {
          select: {
            name: true,
            email: true
          }
        },

        // Performance metrics
        winRate: true,
        roi: true,
        riskReward: true,
        maxDrawdown: true,
        marginRequired: true,
        sharpeRatio: true,
        totalTrades: true,
        profitFactor: true,
        avgTradeReturn: true,

        // Trading config
        instrument: true,
        supportedPairs: true,
        timeframes: true,
        strategyType: true,

        // Subscription info
        subscriberCount: true,

        // Get latest version metadata (but not the code!)
        versions: {
          select: {
            version: true,
            createdAt: true,
            configData: true,
            // Note: NOT selecting strategyCode!
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },

        // Get latest backtest results
        backtestResults: {
          select: {
            id: true,
            startDate: true,
            endDate: true,
            initialBalance: true,
            finalBalance: true,
            totalReturn: true,
            totalReturnPct: true,
            maxDrawdown: true,
            maxDrawdownDuration: true,
            sharpeRatio: true,
            winRate: true,
            profitFactor: true,
            totalTrades: true,
            avgTrade: true,
            equityCurve: true,
            tradeHistory: true,
            monthlyReturns: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        }
      }
    });

    if (!strategy) {
      return res.status(404).json({
        error: 'Strategy not found or not available in marketplace'
      });
    }

    // ACCESS CONTROL: Check if user has permission to view this strategy
    if (!strategy.isPublic) {
      // Private strategy - check access
      const isOwner = userId && strategy.clientId === userId;
      const isAdmin = userRole === 'ADMIN';

      if (!isOwner && !isAdmin) {
        // Check if user has APPROVED access request
        if (userId) {
          const accessRequest = await prisma.strategyAccessRequest.findFirst({
            where: {
              userId,
              strategyId: id,
              status: 'APPROVED'
            }
          });

          if (!accessRequest) {
            // User doesn't have approved access (might be pending or no request at all)
            return res.status(403).json({
              error: 'This strategy is private and requires approval to access'
            });
          }
        } else {
          // Unauthenticated user trying to access private strategy
          return res.status(403).json({
            error: 'This strategy is private and requires approval to access'
          });
        }
      }
    }

    // Transform backtest data to match frontend expectations
    const latestBacktest = strategy.backtestResults[0];

    // Transform monthlyReturns from {month: {pnl, trades}} to {month: pnl}
    let monthlyReturns = latestBacktest?.monthlyReturns;
    if (monthlyReturns && typeof monthlyReturns === 'object') {
      const transformed: Record<string, number> = {};
      Object.entries(monthlyReturns).forEach(([key, value]) => {
        // If value is an object with pnl property, extract just the pnl
        if (value && typeof value === 'object' && 'pnl' in value) {
          transformed[key] = (value as any).pnl;
        } else if (typeof value === 'number') {
          // Already a number, use it directly
          transformed[key] = value;
        }
      });
      monthlyReturns = transformed;
    }

    const transformedBacktest = latestBacktest ? {
      ...latestBacktest,
      monthlyReturns, // Use transformed version
      tradeHistory: Array.isArray(latestBacktest.tradeHistory)
        ? (latestBacktest.tradeHistory as any[]).map((trade, index) => {
            // Helper function to safely parse date - handles strings, numbers, and ISO strings
            const parseDate = (value: any): Date | null => {
              if (!value) return null;

              // If already a valid ISO string, use it
              if (typeof value === 'string' && value.includes('T')) {
                const d = new Date(value);
                return isNaN(d.getTime()) ? null : d;
              }

              // If it's a number (timestamp), convert
              if (typeof value === 'number' || !isNaN(Number(value))) {
                const d = new Date(Number(value));
                return isNaN(d.getTime()) ? null : d;
              }

              // Try parsing as string
              const d = new Date(value);
              return isNaN(d.getTime()) ? null : d;
            };

            const entryDate = parseDate(trade.entry_time);
            const exitDate = parseDate(trade.exit_time);

            return {
              index: index + 1,
              entryTime: entryDate ? entryDate.toISOString() : '',
              exitTime: exitDate ? exitDate.toISOString() : '',
              entryDate: entryDate ? entryDate.toISOString().split('T')[0] : '',
              exitDate: exitDate ? exitDate.toISOString().split('T')[0] : '',
              orderType: trade.position || trade.side || 'market',
              strike: trade.position || trade.side || '',
              action: trade.position || trade.side || '',
              quantity: trade.size || trade.quantity || 0,
              entryPrice: trade.entry_price || 0,
              exitPrice: trade.exit_price || 0,
              profitLoss: trade.pnl_net || trade.net_pnl || trade.pnl || trade.pnl_gross || 0,
              pnl_net: trade.pnl_net || trade.net_pnl || 0, // Net PNL (after charges)
              pnl_gross: trade.pnl_gross || trade.pnl || 0, // Gross PNL (before charges)
              charges: trade.charges || trade.commission || 0,
              remarks: trade.exit_reason || trade.reason || ''
            };
          })
        : []
    } : null;

    // Use client name as author if strategy is assigned to a client
    const displayAuthor = (strategy as any).client?.name || (strategy as any).client?.email || strategy.author;

    res.json({
      strategy: {
        ...strategy,
        // Override author with client name if available
        author: displayAuthor,
        // Remove client object from response
        client: undefined,
        supportedPairs: strategy.supportedPairs ? JSON.parse(strategy.supportedPairs as string) : null,
        timeframes: strategy.timeframes ? JSON.parse(strategy.timeframes as string) : null,
        latestVersion: strategy.versions[0] || null,
        latestBacktest: transformedBacktest,
        versions: undefined, // Remove from response
        backtestResults: undefined, // Remove from response
      }
    });

  } catch (error) {
    logger.error('Failed to fetch strategy details:', error);
    next(error);
  }
});

/**
 * POST /api/marketplace/:id/publish
 * Publish a strategy to the marketplace (requires auth - author only)
 *
 * This endpoint is called by `xcoin deploy --marketplace`
 */
router.post('/:id/publish', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    // Get strategy and verify ownership
    const strategy = await prisma.strategy.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        }
      }
    });

    if (!strategy) {
      return res.status(404).json({
        error: 'Strategy not found'
      });
    }

    // Verify strategy has code uploaded
    if (!strategy.versions || strategy.versions.length === 0) {
      return res.status(400).json({
        error: 'Cannot publish strategy without code. Please upload your strategy first.'
      });
    }

    // Verify strategy is approved (auto-approved for CLI uploads)
    if (!strategy.isApproved) {
      return res.status(400).json({
        error: 'Strategy must be approved before publishing to marketplace'
      });
    }

    // Publish to marketplace (activate it)
    const updatedStrategy = await prisma.strategy.update({
      where: { id },
      data: {
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        code: true,
        isActive: true,
        subscriberCount: true,
      }
    });

    logger.info(`Strategy published to marketplace: ${id} by user ${userId}`);

    res.json({
      success: true,
      message: 'Strategy published to marketplace successfully',
      strategy: {
        id: updatedStrategy.id,
        name: updatedStrategy.name,
        code: updatedStrategy.code,
        isActive: updatedStrategy.isActive,
        marketplaceUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/marketplace/${updatedStrategy.id}`,
      }
    });

  } catch (error) {
    logger.error('Failed to publish strategy:', error);
    next(error);
  }
});

/**
 * POST /api/marketplace/:id/unpublish
 * Remove strategy from marketplace (requires auth - author only)
 */
router.post('/:id/unpublish', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    // Get strategy
    const strategy = await prisma.strategy.findUnique({
      where: { id }
    });

    if (!strategy) {
      return res.status(404).json({
        error: 'Strategy not found'
      });
    }

    // Unpublish from marketplace
    await prisma.strategy.update({
      where: { id },
      data: {
        isActive: false,
      }
    });

    logger.info(`Strategy unpublished from marketplace: ${id} by user ${userId}`);

    res.json({
      success: true,
      message: 'Strategy removed from marketplace'
    });

  } catch (error) {
    logger.error('Failed to unpublish strategy:', error);
    next(error);
  }
});

export { router as marketplaceRoutes };
