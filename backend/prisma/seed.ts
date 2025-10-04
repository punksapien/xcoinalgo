import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const sampleStrategies = [
  {
    name: "ETH Trending Strategy",
    code: "BOT-ETH-TREND-001",
    description: "A sophisticated trend-following strategy for Ethereum using multiple technical indicators including MACD, RSI, and Bollinger Bands. This strategy excels in trending markets and uses dynamic stop-loss management.",
    author: "Abhishek Kumar",
    instrument: "ETHUSDT",
    tags: "Trend Following,Technical Analysis,ETH,Premium",
    winRate: 68.5,
    riskReward: 2.3,
    maxDrawdown: 12.8,
    roi: 24.7,
    marginRequired: 1000,
    scriptPath: "/strategies/eth_trend_bot.py",
    configPath: "/strategies/eth_trend_config.yaml"
  },
  {
    name: "BTC Scalping Pro",
    code: "BOT-BTC-SCALP-002",
    description: "High-frequency scalping strategy designed for Bitcoin with quick entry and exit signals. Uses volume analysis and price action patterns for optimal trade execution.",
    author: "Rajesh Singh",
    instrument: "BTCUSDT",
    tags: "Scalping,High Frequency,BTC,Advanced",
    winRate: 72.1,
    riskReward: 1.8,
    maxDrawdown: 8.5,
    roi: 31.2,
    marginRequired: 2000,
    scriptPath: "/strategies/btc_scalp_bot.py",
    configPath: "/strategies/btc_scalp_config.yaml"
  },
  {
    name: "Multi-Asset Momentum",
    code: "BOT-MOMENTUM-003",
    description: "Diversified momentum strategy that trades across multiple cryptocurrency pairs. Uses correlation analysis and momentum indicators to capture strong directional moves.",
    author: "Priya Patel",
    instrument: "MULTI",
    tags: "Momentum,Multi-Asset,Diversified,Professional",
    winRate: 65.3,
    riskReward: 2.7,
    maxDrawdown: 15.2,
    roi: 28.9,
    marginRequired: 5000,
    scriptPath: "/strategies/momentum_multi_bot.py",
    configPath: "/strategies/momentum_multi_config.yaml"
  },
  {
    name: "SOL Breakout Hunter",
    code: "BOT-SOL-BREAK-004",
    description: "Specialized breakout strategy for Solana focusing on key support and resistance levels. Combines volume confirmation with breakout patterns for high-probability trades.",
    author: "Amit Sharma",
    instrument: "SOLUSDT",
    tags: "Breakout,SOL,Support/Resistance,Free",
    winRate: 61.8,
    riskReward: 3.1,
    maxDrawdown: 18.7,
    roi: 22.4,
    marginRequired: 800,
    scriptPath: "/strategies/sol_breakout_bot.py",
    configPath: "/strategies/sol_breakout_config.yaml"
  },
  {
    name: "MATIC Grid Trading",
    code: "BOT-MATIC-GRID-005",
    description: "Advanced grid trading system optimized for Polygon (MATIC). Automatically places buy and sell orders at predefined intervals to profit from market volatility.",
    author: "Neha Gupta",
    instrument: "MATICUSDT",
    tags: "Grid Trading,MATIC,Automated,Volatility",
    winRate: 78.9,
    riskReward: 1.5,
    maxDrawdown: 7.3,
    roi: 19.6,
    marginRequired: 1200,
    scriptPath: "/strategies/matic_grid_bot.py",
    configPath: "/strategies/matic_grid_config.yaml"
  },
  {
    name: "ADA Mean Reversion",
    code: "BOT-ADA-MEAN-006",
    description: "Mean reversion strategy for Cardano that identifies overbought and oversold conditions using statistical analysis. Perfect for ranging markets with consistent profit taking.",
    author: "Vikram Rao",
    instrument: "ADAUSDT",
    tags: "Mean Reversion,ADA,Statistical,Ranging Markets",
    winRate: 69.7,
    riskReward: 2.0,
    maxDrawdown: 11.4,
    roi: 26.3,
    marginRequired: 600,
    scriptPath: "/strategies/ada_mean_bot.py",
    configPath: "/strategies/ada_mean_config.yaml"
  }
];

async function seed() {
  console.log('Seeding database with sample strategies...');

  try {
    // Clear existing strategies
    await prisma.strategy.deleteMany({});

    // Insert sample strategies
    for (const strategy of sampleStrategies) {
      await prisma.strategy.create({
        data: strategy
      });
    }

    console.log(`✅ Successfully seeded ${sampleStrategies.length} strategies`);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed function
seed();