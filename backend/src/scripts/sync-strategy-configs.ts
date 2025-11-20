/**
 * Migration script to sync strategy executionConfig from Python files
 *
 * This script:
 * 1. Finds all strategies with missing or incomplete executionConfig
 * 2. Reads their Python files and extracts STRATEGY_CONFIG
 * 3. Updates the database with extracted config
 * 4. Registers strategies with active subscriptions in the scheduler
 *
 * Usage: npm run sync-configs
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { extractStrategyConfig } from '../utils/strategy-config-extractor';
import { strategyRegistry } from '../services/strategy-execution/strategy-registry';

const prisma = new PrismaClient();

interface StrategyToSync {
  id: string;
  name: string;
  code: string;
  executionConfig: any;
  hasActiveSubscriptions: boolean;
  subscriberCount: number;
}

async function syncStrategyConfigs() {
  console.log('🔄 Starting strategy config sync...\n');

  try {
    // Find all active strategies
    const strategies = await prisma.strategy.findMany({
      where: {
        isActive: true
      },
      select: {
        id: true,
        name: true,
        code: true,
        executionConfig: true,
        subscriberCount: true,
        subscriptions: {
          where: { isActive: true },
          select: { id: true }
        }
      }
    });

    console.log(`📊 Found ${strategies.length} active strategies\n`);

    const strategiesToSync: StrategyToSync[] = [];
    const strategiesDir = path.join(__dirname, '../../strategies');

    // Identify strategies that need syncing
    for (const strategy of strategies) {
      const hasActiveSubscriptions = strategy.subscriptions.length > 0;
      const config = strategy.executionConfig as any;

      // Check if config is missing critical fields
      const needsSync = !config || !config.pair || !config.resolution;

      if (needsSync) {
        strategiesToSync.push({
          id: strategy.id,
          name: strategy.name,
          code: strategy.code,
          executionConfig: config,
          hasActiveSubscriptions,
          subscriberCount: strategy.subscriberCount
        });
      }
    }

    if (strategiesToSync.length === 0) {
      console.log('✅ All strategies already have valid executionConfig. Nothing to sync.');
      return;
    }

    console.log(`⚠️  Found ${strategiesToSync.length} strategies needing config sync:\n`);
    strategiesToSync.forEach(s => {
      console.log(`  - ${s.name} (${s.id})`);
      console.log(`    Current config: ${JSON.stringify(s.executionConfig)}`);
      console.log(`    Active subscribers: ${s.subscriberCount}`);
      console.log('');
    });

    // Sync each strategy
    let syncedCount = 0;
    let failedCount = 0;

    for (const strategy of strategiesToSync) {
      try {
        console.log(`\n🔧 Syncing ${strategy.name}...`);

        // Find Python file
        const strategyDir = path.join(strategiesDir, strategy.id);
        if (!fs.existsSync(strategyDir)) {
          console.log(`  ❌ Strategy directory not found: ${strategyDir}`);
          failedCount++;
          continue;
        }

        // Find .py file in directory
        const files = fs.readdirSync(strategyDir);
        const pythonFile = files.find(f => f.endsWith('.py'));

        if (!pythonFile) {
          console.log(`  ❌ No Python file found in ${strategyDir}`);
          failedCount++;
          continue;
        }

        const pythonFilePath = path.join(strategyDir, pythonFile);
        const strategyCode = fs.readFileSync(pythonFilePath, 'utf8');

        // Extract config
        console.log(`  📄 Reading ${pythonFile}...`);
        const configExtraction = extractStrategyConfig(strategyCode);

        if (!configExtraction.success || !configExtraction.config) {
          console.log(`  ❌ Failed to extract STRATEGY_CONFIG from Python file`);
          failedCount++;
          continue;
        }

        const extractedConfig = configExtraction.config;
        console.log(`  ✅ Extracted ${configExtraction.extractedParams.length} config parameters`);

        // Merge with existing config (preserve minMargin if it exists)
        const mergedConfig = {
          ...extractedConfig,
          ...(strategy.executionConfig || {}), // Preserve any existing fields like minMargin
        };

        // Ensure pair and resolution are from extracted config (don't allow override)
        if (extractedConfig.pair) mergedConfig.pair = extractedConfig.pair;
        if (extractedConfig.resolution) mergedConfig.resolution = extractedConfig.resolution;

        console.log(`  💾 Updating database...`);
        console.log(`     pair: ${mergedConfig.pair}`);
        console.log(`     resolution: ${mergedConfig.resolution}`);
        console.log(`     minMargin: ${mergedConfig.minMargin || 'not set'}`);

        // Update database
        await prisma.strategy.update({
          where: { id: strategy.id },
          data: {
            executionConfig: mergedConfig
          }
        });

        console.log(`  ✅ Database updated`);

        // Register with scheduler if has active subscriptions
        if (strategy.hasActiveSubscriptions && mergedConfig.pair && mergedConfig.resolution) {
          console.log(`  📋 Registering with scheduler...`);

          try {
            await strategyRegistry.registerStrategy(
              strategy.id,
              mergedConfig.pair,
              mergedConfig.resolution
            );
            console.log(`  ✅ Registered for ${mergedConfig.pair}/${mergedConfig.resolution}`);
          } catch (regError) {
            console.log(`  ⚠️  Registration warning: ${regError instanceof Error ? regError.message : String(regError)}`);
            // Don't fail the sync if registration fails - config is still saved
          }
        } else if (strategy.hasActiveSubscriptions) {
          console.log(`  ⚠️  Has subscribers but missing pair/resolution - cannot register`);
        }

        syncedCount++;
        console.log(`  ✅ Sync complete for ${strategy.name}`);

      } catch (error) {
        console.log(`  ❌ Failed to sync ${strategy.name}:`, error instanceof Error ? error.message : String(error));
        failedCount++;
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log(`\n📊 Sync Summary:`);
    console.log(`  Total strategies needing sync: ${strategiesToSync.length}`);
    console.log(`  ✅ Successfully synced: ${syncedCount}`);
    console.log(`  ❌ Failed: ${failedCount}`);
    console.log('');

    if (syncedCount > 0) {
      console.log('🎉 Config sync completed successfully!');
      console.log('\n💡 Strategies are now registered with the scheduler.');
      console.log('   Next candle execution will pick them up automatically.\n');
    }

  } catch (error) {
    console.error('❌ Fatal error during sync:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  syncStrategyConfigs()
    .then(() => {
      console.log('✅ Done');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error:', error);
      process.exit(1);
    });
}

export { syncStrategyConfigs };
