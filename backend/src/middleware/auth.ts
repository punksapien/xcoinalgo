import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/simple-jwt';
import { AuthenticatedRequest } from '../types';

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Access token is missing or invalid'
      });
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix
    const decoded = verifyToken(token);

    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({
      error: 'Invalid or expired authentication token'
    });
  }
}