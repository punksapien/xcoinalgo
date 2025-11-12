/**
 * Rate Limiting for Validation Endpoints
 * Prevents abuse of resource-intensive validation operations
 */

import rateLimit from 'express-rate-limit';
import { Logger } from '../utils/logger';

const logger = new Logger('ValidationRateLimiter');

/**
 * Rate limiter for quick syntax validation
 * More lenient since it's lightweight
 */
export const quickValidationLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute per user
  message: {
    error: 'Too many validation requests',
    message: 'Please wait a moment before validating again',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for quick validation: ${(req as any).userId || req.ip}`);
    res.status(429).json({
      error: 'Too many validation requests',
      message: 'You can validate code up to 20 times per minute. Please wait before trying again.',
      retryAfter: 60
    });
  }
});

/**
 * Rate limiter for sandbox execution
 * More strict since it's resource-intensive
 */
export const sandboxValidationLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute per user
  message: {
    error: 'Too many sandbox execution requests',
    message: 'Please wait before running code in sandbox again',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for sandbox validation: ${(req as any).userId || req.ip}`);
    res.status(429).json({
      error: 'Too many sandbox execution requests',
      message: 'Sandbox execution is resource-intensive. You can run code up to 5 times per minute. Please wait before trying again.',
      retryAfter: 60
    });
  }
});

/**
 * Rate limiter for terminal session creation
 * Very strict to prevent resource exhaustion
 */
export const terminalSessionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // 3 terminal sessions per 5 minutes per user
  message: {
    error: 'Too many terminal session requests',
    message: 'Please wait before creating a new terminal session',
    retryAfter: '5 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for terminal sessions: ${(req as any).userId || req.ip}`);
    res.status(429).json({
      error: 'Too many terminal session requests',
      message: 'You can create up to 3 terminal sessions per 5 minutes. Please close existing sessions or wait before creating a new one.',
      retryAfter: 300
    });
  },
  skip: (req) => {
    // Allow if already has an active session (reconnecting)
    // This would need integration with terminal session manager
    return false;
  }
});
