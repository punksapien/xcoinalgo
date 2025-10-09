import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/simple-jwt';
import { AuthenticatedRequest } from '../types';

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