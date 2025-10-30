import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/simple-jwt';
import { AuthenticatedRequest } from '../types';
import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Access token is missing or invalid'
      });
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // Check if it's an API key (starts with "xcoin_")
    if (token.startsWith('xcoin_')) {
      // API Key authentication
      const { authenticateApiKey } = await import('../routes/settings');
      const user = await authenticateApiKey(token);

      if (!user) {
        return res.status(401).json({
          error: 'Invalid API key'
        });
      }

      req.userId = user.userId;
      next();
    } else {
      // JWT token authentication
      const decoded = verifyToken(token);
      req.userId = decoded.userId;
      next();
    }
  } catch (error) {
    return res.status(401).json({
      error: 'Invalid or expired authentication token'
    });
  }
}

/**
 * Middleware to require QUANT role
 * Must be used AFTER authenticate middleware
 */
export async function requireQuantRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.userId) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, role: true }
    });

    if (!user) {
      return res.status(401).json({
        error: 'User not found'
      });
    }

    if (user.role !== UserRole.QUANT) {
      return res.status(403).json({
        error: 'Access forbidden. This feature is only available to quant team members.'
      });
    }

    next();
  } catch (error) {
    console.error('Role check error:', error);
    return res.status(500).json({
      error: 'Failed to verify user role'
    });
  }
}