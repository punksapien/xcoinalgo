// Simple working JWT functions with debug logging
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

// Warn if using fallback secret (indicates .env not loaded)
if (JWT_SECRET === 'your-super-secret-jwt-key') {
  console.warn('⚠️  WARNING: JWT_SECRET is using fallback value! Check if .env file is loaded.');
}

export interface JWTPayload {
  userId: string;
  email: string;
}

export function generateToken(payload: JWTPayload): string {
  console.log(`[JWT] Generating token for user: ${payload.userId} (${payload.email})`);
  console.log(`[JWT] Using JWT_SECRET: ${JWT_SECRET.substring(0, 10)}... (${JWT_SECRET.length} chars)`);

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

  console.log(`[JWT] Token generated: ${token.substring(0, 20)}...`);
  return token;
}

export function verifyToken(token: string): JWTPayload {
  try {
    console.log(`[JWT] Verifying token: ${token.substring(0, 20)}...`);
    console.log(`[JWT] Using JWT_SECRET: ${JWT_SECRET.substring(0, 10)}... (${JWT_SECRET.length} chars)`);

    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;

    console.log(`[JWT] Token verified successfully for user: ${decoded.userId} (${decoded.email})`);
    return decoded;
  } catch (error) {
    console.error(`[JWT] Token verification FAILED:`, error instanceof Error ? error.message : 'Unknown error');
    console.error(`[JWT] Failed token: ${token.substring(0, 20)}...`);
    throw error;
  }
}