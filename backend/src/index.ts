import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import passport from 'passport';
import dotenv from 'dotenv';

import { authRoutes } from './routes/auth';
import { brokerRoutes } from './routes/broker';
import { strategyUploadRoutes } from './routes/strategy-upload';
import { botRoutes } from './routes/bot';
import { webhookRoutes } from './routes/webhooks';
import { positionsRoutes } from './routes/positions';
import { strategyExecutionRoutes } from './routes/strategy-execution';
import { backtestRoutes } from './routes/backtest';
import { errorHandler } from './middleware/errorHandler';
import { startHealthCheckMonitoring } from './services/strategyExecutor';
import { startOrderMonitoring } from '../workers/order-monitor';
import './config/passport'; // Initialize passport configuration

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware with CSP configuration for OAuth
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "https://accounts.google.com", "https://oauth2.googleapis.com"],
      frameSrc: ["'self'", "https://accounts.google.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com"],
    },
  },
}));

// CORS configuration for Vercel frontend
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  'https://xcoinalgo.com',
  'https://www.xcoinalgo.com',
  'http://localhost:3000' // For local development
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Session middleware for OAuth
app.use(session({
  secret: process.env.SESSION_SECRET || 'xcoinalgo-session-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/broker', brokerRoutes);
app.use('/api/strategy-upload', strategyUploadRoutes);
app.use('/api/bot', botRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/positions', positionsRoutes);
app.use('/api/strategies', strategyExecutionRoutes);
app.use('/api/backtest', backtestRoutes);

// Error handling middleware
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔒 CORS enabled for: ${process.env.FRONTEND_URL}`);

  // Start health check monitoring for strategy executor
  startHealthCheckMonitoring();
  console.log(`💓 Strategy executor health monitoring started`);

  // Start order monitoring for SL/TP
  startOrderMonitoring();
  console.log(`📊 Order monitoring service started`);
});

export default app;