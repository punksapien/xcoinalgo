import express from 'express';
import http from 'http';
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
import { backtestProgressRoutes } from './routes/backtest-progress';
import { settingsRoutes } from './routes/settings';
import { marketplaceRoutes } from './routes/marketplace';
import { marketDataRoutes } from './routes/market-data';
import { logsRoutes } from './routes/logs';
import { executionAuditRoutes } from './routes/execution-audit';
import { clientRoutes } from './routes/client';
import { adminRoutes } from './routes/admin';
import { strategyInviteRoutes } from './routes/strategy-invite';
import { errorHandler } from './middleware/errorHandler';
import { startHealthCheckMonitoring } from './services/strategyExecutor';
import { startOrderMonitoring } from './workers/order-monitor';
import { terminalSessionManager } from './services/terminal-session-manager';
import './config/passport'; // Initialize passport configuration
// Import prisma (with cache sync extension applied)
import './utils/database';

dotenv.config();

// Validate critical environment variables
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'your-super-secret-jwt-key') {
  console.error('❌ FATAL: JWT_SECRET environment variable is not set or using default value!');
  console.error('❌ Please set JWT_SECRET in your .env file');
  console.error('❌ The backend cannot start without a proper JWT_SECRET');
  process.exit(1);
}

// Log JWT_SECRET confirmation (first 10 chars only for security)
console.log(`✅ JWT_SECRET loaded: ${JWT_SECRET.substring(0, 10)}... (${JWT_SECRET.length} chars)`);

const app = express();
const PORT = process.env.PORT || 3001;

// Enable trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', true);

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
app.use('/api/user', authRoutes);
app.use('/api/broker', brokerRoutes);
app.use('/api/strategy-upload', strategyUploadRoutes);
app.use('/api/bot', botRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/positions', positionsRoutes);
app.use('/api/strategies', strategyExecutionRoutes);
app.use('/api/strategies', backtestProgressRoutes); // SSE progress streaming
app.use('/api/strategies', strategyInviteRoutes); // Invite & access request routes
app.use('/api/backtest', backtestRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/execution/audit', executionAuditRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/market-data', marketDataRoutes);
app.use('/api/client', clientRoutes); // Client dashboard routes
app.use('/api/admin', adminRoutes); // Admin dashboard routes

// Error handling middleware
app.use(errorHandler);

// Create HTTP server
const httpServer = http.createServer(app);

// Initialize WebSocket server for terminal sessions
terminalSessionManager.initialize(httpServer);

// Start server
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔒 CORS enabled for: ${process.env.FRONTEND_URL}`);
  console.log(`🔌 WebSocket server initialized for terminal sessions`);

  // Start health check monitoring for strategy executor
  startHealthCheckMonitoring();
  console.log(`💓 Strategy executor health monitoring started`);

  // Start order monitoring for SL/TP
  startOrderMonitoring();
  console.log(`📊 Order monitoring service started`);
});

export default app;
