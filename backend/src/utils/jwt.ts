import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

export interface JWTPayload {
  userId: string;
  email: string;
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload as any, JWT_SECRET as any, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'coindcx-trading-platform',
    audience: 'trading-bot-users'
  } as any);
}

export function verifyToken(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token as any, JWT_SECRET as any, {
      issuer: 'coindcx-trading-platform',
      audience: 'trading-bot-users'
    } as any) as unknown as JWTPayload;

    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}