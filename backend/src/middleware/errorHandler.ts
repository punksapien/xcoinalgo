import { Request, Response, NextFunction } from 'express';

interface CustomError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  error: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error('Error:', error);

  // Prisma errors
  if (error.code === 'P2002') {
    return res.status(400).json({
      error: 'A record with this information already exists'
    });
  }

  if (error.code === 'P2025') {
    return res.status(404).json({
      error: 'Record not found'
    });
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid authentication token'
    });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Authentication token has expired'
    });
  }

  // Custom errors
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';

  return res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
}