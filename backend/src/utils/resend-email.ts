import { Resend } from 'resend';

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

export interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

export const sendEmail = async (options: EmailOptions): Promise<void> => {
  try {
    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'CryptoBot Platform <noreply@yourdomain.com>',
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    console.log('✅ Email sent successfully via Resend:', result.data?.id);
  } catch (error) {
    console.error('❌ Error sending email via Resend:', error);
    throw new Error('Failed to send email');
  }
};

// Pre-built email templates optimized for Resend
export const emailTemplates = {
  welcome: (userEmail: string) => ({
    to: userEmail,
    subject: 'Welcome to CryptoBot Trading Platform! 🚀',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to CryptoBot</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">

        <!-- Header -->
        <div style="text-align: center; margin-bottom: 40px; padding: 20px 0; border-bottom: 3px solid #2563eb;">
          <h1 style="color: #2563eb; margin: 0; font-size: 32px; font-weight: bold;">
            🤖 CryptoBot
          </h1>
          <p style="color: #6b7280; margin: 5px 0 0 0; font-size: 16px;">
            Algorithmic Trading Platform
          </p>
        </div>

        <!-- Welcome Message -->
        <div style="background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); padding: 30px; border-radius: 12px; margin: 30px 0;">
          <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px;">
            Welcome aboard! 🎉
          </h2>
          <p style="color: #374151; margin: 0 0 20px 0; font-size: 16px;">
            Your CryptoBot account has been successfully created. You're now ready to explore the world of algorithmic trading with our powerful platform.
          </p>
        </div>

        <!-- Quick Start Guide -->
        <div style="margin: 30px 0;">
          <h3 style="color: #2563eb; margin: 0 0 20px 0; font-size: 20px;">
            🚀 Quick Start Guide
          </h3>

          <div style="background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
            <div style="padding: 20px; border-bottom: 1px solid #e5e7eb;">
              <div style="display: flex; align-items: center; margin-bottom: 10px;">
                <span style="background: #2563eb; color: white; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; margin-right: 12px;">1</span>
                <strong style="color: #1f2937;">Set up your broker credentials</strong>
              </div>
              <p style="color: #6b7280; margin: 0 0 0 36px; font-size: 14px;">
                Connect your trading account securely in the Broker Setup section
              </p>
            </div>

            <div style="padding: 20px; border-bottom: 1px solid #e5e7eb;">
              <div style="display: flex; align-items: center; margin-bottom: 10px;">
                <span style="background: #2563eb; color: white; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; margin-right: 12px;">2</span>
                <strong style="color: #1f2937;">Browse strategy marketplace</strong>
              </div>
              <p style="color: #6b7280; margin: 0 0 0 36px; font-size: 14px;">
                Discover proven trading algorithms with detailed performance metrics
              </p>
            </div>

            <div style="padding: 20px; border-bottom: 1px solid #e5e7eb;">
              <div style="display: flex; align-items: center; margin-bottom: 10px;">
                <span style="background: #2563eb; color: white; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; margin-right: 12px;">3</span>
                <strong style="color: #1f2937;">Deploy your first bot</strong>
              </div>
              <p style="color: #6b7280; margin: 0 0 0 36px; font-size: 14px;">
                Start automated trading with just a few clicks
              </p>
            </div>

            <div style="padding: 20px;">
              <div style="display: flex; align-items: center; margin-bottom: 10px;">
                <span style="background: #2563eb; color: white; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; margin-right: 12px;">4</span>
                <strong style="color: #1f2937;">Monitor and optimize</strong>
              </div>
              <p style="color: #6b7280; margin: 0 0 0 36px; font-size: 14px;">
                Track performance and manage your trading portfolio
              </p>
            </div>
          </div>
        </div>

        <!-- CTA Button -->
        <div style="text-align: center; margin: 40px 0;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard"
             style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);">
            🚀 Access Your Dashboard
          </a>
        </div>

        <!-- Footer -->
        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px;">
          <p style="margin: 0 0 10px 0;">
            Need help getting started? Reply to this email or contact our support team.
          </p>
          <p style="margin: 0; font-weight: bold; color: #2563eb;">
            Happy Trading! 📈<br>
            The CryptoBot Team
          </p>
        </div>

      </body>
      </html>
    `,
  }),

  passwordReset: (userEmail: string, resetToken: string) => ({
    to: userEmail,
    subject: 'Reset Your CryptoBot Password 🔐',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">

        <!-- Header -->
        <div style="text-align: center; margin-bottom: 40px; padding: 20px 0; border-bottom: 3px solid #dc2626;">
          <h1 style="color: #dc2626; margin: 0; font-size: 32px; font-weight: bold;">
            🤖 CryptoBot
          </h1>
          <p style="color: #6b7280; margin: 5px 0 0 0; font-size: 16px;">
            Password Reset Request
          </p>
        </div>

        <!-- Security Alert -->
        <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-left: 4px solid #f59e0b; padding: 20px; border-radius: 8px; margin: 30px 0;">
          <div style="display: flex; align-items: center; margin-bottom: 10px;">
            <span style="font-size: 20px; margin-right: 10px;">⚠️</span>
            <strong style="color: #92400e; font-size: 16px;">Security Alert</strong>
          </div>
          <p style="color: #92400e; margin: 0; font-size: 14px;">
            A password reset was requested for your CryptoBot account. If this wasn't you, please ignore this email.
          </p>
        </div>

        <!-- Reset Instructions -->
        <div style="background: #f8fafc; padding: 30px; border-radius: 12px; margin: 30px 0;">
          <p style="color: #374151; margin: 0 0 20px 0; font-size: 16px;">
            Hi there! 👋
          </p>
          <p style="color: #374151; margin: 0 0 25px 0; font-size: 16px;">
            We received a request to reset your password. Click the button below to create a new password for your account:
          </p>

          <!-- Reset Button -->
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}"
               style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);">
              🔐 Reset My Password
            </a>
          </div>
        </div>

        <!-- Important Notice -->
        <div style="background: #fee2e2; border: 1px solid #fca5a5; padding: 20px; border-radius: 8px; margin: 30px 0;">
          <div style="display: flex; align-items: center; margin-bottom: 15px;">
            <span style="font-size: 18px; margin-right: 10px;">🕒</span>
            <strong style="color: #991b1b;">Important Security Information</strong>
          </div>
          <ul style="color: #991b1b; margin: 0; padding-left: 20px; font-size: 14px;">
            <li style="margin-bottom: 8px;">This password reset link expires in <strong>1 hour</strong></li>
            <li style="margin-bottom: 8px;">Only use this link if you requested a password reset</li>
            <li style="margin-bottom: 0;">If you didn't request this, please ignore this email</li>
          </ul>
        </div>

        <!-- Alternative Link -->
        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 30px 0;">
          <p style="color: #374151; margin: 0 0 10px 0; font-size: 14px; font-weight: bold;">
            Button not working?
          </p>
          <p style="color: #6b7280; margin: 0 0 10px 0; font-size: 12px;">
            Copy and paste this link into your browser:
          </p>
          <p style="word-break: break-all; background: #fff; padding: 10px; border-radius: 4px; border: 1px solid #d1d5db; font-family: monospace; font-size: 12px; margin: 0;">
            ${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}
          </p>
        </div>

        <!-- Footer -->
        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px;">
          <p style="margin: 0 0 10px 0;">
            Questions? Contact our support team for immediate assistance.
          </p>
          <p style="margin: 0; font-weight: bold; color: #dc2626;">
            Stay Secure! 🔐<br>
            The CryptoBot Team
          </p>
        </div>

      </body>
      </html>
    `,
  }),
};

// Test Resend connection
export const testEmailConnection = async (): Promise<boolean> => {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.log('⚠️ RESEND_API_KEY not found in environment variables');
      return false;
    }

    // Test by checking if API key is valid format
    if (process.env.RESEND_API_KEY.startsWith('re_')) {
      console.log('✅ Resend API key format is valid');
      return true;
    } else {
      console.log('❌ Invalid Resend API key format. Should start with "re_"');
      return false;
    }
  } catch (error) {
    console.error('❌ Resend service configuration error:', error);
    return false;
  }
};