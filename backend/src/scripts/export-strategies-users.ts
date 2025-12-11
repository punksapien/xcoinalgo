import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface DeployedUser {
  userId: string;
  userEmail: string;
  userCreatedAt: string;
  apiKey: string;
  secretKey: string;
}

interface StrategyWithUsers {
  strategyId: string;
  strategyName: string;
  instrument: string;
  strategyCreatedAt: string;
  deployedUsers: DeployedUser[];
}

async function exportStrategiesUsers() {
  console.log('\n📋 Exporting all strategies with their subscribed users...\n');

  try {
    // Get all strategies with their subscriptions
    const strategies = await prisma.strategy.findMany({
      include: {
        subscriptions: {
          where: {
            isActive: true // Only include active subscriptions
          },
          include: {
            user: {
              include: {
                brokerKeys: true
              }
            }
          }
        },
        executionConfig: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const result: StrategyWithUsers[] = [];

    for (const strategy of strategies) {
      const deployedUsers: DeployedUser[] = [];

      for (const subscription of strategy.subscriptions) {
        // Get the user's broker keys
        const brokerKey = subscription.user.brokerKeys.find(key => key.isActive);

        if (brokerKey) {
          deployedUsers.push({
            userId: subscription.user.id,
            userEmail: subscription.user.email,
            userCreatedAt: subscription.user.createdAt.toISOString().replace('T', 'T').replace(/\.\d{3}Z/, ''),
            apiKey: brokerKey.apiKey,
            secretKey: brokerKey.apiSecret
          });
        }
      }

      // Only include strategies that have at least one deployed user
      if (deployedUsers.length > 0) {
        result.push({
          strategyId: strategy.id,
          strategyName: strategy.name,
          instrument: strategy.executionConfig?.symbol || 'N/A',
          strategyCreatedAt: strategy.createdAt.toISOString().replace('T', 'T').replace(/\.\d{3}Z/, ''),
          deployedUsers
        });
      }
    }

    console.log(`Found ${result.length} strategies with deployed users`);
    console.log(`Total deployed users across all strategies: ${result.reduce((sum, s) => sum + s.deployedUsers.length, 0)}`);

    // Write to file
    const outputPath = path.join(__dirname, '../../../../../strategies_users.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 4));

    console.log(`\n✅ Export completed! File saved to: ${outputPath}\n`);

    // Print summary
    console.log('═'.repeat(80));
    console.log('SUMMARY:');
    console.log('═'.repeat(80));
    result.forEach(strategy => {
      console.log(`\n📊 ${strategy.strategyName} (${strategy.instrument})`);
      console.log(`   Strategy ID: ${strategy.strategyId}`);
      console.log(`   Deployed Users: ${strategy.deployedUsers.length}`);
      strategy.deployedUsers.forEach(user => {
        console.log(`   - ${user.userEmail}`);
      });
    });
    console.log('\n' + '═'.repeat(80) + '\n');

  } catch (error) {
    console.error('❌ Error exporting strategies and users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

exportStrategiesUsers();
