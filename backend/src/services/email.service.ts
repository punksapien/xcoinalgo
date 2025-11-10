import { Resend } from 'resend';
import crypto from 'crypto';

const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_FROM = process.env.EMAIL_FROM || 'XcoinAlgo Platform <noreply@xcoinalgo.com>';

/**
 * Generate a cryptographically secure 6-digit OTP
 */
export function generateOTP(): string {
  // Use crypto.randomInt for cryptographically secure random numbers
  const otp = crypto.randomInt(100000, 999999);
  return otp.toString();
}

/**
 * Calculate OTP expiry time (24 hours from now)
 */
export function getOTPExpiry(): Date {
  return new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
}

/**
 * Calculate password reset token expiry (1 hour from now)
 */
export function getPasswordResetExpiry(): Date {
  return new Date(Date.now() + 60 * 60 * 1000); // 1 hour
}

/**
 * Send verification OTP email
 */
export async function sendVerificationEmail(email: string, otp: string): Promise<void> {
  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: 'Verify your XcoinAlgo account',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verify your email</title>
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">XcoinAlgo</h1>
            </div>

            <div style="background: #ffffff; padding: 40px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
              <h2 style="color: #333; margin-top: 0;">Verify your email address</h2>

              <p>Thank you for signing up! Please use the following verification code to complete your registration:</p>

              <div style="background: #f7f7f7; border: 2px dashed #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0;">
                <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #667eea; font-family: 'Courier New', monospace;">
                  ${otp}
                </div>
              </div>

              <p style="color: #666; font-size: 14px;">
                <strong>This code will expire in 24 hours.</strong>
              </p>

              <p style="color: #666; font-size: 14px; margin-top: 30px;">
                If you didn't request this verification code, you can safely ignore this email.
              </p>

              <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

              <p style="color: #999; font-size: 12px; text-align: center;">
                © ${new Date().getFullYear()} XcoinAlgo Trading Platform. All rights reserved.
              </p>
            </div>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error('Failed to send verification email:', error);
      throw new Error('Failed to send verification email');
    }

    console.log('Verification email sent successfully:', data?.id);
  } catch (error) {
    console.error('Error in sendVerificationEmail:', error);
    throw error;
  }
}

/**
 * Send password reset OTP email
 */
export async function sendPasswordResetEmail(email: string, otp: string): Promise<void> {
  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: 'Reset your XcoinAlgo password',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Reset your password</title>
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">XcoinAlgo</h1>
            </div>

            <div style="background: #ffffff; padding: 40px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
              <h2 style="color: #333; margin-top: 0;">Reset your password</h2>

              <p>We received a request to reset your password. Please use the following code to reset your password:</p>

              <div style="background: #f7f7f7; border: 2px dashed #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0;">
                <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #667eea; font-family: 'Courier New', monospace;">
                  ${otp}
                </div>
              </div>

              <p style="color: #666; font-size: 14px;">
                <strong>This code will expire in 1 hour.</strong>
              </p>

              <p style="color: #ff6b6b; font-size: 14px; background: #fff5f5; padding: 15px; border-radius: 5px; border-left: 4px solid #ff6b6b; margin-top: 30px;">
                ⚠️ <strong>Security Alert:</strong> If you didn't request this password reset, please ignore this email and ensure your account is secure.
              </p>

              <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

              <p style="color: #999; font-size: 12px; text-align: center;">
                © ${new Date().getFullYear()} XcoinAlgo Trading Platform. All rights reserved.
              </p>
            </div>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error('Failed to send password reset email:', error);
      throw new Error('Failed to send password reset email');
    }

    console.log('Password reset email sent successfully:', data?.id);
  } catch (error) {
    console.error('Error in sendPasswordResetEmail:', error);
    throw error;
  }
}

/**
 * Send welcome email (optional - can be used after email verification)
 */
export async function sendWelcomeEmail(email: string, name?: string): Promise<void> {
  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: 'Welcome to XcoinAlgo! 🎉',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Welcome to XcoinAlgo</title>
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to XcoinAlgo! 🎉</h1>
            </div>

            <div style="background: #ffffff; padding: 40px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
              <h2 style="color: #333; margin-top: 0;">Hi${name ? ` ${name}` : ''}!</h2>

              <p>Your email has been verified successfully. You're all set to start your algorithmic trading journey!</p>

              <div style="background: #f0f7ff; padding: 20px; border-radius: 8px; margin: 30px 0;">
                <h3 style="color: #667eea; margin-top: 0;">What's next?</h3>
                <ul style="color: #666; margin: 0; padding-left: 20px;">
                  <li>Browse our strategy marketplace</li>
                  <li>Connect your broker credentials</li>
                  <li>Subscribe to profitable strategies</li>
                  <li>Start automated trading</li>
                </ul>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="https://xcoinalgo.com/dashboard" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                  Go to Dashboard
                </a>
              </div>

              <p style="color: #666; font-size: 14px; margin-top: 30px;">
                Need help? Check out our <a href="https://xcoinalgo.com/docs" style="color: #667eea;">documentation</a> or contact support.
              </p>

              <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

              <p style="color: #999; font-size: 12px; text-align: center;">
                © ${new Date().getFullYear()} XcoinAlgo Trading Platform. All rights reserved.
              </p>
            </div>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error('Failed to send welcome email:', error);
      // Don't throw - welcome email is optional
      return;
    }

    console.log('Welcome email sent successfully:', data?.id);
  } catch (error) {
    console.error('Error in sendWelcomeEmail:', error);
    // Don't throw - welcome email is optional
  }
}
