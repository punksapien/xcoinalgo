import nodemailer from 'nodemailer';

// Email configuration - supports multiple providers
const createTransporter = () => {
  const provider = process.env.EMAIL_PROVIDER || 'gmail';

  switch (provider) {
    case 'gmail':
      return nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD, // Use App Password for Gmail
        },
      });

    case 'smtp':
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      });

    case 'sendgrid':
      return nodemailer.createTransport({
        service: 'SendGrid',
        auth: {
          user: 'apikey',
          pass: process.env.SENDGRID_API_KEY,
        },
      });

    default:
      // Default to Gmail
      return nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD,
        },
      });
  }
};

const transporter = createTransporter();

export interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

export const sendEmail = async (options: EmailOptions): Promise<void> => {
  try {
    const mailOptions = {
      from: `"CryptoBot Platform" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', result.messageId);
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Failed to send email');
  }
};

// Pre-built email templates
export const emailTemplates = {
  welcome: (userEmail: string) => ({
    to: userEmail,
    subject: 'Welcome to CryptoBot Trading Platform! 🚀',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2563eb; margin: 0;">🤖 CryptoBot</h1>
          <h2 style="color: #374151; margin: 10px 0;">Welcome to the Trading Platform!</h2>
        </div>

        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="color: #374151; font-size: 16px; line-height: 1.6;">
            Hi there! 👋
          </p>
          <p style="color: #374151; font-size: 16px; line-height: 1.6;">
            Welcome to CryptoBot Trading Platform! Your account has been successfully created and you're ready to start your algorithmic trading journey.
          </p>

          <div style="margin: 25px 0;">
            <h3 style="color: #2563eb; margin-bottom: 15px;">What's Next?</h3>
            <ul style="color: #374151; font-size: 14px; line-height: 1.6;">
              <li>🔗 <strong>Set up your broker credentials</strong> in the Broker Setup section</li>
              <li>📊 <strong>Explore our strategy marketplace</strong> with proven trading algorithms</li>
              <li>🚀 <strong>Deploy your first trading bot</strong> and start automated trading</li>
              <li>📈 <strong>Monitor your positions</strong> and track performance in real-time</li>
            </ul>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard"
               style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Access Your Dashboard
            </a>
          </div>
        </div>

        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px;">
            Need help? Reply to this email or contact our support team.
          </p>
          <p style="color: #6b7280; font-size: 12px;">
            Happy Trading! 📈<br>
            The CryptoBot Team
          </p>
        </div>
      </div>
    `,
  }),

  passwordReset: (userEmail: string, resetToken: string) => ({
    to: userEmail,
    subject: 'Reset Your CryptoBot Password 🔐',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2563eb; margin: 0;">🤖 CryptoBot</h1>
          <h2 style="color: #374151; margin: 10px 0;">Password Reset Request</h2>
        </div>

        <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <p style="color: #92400e; font-size: 16px; line-height: 1.6; margin: 0;">
            <strong>⚠️ Security Alert:</strong> A password reset was requested for your account.
          </p>
        </div>

        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="color: #374151; font-size: 16px; line-height: 1.6;">
            Hi there! 👋
          </p>
          <p style="color: #374151; font-size: 16px; line-height: 1.6;">
            We received a request to reset your password. Click the button below to create a new password:
          </p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}"
               style="background-color: #dc2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Reset Password
            </a>
          </div>

          <div style="background-color: #fee2e2; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="color: #991b1b; font-size: 14px; line-height: 1.6; margin: 0;">
              <strong>Important:</strong> This link expires in 1 hour for security reasons. If you didn't request this reset, please ignore this email.
            </p>
          </div>
        </div>

        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <span style="word-break: break-all;">${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}</span>
          </p>
          <p style="color: #6b7280; font-size: 12px;">
            Stay secure! 🔐<br>
            The CryptoBot Team
          </p>
        </div>
      </div>
    `,
  }),
};

// Test email configuration
export const testEmailConnection = async (): Promise<boolean> => {
  try {
    await transporter.verify();
    console.log('✅ Email service is ready to send emails');
    return true;
  } catch (error) {
    console.error('❌ Email service configuration error:', error);
    return false;
  }
};