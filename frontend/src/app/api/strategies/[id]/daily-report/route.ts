import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const strategyId = params.id;

    // SSH config from environment or hardcoded
    const sshKey = '/Users/macintosh/Developer/coindcx_client/xcoinalgo-backend-key.pem';
    const sshHost = 'ubuntu@184.72.102.221';
    const logPath = `xcoinalgo/backend/strategies/${strategyId}/logs/trading_bot.log`;

    // Fetch logs from server
    const sshCommand = `ssh -i ${sshKey} ${sshHost} "cat ${logPath}"`;

    let logContent: string;
    try {
      const { stdout } = await execAsync(sshCommand);
      logContent = stdout;
    } catch (error: any) {
      console.error('SSH error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch logs from server. Strategy may not exist or logs not available.' },
        { status: 500 }
      );
    }

    // Create temp file with log analyzer script
    const analyzerScript = `
import re
import sys
import json
from datetime import datetime, timedelta
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Dict, List, Set, Optional, Tuple

@dataclass
class DailyStats:
    """Daily aggregated statistics"""
    date: str
    bot_signals: int = 0
    total_user_orders: int = 0
    active_users: Set[str] = field(default_factory=set)
    total_qty: float = 0.0
    buy_orders: int = 0
    sell_orders: int = 0
    signal_prices: List[Tuple[str, float]] = field(default_factory=list)

    def to_dict(self) -> Dict:
        """Basic output matching screenshot format"""
        return {
            'Date': self.date,
            'Bot Signals': self.bot_signals,
            'Total User Orders': self.total_user_orders,
            'Active Users': len(self.active_users),
            'Total Qty': round(self.total_qty, 3),
            'Buy Orders': self.buy_orders,
            'Sell Orders': self.sell_orders,
        }

class XCoinAlgoLogAnalyzer:
    PATTERNS = {
        'timestamp': re.compile(r'^(\\d{4}-\\d{2}-\\d{2})\\s+(\\d{2}:\\d{2}:\\d{2})[,.]?\\d*'),
        'signal': re.compile(r'New\\s+(BUY|SELL|LONG|SHORT)\\s+signal\\s+at\\s+([\\d.]+)', re.IGNORECASE),
        'order': re.compile(r'Placing\\s+(BUY|SELL)\\s+(?:MARKET|LIMIT)\\s+order\\s+for\\s+([\\d.]+)\\s+units', re.IGNORECASE),
        'user': re.compile(r'\\[(\\d+)/(\\d+)\\]\\s*Processing\\s+user\\s+(\\w+)', re.IGNORECASE),
    }

    def __init__(self):
        self.daily_stats: Dict[str, DailyStats] = {}
        self.current_date: Optional[str] = None
        self.seen_signals_today: Set[str] = set()

    def _get_or_create_stats(self, date: str) -> DailyStats:
        if date not in self.daily_stats:
            self.daily_stats[date] = DailyStats(date=date)
        return self.daily_stats[date]

    def _parse_line(self, line: str):
        if not line:
            return

        ts_match = self.PATTERNS['timestamp'].match(line)
        if ts_match:
            date_str = ts_match.group(1)
            if date_str != self.current_date:
                self.current_date = date_str
                self.seen_signals_today = set()

        if not self.current_date:
            return

        stats = self._get_or_create_stats(self.current_date)

        user_match = self.PATTERNS['user'].search(line)
        if user_match:
            current_user = user_match.group(3)
            stats.active_users.add(current_user)

        signal_match = self.PATTERNS['signal'].search(line)
        if signal_match:
            side = signal_match.group(1).upper()
            if side == 'LONG':
                side = 'BUY'
            elif side == 'SHORT':
                side = 'SELL'

            price = float(signal_match.group(2))
            signal_key = f"{side}_{price}"
            if signal_key not in self.seen_signals_today:
                self.seen_signals_today.add(signal_key)
                stats.bot_signals += 1
                stats.signal_prices.append((side, price))

        order_match = self.PATTERNS['order'].search(line)
        if order_match:
            side = order_match.group(1).upper()
            qty = float(order_match.group(2))

            stats.total_user_orders += 1
            stats.total_qty += qty

            if side == 'BUY':
                stats.buy_orders += 1
            elif side == 'SELL':
                stats.sell_orders += 1

    def parse_content(self, content: str) -> Dict[str, DailyStats]:
        for line in content.strip().split('\\n'):
            self._parse_line(line.strip())
        return self.daily_stats

    def get_results_until_yesterday(self) -> List[Dict]:
        """Get results excluding today"""
        yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
        results = []
        for date in sorted(self.daily_stats.keys()):
            if date <= yesterday:
                results.append(self.daily_stats[date].to_dict())
        return results

# Read from stdin
content = sys.stdin.read()
analyzer = XCoinAlgoLogAnalyzer()
analyzer.parse_content(content)
results = analyzer.get_results_until_yesterday()

# Output as JSON
print(json.dumps(results))
`;

    // Save analyzer script to temp file
    const scriptPath = join(tmpdir(), `analyzer_${strategyId}_${Date.now()}.py`);
    writeFileSync(scriptPath, analyzerScript);

    // Save log content to temp file
    const logFilePath = join(tmpdir(), `logs_${strategyId}_${Date.now()}.txt`);
    writeFileSync(logFilePath, logContent);

    try {
      // Run analyzer
      const { stdout: analysisOutput } = await execAsync(
        `python3 ${scriptPath} < ${logFilePath}`
      );

      // Parse JSON output
      const results = JSON.parse(analysisOutput);

      // Convert to CSV
      if (results.length === 0) {
        return NextResponse.json(
          { error: 'No data found in logs' },
          { status: 404 }
        );
      }

      const headers = Object.keys(results[0]);
      const csvRows = [
        headers.join(','),
        ...results.map((row: any) =>
          headers.map(header => {
            const value = row[header];
            // Escape commas and quotes
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          }).join(',')
        )
      ];

      const csv = csvRows.join('\n');

      // Clean up temp files
      unlinkSync(scriptPath);
      unlinkSync(logFilePath);

      // Return CSV with proper headers
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="strategy_${strategyId}_daily_report.csv"`,
        },
      });

    } catch (error: any) {
      console.error('Analysis error:', error);

      // Clean up temp files
      try {
        unlinkSync(scriptPath);
        unlinkSync(logFilePath);
      } catch {}

      return NextResponse.json(
        { error: 'Failed to analyze logs: ' + error.message },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('Error generating report:', error);
    return NextResponse.json(
      { error: 'Failed to generate report: ' + error.message },
      { status: 500 }
    );
  }
}
