import * as CoinDCXClient from './src/services/coindcx-client';
import { decrypt } from './src/utils/simple-crypto';
import prisma from './src/utils/database';

async function testWalletAPI() {
  try {
    // Get first user's credentials
    const cred = await prisma.brokerCredential.findFirst({
      where: { brokerName: 'coindcx', isActive: true }
    });

    if (!cred) {
      console.log('❌ No broker credentials found');
      return;
    }

    console.log('✅ Found credentials for user:', cred.userId);

    // Test the API call
    const wallets = await CoinDCXClient.getFuturesWallets(
      cred.apiKey,
      cred.apiSecret
    );

    console.log('\n📊 RAW WALLET DATA FROM COINDCX:');
    console.log(JSON.stringify(wallets, null, 2));

    const usdtWallet = wallets.find((w: any) => w.currency_short_name === 'USDT');
    
    console.log('\n💰 USDT WALLET:');
    console.log(JSON.stringify(usdtWallet, null, 2));

    if (usdtWallet) {
      console.log('\n🔢 TYPE CHECKS:');
      console.log('balance type:', typeof (usdtWallet as any).balance);
      console.log('balance value:', (usdtWallet as any).balance);
      console.log('Number(balance):', Number((usdtWallet as any).balance));
      
      const balance = Number((usdtWallet as any).balance || 0);
      const locked = Number((usdtWallet as any).locked_balance || 0);
      const crossOrder = Number((usdtWallet as any).cross_order_margin || 0);
      const crossUser = Number((usdtWallet as any).cross_user_margin || 0);
      
      console.log('\n💵 CALCULATION:');
      console.log('balance:', balance);
      console.log('locked:', locked);
      console.log('crossOrder:', crossOrder);
      console.log('crossUser:', crossUser);
      console.log('available:', balance - (locked + crossOrder + crossUser));
    }

  } catch (error) {
    console.error('❌ ERROR:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testWalletAPI();

