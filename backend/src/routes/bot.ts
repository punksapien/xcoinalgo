import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import prisma from '../utils/database';
import { strategyExecutor } from '../services/strategyExecutor';
import { AuthenticatedRequest } from '../types';
import { BotStatus } from '@prisma/client';

const router = Router();

// Deploy and start a bot
router.post('/start', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { strategyId, leverage = 10, riskPerTrade = 0.005, marginCurrency = 'USDT', executionInterval = 300 } = req.body;
    const userId = req.userId!;

    if (!strategyId) {
      return res.status(400).json({
        error: 'Strategy ID is required'
      });
    }

    // Validate strategy exists
    const strategy = await prisma.strategy.findUnique({
      where: { id: strategyId }
    });

    if (!strategy || !strategy.isActive) {
      return res.status(404).json({
        error: 'Strategy not found or not active'
      });
    }

    // Check if user has broker credentials
    const brokerCredential = await prisma.brokerCredential.findUnique({
      where: {
        userId_brokerName: {
          userId,
          brokerName: 'coindcx'
        }
      }
    });

    if (!brokerCredential || !brokerCredential.isActive) {
      return res.status(400).json({
        error: 'CoinDCX credentials not found. Please set up your broker connection first.'
      });
    }

    // Check if user already has this strategy deployed
    const existingDeployment = await prisma.botDeployment.findUnique({
      where: {
        userId_strategyId: {
          userId,
          strategyId
        }
      }
    });

    if (existingDeployment && existingDeployment.status !== BotStatus.STOPPED) {
      return res.status(400).json({
        error: 'You already have this strategy deployed. Stop the existing deployment first.'
      });
    }

    // Create or update bot deployment
    const deployment = await prisma.botDeployment.upsert({
      where: {
        userId_strategyId: {
          userId,
          strategyId
        }
      },
      update: {
        status: BotStatus.DEPLOYING,
        leverage,
        riskPerTrade,
        marginCurrency,
        executionInterval,
        deployedAt: new Date(),
        errorMessage: null
      },
      create: {
        userId,
        strategyId,
        status: BotStatus.DEPLOYING,
        leverage,
        riskPerTrade,
        marginCurrency,
        executionInterval
      },
      include: {
        strategy: {
          select: {
            name: true,
            code: true
          }
        }
      }
    });

    // Update strategy deployment count
    await prisma.strategy.update({
      where: { id: strategyId },
      data: {
        deploymentCount: { increment: 1 }
      }
    });

    // Start the bot via strategy executor
    try {
      const result = await strategyExecutor.deployStrategy(deployment.id);

      res.json({
        message: 'Bot started successfully',
        deployment: {
          id: deployment.id,
          strategyName: deployment.strategy.name,
          strategyCode: deployment.strategy.code,
          status: BotStatus.ACTIVE,
          strategyId: result.strategy_id,
          executionInterval,
          deployedAt: deployment.deployedAt
        }
      });
    } catch (deployError) {
      // If deployment fails, update deployment status
      await prisma.botDeployment.update({
        where: { id: deployment.id },
        data: {
          status: BotStatus.ERROR,
          errorMessage: deployError instanceof Error ? deployError.message : 'Deployment failed'
        }
      });

      return res.status(500).json({
        error: 'Failed to start bot',
        details: deployError instanceof Error ? deployError.message : 'Unknown error'
      });
    }
  } catch (error) {
    next(error);
  }
});

// Stop a bot
router.post('/stop', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { deploymentId } = req.body;
    const userId = req.userId!;

    if (!deploymentId) {
      return res.status(400).json({
        error: 'Deployment ID is required'
      });
    }

    // Find deployment
    const deployment = await prisma.botDeployment.findFirst({
      where: {
        id: deploymentId,
        userId
      },
      include: {
        strategy: {
          select: {
            name: true,
            code: true
          }
        }
      }
    });

    if (!deployment) {
      return res.status(404).json({
        error: 'Bot deployment not found'
      });
    }

    if (deployment.status === BotStatus.STOPPED) {
      return res.status(400).json({
        error: 'Bot is already stopped'
      });
    }

    // Stop the bot via strategy executor
    try {
      await strategyExecutor.stopStrategy(deployment.id);

      res.json({
        message: 'Bot stopped successfully',
        deployment: {
          id: deployment.id,
          strategyName: deployment.strategy.name,
          strategyCode: deployment.strategy.code,
          status: BotStatus.STOPPED,
          stoppedAt: new Date()
        }
      });
    } catch (stopError) {
      return res.status(500).json({
        error: 'Failed to stop bot',
        details: stopError instanceof Error ? stopError.message : 'Unknown error'
      });
    }
  } catch (error) {
    next(error);
  }
});

// Get user's bot deployments
router.get('/deployments', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { status, page = 1, limit = 10 } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const whereConditions: any = { userId };

    if (status) {
      whereConditions.status = status;
    }

    const deployments = await prisma.botDeployment.findMany({
      where: whereConditions,
      include: {
        strategy: {
          select: {
            name: true,
            code: true,
            author: true,
            instrument: true
          }
        }
      },
      orderBy: {
        deployedAt: 'desc'
      },
      skip,
      take: Number(limit)
    });

    // Get execution stats for active deployments
    const deploymentsWithStats = await Promise.all(
      deployments.map(async (deployment) => {
        let executionStats = null;
        if (deployment.status === BotStatus.ACTIVE || deployment.status === BotStatus.STARTING) {
          executionStats = await strategyExecutor.getStrategyStatus(deployment.id);
        }

        return {
          ...deployment,
          executionStats
        };
      })
    );

    const total = await prisma.botDeployment.count({
      where: whereConditions
    });

    res.json({
      deployments: deploymentsWithStats,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get specific deployment status
router.get('/deployments/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    const deployment = await prisma.botDeployment.findFirst({
      where: {
        id,
        userId
      },
      include: {
        strategy: true
      }
    });

    if (!deployment) {
      return res.status(404).json({
        error: 'Bot deployment not found'
      });
    }

    // Get execution stats if active
    let executionStats = null;
    if (deployment.status === BotStatus.ACTIVE || deployment.status === BotStatus.STARTING) {
      executionStats = await strategyExecutor.getStrategyStatus(deployment.id);
    }

    res.json({
      deployment: {
        ...deployment,
        executionStats
      }
    });
  } catch (error) {
    next(error);
  }
});

// Delete a deployment
router.delete('/deployments/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    const deployment = await prisma.botDeployment.findFirst({
      where: {
        id,
        userId
      }
    });

    if (!deployment) {
      return res.status(404).json({
        error: 'Bot deployment not found'
      });
    }

    // Can't delete active deployments
    if (deployment.status !== BotStatus.STOPPED && deployment.status !== BotStatus.ERROR) {
      return res.status(400).json({
        error: 'Cannot delete active deployment. Stop the bot first.'
      });
    }

    // Delete the deployment
    await prisma.botDeployment.delete({
      where: { id }
    });

    res.json({
      message: 'Bot deployment deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Heartbeat endpoint for bots to report status
router.post('/heartbeat', async (req, res) => {
  try {
    const { deploymentId, status, metadata } = req.body;

    if (!deploymentId) {
      return res.status(400).json({
        error: 'Deployment ID is required'
      });
    }

    // Update heartbeat
    await prisma.botDeployment.update({
      where: { id: deploymentId },
      data: {
        lastHeartbeat: new Date(),
        ...(status && { status })
      }
    });

    // Log if metadata provided
    if (metadata) {
      await prisma.processLog.create({
        data: {
          botDeploymentId: deploymentId,
          level: 'INFO',
          message: 'Heartbeat received',
          metadata
        }
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Heartbeat error:', error);
    res.status(500).json({
      error: 'Failed to process heartbeat'
    });
  }
});

export { router as botRoutes };