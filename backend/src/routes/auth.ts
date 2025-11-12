import { Router } from 'express';
import bcrypt from 'bcrypt';
import passport from 'passport';
import rateLimit from 'express-rate-limit';
import { generateToken } from '../utils/simple-jwt';
import prisma from '../utils/database';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { Logger } from '../utils/logger';
import {
  generateOTP,
  getOTPExpiry,
  getPasswordResetExpiry,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail
} from '../services/email.service';

const router = Router();
const logger = new Logger('AuthRoutes');

// Rate limiters for auth endpoints
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: 'Too many login attempts. Please try again after 15 minutes.',
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: { trustProxy: false },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 registrations per hour per IP
  message: 'Too many accounts created. Please try again after an hour.',
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: { trustProxy: false },
});

const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 OTP requests per hour
  message: 'Too many OTP requests. Please try again after an hour.',
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: { trustProxy: false },
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 password reset requests per hour
  message: 'Too many password reset attempts. Please try again after an hour.',
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: { trustProxy: false },
});

// Register new user with email verification
router.post('/register', registerLimiter, async (req, res, next) => {
  try {
    const { email, password, name, phoneNumber } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }

    // Note: name is optional at backend level but will be enforced by frontend
    // This allows flexibility for existing API consumers

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Invalid email format'
      });
    }

    // Validate password strength (minimum 8 characters)
    if (password.length < 8) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters long'
      });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({
        error: 'User with this email already exists'
      });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = getOTPExpiry();

    // Create user with verification token
    const user = await prisma.user.create({
      data: {
        email,
        name: name || null, // Optional name from signup form
        phoneNumber: phoneNumber || null, // Optional phone number
        password: hashedPassword,
        verificationToken: otp,
        verificationTokenExpiry: otpExpiry,
        emailVerified: null // Not verified yet
      },
      select: {
        id: true,
        email: true,
        name: true,
        phoneNumber: true,
        emailVerified: true,
        createdAt: true
      }
    });

    // Send verification email
    await sendVerificationEmail(email, otp);

    // Don't return token yet - user must verify email first
    res.status(201).json({
      message: 'Registration successful! Please check your email for verification code.',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phoneNumber: user.phoneNumber,
        emailVerified: user.emailVerified
      },
      requiresVerification: true
    });
  } catch (error) {
    next(error);
  }
});

// Login user
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }

    // Check if user has a password (OAuth users don't)
    if (!user.password) {
      return res.status(401).json({
        error: 'This account uses Google sign-in. Please use "Sign in with Google".'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }

    // Check if email is verified (only for email/password users)
    if (!user.emailVerified && !user.googleId) {
      return res.status(403).json({
        error: 'Please verify your email before logging in',
        requiresVerification: true,
        email: user.email
      });
    }

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      email: user.email
    });

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt
      },
      token
    });
  } catch (error) {
    next(error);
  }
});

// Get current user info
router.get('/me', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    res.json({
      user
    });
  } catch (error) {
    next(error);
  }
});

// Logout route
router.post('/logout', (req, res) => {
  try {
    // Clear any server-side session if using session-based auth
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.error('Session destruction error:', err);
        }
      });
    }

    // For JWT-based auth, logout is mainly handled client-side
    // This endpoint confirms logout and can be used for any server cleanup
    res.json({
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout failed'
    });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        error: 'Email and OTP are required'
      });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    // Check if already verified
    if (user.emailVerified) {
      return res.status(400).json({
        error: 'Email already verified'
      });
    }

    // Check if OTP matches
    if (user.verificationToken !== otp) {
      return res.status(400).json({
        error: 'Invalid verification code'
      });
    }

    // Check if OTP expired
    if (user.verificationTokenExpiry && user.verificationTokenExpiry < new Date()) {
      return res.status(400).json({
        error: 'Verification code has expired. Please request a new one.'
      });
    }

    // Mark email as verified and clear verification token
    const verifiedUser = await prisma.user.update({
      where: { email },
      data: {
        emailVerified: new Date(),
        verificationToken: null,
        verificationTokenExpiry: null
      },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        role: true,
        createdAt: true
      }
    });

    // Send welcome email (optional)
    try {
      await sendWelcomeEmail(email);
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Don't fail the verification if welcome email fails
    }

    // Generate JWT token
    const token = generateToken({
      userId: verifiedUser.id,
      email: verifiedUser.email
    });

    res.json({
      message: 'Email verified successfully!',
      user: verifiedUser,
      token
    });
  } catch (error) {
    next(error);
  }
});

// Resend verification OTP
router.post('/resend-otp', otpLimiter, async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'Email is required'
      });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    // Check if already verified
    if (user.emailVerified) {
      return res.status(400).json({
        error: 'Email already verified'
      });
    }

    // Generate new OTP
    const otp = generateOTP();
    const otpExpiry = getOTPExpiry();

    // Update user with new OTP
    await prisma.user.update({
      where: { email },
      data: {
        verificationToken: otp,
        verificationTokenExpiry: otpExpiry
      }
    });

    // Send new verification email
    await sendVerificationEmail(email, otp);

    res.json({
      message: 'Verification code sent! Please check your email.'
    });
  } catch (error) {
    next(error);
  }
});

// Forgot password - Send reset OTP
router.post('/forgot-password', passwordResetLimiter, async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'Email is required'
      });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    // Don't reveal if user exists or not (security best practice)
    if (!user) {
      return res.json({
        message: 'If an account exists with this email, you will receive a password reset code.'
      });
    }

    // Check if user is OAuth-only
    if (!user.password && user.googleId) {
      return res.status(400).json({
        error: 'This account uses Google sign-in. Password reset is not available.'
      });
    }

    // Generate reset OTP
    const otp = generateOTP();
    const otpExpiry = getPasswordResetExpiry();

    // Update user with reset token
    await prisma.user.update({
      where: { email },
      data: {
        resetPasswordToken: otp,
        resetPasswordExpiry: otpExpiry
      }
    });

    // Send password reset email
    await sendPasswordResetEmail(email, otp);

    res.json({
      message: 'If an account exists with this email, you will receive a password reset code.'
    });
  } catch (error) {
    next(error);
  }
});

// Reset password with OTP
router.post('/reset-password', async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        error: 'Email, OTP, and new password are required'
      });
    }

    // Validate password strength
    if (newPassword.length < 8) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters long'
      });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(404).json({
        error: 'Invalid reset code'
      });
    }

    // Check if OTP matches
    if (user.resetPasswordToken !== otp) {
      return res.status(400).json({
        error: 'Invalid reset code'
      });
    }

    // Check if OTP expired
    if (user.resetPasswordExpiry && user.resetPasswordExpiry < new Date()) {
      return res.status(400).json({
        error: 'Reset code has expired. Please request a new one.'
      });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password and clear reset token
    await prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpiry: null
      }
    });

    res.json({
      message: 'Password reset successfully! You can now login with your new password.'
    });
  } catch (error) {
    next(error);
  }
});

// Google OAuth - NextAuth Integration (POST endpoint for frontend)
router.post('/google-auth', async (req, res, next) => {
  try {
    const { email, name, googleId, image } = req.body;

    if (!email || !googleId) {
      return res.status(400).json({
        error: 'Email and Google ID are required'
      });
    }

    // Check if user exists
    let user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        googleId: true,
        emailVerified: true,
        createdAt: true
      }
    });

    if (!user) {
      // Create new user from Google data
      user = await prisma.user.create({
        data: {
          email,
          name, // Save name from Google profile
          googleId,
          password: null, // OAuth users don't have passwords
          emailVerified: new Date(), // Google emails are pre-verified
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          googleId: true,
          emailVerified: true,
          createdAt: true
        }
      });
    } else if (!user.googleId) {
      // Update existing user with Google ID (account linking)
      user = await prisma.user.update({
        where: { email },
        data: {
          googleId,
          name: name || user.name, // Update name if provided, keep existing otherwise
          emailVerified: user.emailVerified || new Date(), // Verify email if not already
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          googleId: true,
          emailVerified: true,
          createdAt: true
        }
      });
    }

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      email: user.email
    });

    res.json({
      message: 'Google authentication successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt
      },
      token
    });
  } catch (error) {
    next(error);
  }
});

// Get current user endpoint - Returns fresh user data from database
router.get('/user/me', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Fetch fresh user data from database (including latest role)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Error fetching user data:', error);
    next(error);
  }
});

// Google OAuth routes (Passport.js - legacy, keeping for backward compatibility)
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=oauth_failed` }),
  (req, res) => {
    // Successful authentication
    const user = req.user as any;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    if (user && user.token) {
      // Redirect to frontend with token in URL params (for client-side handling)
      res.redirect(`${frontendUrl}/dashboard?token=${user.token}&email=${user.email}`);
    } else {
      res.redirect(`${frontendUrl}/login?error=oauth_failed`);
    }
  }
);

// ============================================
// User Profile Management Routes
// ============================================

/**
 * GET /api/user/profile
 * Get current user's profile information
 */
router.get('/profile', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phoneNumber: true,
        role: true,
        googleId: true, // To check if OAuth user
        emailVerified: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    // Check if user can change password (only non-OAuth users)
    const canChangePassword = !user.googleId;

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phoneNumber: user.phoneNumber,
        role: user.role,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        canChangePassword
      }
    });
  } catch (error) {
    logger.error('Failed to fetch user profile:', error);
    next(error);
  }
});

/**
 * PUT /api/user/profile
 * Update user profile (name, phoneNumber)
 * Email cannot be changed
 */
router.put('/profile', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { name, phoneNumber } = req.body;

    // Validate inputs
    if (name !== undefined && typeof name !== 'string') {
      return res.status(400).json({
        error: 'Name must be a string'
      });
    }

    if (phoneNumber !== undefined && phoneNumber !== null && typeof phoneNumber !== 'string') {
      return res.status(400).json({
        error: 'Phone number must be a string'
      });
    }

    // Build update data
    const updateData: any = {};
    if (name !== undefined) updateData.name = name || null;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber || null;

    // Update user
    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        phoneNumber: true,
        role: true,
        googleId: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true
      }
    });

    logger.info(`User ${userId} updated profile`);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phoneNumber: user.phoneNumber,
        role: user.role,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        canChangePassword: !user.googleId
      }
    });
  } catch (error) {
    logger.error('Failed to update user profile:', error);
    next(error);
  }
});

/**
 * PUT /api/user/change-password
 * Change user password (only for email/password users, not OAuth)
 */
router.put('/change-password', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'Current password and new password are required'
      });
    }

    // Validate new password strength
    if (newPassword.length < 8) {
      return res.status(400).json({
        error: 'New password must be at least 8 characters long'
      });
    }

    // Get user with password field
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        password: true,
        googleId: true
      }
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    // Check if user is OAuth user (no password)
    if (user.googleId && !user.password) {
      return res.status(400).json({
        error: 'Cannot change password for OAuth users. You signed in with Google.'
      });
    }

    if (!user.password) {
      return res.status(400).json({
        error: 'No password set for this account'
      });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Current password is incorrect'
      });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword
      }
    });

    logger.info(`User ${userId} changed password`);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    logger.error('Failed to change password:', error);
    next(error);
  }
});

export { router as authRoutes };