/**
 * Bulk Update Script: Set all active strategies to isPublic=true
 *
 * This script updates all existing strategies that are active to be public.
 * Run this once to fix the data before deploying the new access control logic.
 */

import prisma from '../src/utils/database';

async function main() {
  console.log('🔍 Checking current strategy visibility status...\n');

  // Get current counts
  const [totalStrategies, activeStrategies, publicStrategies, privateStrategies] = await Promise.all([
    prisma.strategy.count(),
    prisma.strategy.count({ where: { isActive: true } }),
    prisma.strategy.count({ where: { isActive: true, isPublic: true } }),
    prisma.strategy.count({ where: { isActive: true, isPublic: false } }),
  ]);

  console.log('Current Status:');
  console.log(`- Total strategies: ${totalStrategies}`);
  console.log(`- Active strategies: ${activeStrategies}`);
  console.log(`- Active + Public: ${publicStrategies}`);
  console.log(`- Active + Private: ${privateStrategies}\n`);

  if (privateStrategies === 0) {
    console.log('✅ All active strategies are already public. No update needed.');
    return;
  }

  console.log(`📝 Will update ${privateStrategies} private strategies to public...\n`);

  // List strategies that will be updated
  const strategiesToUpdate = await prisma.strategy.findMany({
    where: {
      isActive: true,
      isPublic: false,
    },
    select: {
      id: true,
      name: true,
      code: true,
      author: true,
    }
  });

  console.log('Strategies to be updated:');
  strategiesToUpdate.forEach((strategy, index) => {
    console.log(`${index + 1}. ${strategy.name} (${strategy.code}) by ${strategy.author}`);
  });

  console.log('\n🚀 Updating strategies...');

  // Perform the bulk update
  const result = await prisma.strategy.updateMany({
    where: {
      isActive: true,
      isPublic: false,
    },
    data: {
      isPublic: true,
    }
  });

  console.log(`\n✅ Successfully updated ${result.count} strategies to public`);

  // Verify the update
  const afterUpdate = await prisma.strategy.count({
    where: { isActive: true, isPublic: false }
  });

  console.log(`\n🔍 Verification: ${afterUpdate} active private strategies remaining`);

  if (afterUpdate === 0) {
    console.log('✅ All active strategies are now public!');
  } else {
    console.warn('⚠️  Some strategies are still private. Please investigate.');
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error('❌ Error:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
