import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface ReportConfig {
  email: string;
  strategyName: string;
  daysBack: number;
  outputPath?: string;
}

interface TradeRow {
  tradeId: string;
  subscriberEmail: string;
  subscriberName: string;
  strategyName: string;
  strategyCode: string;
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
  signalConfidence: number | null;
}

interface PerformanceSummary {
  subscriberEmail: string;
  subscriberName: string;
  strategyName: string;
  capital: number;
  riskPerTrade: number;
  leverage: number;
  maxPositions: number;
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
  subscribedAt: Date;
}

async function generatePnLReport(config: ReportConfig): Promise<void> {
  console.log('\n🔍 Starting P&L Report Generation...\n');
  console.log(`Email: ${config.email}`);
  console.log(`Strategy: ${config.strategyName}`);
  console.log(`Period: Last ${config.daysBack} days\n`);

  try {
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - config.daysBack);

    console.log(`Date Range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}\n`);

    // Find the user's subscription to the ETH strategy
    const subscription = await prisma.strategySubscription.findFirst({
      where: {
        user: {
          email: config.email
        },
        strategy: {
          OR: [
            { name: { contains: config.strategyName, mode: 'insensitive' } },
            { code: { contains: config.strategyName, mode: 'insensitive' } }
          ]
        }
      },
      include: {
        user: {
          select: {
            email: true,
            name: true
          }
        },
        strategy: {
          select: {
            name: true,
            code: true,
            description: true
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
      }
    });

    if (!subscription) {
      console.error(`❌ No subscription found for email "${config.email}" with strategy "${config.strategyName}"`);
      console.log('\n💡 Tip: Check if the email and strategy name are correct.');
      return;
    }

    console.log(`✅ Found subscription ID: ${subscription.id}`);
    console.log(`   Strategy: ${subscription.strategy.name} (${subscription.strategy.code})`);
    console.log(`   User: ${subscription.user.name} (${subscription.user.email})`);
    console.log(`   Total trades in period: ${subscription.trades.length}\n`);

    if (subscription.trades.length === 0) {
      console.log('⚠️  No trades found in the specified period.');
      console.log('   Report will contain only subscription details.\n');
    }

    // Prepare trade data for CSV
    const tradeRows: TradeRow[] = subscription.trades.map(trade => ({
      tradeId: trade.id,
      subscriberEmail: subscription.user.email,
      subscriberName: subscription.user.name || 'N/A',
      strategyName: subscription.strategy.name,
      strategyCode: subscription.strategy.code,
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
      orderId: trade.orderId,
      signalConfidence: trade.signalConfidence
    }));

    // Calculate performance metrics
    const closedTrades = subscription.trades.filter(t => t.status === 'CLOSED');
    const openTrades = subscription.trades.filter(t => t.status === 'OPEN');
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
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

    const performanceSummary: PerformanceSummary = {
      subscriberEmail: subscription.user.email,
      subscriberName: subscription.user.name || 'N/A',
      strategyName: subscription.strategy.name,
      capital: subscription.capital,
      riskPerTrade: subscription.riskPerTrade || 0,
      leverage: subscription.leverage || 0,
      maxPositions: subscription.maxPositions || 0,
      totalTrades: subscription.trades.length,
      openPositions: openTrades.length,
      closedTrades: closedTrades.length,
      winningTrades: profitableTrades.length,
      losingTrades: losingTrades.length,
      winRate: winRate,
      totalPnl: totalPnl,
      avgPnl: avgPnl,
      largestWin: largestWin,
      largestLoss: largestLoss,
      profitFactor: profitFactor,
      subscribedAt: subscription.subscribedAt
    };

    // Display performance summary
    console.log('📊 PERFORMANCE SUMMARY');
    console.log('═'.repeat(60));
    console.log(`Strategy:          ${performanceSummary.strategyName}`);
    console.log(`Subscriber:        ${performanceSummary.subscriberName}`);
    console.log(`Email:             ${performanceSummary.subscriberEmail}`);
    console.log(`Subscribed At:     ${performanceSummary.subscribedAt.toISOString()}`);
    console.log('─'.repeat(60));
    console.log(`Capital:           ${performanceSummary.capital.toFixed(2)}`);
    console.log(`Risk Per Trade:    ${(performanceSummary.riskPerTrade * 100).toFixed(2)}%`);
    console.log(`Leverage:          ${performanceSummary.leverage}x`);
    console.log(`Max Positions:     ${performanceSummary.maxPositions}`);
    console.log('─'.repeat(60));
    console.log(`Total Trades:      ${performanceSummary.totalTrades}`);
    console.log(`Open Positions:    ${performanceSummary.openPositions}`);
    console.log(`Closed Trades:     ${performanceSummary.closedTrades}`);
    console.log(`Winning Trades:    ${performanceSummary.winningTrades}`);
    console.log(`Losing Trades:     ${performanceSummary.losingTrades}`);
    console.log(`Win Rate:          ${performanceSummary.winRate.toFixed(2)}%`);
    console.log('─'.repeat(60));
    console.log(`Total P&L:         ${performanceSummary.totalPnl.toFixed(2)}`);
    console.log(`Avg P&L/Trade:     ${performanceSummary.avgPnl.toFixed(2)}`);
    console.log(`Largest Win:       ${performanceSummary.largestWin.toFixed(2)}`);
    console.log(`Largest Loss:      ${performanceSummary.largestLoss.toFixed(2)}`);
    console.log(`Profit Factor:     ${profitFactor === Infinity ? '∞' : performanceSummary.profitFactor.toFixed(2)}`);
    console.log('═'.repeat(60));
    console.log('');

    // Generate CSV files
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const outputDir = config.outputPath || path.join(process.cwd(), 'reports');

    // Create reports directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 1. Summary CSV
    const summaryFilePath = path.join(outputDir, `pnl-summary-${config.email}-${timestamp}.csv`);
    const summaryHeaders = Object.keys(performanceSummary).join(',');
    const summaryValues = Object.values(performanceSummary).map(v =>
      v instanceof Date ? v.toISOString() : v
    ).join(',');
    fs.writeFileSync(summaryFilePath, `${summaryHeaders}\n${summaryValues}`);

    console.log(`✅ Summary report saved: ${summaryFilePath}`);

    // 2. Detailed Trades CSV
    if (tradeRows.length > 0) {
      const tradesFilePath = path.join(outputDir, `pnl-trades-${config.email}-${timestamp}.csv`);
      const tradeHeaders = Object.keys(tradeRows[0]).join(',');
      const tradeLines = tradeRows.map(row =>
        Object.values(row).map(v => {
          if (v instanceof Date) return v.toISOString();
          if (v === null) return '';
          if (typeof v === 'string' && v.includes(',')) return `"${v}"`;
          return v;
        }).join(',')
      );
      fs.writeFileSync(tradesFilePath, `${tradeHeaders}\n${tradeLines.join('\n')}`);

      console.log(`✅ Detailed trades report saved: ${tradesFilePath}`);
    }

    // 3. Daily P&L Breakdown CSV
    if (closedTrades.length > 0) {
      const dailyPnl = new Map<string, { date: string; trades: number; pnl: number }>();

      closedTrades.forEach(trade => {
        const dateKey = trade.exitedAt?.toISOString().split('T')[0] || 'Unknown';
        const existing = dailyPnl.get(dateKey) || { date: dateKey, trades: 0, pnl: 0 };
        existing.trades += 1;
        existing.pnl += trade.pnl || 0;
        dailyPnl.set(dateKey, existing);
      });

      const dailyPnlArray = Array.from(dailyPnl.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
      );

      const dailyFilePath = path.join(outputDir, `pnl-daily-${config.email}-${timestamp}.csv`);
      const dailyHeaders = 'date,trades,pnl,cumulativePnl';
      let cumulativePnl = 0;
      const dailyLines = dailyPnlArray.map(day => {
        cumulativePnl += day.pnl;
        return `${day.date},${day.trades},${day.pnl.toFixed(2)},${cumulativePnl.toFixed(2)}`;
      });
      fs.writeFileSync(dailyFilePath, `${dailyHeaders}\n${dailyLines.join('\n')}`);

      console.log(`✅ Daily P&L breakdown saved: ${dailyFilePath}`);
    }

    console.log('\n✨ Report generation complete!\n');

  } catch (error) {
    console.error('❌ Error generating report:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Parse command-line arguments or use defaults
const email = process.argv[2] || 'Manish19862003@gmail.com';
const strategyName = process.argv[3] || 'ETH';
const daysBack = parseInt(process.argv[4]) || 30;
const outputPath = process.argv[5];

// Run the report
generatePnLReport({
  email,
  strategyName,
  daysBack,
  outputPath
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
