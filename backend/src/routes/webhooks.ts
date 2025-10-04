import { Router } from 'express';
import crypto from 'crypto';
import prisma from '../utils/database';
import { gitIntegrationService } from '../services/git-integration';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Verify GitHub webhook signature
 */
function verifyGitHubSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signature)
  );
}

/**
 * Verify GitLab webhook token
 */
function verifyGitLabToken(providedToken: string, expectedToken: string): boolean {
  return crypto.timingSafeEqual(
    Buffer.from(providedToken),
    Buffer.from(expectedToken)
  );
}

/**
 * GitHub webhook handler
 */
router.post('/github', async (req, res) => {
  try {
    const signature = req.headers['x-hub-signature-256'] as string;
    const event = req.headers['x-github-event'] as string;
    const payload = JSON.stringify(req.body);

    // Verify webhook signature
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (secret && signature) {
      if (!verifyGitHubSignature(payload, signature, secret)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Only process push events to main/master branches
    if (event === 'push') {
      const branch = req.body.ref?.replace('refs/heads/', '');
      const allowedBranches = ['main', 'master', 'develop'];

      if (allowedBranches.includes(branch)) {
        logger.info(`Processing GitHub push event for branch: ${branch}`);

        // Process webhook asynchronously
        gitIntegrationService.processWebhook(req.body, 'github')
          .catch(error => {
            logger.error('GitHub webhook processing failed:', error);
          });

        res.status(200).json({ message: 'Webhook received and queued for processing' });
      } else {
        logger.info(`Ignoring push to branch: ${branch}`);
        res.status(200).json({ message: 'Branch ignored' });
      }
    } else {
      logger.info(`Ignoring GitHub event: ${event}`);
      res.status(200).json({ message: 'Event type ignored' });
    }
  } catch (error) {
    logger.error('GitHub webhook handler error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GitLab webhook handler
 */
router.post('/gitlab', async (req, res) => {
  try {
    const token = req.headers['x-gitlab-token'] as string;
    const event = req.headers['x-gitlab-event'] as string;

    // Verify webhook token
    const expectedToken = process.env.GITLAB_WEBHOOK_TOKEN;
    if (expectedToken && token) {
      if (!verifyGitLabToken(token, expectedToken)) {
        return res.status(401).json({ error: 'Invalid token' });
      }
    }

    // Only process push events to main/master branches
    if (event === 'Push Hook') {
      const branch = req.body.ref?.replace('refs/heads/', '');
      const allowedBranches = ['main', 'master', 'develop'];

      if (allowedBranches.includes(branch)) {
        logger.info(`Processing GitLab push event for branch: ${branch}`);

        // Process webhook asynchronously
        gitIntegrationService.processWebhook(req.body, 'gitlab')
          .catch(error => {
            logger.error('GitLab webhook processing failed:', error);
          });

        res.status(200).json({ message: 'Webhook received and queued for processing' });
      } else {
        logger.info(`Ignoring push to branch: ${branch}`);
        res.status(200).json({ message: 'Branch ignored' });
      }
    } else {
      logger.info(`Ignoring GitLab event: ${event}`);
      res.status(200).json({ message: 'Event type ignored' });
    }
  } catch (error) {
    logger.error('GitLab webhook handler error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Manual trigger for strategy validation
 */
router.post('/validate/:strategyId', async (req, res) => {
  try {
    const { strategyId } = req.params;

    // Find strategy
    const strategy = await prisma.strategy.findUnique({
      where: { id: strategyId }
    });

    if (!strategy) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    if (!strategy.gitRepository) {
      return res.status(400).json({ error: 'Strategy does not have a Git repository configured' });
    }

    // Trigger validation
    gitIntegrationService.syncAndValidateStrategy(strategyId, {
      url: strategy.gitRepository,
      branch: strategy.gitBranch || 'main'
    }).catch(error => {
      logger.error('Manual validation failed:', error);
    });

    res.json({ message: 'Validation triggered' });
  } catch (error) {
    logger.error('Manual validation trigger error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get validation status for a strategy
 */
router.get('/validation-status/:strategyId', async (req, res) => {
  try {
    const { strategyId } = req.params;

    const strategy = await prisma.strategy.findUnique({
      where: { id: strategyId },
      select: {
        validationStatus: true,
        validationErrors: true,
        lastValidatedAt: true,
        gitCommitHash: true
      }
    });

    if (!strategy) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    const validationErrors = strategy.validationErrors
      ? JSON.parse(strategy.validationErrors)
      : null;

    res.json({
      status: strategy.validationStatus,
      errors: validationErrors?.errors || [],
      warnings: validationErrors?.warnings || [],
      lastValidatedAt: strategy.lastValidatedAt,
      commitHash: strategy.gitCommitHash
    });
  } catch (error) {
    logger.error('Validation status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as webhookRoutes };