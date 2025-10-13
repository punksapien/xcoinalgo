import crypto from 'crypto';
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

    // Decrypt credentials
    const apiKey = decrypt(cred.apiKey);
    const apiSecret = decrypt(cred.apiSecret);

    console.log('\n🔑 API Key (first 10 chars):', apiKey.substring(0, 10));
    console.log('🔑 API Secret (first 10 chars):', apiSecret.substring(0, 10));

    // Test the API call using node-fetch with request-like syntax
    const baseurl = "https://api.coindcx.com";
    const timeStamp = Math.floor(Date.now());
    const body = { timestamp: timeStamp };
    const payload = JSON.stringify(body);
    const signature = crypto.createHmac('sha256', apiSecret).update(payload).digest('hex');

    console.log('\n📡 Making API request...');
    console.log('Timestamp:', timeStamp);
    console.log('Payload:', payload);
    console.log('Signature (first 20 chars):', signature.substring(0, 20));

    // Try using fetch WITHOUT body (GET requests shouldn't have body)
    const url = `${baseurl}/exchange/v1/derivatives/futures/wallets`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-AUTH-APIKEY': apiKey,
        'X-AUTH-SIGNATURE': signature,
      },
    });

    console.log('\n📊 Response status:', response.status);
    
    const responseText = await response.text();
    console.log('📊 Response body:', responseText);

    if (response.ok) {
      const wallets = JSON.parse(responseText);
      console.log('\n✅ SUCCESS! Wallets:', JSON.stringify(wallets, null, 2));
    } else {
      console.log('\n❌ FAILED with status:', response.status);
    }

  } catch (error) {
    console.error('❌ ERROR:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testWalletAPI();

