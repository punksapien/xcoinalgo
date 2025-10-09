import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import prisma from '../utils/database';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';

const router = Router();

// Generate a secure random API key
function generateApiKey(): string {
  // Format: xcoin_<random>
  const randomBytes = crypto.randomBytes(32).toString('hex');
  return `xcoin_${randomBytes}`;
}

// Get API key prefix for display (first 12 chars)
function getKeyPrefix(apiKey: string): string {
  return apiKey.substring(0, 12);
}

// POST /api/settings/api-keys - Generate new API key
router.post('/api-keys', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        error: 'API key name is required'
      });
    }

    if (name.length > 100) {
      return res.status(400).json({
        error: 'API key name must be less than 100 characters'
      });
    }

    // Generate new API key
    const apiKey = generateApiKey();
    const keyPrefix = getKeyPrefix(apiKey);

    // Hash the API key for storage (similar to password hashing)
    const saltRounds = 12;
    const keyHash = await bcrypt.hash(apiKey, saltRounds);

    // Store in database
    const newApiKey = await prisma.apiKey.create({
      data: {
        userId,
        name: name.trim(),
        keyHash,
        keyPrefix,
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      }
    });

    // Return the API key (only time it's shown in plain text!)
    res.status(201).json({
      message: 'API key created successfully',
      apiKey, // Plain text - user must save this now
      keyInfo: newApiKey
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    next(error);
  }
});

// GET /api/settings/api-keys - List user's API keys
router.get('/api-keys', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;

    const apiKeys = await prisma.apiKey.findMany({
      where: {
        userId,
        isActive: true
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        isActive: true,
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      apiKeys
    });
  } catch (error) {
    console.error('Error fetching API keys:', error);
    next(error);
  }
});

// DELETE /api/settings/api-keys/:id - Revoke API key
router.delete('/api-keys/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        error: 'API key ID is required'
      });
    }

    // Verify the API key belongs to the user
    const apiKey = await prisma.apiKey.findFirst({
      where: {
        id,
        userId
      }
    });

    if (!apiKey) {
      return res.status(404).json({
        error: 'API key not found'
      });
    }

    // Soft delete by marking as inactive
    await prisma.apiKey.update({
      where: { id },
      data: {
        isActive: false,
        updatedAt: new Date()
      }
    });

    res.json({
      message: 'API key revoked successfully'
    });
  } catch (error) {
    console.error('Error revoking API key:', error);
    next(error);
  }
});

// Helper function to authenticate via API key (used by auth middleware)
export async function authenticateApiKey(apiKey: string): Promise<{ userId: string; email: string } | null> {
  try {
    // API keys start with "xcoin_"
    if (!apiKey.startsWith('xcoin_')) {
      return null;
    }

    const keyPrefix = getKeyPrefix(apiKey);

    // Find API keys with matching prefix
    const apiKeys = await prisma.apiKey.findMany({
      where: {
        keyPrefix,
        isActive: true
      },
      include: {
        user: {
          select: {
            id: true,
            email: true
          }
        }
      }
    });

    // Try to match the hash
    for (const key of apiKeys) {
      const isMatch = await bcrypt.compare(apiKey, key.keyHash);
      if (isMatch) {
        // Update last used timestamp
        prisma.apiKey.update({
          where: { id: key.id },
          data: { lastUsedAt: new Date() }
        }).catch(err => console.error('Error updating lastUsedAt:', err));

        return {
          userId: key.user.id,
          email: key.user.email
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error authenticating API key:', error);
    return null;
  }
}

export { router as settingsRoutes };
