import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkStrategyStatus(strategyId: string) {
  console.log('\n🔍 Checking Strategy Status...\n');

  try {
    // 1. Check strategy details
    const strategy = await prisma.strategy.findUnique({
      where: { id: strategyId },
      select: {
        id: true,
        name: true,
        code: true,
        isActive: true,
        isApproved: true,
        lastDeployedAt: true,
        subscriberCount: true,
        executionConfig: true
      }
    });

    if (!strategy) {
      console.error(`❌ Strategy not found: ${strategyId}`);
      return;
    }

    console.log('📋 STRATEGY DETAILS:');
    console.log('═'.repeat(80));
    console.log(`Name:            ${strategy.name}`);
    console.log(`Code:            ${strategy.code}`);
    console.log(`Is Active:       ${strategy.isActive ? '🟢 YES' : '🔴 NO'}`);
    console.log(`Is Approved:     ${strategy.isApproved ? '✅ YES' : '❌ NO'}`);
    console.log(`Subscribers:     ${strategy.subscriberCount}`);
    console.log(`Last Deployed:   ${strategy.lastDeployedAt || 'Never'}`);
    console.log(`Execution Config:`, JSON.stringify(strategy.executionConfig, null, 2));
    console.log('═'.repeat(80));
    console.log('');

    // 2. Check recent executions
    const recentExecutions = await prisma.strategyExecution.findMany({
      where: { strategyId },
      orderBy: { executedAt: 'desc' },
      take: 10
    });

    console.log('📊 RECENT EXECUTIONS:');
    console.log('═'.repeat(80));
    if (recentExecutions.length === 0) {
      console.log('⚠️  NO EXECUTIONS FOUND - Strategy has never been executed!');
    } else {
      console.log(`Found ${recentExecutions.length} recent execution(s):\n`);
      recentExecutions.forEach((exec, idx) => {
        console.log(`${idx + 1}. Executed At: ${exec.executedAt.toISOString()}`);
        console.log(`   Status:       ${exec.status}`);
        console.log(`   Signal:       ${exec.signalType || 'N/A'}`);
        console.log(`   Subscribers:  ${exec.subscribersCount}`);
        console.log(`   Trades:       ${exec.tradesGenerated}`);
        console.log(`   Duration:     ${exec.duration}s`);
        if (exec.error) {
          console.log(`   Error:        ${exec.error}`);
        }
        console.log('');
      });

      // Show time since last execution
      const lastExecution = recentExecutions[0];
      const hoursSinceLastExecution = (Date.now() - lastExecution.executedAt.getTime()) / (1000 * 60 * 60);
      console.log(`⏱️  Time since last execution: ${hoursSinceLastExecution.toFixed(2)} hours ago`);
    }
    console.log('═'.repeat(80));
    console.log('');

    // 3. Check active subscriptions
    const activeSubscriptions = await prisma.strategySubscription.count({
      where: {
        strategyId,
        isActive: true,
        isPaused: false
      }
    });

    console.log('👥 SUBSCRIPTION STATUS:');
    console.log('═'.repeat(80));
    console.log(`Total Subscriptions:  ${strategy.subscriberCount}`);
    console.log(`Active & Not Paused:  ${activeSubscriptions}`);
    console.log('═'.repeat(80));
    console.log('');

    // 4. Diagnosis
    console.log('🔧 DIAGNOSIS:');
    console.log('═'.repeat(80));

    if (!strategy.isActive) {
      console.log('❌ ISSUE: Strategy is NOT ACTIVE');
      console.log('   → The strategy needs to be activated in the database');
    }

    if (!strategy.isApproved) {
      console.log('⚠️  WARNING: Strategy is NOT APPROVED');
      console.log('   → This might prevent execution in production');
    }

    if (recentExecutions.length === 0) {
      console.log('❌ ISSUE: NO EXECUTIONS FOUND');
      console.log('   → The strategy execution service has never run for this strategy');
      console.log('   → Possible causes:');
      console.log('      1. PM2 process not running');
      console.log('      2. Cron job not configured');
      console.log('      3. Strategy not registered in execution scheduler');
      console.log('      4. Execution interval not set');
    } else {
      const lastExecution = recentExecutions[0];
      const hoursSinceLastExecution = (Date.now() - lastExecution.executedAt.getTime()) / (1000 * 60 * 60);

      if (hoursSinceLastExecution > 24) {
        console.log(`⚠️  WARNING: Last execution was ${hoursSinceLastExecution.toFixed(2)} hours ago`);
        console.log('   → Strategy execution service may have stopped');
      } else {
        console.log(`✅ Strategy was executed recently (${hoursSinceLastExecution.toFixed(2)} hours ago)`);
      }
    }

    if (activeSubscriptions === 0) {
      console.log('⚠️  WARNING: No active subscriptions ready to trade');
      console.log('   → All subscriptions are either inactive or paused');
    }

    console.log('═'.repeat(80));
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

const strategyId = process.argv[2] || 'cmh7lyx0y0000p91hb96tpbl6';
checkStrategyStatus(strategyId);
