/**
 * Generalized Bulk Subscription Script
 *
 * Usage:
 *   npx ts-node scripts/bulk-subscribe-from-csv.ts <csv-file-path> <strategy-id>
 *
 * CSV Format (with header):
 *   email,capital,risk_per_trade,leverage,api,secret
 *   user@example.com,10000,0.15,10,api_key,api_secret
 *
 * Example:
 *   npx ts-node scripts/bulk-subscribe-from-csv.ts users.csv cmj7cm5rd0004p99liyiota9i
 */

import * as fs from 'fs';
import * as path from 'path';
import prisma from '../src/utils/database';
import CoinDCXClient from '../src/services/coindcx-client';

interface UserData {
  email: string;
  capital: number;
  risk_per_trade: number;
  leverage: number;
  api: string;
  secret: string;
}

function parseCSV(filePath: string): UserData[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length < 2) {
    throw new Error('CSV file must have at least a header and one data row');
  }

  const headers = lines[0].split(',').map(h => h.trim());
  const users: UserData[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());

    if (values.length !== headers.length) {
      console.warn(`⚠️  Skipping line ${i + 1}: column count mismatch`);
      continue;
    }

    const user: any = {};
    headers.forEach((header, index) => {
      user[header] = values[index];
    });

    users.push({
      email: user.email,
      capital: Number(user.capital),
      risk_per_trade: Number(user.risk_per_trade),
      leverage: Number(user.leverage),
      api: user.api,
      secret: user.secret
    });
  }

  return users;
}

async function setupBrokerCredentials(usersData: UserData[]) {
  console.log('🔧 Setting up broker credentials for users...\n');

  for (const userData of usersData) {
    console.log(`Processing ${userData.email}...`);

    try {
      // Find user
      const user = await prisma.user.findUnique({
        where: { email: userData.email.toLowerCase() }
      });

      if (!user) {
        console.log(`  ❌ User not found: ${userData.email}\n`);
        continue;
      }

      // Check if credentials already exist
      const existingCred = await prisma.brokerCredential.findUnique({
        where: {
          userId_brokerName: {
            userId: user.id,
            brokerName: 'coindcx'
          }
        }
      });

      // Validate credentials with CoinDCX
      console.log(`  🔍 Validating credentials with CoinDCX...`);
      try {
        const wallets = await CoinDCXClient.getFuturesWallets(userData.api, userData.secret);
        console.log(`  ✅ Credentials valid! Found ${wallets.length} wallets`);
      } catch (error: any) {
        console.log(`  ❌ Invalid credentials: ${error.message}\n`);
        continue;
      }

      if (existingCred) {
        // Update existing credentials
        await prisma.brokerCredential.update({
          where: { id: existingCred.id },
          data: {
            apiKey: userData.api,
            apiSecret: userData.secret,
            isActive: true
          }
        });
        console.log(`  ✅ Updated broker credentials\n`);
      } else {
        // Create new credentials
        await prisma.brokerCredential.create({
          data: {
            userId: user.id,
            brokerName: 'coindcx',
            apiKey: userData.api,
            apiSecret: userData.secret,
            isActive: true
          }
        });
        console.log(`  ✅ Created broker credentials\n`);
      }
    } catch (error: any) {
      console.log(`  ❌ Error: ${error.message}\n`);
    }
  }
}

async function bulkSubscribeUsers(usersData: UserData[], strategyId: string) {
  console.log('\n📊 Subscribing users to strategy...\n');

  const { subscriptionService } = await import('../src/services/strategy-execution/subscription-service');

  const results = [];

  for (const userData of usersData) {
    const result: any = {
      email: userData.email,
      status: 'failed',
      error: null,
      subscriptionId: null
    };

    try {
      console.log(`Processing ${userData.email}...`);

      // Find user
      const user = await prisma.user.findUnique({
        where: { email: userData.email.toLowerCase() }
      });

      if (!user) {
        result.error = 'User not found';
        console.log(`  ❌ ${result.error}\n`);
        results.push(result);
        continue;
      }

      // Get broker credentials
      const brokerCredential = await prisma.brokerCredential.findFirst({
        where: { userId: user.id, isActive: true }
      });

      if (!brokerCredential) {
        result.error = 'No active broker credentials';
        console.log(`  ❌ ${result.error}\n`);
        results.push(result);
        continue;
      }

      // Check if already subscribed
      const existing = await prisma.strategySubscription.findFirst({
        where: {
          userId: user.id,
          strategyId,
          isActive: true
        }
      });

      if (existing) {
        result.status = 'already_subscribed';
        result.subscriptionId = existing.id;
        console.log(`  ⚠️  Already subscribed (ID: ${existing.id})\n`);
        results.push(result);
        continue;
      }

      // Check wallet balance
      const wallets = await CoinDCXClient.getFuturesWallets(
        brokerCredential.apiKey,
        brokerCredential.apiSecret
      );

      const calculateAvailable = (w: any) =>
        Number(w.balance || 0) -
        (Number(w.cross_order_margin || 0) + Number(w.cross_user_margin || 0));

      const primaryWallet =
        wallets.find((w: any) => w.currency_short_name === 'INR') ||
        wallets.find((w: any) => w.currency_short_name === 'USDT');

      if (!primaryWallet) {
        result.error = 'No futures wallet found';
        console.log(`  ❌ ${result.error}\n`);
        results.push(result);
        continue;
      }

      const available = calculateAvailable(primaryWallet);
      console.log(`  💰 Available balance: ${available.toFixed(2)} ${primaryWallet.currency_short_name}`);

      if (!isFinite(available) || available < Number(userData.capital)) {
        console.log(`  ⚠️  Low balance: ${available.toFixed(2)} < ${userData.capital} (proceeding anyway)`);
      }

      // Create subscription
      const subscription = await subscriptionService.createSubscription({
        userId: user.id,
        strategyId,
        capital: Number(userData.capital),
        riskPerTrade: userData.risk_per_trade,
        leverage: userData.leverage,
        brokerCredentialId: brokerCredential.id,
        maxPositions: 1,
        maxDailyLoss: 0.05
      });

      result.status = 'success';
      result.subscriptionId = subscription.subscriptionId;
      result.settings = {
        capital: userData.capital,
        riskPerTrade: userData.risk_per_trade,
        leverage: userData.leverage
      };

      console.log(`  ✅ Subscribed! ID: ${subscription.subscriptionId}`);
      console.log(`     Capital: ${userData.capital}, Risk: ${userData.risk_per_trade}, Leverage: ${userData.leverage}\n`);

      results.push(result);
    } catch (error: any) {
      result.error = error.message || String(error);
      console.log(`  ❌ Error: ${result.error}\n`);
      results.push(result);
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📈 SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Total users: ${results.length}`);
  console.log(`✅ Success: ${results.filter(r => r.status === 'success').length}`);
  console.log(`⚠️  Already subscribed: ${results.filter(r => r.status === 'already_subscribed').length}`);
  console.log(`❌ Failed: ${results.filter(r => r.status === 'failed').length}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // Detailed results
  console.log('Detailed Results:');
  console.log(JSON.stringify(results, null, 2));

  return results;
}

async function main() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);

    if (args.length < 2) {
      console.error('❌ Usage: npx ts-node scripts/bulk-subscribe-from-csv.ts <csv-file-path> <strategy-id>');
      console.error('');
      console.error('Example:');
      console.error('  npx ts-node scripts/bulk-subscribe-from-csv.ts users.csv cmj7cm5rd0004p99liyiota9i');
      console.error('');
      console.error('CSV Format:');
      console.error('  email,capital,risk_per_trade,leverage,api,secret');
      console.error('  user@example.com,10000,0.15,10,api_key,api_secret');
      process.exit(1);
    }

    const csvFilePath = args[0];
    const strategyId = args[1];

    // Validate CSV file exists
    if (!fs.existsSync(csvFilePath)) {
      console.error(`❌ CSV file not found: ${csvFilePath}`);
      process.exit(1);
    }

    console.log('🚀 Starting bulk subscription process...\n');
    console.log(`CSV File: ${csvFilePath}`);
    console.log(`Strategy ID: ${strategyId}\n`);

    // Parse CSV
    const usersData = parseCSV(csvFilePath);
    console.log(`📋 Loaded ${usersData.length} users from CSV\n`);

    // Validate strategy exists
    const strategy = await prisma.strategy.findUnique({
      where: { id: strategyId },
      select: { id: true, name: true, code: true }
    });

    if (!strategy) {
      console.error(`❌ Strategy not found: ${strategyId}`);
      process.exit(1);
    }

    console.log(`✅ Strategy found: ${strategy.name} (${strategy.code})\n`);

    // Step 1: Setup broker credentials
    await setupBrokerCredentials(usersData);

    // Step 2: Subscribe users
    await bulkSubscribeUsers(usersData, strategyId);

    console.log('\n✅ Process completed!');
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
