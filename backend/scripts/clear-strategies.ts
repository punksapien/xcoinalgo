/**
 * Clear all strategies from database
 * Use with caution - this deletes ALL strategy data!
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function clearStrategies() {
  console.log('🗑️  Clearing all strategies from database...\n')

  try {
    // Delete in correct order to respect foreign key constraints

    console.log('Deleting trades...')
    const trades = await prisma.trade.deleteMany({})
    console.log(`  ✓ Deleted ${trades.count} trades`)

    console.log('Deleting strategy executions...')
    const executions = await prisma.strategyExecution.deleteMany({})
    console.log(`  ✓ Deleted ${executions.count} executions`)

    console.log('Deleting strategy subscriptions...')
    const subscriptions = await prisma.strategySubscription.deleteMany({})
    console.log(`  ✓ Deleted ${subscriptions.count} subscriptions`)

    console.log('Deleting bot deployments...')
    const deployments = await prisma.botDeployment.deleteMany({})
    console.log(`  ✓ Deleted ${deployments.count} deployments`)

    console.log('Deleting strategies...')
    const strategies = await prisma.strategy.deleteMany({})
    console.log(`  ✓ Deleted ${strategies.count} strategies`)

    console.log('\n✅ All strategies and related data cleared successfully!')

  } catch (error) {
    console.error('❌ Error clearing strategies:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

clearStrategies()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })

