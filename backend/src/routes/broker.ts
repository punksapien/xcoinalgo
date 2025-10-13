import { Router } from 'express';
import crypto from 'crypto';
import { authenticate } from '../middleware/auth';
import { encrypt, decrypt } from '../utils/simple-crypto';
import prisma from '../utils/database';
import { AuthenticatedRequest } from '../types';
import * as CoinDCXClient from '../services/coindcx-client';

const router = Router();

// Store CoinDCX credentials
router.post('/keys', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { apiKey, apiSecret } = req.body;
    const userId = req.userId!;

    if (!apiKey || !apiSecret) {
      return res.status(400).json({
        error: 'API Key and API Secret are required'
      });
    }

    // Basic validation for CoinDCX API key format
    if (typeof apiKey !== 'string' || typeof apiSecret !== 'string') {
      return res.status(400).json({
        error: 'API Key and Secret must be strings'
      });
    }

    // Encrypt the credentials
    const encryptedApiKey = encrypt(apiKey);
    const encryptedApiSecret = encrypt(apiSecret);

    // Store or update broker credentials
    const brokerCredential = await prisma.brokerCredential.upsert({
      where: {
        userId_brokerName: {
          userId,
          brokerName: 'coindcx'
        }
      },
      update: {
        apiKey: encryptedApiKey,
        apiSecret: encryptedApiSecret,
        isActive: true,
        updatedAt: new Date()
      },
      create: {
        userId,
        brokerName: 'coindcx',
        apiKey: encryptedApiKey,
        apiSecret: encryptedApiSecret,
        isActive: true
      }
    });

    res.json({
      message: 'CoinDCX credentials stored successfully',
      credential: {
        id: brokerCredential.id,
        brokerName: brokerCredential.brokerName,
        isActive: brokerCredential.isActive,
        createdAt: brokerCredential.createdAt,
        updatedAt: brokerCredential.updatedAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get broker credentials list
router.get('/credentials', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;

    const credentials = await prisma.brokerCredential.findMany({
      where: {
        userId,
      },
      select: {
        id: true,
        brokerName: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({
      credentials,
    });
  } catch (error) {
    next(error);
  }
});

// Get account balance
router.get('/balance', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;

    // Get user's broker credentials
    const brokerCredential = await prisma.brokerCredential.findUnique({
      where: {
        userId_brokerName: {
          userId,
          brokerName: 'coindcx'
        }
      }
    });

    if (!brokerCredential || !brokerCredential.isActive) {
      return res.status(404).json({
        error: 'No active broker credentials found. Please connect your broker first.'
      });
    }

    // Decrypt credentials
    const apiKey = decrypt(brokerCredential.apiKey);
    const apiSecret = decrypt(brokerCredential.apiSecret);

    // Fetch balances from CoinDCX
    const balances = await CoinDCXClient.getBalances(apiKey, apiSecret);

    // Calculate total balance in INR
    // For simplicity, we're summing up INR balance and treating other currencies as-is
    // In production, you'd want to convert all to INR using current rates
    const inrBalance = balances.find(b => b.currency.toLowerCase() === 'inr');
    const totalAvailable = inrBalance ? inrBalance.balance : 0;

    res.json({
      totalAvailable,
      balances: balances.filter(b => b.balance > 0).slice(0, 10), // Top 10 non-zero balances
      currency: 'INR',
    });
  } catch (error) {
    console.error('Failed to fetch balance:', error);
    next(error);
  }
});

// Get futures wallet balances (for margin trading)
router.get('/futures-balance', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;

    // Get user's broker credentials
    const brokerCredential = await prisma.brokerCredential.findUnique({
      where: {
        userId_brokerName: {
          userId,
          brokerName: 'coindcx'
        }
      }
    });

    if (!brokerCredential || !brokerCredential.isActive) {
      return res.status(404).json({
        error: 'No active broker credentials found. Please connect your broker first.'
      });
    }

    // Fetch futures wallet balances
    try {
      const wallets = await CoinDCXClient.getFuturesWallets(
        brokerCredential.apiKey,
        brokerCredential.apiSecret
      );

      // Find USDT wallet (primary margin currency for futures)
      const usdtWallet = wallets.find((w: any) =>
        w.currency_short_name === 'USDT'
      );

      // Calculate available balance: balance - (locked_balance + cross_order_margin + cross_user_margin)
      const calculateAvailable = (wallet: any): number => {
        const balance = Number(wallet.balance || 0);
        const locked = Number(wallet.locked_balance || 0);
        const crossOrder = Number(wallet.cross_order_margin || 0);
        const crossUser = Number(wallet.cross_user_margin || 0);
        return balance - (locked + crossOrder + crossUser);
      };

      const usdtAvailable = usdtWallet ? calculateAvailable(usdtWallet) : 0;

      res.json({
        totalAvailable: usdtAvailable, // USDT only for futures
        usdtAvailable,
        wallets: wallets.map((w: any) => ({
          currency: w.currency_short_name,
          available: calculateAvailable(w),
          locked: Number(w.locked_balance || 0),
          total: Number(w.balance || 0)
        })),
        currency: 'USDT',
      });
    } catch (walletError: any) {
      // Handle 404 or API errors gracefully - return empty balance
      console.warn('CoinDCX futures wallet API error:', walletError.message);
      
      res.json({
        totalAvailable: 0,
        usdtAvailable: 0,
        wallets: [],
        currency: 'USDT',
        warning: 'Unable to fetch futures wallet. Please ensure your API key has futures trading permissions enabled on CoinDCX.'
      });
    }
  } catch (error) {
    console.error('Failed to fetch futures balance:', error);
    next(error);
  }
});

// Get broker connection status
router.get('/status', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;

    const brokerCredential = await prisma.brokerCredential.findUnique({
      where: {
        userId_brokerName: {
          userId,
          brokerName: 'coindcx'
        }
      },
      select: {
        id: true,
        brokerName: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!brokerCredential) {
      return res.json({
        connected: false,
        message: 'No CoinDCX credentials found'
      });
    }

    res.json({
      connected: brokerCredential.isActive,
      brokerName: brokerCredential.brokerName,
      connectedAt: brokerCredential.createdAt,
      lastUpdated: brokerCredential.updatedAt
    });
  } catch (error) {
    next(error);
  }
});

// Delete broker credentials
router.delete('/keys', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;

    // Check if user has any active bot deployments
    const activeDeployments = await prisma.botDeployment.findMany({
      where: {
        userId,
        status: {
          in: ['ACTIVE', 'STARTING', 'DEPLOYING']
        }
      }
    });

    if (activeDeployments.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete credentials while you have active bot deployments. Please stop all bots first.'
      });
    }

    // Delete credentials
    await prisma.brokerCredential.delete({
      where: {
        userId_brokerName: {
          userId,
          brokerName: 'coindcx'
        }
      }
    });

    res.json({
      message: 'CoinDCX credentials deleted successfully'
    });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        error: 'No CoinDCX credentials found to delete'
      });
    }
    next(error);
  }
});

// Test CoinDCX API connection
router.post('/test', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { apiKey, apiSecret } = req.body;

    if (!apiKey || !apiSecret) {
      return res.status(400).json({
        error: 'API Key and API Secret are required for testing'
      });
    }

    // Basic validation for CoinDCX API key format
    if (typeof apiKey !== 'string' || typeof apiSecret !== 'string') {
      return res.status(400).json({
        error: 'API Key and Secret must be strings'
      });
    }

    // Test the connection by making a simple API call to CoinDCX
    try {
      // Use milliseconds timestamp like the Python client
      const timestamp = Math.floor(Date.now());
      const payload = { timestamp };

      // Use truly compact JSON serialization (no spaces) like Python client
      const body = JSON.stringify(payload).replace(/\s/g, '');

      // Create HMAC-SHA256 signature according to CoinDCX documentation
      const signature = crypto
        .createHmac('sha256', apiSecret)
        .update(body)
        .digest('hex');

      // Comprehensive logging for debugging
      console.log('🔍 CoinDCX API Test Debug Info:');
      console.log('📅 Timestamp:', timestamp);
      console.log('📦 Payload:', payload);
      console.log('📄 JSON Body:', body);
      console.log('🔑 API Key (first 8 chars):', apiKey.substring(0, 8) + '...');
      console.log('🔐 Generated Signature:', signature);
      console.log('🌐 Request URL:', 'https://api.coindcx.com/exchange/v1/users/balances');

      // Make a test API call to CoinDCX (using user balances endpoint)
      const response = await fetch('https://api.coindcx.com/exchange/v1/users/balances', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-AUTH-APIKEY': apiKey,
          'X-AUTH-SIGNATURE': signature,
        },
        body,
      });

      // Comprehensive response logging
      console.log('📡 CoinDCX Response Status:', response.status);
      console.log('📋 Response Headers:', Object.fromEntries(response.headers));

      if (!response.ok) {
        let errorMessage = 'Invalid API credentials';
        let responseBody = '';

        try {
          responseBody = await response.text();
          console.log('❌ CoinDCX Error Response Body:', responseBody);

          // Try to parse as JSON for structured error
          const errorData = JSON.parse(responseBody) as { message?: string, error?: string };
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch (parseError) {
          console.log('⚠️ Could not parse error response as JSON:', parseError);
          errorMessage = responseBody || errorMessage;
        }

        // Enhanced error messages based on status
        if (response.status === 401) {
          errorMessage = 'Authentication failed. Please check your API key and secret. CoinDCX says: ' + errorMessage;
        } else if (response.status === 403) {
          errorMessage = 'API access forbidden. Please ensure your API key has the required permissions. CoinDCX says: ' + errorMessage;
        } else if (response.status === 429) {
          errorMessage = 'Rate limit exceeded. Please try again later. CoinDCX says: ' + errorMessage;
        }

        console.log('💥 Final error message:', errorMessage);

        return res.status(400).json({
          error: errorMessage,
          statusCode: response.status,
          details: {
            timestamp,
            endpoint: '/exchange/v1/users/balances',
            bodyLength: body.length
          }
        });
      }

      // If we get here, the credentials are valid
      const accountData = await response.json();

      res.json({
        success: true,
        message: 'CoinDCX API connection test successful',
        accountInfo: {
          // Return only safe, non-sensitive account info
          hasAccess: true,
          timestamp: new Date().toISOString()
        }
      });
    } catch (apiError) {
      console.error('💥 CoinDCX API test error:', apiError);
      console.error('🔧 Error details:', {
        name: apiError instanceof Error ? apiError.name : 'Unknown',
        message: apiError instanceof Error ? apiError.message : String(apiError),
        stack: apiError instanceof Error ? apiError.stack : undefined
      });

      if (apiError instanceof Error) {
        if (apiError.message.includes('ENOTFOUND') || apiError.message.includes('ECONNREFUSED')) {
          console.error('🌐 Network connectivity issue detected');
          return res.status(500).json({
            error: 'Unable to connect to CoinDCX API. Please check your internet connection.',
            details: { errorType: 'NETWORK_ERROR', originalMessage: apiError.message }
          });
        }

        console.error('🚫 API connection failed with error:', apiError.message);
        return res.status(400).json({
          error: 'API connection test failed: ' + apiError.message,
          details: { errorType: 'API_ERROR', originalMessage: apiError.message }
        });
      }

      console.error('❓ Unknown error type:', typeof apiError);
      return res.status(500).json({
        error: 'Unknown error occurred while testing API connection',
        details: { errorType: 'UNKNOWN_ERROR', originalMessage: String(apiError) }
      });
    }
  } catch (error) {
    console.error('Broker test error:', error);
    next(error);
  }
});

export { router as brokerRoutes };
