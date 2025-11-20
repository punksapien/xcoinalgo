import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkTrades() {
  console.log('\n🔍 Checking for trades in database...\n');

  try {
    // Get total trade count
    const totalTrades = await prisma.trade.count();
    console.log(`Total trades in database: ${totalTrades}\n`);

    if (totalTrades === 0) {
      console.log('⚠️  No trades found in the database.');
      console.log('   Strategies may not have executed yet, or no trades have been placed.\n');
      return;
    }

    // Get trades by strategy
    const tradesByStrategy = await prisma.trade.groupBy({
      by: ['subscriptionId'],
      _count: true,
      orderBy: {
        _count: {
          subscriptionId: 'desc'
        }
      },
      take: 10
    });

    console.log('Top 10 subscriptions by trade count:');
    console.log('═'.repeat(80));

    for (const group of tradesByStrategy) {
      const subscription = await prisma.strategySubscription.findUnique({
        where: { id: group.subscriptionId },
        include: {
          user: { select: { email: true, name: true } },
          strategy: { select: { name: true, code: true } }
        }
      });

      if (subscription) {
        console.log(`Subscription: ${subscription.id}`);
        console.log(`Strategy:     ${subscription.strategy.name}`);
        console.log(`User:         ${subscription.user.email}`);
        console.log(`Trade Count:  ${group._count}`);
        console.log('─'.repeat(80));
      }
    }

    // Get recent trades
    console.log('\n📋 Recent trades (last 5):\n');
    const recentTrades = await prisma.trade.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        subscription: {
          include: {
            user: { select: { email: true } },
            strategy: { select: { name: true } }
          }
        }
      }
    });

    recentTrades.forEach((trade, idx) => {
      console.log(`${idx + 1}. Trade ID: ${trade.id}`);
      console.log(`   Strategy:  ${trade.subscription.strategy.name}`);
      console.log(`   User:      ${trade.subscription.user.email}`);
      console.log(`   Symbol:    ${trade.symbol}`);
      console.log(`   Side:      ${trade.side}`);
      console.log(`   Status:    ${trade.status}`);
      console.log(`   P&L:       ${trade.pnl || 'N/A'}`);
      console.log(`   Created:   ${trade.createdAt.toISOString()}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkTrades();
