import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import prisma from '../utils/database';
import { generateToken } from '../utils/simple-jwt';

// Serialize user for session
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        createdAt: true,
        updatedAt: true
      }
    });
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  callbackURL: 'https://xcoinalgo.com/api/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails?.[0]?.value;

    if (!email) {
      return done(new Error('No email found in Google profile'), null);
    }

    // Check if user already exists
    let user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      // Create new user for Google OAuth
      user = await prisma.user.create({
        data: {
          email,
          password: 'google-oauth-' + Date.now() // Placeholder password for OAuth users
        }
      });
    }

    // Generate JWT token for the user
    const token = generateToken({
      userId: user.id,
      email: user.email
    });

    // Attach token to user object
    const userWithToken = {
      ...user,
      token
    };

    return done(null, userWithToken);
  } catch (error) {
    console.error('Google OAuth Error:', error);
    return done(error, null);
  }
}));

export default passport;