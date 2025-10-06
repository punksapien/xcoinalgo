import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import passport from 'passport';
import dotenv from 'dotenv';

import { authRoutes } from './routes/auth';
import { brokerRoutes } from './routes/broker';
// import { strategyUploadRoutes } from './routes/strategy-upload'; // Disabled due to schema compatibility issues
import { botRoutes } from './routes/bot';
import { webhookRoutes } from './routes/webhooks';
import { positionsRoutes } from './routes/positions';
import { errorHandler } from './middleware/errorHandler';
import { startHealthCheckMonitoring } from './services/strategyExecutor';
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

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
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
// app.use('/api/strategy-upload', strategyUploadRoutes); // Disabled due to schema compatibility issues
app.use('/api/bot', botRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/positions', positionsRoutes);

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
});

export default app;