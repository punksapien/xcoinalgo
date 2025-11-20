import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkExecutionHistory(strategyId: string) {
  console.log('\n🔍 Checking Execution History...\n');

  try {
    // Get total execution count
    const totalExecutions = await prisma.strategyExecution.count({
      where: { strategyId }
    });

    console.log(`Total executions ever: ${totalExecutions}\n`);

    // Get first execution
    const firstExecution = await prisma.strategyExecution.findFirst({
      where: { strategyId },
      orderBy: { executedAt: 'asc' }
    });

    // Get last execution
    const lastExecution = await prisma.strategyExecution.findFirst({
      where: { strategyId },
      orderBy: { executedAt: 'desc' }
    });

    if (firstExecution) {
      console.log('📅 FIRST EXECUTION:');
      console.log(`   Date: ${firstExecution.executedAt.toISOString()}`);
      console.log(`   Status: ${firstExecution.status}`);
      console.log(`   Signal: ${firstExecution.signalType || 'N/A'}`);
      console.log('');
    }

    if (lastExecution) {
      console.log('📅 LAST EXECUTION:');
      console.log(`   Date: ${lastExecution.executedAt.toISOString()}`);
      console.log(`   Status: ${lastExecution.status}`);
      console.log(`   Signal: ${lastExecution.signalType || 'N/A'}`);
      console.log('');

      const daysSinceFirst = firstExecution
        ? (lastExecution.executedAt.getTime() - firstExecution.executedAt.getTime()) / (1000 * 60 * 60 * 24)
        : 0;
      console.log(`⏱️  Strategy has been running for: ${daysSinceFirst.toFixed(2)} days\n`);
    }

    // Check for any successful executions
    const successfulExecutions = await prisma.strategyExecution.findMany({
      where: {
        strategyId,
        status: 'success'
      },
      orderBy: { executedAt: 'desc' },
      take: 5
    });

    console.log('✅ SUCCESSFUL EXECUTIONS:');
    console.log('═'.repeat(80));
    if (successfulExecutions.length === 0) {
      console.log('⚠️  NO SUCCESSFUL EXECUTIONS FOUND - All executions have failed!');
    } else {
      console.log(`Found ${successfulExecutions.length} successful execution(s):\n`);
      successfulExecutions.forEach((exec, idx) => {
        console.log(`${idx + 1}. ${exec.executedAt.toISOString()}`);
        console.log(`   Signal: ${exec.signalType}`);
        console.log(`   Subscribers: ${exec.subscribersCount} | Trades: ${exec.tradesGenerated}`);
        console.log('');
      });
    }
    console.log('═'.repeat(80));
    console.log('');

    // Check execution frequency over last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const executionsLast30Days = await prisma.strategyExecution.count({
      where: {
        strategyId,
        executedAt: { gte: thirtyDaysAgo }
      }
    });

    console.log('📊 EXECUTION FREQUENCY (Last 30 days):');
    console.log('═'.repeat(80));
    console.log(`Total executions: ${executionsLast30Days}`);
    console.log(`Expected (every 5 min): ${(30 * 24 * 60) / 5} executions`);

    if (executionsLast30Days === 0) {
      console.log('\n❌ ZERO executions in the last 30 days!');
      console.log('   This strategy has NOT been running for at least a month.');
    } else if (executionsLast30Days < 1000) {
      console.log(`\n⚠️  Only ${executionsLast30Days} executions in 30 days (very low)`);
      console.log('   Strategy may have been offline or only recently started.');
    }
    console.log('═'.repeat(80));
    console.log('');

    // Group executions by date
    const executionsByDate = await prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT DATE(executed_at) as date, COUNT(*) as count
      FROM strategy_executions
      WHERE strategy_id = ${strategyId}
      GROUP BY DATE(executed_at)
      ORDER BY DATE(executed_at) DESC
      LIMIT 30
    `;

    console.log('📆 EXECUTIONS BY DATE (Last 30 days):');
    console.log('═'.repeat(80));
    if (executionsByDate.length > 0) {
      executionsByDate.forEach(row => {
        console.log(`${row.date}: ${row.count} executions`);
      });
    } else {
      console.log('No execution data available');
    }
    console.log('═'.repeat(80));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

const strategyId = process.argv[2] || 'cmh7lyx0y0000p91hb96tpbl6';
checkExecutionHistory(strategyId);
