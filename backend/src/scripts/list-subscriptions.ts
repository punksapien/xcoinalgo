import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function listSubscriptions() {
  console.log('\n📋 Listing all subscriptions...\n');

  try {
    const subscriptions = await prisma.strategySubscription.findMany({
      include: {
        user: {
          select: {
            email: true,
            name: true
          }
        },
        strategy: {
          select: {
            id: true,
            name: true,
            code: true
          }
        }
      },
      orderBy: {
        subscribedAt: 'desc'
      }
    });

    if (subscriptions.length === 0) {
      console.log('⚠️  No subscriptions found in the database.');
      return;
    }

    console.log(`Found ${subscriptions.length} subscription(s):\n`);
    console.log('═'.repeat(100));

    subscriptions.forEach((sub, index) => {
      console.log(`${index + 1}. Subscription ID: ${sub.id}`);
      console.log(`   Strategy ID:   ${sub.strategyId}`);
      console.log(`   Strategy:      ${sub.strategy.name} (${sub.strategy.code})`);
      console.log(`   User:          ${sub.user.name || 'N/A'} (${sub.user.email})`);
      console.log(`   Capital:       ${sub.capital}`);
      console.log(`   Total Trades:  ${sub.totalTrades}`);
      console.log(`   Total P&L:     ${sub.totalPnl}`);
      console.log(`   Active:        ${sub.isActive}`);
      console.log(`   Subscribed At: ${sub.subscribedAt.toISOString()}`);
      console.log('─'.repeat(100));
    });

    console.log('\n');

  } catch (error) {
    console.error('❌ Error listing subscriptions:', error);
  } finally {
    await prisma.$disconnect();
  }
}

listSubscriptions();
