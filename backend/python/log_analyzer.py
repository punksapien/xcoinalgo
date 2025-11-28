#!/usr/bin/env python3
"""
XCoinAlgo Strategy Log Analyzer
================================
Parses strategy bot logs and outputs daily metrics.

Usage:
    python log_analyzer.py /path/to/trading_bot.log
"""

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
    """
    Analyzer specifically for XCoinAlgo strategy logs.

    Patterns matched:
    - Signals: "New BUY signal at 84868.0000"
    - Orders: "Placing BUY MARKET order for 0.001 units..."
    - Users: "[1/8] Processing user cmi2z1w8p0000p9ewt9vsjw9a"
    """

    PATTERNS = {
        'timestamp': re.compile(r'^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})[,.]?\d*'),
        'signal': re.compile(
            r'New\s+(BUY|SELL|LONG|SHORT)\s+signal\s+at\s+([\d.]+)',
            re.IGNORECASE
        ),
        'order': re.compile(
            r'Placing\s+(BUY|SELL)\s+(?:MARKET|LIMIT)\s+order\s+for\s+([\d.]+)\s+units',
            re.IGNORECASE
        ),
        'user': re.compile(
            r'\[(\d+)/(\d+)\]\s*Processing\s+user\s+(\w+)',
            re.IGNORECASE
        ),
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

    def parse_file(self, filepath: str) -> Dict[str, DailyStats]:
        """Parse a single log file"""
        try:
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                for line in f:
                    self._parse_line(line.strip())
        except FileNotFoundError:
            print(json.dumps({"error": f"Log file not found: {filepath}"}))
            sys.exit(1)
        except Exception as e:
            print(json.dumps({"error": f"Error reading log file: {str(e)}"}))
            sys.exit(1)

        return self.daily_stats

    def get_results_until_yesterday(self) -> List[Dict]:
        """Get results excluding today"""
        yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
        results = []
        for date in sorted(self.daily_stats.keys()):
            if date <= yesterday:
                results.append(self.daily_stats[date].to_dict())
        return results


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python log_analyzer.py /path/to/log/file"}))
        sys.exit(1)

    log_file = sys.argv[1]

    analyzer = XCoinAlgoLogAnalyzer()
    analyzer.parse_file(log_file)
    results = analyzer.get_results_until_yesterday()

    # Output as JSON
    print(json.dumps(results))


if __name__ == "__main__":
    main()
