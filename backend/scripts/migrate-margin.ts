/**
 * Migration script to calculate and update margin for existing strategies
 * Run this once to apply margin calculation to all existing strategies
 */

import prisma from '../src/utils/database';

interface RiskProfile {
  recommendedCapital?: number;
  leverage?: number;
}

interface Config {
  pair?: string;
  instrument?: string;
  riskProfile?: RiskProfile;
}

function calculateMargin(config: Config): { marginRequired: number | null; marginCurrency: string } {
  let marginRequired: number | null = null;
  let marginCurrency = 'INR'; // Default for spot

  // Determine currency based on pair
  const pair = config.pair || config.instrument || '';
  if (pair.startsWith('B-')) {
    marginCurrency = 'USDT'; // Futures use USDT
  }

  // Calculate margin from riskProfile
  if (config.riskProfile) {
    const { recommendedCapital, leverage } = config.riskProfile;

    if (recommendedCapital && leverage && leverage > 0) {
      // For futures: margin = capital / leverage
      // For spot: margin = capital (no leverage)
      if (marginCurrency === 'USDT' && leverage > 1) {
        marginRequired = recommendedCapital / leverage;
      } else {
        marginRequired = recommendedCapital;
      }
    } else if (recommendedCapital) {
      // No leverage specified, use capital as margin
      marginRequired = recommendedCapital;
    }
  }

  return { marginRequired, marginCurrency };
}

async function migrateMargin() {
  console.log('🔄 Starting margin migration...\n');

  try {
    // Fetch all strategies
    const strategies = await prisma.strategy.findMany({
      include: {
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    console.log(`Found ${strategies.length} strategies to process\n`);

    let updated = 0;
    let skipped = 0;

    for (const strategy of strategies) {
      const latestVersion = strategy.versions[0];

      if (!latestVersion || !latestVersion.configData) {
        console.log(`⏭️  Skipping ${strategy.code} - No config found`);
        skipped++;
        continue;
      }

      const config = latestVersion.configData as Config;
      const { marginRequired, marginCurrency } = calculateMargin(config);

      // Update only if margin was calculated
      if (marginRequired !== null) {
        await prisma.strategy.update({
          where: { id: strategy.id },
          data: {
            marginRequired,
            marginCurrency
          }
        });

        console.log(`✅ Updated ${strategy.code}:`);
        console.log(`   Pair: ${config.pair || 'unknown'}`);
        console.log(`   Margin: ${marginCurrency === 'USDT' ? '$' : '₹'}${marginRequired.toFixed(2)}`);
        console.log(`   Currency: ${marginCurrency}\n`);
        updated++;
      } else {
        console.log(`⏭️  Skipping ${strategy.code} - No riskProfile found\n`);
        skipped++;
      }
    }

    console.log('\n📊 Migration complete!');
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   📦 Total: ${strategies.length}\n`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
migrateMargin()
  .then(() => {
    console.log('✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

