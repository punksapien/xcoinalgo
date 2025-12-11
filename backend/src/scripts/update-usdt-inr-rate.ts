/**
 * Cron Script: Update USDT/INR Conversion Rate
 *
 * This script fetches the current USDT/INR conversion rate from CoinDCX
 * and stores it in the SystemConfig table.
 *
 * Run frequency: Every 4 months (or manually when needed)
 *
 * Usage:
 *   npx ts-node src/scripts/update-usdt-inr-rate.ts
 *   # or after building:
 *   node dist/scripts/update-usdt-inr-rate.js
 */

import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COINDCX_API_URL = 'https://api.coindcx.com/api/v1/derivatives/futures/data/conversions';

interface ConversionData {
  symbol: string;
  margin_currency_short_name: string;
  target_currency_short_name: string;
  conversion_price: number;
  last_updated_at: number;
}

async function fetchConversionRate(apiKey: string, apiSecret: string): Promise<number | null> {
  const timestamp = Date.now();
  const body = { timestamp };

  const payload = Buffer.from(JSON.stringify(body)).toString();
  const signature = crypto.createHmac('sha256', apiSecret).update(payload).digest('hex');

  try {
    const response = await fetch(COINDCX_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AUTH-APIKEY': apiKey,
        'X-AUTH-SIGNATURE': signature,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error(`API request failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as ConversionData[];
    const usdtInr = data.find(item => item.symbol === 'USDTINR');

    if (usdtInr) {
      console.log(`Fetched USDT/INR rate: ${usdtInr.conversion_price}`);
      console.log(`Last updated at: ${new Date(usdtInr.last_updated_at).toISOString()}`);
      return usdtInr.conversion_price;
    }

    console.error('USDTINR not found in response');
    return null;
  } catch (error) {
    console.error('Failed to fetch conversion rate:', error);
    return null;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('USDT/INR Rate Update Script');
  console.log('='.repeat(60));
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('');

  try {
    // Pick a random active broker credential
    const credentials = await prisma.brokerCredential.findMany({
      where: { isActive: true },
      select: { apiKey: true, apiSecret: true },
    });

    if (credentials.length === 0) {
      console.error('No active broker credentials found in database');
      process.exit(1);
    }

    // Pick a random one
    const randomIndex = Math.floor(Math.random() * credentials.length);
    const { apiKey, apiSecret } = credentials[randomIndex];
    console.log(`Using credential ${randomIndex + 1} of ${credentials.length} (randomly selected)`);

    // Fetch the conversion rate
    const rate = await fetchConversionRate(apiKey, apiSecret);

    if (rate === null) {
      console.error('Failed to fetch conversion rate');
      process.exit(1);
    }

    // Store in database
    await prisma.systemConfig.upsert({
      where: { key: 'USDT_INR_RATE' },
      update: { value: rate.toString() },
      create: { key: 'USDT_INR_RATE', value: rate.toString() },
    });

    console.log('');
    console.log(`✅ Successfully updated USDT_INR_RATE to ${rate}`);
    console.log(`Stored in system_config table`);
    console.log('');
    console.log('Next update recommended in 4 months');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
