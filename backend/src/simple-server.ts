import express from 'express';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import prisma from './utils/database';
import { sendEmail, emailTemplates, testEmailConnection } from './utils/resend-email';

const app = express();
const PORT = 3001;

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'cryptobot-session-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Set to true in production with HTTPS
}));

// Passport configuration
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  callbackURL: '/api/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Check if user already exists
    let user = await prisma.user.findUnique({
      where: { email: profile.emails?.[0]?.value }
    });

    if (!user) {
      // Create new user
      user = await prisma.user.create({
        data: {
          email: profile.emails?.[0]?.value || '',
          password: 'google-oauth', // Placeholder for OAuth users
        }
      });

      // Send welcome email
      try {
        const welcomeEmailTemplate = emailTemplates.welcome(user.email);
        await sendEmail(welcomeEmailTemplate);
        console.log(`✅ Welcome email sent to ${user.email}`);
      } catch (emailError) {
        console.error(`❌ Failed to send welcome email to ${user.email}:`, emailError);
      }
    }

    return done(null, user);
  } catch (error) {
    return done(error, null);
  }
}));

passport.serializeUser((user: any, done) => {
  done(null, user.id.toString());
});

passport.deserializeUser(async (id: any, done) => {
  try {
    console.log('🔍 Deserializing user ID:', id, typeof id);

    // Ensure id is valid string
    if (!id || typeof id !== 'string') {
      console.log('❌ No valid ID provided for deserialization');
      return done(null, false);
    }

    console.log('✅ Using string user ID:', id);

    const user = await prisma.user.findUnique({
      where: { id: id },  // Use string ID directly
      select: { id: true, email: true, createdAt: true }
    });

    if (!user) {
      console.log('❌ User not found for ID:', id);
      return done(null, false);
    }

    console.log('✅ User deserialized successfully:', user.email);
    done(null, user);
  } catch (error) {
    console.error('❌ Error in deserializeUser:', error);
    done(error, null);
  }
});

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(passport.initialize());
app.use(passport.session());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running!' });
});

// Get strategies (simplified)
app.get('/api/strategies', async (req, res) => {
  try {
    const strategies = await prisma.strategy.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        description: true,
        author: true,
        instrument: true,
        tags: true,
        winRate: true,
        riskReward: true,
        maxDrawdown: true,
        roi: true,
        marginRequired: true,
        deploymentCount: true,
        createdAt: true
      }
    });

    // Convert tags string to array for frontend
    const formattedStrategies = strategies.map(strategy => ({
      ...strategy,
      tags: strategy.tags ? strategy.tags.split(',') : []
    }));

    res.json({
      strategies: formattedStrategies,
      pagination: {
        page: 1,
        limit: 20,
        total: strategies.length,
        totalPages: 1
      }
    });
  } catch (error) {
    console.error('Error fetching strategies:', error);
    res.status(500).json({ error: 'Failed to fetch strategies' });
  }
});

// Google OAuth routes
app.get('/api/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/api/auth/google/callback',
  passport.authenticate('google', { failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login` }),
  (req, res) => {
    // Successful authentication, redirect to dashboard
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard`);
  }
);

// Get current user
app.get('/api/auth/me', (req: any, res) => {
  if (req.isAuthenticated()) {
    res.json({
      user: req.user,
      token: 'google-oauth-token-' + req.user.id
    });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// Logout
app.post('/api/auth/logout', (req: any, res) => {
  req.logout((err: any) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

// Strategy meta endpoints
app.get('/api/strategies/meta/tags', async (req, res) => {
  try {
    const strategies = await prisma.strategy.findMany({
      select: { tags: true }
    });

    // Extract unique tags from all strategies
    const allTags = strategies
      .map(strategy => strategy.tags ? strategy.tags.split(',') : [])
      .flat()
      .filter(tag => tag.trim())
      .map(tag => tag.trim());

    const uniqueTags = [...new Set(allTags)];

    res.json({ tags: uniqueTags });
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

app.get('/api/strategies/meta/authors', async (req, res) => {
  try {
    const strategies = await prisma.strategy.findMany({
      select: { author: true }
    });

    // Extract unique authors
    const uniqueAuthors = [...new Set(strategies.map(s => s.author).filter(Boolean))];

    res.json({ authors: uniqueAuthors });
  } catch (error) {
    console.error('Error fetching authors:', error);
    res.status(500).json({ error: 'Failed to fetch authors' });
  }
});

// Password reset request
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true }
    });

    if (!user) {
      // Don't reveal if email exists or not for security
      return res.json({
        message: 'If an account with that email exists, we have sent a password reset link.'
      });
    }

    // Generate simple reset token (in production, use crypto.randomBytes)
    const resetToken = 'reset-' + user.id + '-' + Date.now();

    // In a real app, you'd store this token in database with expiration
    // For demo purposes, we'll just send it in the email

    try {
      const resetEmailTemplate = emailTemplates.passwordReset(user.email, resetToken);
      await sendEmail(resetEmailTemplate);
      console.log(`✅ Password reset email sent to ${user.email}`);
    } catch (emailError) {
      console.error(`❌ Failed to send reset email to ${user.email}:`, emailError);
      return res.status(500).json({ error: 'Failed to send reset email' });
    }

    res.json({
      message: 'If an account with that email exists, we have sent a password reset link.'
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

// Basic broker endpoints
app.post('/api/broker/keys', (req, res) => {
  res.json({ message: 'API keys stored successfully' });
});

app.get('/api/broker/status', (req, res) => {
  res.json({
    connected: true,
    balance: { INR: 50000 },
    status: 'Connected to CoinDCX'
  });
});

app.delete('/api/broker/keys', (req, res) => {
  res.json({ message: 'API keys deleted successfully' });
});

// Basic bot endpoints
app.post('/api/bot/start', (req, res) => {
  res.json({
    deploymentId: 'demo-deployment-' + Date.now(),
    message: 'Bot started successfully'
  });
});

app.post('/api/bot/stop', (req, res) => {
  res.json({ message: 'Bot stopped successfully' });
});

app.get('/api/bot/deployments', (req, res) => {
  res.json({ deployments: [], pagination: { page: 1, limit: 10, total: 0 } });
});

app.get('/api/bot/deployments/:id', (req, res) => {
  res.json({
    deployment: {
      id: req.params.id,
      status: 'stopped',
      strategy: 'Demo Strategy',
      pnl: 0
    }
  });
});

app.delete('/api/bot/deployments/:id', (req, res) => {
  res.json({ message: 'Deployment deleted successfully' });
});

// Test email endpoint
app.post('/api/test-email', async (req, res) => {
  try {
    const { to } = req.body;

    if (!to) {
      return res.status(400).json({ error: 'Recipient email is required' });
    }

    await sendEmail({
      to,
      subject: 'Test Email from CryptoBot Platform 🚀',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #2563eb;">🤖 CryptoBot Platform</h1>
          <h2>Email Service Test</h2>
          <p>This is a test email to verify that your email service is working correctly!</p>
          <p>✅ If you're reading this, your email configuration is working perfectly.</p>
          <p>Time sent: ${new Date().toISOString()}</p>
        </div>
      `
    });

    console.log(`✅ Test email sent to ${to}`);
    res.json({ message: 'Test email sent successfully!' });
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({ error: 'Failed to send test email' });
  }
});

app.listen(PORT, async () => {
  console.log(`🚀 Simple backend running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📋 Strategies: http://localhost:${PORT}/api/strategies`);
  console.log(`🔐 Google OAuth: http://localhost:${PORT}/api/auth/google`);
  console.log(`👤 Current user: GET http://localhost:${PORT}/api/auth/me`);
  console.log(`📧 Test email: POST http://localhost:${PORT}/api/test-email`);

  // Test email connection on startup
  const emailReady = await testEmailConnection();
  if (emailReady) {
    console.log(`📧 Email service configured and ready!`);
  } else {
    console.log(`⚠️  Email service not configured. Update .env file with email settings.`);
  }

  // Check Google OAuth configuration
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.log(`⚠️  Google OAuth not configured. Update .env file with Google credentials.`);
  } else {
    console.log(`✅ Google OAuth configured and ready!`);
  }
});

export default app;