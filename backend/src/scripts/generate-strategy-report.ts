import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface SubscriberRow {
  subscriberId: string;
  userEmail: string;
  userName: string;
  capital: number;
  riskPerTrade: number;
  leverage: number;
  maxPositions: number;
  tradingType: string;
  marginCurrency: string;
  isActive: boolean;
  isPaused: boolean;
  subscribedAt: Date;
  totalTrades: number;
  openPositions: number;
  closedTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
  largestWin: number;
  largestLoss: number;
  profitFactor: number;
}

interface TradeRow {
  tradeId: string;
  subscriberId: string;
  subscriberEmail: string;
  subscriberName: string;
  symbol: string;
  side: string;
  quantity: number;
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  leverage: number | null;
  tradingType: string;
  marginCurrency: string | null;
  liquidationPrice: number | null;
  status: string;
  pnl: number | null;
  pnlPct: number | null;
  fees: number;
  entryTime: Date;
  exitTime: Date | null;
  exitReason: string | null;
  positionId: string | null;
  orderId: string | null;
}

async function generateStrategyReport(strategyId: string, daysBack: number = 30, outputPath?: string): Promise<void> {
  console.log('\n🔍 Starting Strategy Report Generation...\n');
  console.log(`Strategy ID: ${strategyId}`);
  console.log(`Period: Last ${daysBack} days\n`);

  try {
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    console.log(`Date Range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}\n`);

    // Fetch strategy details
    const strategy = await prisma.strategy.findUnique({
      where: { id: strategyId },
      select: {
        id: true,
        name: true,
        code: true,
        description: true,
        author: true,
        subscriberCount: true
      }
    });

    if (!strategy) {
      console.error(`❌ Strategy not found with ID: ${strategyId}`);
      return;
    }

    console.log(`✅ Strategy Found: ${strategy.name} (${strategy.code})`);
    console.log(`   Author: ${strategy.author}`);
    console.log(`   Total Subscribers: ${strategy.subscriberCount}\n`);

    // Fetch all subscriptions with trades
    const subscriptions = await prisma.strategySubscription.findMany({
      where: {
        strategyId: strategyId
      },
      include: {
        user: {
          select: {
            email: true,
            name: true
          }
        },
        trades: {
          where: {
            createdAt: {
              gte: startDate,
              lte: endDate
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      },
      orderBy: {
        subscribedAt: 'desc'
      }
    });

    console.log(`📊 Found ${subscriptions.length} subscription(s)\n`);

    if (subscriptions.length === 0) {
      console.log('⚠️  No subscriptions found for this strategy.');
      return;
    }

    // Prepare subscriber summary data
    const subscriberRows: SubscriberRow[] = [];
    const allTrades: TradeRow[] = [];
    let totalTradesAcrossAll = 0;
    let totalPnlAcrossAll = 0;

    subscriptions.forEach(sub => {
      const trades = sub.trades;
      const closedTrades = trades.filter(t => t.status === 'CLOSED');
      const openTrades = trades.filter(t => t.status === 'OPEN');
      const profitableTrades = closedTrades.filter(t => (t.pnl || 0) > 0);
      const losingTrades = closedTrades.filter(t => (t.pnl || 0) < 0);

      const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
      const avgPnl = closedTrades.length > 0 ? totalPnl / closedTrades.length : 0;
      const winRate = closedTrades.length > 0 ? (profitableTrades.length / closedTrades.length) * 100 : 0;

      const pnlValues = closedTrades.map(t => t.pnl || 0);
      const largestWin = pnlValues.length > 0 ? Math.max(...pnlValues) : 0;
      const largestLoss = pnlValues.length > 0 ? Math.min(...pnlValues) : 0;

      const totalWins = profitableTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
      const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0));
      const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 999 : 0;

      subscriberRows.push({
        subscriberId: sub.id,
        userEmail: sub.user.email,
        userName: sub.user.name || 'N/A',
        capital: sub.capital,
        riskPerTrade: sub.riskPerTrade || 0,
        leverage: sub.leverage || 0,
        maxPositions: sub.maxPositions || 0,
        tradingType: sub.tradingType,
        marginCurrency: sub.marginCurrency,
        isActive: sub.isActive,
        isPaused: sub.isPaused,
        subscribedAt: sub.subscribedAt,
        totalTrades: trades.length,
        openPositions: openTrades.length,
        closedTrades: closedTrades.length,
        winningTrades: profitableTrades.length,
        losingTrades: losingTrades.length,
        winRate: winRate,
        totalPnl: totalPnl,
        avgPnl: avgPnl,
        largestWin: largestWin,
        largestLoss: largestLoss,
        profitFactor: profitFactor
      });

      // Collect all trades
      trades.forEach(trade => {
        allTrades.push({
          tradeId: trade.id,
          subscriberId: sub.id,
          subscriberEmail: sub.user.email,
          subscriberName: sub.user.name || 'N/A',
          symbol: trade.symbol,
          side: trade.side,
          quantity: trade.quantity,
          entryPrice: trade.entryPrice,
          exitPrice: trade.exitPrice,
          stopLoss: trade.stopLoss,
          takeProfit: trade.takeProfit,
          leverage: trade.leverage,
          tradingType: trade.tradingType,
          marginCurrency: trade.marginCurrency,
          liquidationPrice: trade.liquidationPrice,
          status: trade.status,
          pnl: trade.pnl,
          pnlPct: trade.pnlPct,
          fees: trade.fees,
          entryTime: trade.createdAt,
          exitTime: trade.exitedAt,
          exitReason: trade.exitReason,
          positionId: trade.positionId,
          orderId: trade.orderId
        });
      });

      totalTradesAcrossAll += trades.length;
      totalPnlAcrossAll += totalPnl;
    });

    // Display summary
    console.log('═'.repeat(80));
    console.log('📈 STRATEGY PERFORMANCE SUMMARY');
    console.log('═'.repeat(80));
    console.log(`Strategy:           ${strategy.name}`);
    console.log(`Code:               ${strategy.code}`);
    console.log(`Total Subscribers:  ${subscriptions.length}`);
    console.log(`Active Subscribers: ${subscriptions.filter(s => s.isActive).length}`);
    console.log(`Total Trades:       ${totalTradesAcrossAll}`);
    console.log(`Total P&L:          ${totalPnlAcrossAll.toFixed(2)}`);
    console.log('═'.repeat(80));
    console.log('');

    // Display subscriber breakdown
    console.log('📋 SUBSCRIBER BREAKDOWN:');
    console.log('─'.repeat(80));
    subscriberRows.forEach((row, idx) => {
      console.log(`${idx + 1}. ${row.userEmail} (${row.userName})`);
      console.log(`   Status: ${row.isActive ? '🟢 Active' : '🔴 Inactive'}${row.isPaused ? ' (Paused)' : ''}`);
      console.log(`   Capital: ${row.capital} | Trades: ${row.totalTrades} | P&L: ${row.totalPnl.toFixed(2)}`);
      if (row.totalTrades > 0) {
        console.log(`   Win Rate: ${row.winRate.toFixed(2)}% | Profit Factor: ${row.profitFactor.toFixed(2)}`);
      }
      console.log('');
    });
    console.log('');

    // Generate CSV files
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const outputDir = outputPath || path.join(process.cwd(), 'reports');

    // Create reports directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 1. Subscribers Summary CSV
    const subscribersFilePath = path.join(outputDir, `strategy-subscribers-${strategyId}-${timestamp}.csv`);
    if (subscriberRows.length > 0) {
      const subscriberHeaders = Object.keys(subscriberRows[0]).join(',');
      const subscriberLines = subscriberRows.map(row =>
        Object.values(row).map(v => {
          if (v instanceof Date) return v.toISOString();
          if (v === null) return '';
          if (typeof v === 'string' && v.includes(',')) return `"${v}"`;
          return v;
        }).join(',')
      );
      fs.writeFileSync(subscribersFilePath, `${subscriberHeaders}\n${subscriberLines.join('\n')}`);
      console.log(`✅ Subscribers summary saved: ${subscribersFilePath}`);
    }

    // 2. All Trades CSV
    if (allTrades.length > 0) {
      const tradesFilePath = path.join(outputDir, `strategy-trades-${strategyId}-${timestamp}.csv`);
      const tradeHeaders = Object.keys(allTrades[0]).join(',');
      const tradeLines = allTrades.map(row =>
        Object.values(row).map(v => {
          if (v instanceof Date) return v.toISOString();
          if (v === null) return '';
          if (typeof v === 'string' && v.includes(',')) return `"${v}"`;
          return v;
        }).join(',')
      );
      fs.writeFileSync(tradesFilePath, `${tradeHeaders}\n${tradeLines.join('\n')}`);
      console.log(`✅ All trades saved: ${tradesFilePath}`);
    } else {
      console.log(`ℹ️  No trades found in the specified period - skipping trades CSV`);
    }

    // 3. Strategy Overview CSV
    const overviewFilePath = path.join(outputDir, `strategy-overview-${strategyId}-${timestamp}.csv`);
    const overviewData = {
      strategyId: strategy.id,
      strategyName: strategy.name,
      strategyCode: strategy.code,
      author: strategy.author,
      totalSubscribers: subscriptions.length,
      activeSubscribers: subscriptions.filter(s => s.isActive).length,
      totalTrades: totalTradesAcrossAll,
      totalPnl: totalPnlAcrossAll,
      reportStartDate: startDate.toISOString(),
      reportEndDate: endDate.toISOString(),
      generatedAt: new Date().toISOString()
    };
    const overviewHeaders = Object.keys(overviewData).join(',');
    const overviewValues = Object.values(overviewData).join(',');
    fs.writeFileSync(overviewFilePath, `${overviewHeaders}\n${overviewValues}`);
    console.log(`✅ Strategy overview saved: ${overviewFilePath}`);

    console.log('\n✨ Report generation complete!\n');

  } catch (error) {
    console.error('❌ Error generating report:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Parse command-line arguments
const strategyId = process.argv[2] || 'cmh7lyx0y0000p91hb96tpbl6';
const daysBack = parseInt(process.argv[3]) || 30;
const outputPath = process.argv[4];

console.log('Usage: ts-node generate-strategy-report.ts [strategyId] [daysBack] [outputPath]');
console.log('Example: ts-node generate-strategy-report.ts cmh7lyx0y0000p91hb96tpbl6 30 /tmp/reports\n');

// Run the report
generateStrategyReport(strategyId, daysBack, outputPath).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
