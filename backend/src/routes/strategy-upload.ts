/**
 * Strategy Upload Routes - API endpoints for quant researchers to upload strategies
 */

import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { strategyService } from '../services/strategy-service';
import { AuthenticatedRequest } from '../types';
import prisma from '../utils/database';
import { Logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { spawn } from 'child_process';
import { uvEnvManager } from '../services/python-env';

const logger = new Logger('StrategyUpload');
const router = Router();

/**
 * Calculate margin required and currency from config
 * Option A: Use riskProfile from config.json
 */
function calculateMarginFromConfig(config: any): { marginRequired: number | null, marginCurrency: string } {
  let marginRequired: number | null = null;
  let marginCurrency = 'INR'; // Default for spot

  // Determine currency based on pair
  const pair = config.pair || config.instrument || '';
  if (pair.startsWith('B-')) {
    marginCurrency = 'USDT'; // Futures use USDT
  }

  // Calculate margin from riskProfile (Option A)
  if (config.riskProfile) {
    const { recommendedCapital, leverage } = config.riskProfile;

    if (recommendedCapital && leverage && leverage > 0) {
      // For futures: margin = capital / leverage
      // For spot: margin = capital (no leverage)
      if (marginCurrency === 'USDT' && leverage > 1) {
        marginRequired = recommendedCapital / leverage;
      } else {
        marginRequired = recommendedCapital;
      }
    } else if (recommendedCapital) {
      // No leverage specified, use capital as margin
      marginRequired = recommendedCapital;
    }
  }

  return { marginRequired, marginCurrency };
}

/**
 * Execute LiveTrader backtest using Python executor with isolated uv environment
 */
async function executeLiveTraderBacktest(
  strategyCode: string,
  requirementsTxt: string,
  config: any
): Promise<any> {
  return new Promise((resolve, reject) => {
    // Create/get isolated Python environment with uv
    logger.info('Setting up isolated Python environment for backtest...');
    const env = uvEnvManager.ensureEnv(requirementsTxt);
    
    if (!fs.existsSync(env.pythonPath)) {
      logger.error(`Python path not found: ${env.pythonPath}`);
      return reject(new Error('Failed to create Python environment for backtest'));
    }
    
    if (env.created) {
      logger.info(`Created new Python environment: ${env.pythonPath}`);
    } else {
      logger.info(`Using cached Python environment: ${env.pythonPath}`);
    }

    const pythonScript = path.join(__dirname, '../../python/livetrader_backtest_executor.py');
    const pythonProcess = spawn(env.pythonPath, [pythonScript], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      logger.debug(`LiveTrader backtest stderr: ${data.toString()}`);
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        logger.error(`LiveTrader backtest failed with code ${code}`);
        logger.error(`Stderr: ${stderr}`);
        return reject(new Error(`Backtest process exited with code ${code}`));
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (parseError) {
        logger.error('Failed to parse backtest result:', parseError);
        logger.error('Stdout:', stdout);
        reject(new Error('Failed to parse backtest result'));
      }
    });

    pythonProcess.on('error', (error) => {
      logger.error('Failed to start backtest process:', error);
      reject(error);
    });

    // Send input to Python process
    const input = JSON.stringify({
      strategy_code: strategyCode,
      config: config
    });

    pythonProcess.stdin.write(input);
    pythonProcess.stdin.end();

    // Timeout after 5 minutes
    setTimeout(() => {
      pythonProcess.kill();
      reject(new Error('Backtest timeout (5 minutes)'));
    }, 5 * 60 * 1000);
  });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = '/tmp/claude/strategy-uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // Only allow Python files
    if (file.mimetype === 'text/x-python' || file.originalname.endsWith('.py')) {
      cb(null, true);
    } else {
      cb(new Error('Only Python (.py) files are allowed'));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

// Upload strategy file
router.post('/upload', authenticate, upload.single('strategyFile'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const file = req.file;
    const { name, description, config } = req.body;

    if (!file) {
      return res.status(400).json({
        error: 'No strategy file uploaded'
      });
    }

    if (!name || !config) {
      return res.status(400).json({
        error: 'Strategy name and configuration are required'
      });
    }

    // Parse configuration
    let parsedConfig;
    try {
      parsedConfig = JSON.parse(config);
    } catch (error) {
      return res.status(400).json({
        error: 'Invalid configuration JSON'
      });
    }

    // Read strategy file content
    const strategyCode = fs.readFileSync(file.path, 'utf8');

    // Clean up uploaded file
    fs.unlinkSync(file.path);

    // Validate strategy code
    const validationResult = await validateStrategyCode(strategyCode, parsedConfig);
    if (!validationResult.isValid) {
      return res.status(400).json({
        error: 'Strategy validation failed',
        details: validationResult.errors
      });
    }

    // Store strategy code in a version (start as non-marketplace until backtest succeeds)
    const strategy = await prisma.strategy.create({
      data: {
        name,
        code: parsedConfig.code || generateStrategyCode(name),
        description: description || '',
        detailedDescription: parsedConfig.detailedDescription || '',
        author: parsedConfig.author || 'Unknown',
        version: '1.0.0',
        instrument: parsedConfig.pair || 'B-BTC_USDT',
        tags: Array.isArray(parsedConfig.tags) ? parsedConfig.tags.join(',') : (parsedConfig.tags || ''),
        validationStatus: validationResult.isValid ? 'VALID' : 'INVALID',
        validationErrors: validationResult.errors?.join(', '),
        lastValidatedAt: new Date(),
        isActive: false,
        isApproved: false,
        isMarketplace: false,
        winRate: parsedConfig.winRate,
        riskReward: parsedConfig.riskReward,
        maxDrawdown: parsedConfig.maxDrawdown,
        roi: parsedConfig.roi,
        marginRequired: parsedConfig.marginRequired,
        supportedPairs: parsedConfig.supportedPairs ? JSON.stringify(parsedConfig.supportedPairs) : null,
        timeframes: parsedConfig.timeframes ? JSON.stringify(parsedConfig.timeframes) : null,
        strategyType: parsedConfig.strategyType,
        versions: {
          create: {
            version: '1.0.0',
            strategyCode,
            configData: parsedConfig,
            isValidated: validationResult.isValid,
            validationErrors: validationResult.errors?.join(', ')
          }
        }
      }
    });

    logger.info(`Strategy uploaded: ${strategy.id} by user ${userId}`);

    // Auto-trigger backtest after successful upload; only list on success
    let backtestMetrics = null;
    try {
      logger.info(`Auto-triggering backtest for strategy ${strategy.id}`);

      // Import backtest engine
      const { backtestEngine } = await import('../services/backtest-engine');

      // Get execution config from parsed config
      const executionConfig = parsedConfig.executionConfig || {};
      const symbol = executionConfig.symbol || parsedConfig.pair || parsedConfig.pairs?.[0];
      const resolution = executionConfig.resolution || parsedConfig.timeframes?.[0] || '5';

      if (!symbol) {
        logger.warn(`Cannot run auto-backtest: no symbol found in config`);
      } else {
        // Calculate backtest period (last 1 year)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 365);

        // Map resolution to backtest format
        const resolutionMap: Record<string, string> = {
          '1': '1m', '5': '5m', '15': '15m', '30': '30m',
          '60': '1h', '120': '2h', '240': '4h', '1D': '1d'
        };
        const mappedResolution = resolutionMap[resolution] || `${resolution}m`;

        // Run backtest
        const backtestResult = await backtestEngine.runBacktest({
          strategyId: strategy.id,
          symbol,
          resolution: mappedResolution as any,
          startDate,
          endDate,
          initialCapital: 10000,
          riskPerTrade: 0.01,
          leverage: parsedConfig.riskProfile?.leverage || 10,
          commission: 0.001,
        });

        // Update strategy metrics and mark as marketplace-visible
        await prisma.strategy.update({
          where: { id: strategy.id },
          data: {
            winRate: backtestResult.metrics.winRate,
            riskReward: backtestResult.metrics.profitFactor,
            maxDrawdown: backtestResult.metrics.maxDrawdownPct,
            roi: backtestResult.metrics.totalPnlPct,
            isMarketplace: true,
            isPublic: true,
            isApproved: true,
            isActive: true,
          },
        });

        backtestMetrics = {
          winRate: backtestResult.metrics.winRate,
          profitFactor: backtestResult.metrics.profitFactor,
          maxDrawdown: backtestResult.metrics.maxDrawdownPct,
          roi: backtestResult.metrics.totalPnlPct,
          totalTrades: backtestResult.metrics.totalTrades,
        };

        logger.info(`Auto-backtest completed for strategy ${strategy.id}: ` +
          `Win Rate ${backtestMetrics.winRate.toFixed(1)}%, ` +
          `ROI ${backtestMetrics.roi.toFixed(2)}%`);
      }
    } catch (backtestError) {
      logger.error('Auto-backtest failed (non-fatal):', backtestError);
      // Don't fail the upload; remain non-marketplace and include failure in response
    }

    res.json({
      success: true,
      strategy: {
        id: strategy.id,
        name: strategy.name,
        code: strategy.code,
        description: strategy.description,
        author: strategy.author,
        version: strategy.version,
        createdAt: strategy.createdAt,
      },
      validation: validationResult,
      backtest: backtestMetrics,
      visibility: {
        marketplace: !!(backtestMetrics),
        processing: !backtestMetrics
      }
    });

  } catch (error) {
    logger.error('Strategy upload failed:', error);

    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    if (error instanceof Error) {
      return res.status(500).json({
        error: 'Strategy upload failed',
        message: error.message
      });
    }

    next(error);
  }
});

// Get all active strategies (public marketplace)
router.get('/strategies', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { page = 1, limit = 10, search, status, all } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    // Build filter conditions
    const whereConditions: any = {};

    if (search) {
      whereConditions.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { code: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    // by default, only show active strategies (unless 'all' param is true)
    if (status) {
      whereConditions.isActive = status === 'active';
    } else if (!all || all === 'false') {
      // default: only active strategies
      whereConditions.isActive = true;
    }
    // if all=true, show both active and inactive

    const [strategies, total] = await Promise.all([
      prisma.strategy.findMany({
        where: whereConditions,
        select: {
          id: true,
          name: true,
          code: true,
          description: true,
          author: true,
          version: true,
          isActive: true,
          tags: true,
          instrument: true,
          createdAt: true,
          updatedAt: true,

          // Performance metrics
          winRate: true,
          roi: true,
          riskReward: true,
          maxDrawdown: true,
          sharpeRatio: true,
          totalTrades: true,
          profitFactor: true,
          marginRequired: true,

          // Trading config (JSON fields)
          supportedPairs: true,
          timeframes: true,

          // Deployments
          botDeployments: {
            select: {
              id: true,
              status: true,
              deployedAt: true,
            },
            orderBy: { deployedAt: 'desc' },
            take: 1,
          },

          // Latest backtest results
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
              sharpeRatio: true,
              winRate: true,
              profitFactor: true,
              totalTrades: true,
              avgTrade: true,
              equityCurve: true,
              tradeHistory: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.strategy.count({ where: whereConditions })
    ]);

    res.json({
      strategies: strategies.map(strategy => {
        // Parse JSON fields
        const supportedPairs = strategy.supportedPairs ? JSON.parse(strategy.supportedPairs as string) : null;
        const timeframes = strategy.timeframes ? JSON.parse(strategy.timeframes as string) : null;

        // Count active deployments
        const deploymentCount = strategy.botDeployments.filter(d =>
          ['ACTIVE', 'DEPLOYING', 'STARTING'].includes(d.status)
        ).length;

        return {
          ...strategy,
          // Parse JSON fields
          supportedPairs,
          timeframes,
          // Add computed fields
          deploymentCount,
          subscriberCount: 0, // TODO: Implement subscription count
          latestDeployment: strategy.botDeployments[0] || null,
          latestBacktest: strategy.backtestResults[0] || null,
          // Add features object for frontend compatibility
          features: timeframes ? {
            timeframes: timeframes,
            leverage: 10, // Default leverage, should be extracted from config if available
          } : undefined,
          // Remove internal arrays from response
          botDeployments: undefined,
          backtestResults: undefined,
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
    logger.error('Failed to get user strategies:', error);
    next(error);
  }
});

// Get specific strategy details
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const strategyId = req.params.id;

    const strategy = await prisma.strategy.findFirst({
      where: { id: strategyId },
      include: {
        botDeployments: {
          orderBy: { deployedAt: 'desc' },
          take: 5,
        },
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
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
        error: 'Strategy not found'
      });
    }

    // Format response with latestBacktest
    const formattedStrategy = {
      ...strategy,
      latestBacktest: strategy.backtestResults?.[0] || null,
      backtestResults: undefined, // Remove array from response
    };

    res.json({ strategy: formattedStrategy });

  } catch (error) {
    logger.error('Failed to get strategy details:', error);
    next(error);
  }
});

// Update strategy
router.put('/:id', authenticate, upload.single('strategyFile'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const strategyId = req.params.id;
    const { name, description, config } = req.body;
    const file = req.file;

    // Check if strategy exists
    const existingStrategy = await prisma.strategy.findFirst({
      where: { id: strategyId },
      include: {
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        }
      }
    });

    if (!existingStrategy) {
      return res.status(404).json({
        error: 'Strategy not found'
      });
    }

    const updateData: any = {};

    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;

    let parsedConfig: any = null;
    if (config) {
      try {
        parsedConfig = JSON.parse(config);
      } catch (error) {
        return res.status(400).json({
          error: 'Invalid configuration JSON'
        });
      }
    }

    if (file) {
      // Read new strategy code
      const strategyCode = fs.readFileSync(file.path, 'utf8');
      fs.unlinkSync(file.path); // Clean up

      // Get current config from latest version
      const currentConfig = existingStrategy.versions[0]?.configData || {};

      // Validate new code
      const validationResult = await validateStrategyCode(
        strategyCode,
        parsedConfig || currentConfig
      );

      if (!validationResult.isValid) {
        return res.status(400).json({
          error: 'Strategy validation failed',
          details: validationResult.errors
        });
      }

      // Create new version
      const newVersion = incrementVersion(existingStrategy.version);
      updateData.version = newVersion;

      // We'll create the version separately after updating strategy
      updateData.newStrategyCode = strategyCode;
      updateData.newConfigData = parsedConfig || currentConfig;
    }

    // Extract temporary fields
    const newStrategyCode = updateData.newStrategyCode;
    const newConfigData = updateData.newConfigData;
    delete updateData.newStrategyCode;
    delete updateData.newConfigData;

    // Update strategy
    const updatedStrategy = await prisma.strategy.update({
      where: { id: strategyId },
      data: updateData
    });

    // Create new version if we have new code
    if (newStrategyCode) {
      await prisma.strategyVersion.create({
        data: {
          strategyId: updatedStrategy.id,
          version: updatedStrategy.version,
          strategyCode: newStrategyCode,
          configData: newConfigData,
          isValidated: true,
        }
      });
    }

    logger.info(`Strategy updated: ${strategyId} by user ${userId}`);

    res.json({
      success: true,
      strategy: {
        id: updatedStrategy.id,
        name: updatedStrategy.name,
        code: updatedStrategy.code,
        description: updatedStrategy.description,
        version: updatedStrategy.version,
        updatedAt: updatedStrategy.updatedAt,
      }
    });

  } catch (error) {
    logger.error('Strategy update failed:', error);

    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    next(error);
  }
});

// Delete strategy
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const strategyId = req.params.id;

    // Check if strategy has active deployments
    const activeDeployments = await prisma.botDeployment.findMany({
      where: {
        strategyId,
        status: {
          in: ['ACTIVE', 'DEPLOYING', 'STARTING']
        }
      }
    });

    if (activeDeployments.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete strategy with active deployments. Please stop all deployments first.'
      });
    }

    // Hard delete (permanently remove strategy and cascade delete related records)
    await prisma.strategy.delete({
      where: { id: strategyId }
    });

    logger.info(`Strategy permanently deleted: ${strategyId} by user ${userId}`);

    res.json({
      success: true,
      message: 'Strategy deleted successfully'
    });

  } catch (error) {
    logger.error('Strategy deletion failed:', error);
    next(error);
  }
});

// Soft delete (deactivate) strategy
router.patch('/:id/deactivate', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const strategyId = req.params.id;

    // check if strategy exists
    const strategy = await prisma.strategy.findUnique({
      where: { id: strategyId }
    });

    if (!strategy) {
      return res.status(404).json({
        error: 'Strategy not found'
      });
    }

    // soft delete: just set isActive to false
    await prisma.strategy.update({
      where: { id: strategyId },
      data: { isActive: false }
    });

    logger.info(`Strategy soft deleted: ${strategyId} by user ${userId}`);

    res.json({
      success: true,
      message: 'Strategy deactivated successfully (can be restored later)'
    });

  } catch (error) {
    logger.error('Strategy deactivation failed:', error);
    next(error);
  }
});

// Restore (activate) strategy
router.patch('/:id/activate', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const strategyId = req.params.id;

    // check if strategy exists
    const strategy = await prisma.strategy.findUnique({
      where: { id: strategyId }
    });

    if (!strategy) {
      return res.status(404).json({
        error: 'Strategy not found'
      });
    }

    // restore: set isActive back to true
    await prisma.strategy.update({
      where: { id: strategyId },
      data: { isActive: true }
    });

    logger.info(`Strategy restored: ${strategyId} by user ${userId}`);

    res.json({
      success: true,
      message: 'Strategy activated successfully'
    });

  } catch (error) {
    logger.error('Strategy activation failed:', error);
    next(error);
  }
});

// CLI-friendly upload: accepts JSON payload with file contents (no multipart)
router.post('/cli-upload', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { strategyCode, config, requirements, name, description } = req.body;

    if (!strategyCode || !config) {
      return res.status(400).json({
        error: 'Strategy code and config are required'
      });
    }

    // Parse configuration
    let parsedConfig;
    try {
      parsedConfig = typeof config === 'string' ? JSON.parse(config) : config;
    } catch (error) {
      return res.status(400).json({
        error: 'Invalid configuration JSON'
      });
    }

    // Use name from payload or config
    const strategyName = name || parsedConfig.name || 'Unnamed Strategy';

    // Validate strategy code
    const validationResult = await validateStrategyCode(strategyCode, parsedConfig);
    if (!validationResult.isValid) {
      return res.status(400).json({
        error: 'Strategy validation failed',
        details: validationResult.errors
      });
    }

    // Check if strategy with same code already exists (for updates)
    const existingStrategy = await prisma.strategy.findFirst({
      where: {
        code: parsedConfig.code || generateStrategyCode(strategyName)
      }
    });

    let strategy;

    if (existingStrategy) {
      // Update existing strategy with new version
      const newVersion = incrementVersion(existingStrategy.version);

      // Recalculate margin from updated config (Option A)
      const { marginRequired, marginCurrency } = calculateMarginFromConfig(parsedConfig);

      strategy = await prisma.strategy.update({
        where: { id: existingStrategy.id },
        data: {
          version: newVersion,
          description: description || parsedConfig.description || existingStrategy.description,
          marginRequired: marginRequired,
          marginCurrency: marginCurrency,
          validationStatus: validationResult.isValid ? 'VALID' : 'INVALID',
          validationErrors: validationResult.errors?.join(', '),
          lastValidatedAt: new Date(),
          versions: {
            create: {
              version: newVersion,
              strategyCode,
              configData: parsedConfig,
              requirements: requirements || null,
              isValidated: validationResult.isValid,
              validationErrors: validationResult.errors?.join(', ')
            }
          }
        },
        include: {
          versions: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      logger.info(`Strategy updated via CLI: ${strategy.id} (v${newVersion}) by user ${userId}`);
    } else {
      // Calculate margin from config (Option A)
      const { marginRequired, marginCurrency } = calculateMarginFromConfig(parsedConfig);

      // Create new strategy (do NOT publish to marketplace until backtest succeeds)
      strategy = await prisma.strategy.create({
        data: {
          name: strategyName,
          code: parsedConfig.code || generateStrategyCode(strategyName),
          description: description || parsedConfig.description || '',
          detailedDescription: parsedConfig.detailedDescription || '',
          author: parsedConfig.author || 'Unknown',
          version: '1.0.0',
          instrument: parsedConfig.pair || 'B-BTC_USDT',
          tags: Array.isArray(parsedConfig.tags) ? parsedConfig.tags.join(',') : (parsedConfig.tags || ''),
          validationStatus: validationResult.isValid ? 'VALID' : 'INVALID',
          validationErrors: validationResult.errors?.join(', '),
          lastValidatedAt: new Date(),
          // Gate visibility until backtest completes
          isActive: false,
          isApproved: false,
          isMarketplace: false,
          winRate: parsedConfig.winRate,
          riskReward: parsedConfig.riskReward,
          maxDrawdown: parsedConfig.maxDrawdown,
          roi: parsedConfig.roi,
          marginRequired: marginRequired,
          marginCurrency: marginCurrency,
          supportedPairs: parsedConfig.supportedPairs ? JSON.stringify(parsedConfig.supportedPairs) : null,
          timeframes: parsedConfig.timeframes ? JSON.stringify(parsedConfig.timeframes) : null,
          strategyType: parsedConfig.strategyType,
          versions: {
            create: {
              version: '1.0.0',
              strategyCode,
              configData: parsedConfig,
              requirements: requirements || null,
              isValidated: validationResult.isValid,
              validationErrors: validationResult.errors?.join(', ')
            }
          }
        },
        include: {
          versions: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      logger.info(`New strategy created via CLI: ${strategy.id} by user ${userId}`);
    }

    // Auto-trigger backtest after successful upload
    let backtestMetrics = null;
    let backtestError: string | null = null;

    // LiveTrader strategies are self-contained and have their own backtest() method
    if (parsedConfig.strategyType === 'livetrader') {
      logger.info(`LiveTrader strategy detected - running backtest via LiveTrader.backtest() method`);
      try {
        // Get requirements.txt content (required for uv environment)
        const requirementsTxt = requirements || 'pandas>=2.0.0\nnumpy>=1.24.0\npandas-ta>=0.3.14b\nrequests>=2.31.0';
        
        // Execute LiveTrader backtest in isolated uv environment
        const pair = parsedConfig.executionConfig?.symbol || parsedConfig.pair || parsedConfig.pairs?.[0];
        const resolution = parsedConfig.resolution || parsedConfig.timeframes?.[0] || '5';
        
        const backtestResult = await executeLiveTraderBacktest(
          strategyCode, 
          requirementsTxt,
          {
            pair: pair,
            resolution: resolution,
            symbol: pair, // for backwards compatibility
            leverage: parsedConfig.riskProfile?.defaultLeverage || 10,
            capital: parsedConfig.riskProfile?.defaultCapital || 10000,
            risk_per_trade: parsedConfig.riskProfile?.defaultRiskPerTrade || 0.02,
            api_key: 'BACKTEST_MODE',
            api_secret: 'BACKTEST_MODE'
          }
        );

        if (!backtestResult.success) {
          throw new Error(backtestResult.error || 'Backtest failed');
        }

        // Update strategy metrics and publish to marketplace
        await prisma.strategy.update({
          where: { id: strategy.id },
          data: {
            winRate: backtestResult.winRate,
            riskReward: backtestResult.profitFactor,
            maxDrawdown: backtestResult.maxDrawdown,
            roi: backtestResult.roi,
            isActive: true,
            isApproved: true,
            isMarketplace: true,
          },
        });

        backtestMetrics = {
          winRate: backtestResult.winRate,
          profitFactor: backtestResult.profitFactor,
          maxDrawdown: backtestResult.maxDrawdown,
          roi: backtestResult.roi,
          totalTrades: backtestResult.totalTrades,
        };

        logger.info(`LiveTrader backtest completed for strategy ${strategy.id}: ` +
          `Win Rate ${backtestMetrics.winRate.toFixed(1)}%, ` +
          `ROI ${backtestMetrics.roi.toFixed(2)}%`);
      } catch (err) {
        logger.error('LiveTrader backtest failed (non-fatal):', err);
        backtestError = err instanceof Error ? err.message : String(err);
        // Keep strategy hidden (isActive=false) so marketplace doesn't show N/A cards
      }
    } else {
      // Old BaseStrategy format - run auto-backtest
      try {
        logger.info(`Auto-triggering backtest for strategy ${strategy.id}`);

        // Import backtest engine
        const { backtestEngine } = await import('../services/backtest-engine');

        // Get execution config from parsed config
        const executionConfig = parsedConfig.executionConfig || {};
        const symbol = executionConfig.symbol || parsedConfig.pair || parsedConfig.pairs?.[0];
        const resolution = executionConfig.resolution || parsedConfig.timeframes?.[0] || '5';

        if (!symbol) {
          logger.warn(`Cannot run auto-backtest: no symbol found in config`);
        } else {
        // Calculate backtest period (last 1 year)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 365);

        // Map resolution to backtest format
        const resolutionMap: Record<string, string> = {
          '1': '1m', '5': '5m', '15': '15m', '30': '30m',
          '60': '1h', '120': '2h', '240': '4h', '1D': '1d'
        };
        const mappedResolution = resolutionMap[resolution] || `${resolution}m`;

        // Run backtest
        const backtestResult = await backtestEngine.runBacktest({
          strategyId: strategy.id,
          symbol,
          resolution: mappedResolution as any,
          startDate,
          endDate,
          initialCapital: 10000,
          riskPerTrade: 0.01,
          leverage: parsedConfig.riskProfile?.leverage || 10,
          commission: 0.001,
        });

        // Update strategy metrics and publish to marketplace
        await prisma.strategy.update({
          where: { id: strategy.id },
          data: {
            winRate: backtestResult.metrics.winRate,
            riskReward: backtestResult.metrics.profitFactor,
            maxDrawdown: backtestResult.metrics.maxDrawdownPct,
            roi: backtestResult.metrics.totalPnlPct,
            isActive: true,
            isApproved: true,
            isMarketplace: true,
          },
        });

        backtestMetrics = {
          winRate: backtestResult.metrics.winRate,
          profitFactor: backtestResult.metrics.profitFactor,
          maxDrawdown: backtestResult.metrics.maxDrawdownPct,
          roi: backtestResult.metrics.totalPnlPct,
          totalTrades: backtestResult.metrics.totalTrades,
        };

        logger.info(`Auto-backtest completed for strategy ${strategy.id}: ` +
          `Win Rate ${backtestMetrics.winRate.toFixed(1)}%, ` +
          `ROI ${backtestMetrics.roi.toFixed(2)}%`);
      }
      } catch (err) {
        logger.error('Auto-backtest failed (non-fatal):', err);
        backtestError = err instanceof Error ? err.message : String(err);
        // Keep strategy hidden (isActive=false) so marketplace doesn't show N/A cards
      }
    } // End else block for BaseStrategy auto-backtest

    res.json({
      success: true,
      strategy: {
        id: strategy.id,
        name: strategy.name,
        code: strategy.code,
        description: strategy.description,
        author: strategy.author,
        version: strategy.version,
        createdAt: strategy.createdAt,
        updatedAt: strategy.updatedAt,
        isNew: !existingStrategy,
      },
      validation: validationResult,
      backtest: backtestMetrics,
      backtestStatus: backtestError ? 'FAILED' : (backtestMetrics ? 'DONE' : 'PROCESSING'),
      backtestError,
      visibility: {
        marketplace: !!backtestMetrics,
        processing: !backtestMetrics && !backtestError,
        failed: !!backtestError
      }
    });

  } catch (error) {
    logger.error('CLI strategy upload failed:', error);

    if (error instanceof Error) {
      return res.status(500).json({
        error: 'Strategy upload failed',
        message: error.message
      });
    }

    next(error);
  }
});

// Upload backtest results from CLI
router.post('/:id/backtest-results', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const strategyId = req.params.id;
    const {
      startDate,
      endDate,
      initialBalance,
      finalBalance,
      totalReturn,
      totalReturnPct,
      maxDrawdown,
      sharpeRatio,
      winRate,
      profitFactor,
      totalTrades,
      avgTrade,
      equityCurve,
      tradeHistory,
      timeframe,
    } = req.body;

    // Validate required fields
    if (!startDate || !endDate || !initialBalance || !finalBalance) {
      return res.status(400).json({
        error: 'Missing required backtest parameters',
        required: ['startDate', 'endDate', 'initialBalance', 'finalBalance']
      });
    }

    // Check if strategy exists
    const strategy = await prisma.strategy.findUnique({
      where: { id: strategyId }
    });

    if (!strategy) {
      return res.status(404).json({
        error: 'Strategy not found'
      });
    }

    // Create backtest result
    const backtestResult = await prisma.backtestResult.create({
      data: {
        strategyId,
        version: strategy.version,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        initialBalance,
        finalBalance,
        totalReturn: totalReturn || (finalBalance - initialBalance),
        totalReturnPct: totalReturnPct || ((finalBalance - initialBalance) / initialBalance * 100),
        maxDrawdown: maxDrawdown || 0,
        sharpeRatio: sharpeRatio || 0,
        winRate: winRate || 0,
        profitFactor: profitFactor || 0,
        totalTrades: totalTrades || 0,
        avgTrade: avgTrade || 0,
        timeframe: timeframe || '1d',
        equityCurve: equityCurve || {},
        tradeHistory: tradeHistory || [],
        monthlyReturns: {},
        backtestDuration: 0,
      }
    });

    // Calculate risk/reward ratio
    const riskReward = avgTrade && maxDrawdown ? Math.abs(avgTrade / maxDrawdown) : 0;

    // Update strategy with latest metrics
    await prisma.strategy.update({
      where: { id: strategyId },
      data: {
        winRate,
        roi: totalReturnPct,
        maxDrawdown,
        sharpeRatio,
        profitFactor,
        totalTrades,
        riskReward,
        avgTradeReturn: avgTrade,
        updatedAt: new Date(),
      }
    });

    logger.info(`Backtest results uploaded for strategy ${strategyId} by user ${userId}`);

    res.json({
      success: true,
      message: 'Backtest results uploaded successfully',
      backtestResult: {
        id: backtestResult.id,
        winRate,
        roi: totalReturnPct,
        maxDrawdown,
        sharpeRatio,
        profitFactor,
        totalTrades,
      }
    });

  } catch (error) {
    logger.error('Backtest results upload failed:', error);
    next(error);
  }
});

// Deploy strategy
router.post('/:id/deploy', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const strategyId = req.params.id;
    const { auto_start = true } = req.body;

    // Get strategy with latest version
    const strategy = await prisma.strategy.findFirst({
      where: { id: strategyId, isApproved: true },
      include: {
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        }
      }
    });

    if (!strategy) {
      return res.status(404).json({
        error: 'Strategy not found or not approved'
      });
    }

    if (!strategy.versions || strategy.versions.length === 0) {
      return res.status(400).json({
        error: 'Strategy has no uploaded code'
      });
    }

    const latestVersion = strategy.versions[0];

    // Deploy using existing deployment service
    const deploymentRequest = {
      user_id: userId,
      strategy_code: latestVersion.strategyCode,
      config: latestVersion.configData as any,
      auto_start,
      environment: 'production',
    };

    const deploymentResult = await strategyService.deployStrategy(deploymentRequest);

    if (!deploymentResult.success) {
      return res.status(400).json({
        error: deploymentResult.message,
        details: deploymentResult.error_details,
      });
    }

    // Record deployment in database
    const deployment = await prisma.botDeployment.create({
      data: {
        userId,
        strategyId: strategy.id,
        status: 'DEPLOYING',
        leverage: (latestVersion.configData as any)?.leverage || 10,
        riskPerTrade: (latestVersion.configData as any)?.risk_per_trade || 0.01,
        marginCurrency: 'USDT',
      },
    });

    res.json({
      success: true,
      deployment: {
        id: deployment.id,
        strategyInstanceId: deploymentResult.strategy_id,
        status: deploymentResult.status,
        message: deploymentResult.message,
      },
    });

  } catch (error) {
    logger.error('Strategy deployment failed:', error);
    next(error);
  }
});

// Helper functions
async function validateStrategyCode(code: string, config: any) {
  try {
    // Basic validation checks
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if this is LiveTrader format
    const isLiveTrader = config.strategyType === 'livetrader' || code.includes('class LiveTrader');

    if (isLiveTrader) {
      // LiveTrader format validation
      if (!code.includes('class LiveTrader')) {
        errors.push('LiveTrader strategy must contain a LiveTrader class');
      }

      if (!code.includes('def check_for_new_signal')) {
        errors.push('LiveTrader must implement check_for_new_signal method');
      }

      // LiveTrader is allowed to use os, sys, requests, etc. - it's fully self-contained
      // No security warnings for LiveTrader format

    } else {
      // Old BaseStrategy format validation
      if (!code.includes('class ') || !code.includes('BaseStrategy')) {
        errors.push('Strategy must contain a class that inherits from BaseStrategy');
      }

      // Check for required methods
      if (!code.includes('def generate_signals')) {
        errors.push('Strategy must implement generate_signals method');
      }

      // Check for potential security issues (only for old format)
      const dangerousPatterns = [
        'import os',
        'import subprocess',
        'import sys',
        'eval(',
        'exec(',
        '__import__',
        'open(',
        'file(',
      ];

      for (const pattern of dangerousPatterns) {
        if (code.includes(pattern)) {
          warnings.push(`Potentially dangerous pattern detected: ${pattern}`);
        }
      }
    }

    // Validate configuration
    const requiredConfigFields = ['name', 'code', 'author'];
    for (const field of requiredConfigFields) {
      if (!config[field]) {
        errors.push(`Missing required configuration field: ${field}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      estimatedMemory: Math.max(50, code.length / 1000), // Rough estimate
      estimatedCpu: 5.0, // Default estimate
    };

  } catch (error) {
    return {
      isValid: false,
      errors: [`Validation error: ${error}`],
      warnings: [],
    };
  }
}

function generateStrategyCode(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_V1';
}

function incrementVersion(currentVersion: string): string {
  const parts = currentVersion.split('.');
  const patch = parseInt(parts[2] || '0') + 1;
  return `${parts[0]}.${parts[1]}.${patch}`;
}

export { router as strategyUploadRoutes };
