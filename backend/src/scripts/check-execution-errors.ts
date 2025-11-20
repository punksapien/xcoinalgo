import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkExecutionErrors(strategyId: string) {
  console.log('\n🔍 Checking Execution Errors...\n');

  const executions = await prisma.strategyExecution.findMany({
    where: { strategyId },
    orderBy: { executedAt: 'desc' },
    take: 5,
    select: {
      executedAt: true,
      status: true,
      error: true,
      duration: true,
      signalType: true,
      subscribersCount: true,
      tradesGenerated: true
    }
  });

  console.log(`Last ${executions.length} executions:\n`);
  console.log('═'.repeat(100));

  executions.forEach((exec, idx) => {
    console.log(`${idx + 1}. Executed At: ${exec.executedAt.toISOString()}`);
    console.log(`   Status:      ${exec.status}`);
    console.log(`   Signal:      ${exec.signalType || 'N/A'}`);
    console.log(`   Subscribers: ${exec.subscribersCount}`);
    console.log(`   Trades:      ${exec.tradesGenerated}`);
    console.log(`   Duration:    ${exec.duration}s`);

    if (exec.error) {
      console.log(`   ❌ ERROR:`);
      console.log(`   ${exec.error}`);
    } else {
      console.log(`   ⚠️  No error message logged`);
    }
    console.log('─'.repeat(100));
  });

  await prisma.$disconnect();
}

const strategyId = process.argv[2] || 'cmh7lyx0y0000p91hb96tpbl6';
checkExecutionErrors(strategyId);
