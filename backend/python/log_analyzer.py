"""
XCoinAlgo Strategy Log Analyzer
================================
Parses strategy bot logs and outputs daily metrics.

Specifically designed for logs from the LiveTrader class that produce:
- "New BUY/SELL signal at {price}"
- "Placing BUY/SELL MARKET order for {qty} units..."
- "[1/8] Processing user {user_id}"
- Exit logs: "Stop Loss", "Take Profit", "Trailing Hit"

Output columns:
- Date
- Bot Signals (unique signals per day - by price)
- Total User Orders (SUCCESSFUL orders only - not failed ones)
- Active Users (users processed that day)
- Total Qty (sum of quantities from SUCCESSFUL orders only)
- Buy Orders (successful)
- Sell Orders (successful)

Usage:
    python log_analyzer.py --log strategy.log
    python log_analyzer.py --log strategy.log --csv report.csv
    python log_analyzer.py --log-dir /path/to/logs/
"""

import re
import argparse
from datetime import datetime
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Dict, List, Set, Optional, Tuple
from pathlib import Path
import csv
import json


@dataclass
class DailyStats:
    """Daily aggregated statistics"""
    date: str
    bot_signals: int = 0                    # Unique signals (by side+price)

    # Successful orders only (for main output)
    total_user_orders: int = 0              # Successful orders
    total_qty: float = 0.0                  # Sum of successful order quantities
    buy_orders: int = 0                     # Successful buy orders
    sell_orders: int = 0                    # Successful sell orders

    # Attempted orders (for detailed output)
    orders_attempted: int = 0
    orders_failed: int = 0
    qty_attempted: float = 0.0

    active_users: Set[str] = field(default_factory=set)

    # Additional tracking for deeper analysis
    signal_prices: List[Tuple[str, float]] = field(default_factory=list)  # (side, price)
    errors: Dict[str, int] = field(default_factory=lambda: defaultdict(int))
    exits: Dict[str, int] = field(default_factory=lambda: defaultdict(int))  # Exit reasons
    cycles: int = 0
    positions_opened: int = 0
    positions_closed: int = 0

    def to_dict(self) -> Dict:
        """Basic output matching screenshot format - SUCCESSFUL orders only"""
        return {
            'Date': self.date,
            'Bot Signals': self.bot_signals,
            'Total User Orders': self.total_user_orders,  # Successful only
            'Active Users': len(self.active_users),
            'Total Qty': round(self.total_qty, 3),        # Successful only
            'Buy Orders': self.buy_orders,                 # Successful only
            'Sell Orders': self.sell_orders,               # Successful only
        }

    def to_detailed_dict(self) -> Dict:
        """Detailed output with error breakdown"""
        base = self.to_dict()
        base.update({
            'Orders Attempted': self.orders_attempted,
            'Orders Failed': self.orders_failed,
            'Cycles': self.cycles,
            'Positions Opened': self.positions_opened,
            'Positions Closed': self.positions_closed,
            'Errors - 400': self.errors.get('400', 0),
            'Errors - 422': self.errors.get('422', 0),
            'Errors - Qty Zero': self.errors.get('qty_zero', 0),
            'Errors - Balance': self.errors.get('balance', 0),
            'Exits - SL': self.exits.get('stop_loss', 0),
            'Exits - TP1': self.exits.get('tp1', 0),
            'Exits - TP2': self.exits.get('tp2', 0),
            'Exits - TSL': self.exits.get('trailing', 0),
        })
        return base


class XCoinAlgoLogAnalyzer:
    """
    Analyzer specifically for XCoinAlgo strategy logs.

    Key feature: Only counts SUCCESSFUL orders (where "Order response:" appears)
    Failed orders (400, 422 errors) are tracked separately but not counted in main metrics.

    Patterns matched:
    - Signals: "New BUY signal at 84868.0000" or "New BUY signal on 30m timeframe at 2777.74"
    - Orders: "Placing BUY MARKET order for 0.001 units..."
    - Success: "Order response:" indicates order succeeded
    - Users: "[1/8] Processing user cmi2z1w8p0000p9ewt9vsjw9a"
    - Errors: "400 Client Error", "422 Client Error", "quantity is zero"
    """

    # Regex patterns for XCoinAlgo logs
    PATTERNS = {
        # Timestamp: 2025-11-21 14:45:08,778
        'timestamp': re.compile(r'^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})[,.]?\d*'),

        # Signal: Various formats
        # - "New BUY signal at 84868.0000"
        # - "New BUY signal on 30m timeframe at 2777.74"
        # - "BUY signal detected at 3500"
        'signal': re.compile(
            r'(?:New\s+)?(BUY|SELL|LONG|SHORT)\s+signal\s+'
            r'(?:on\s+\w+\s+timeframe\s+)?'
            r'(?:at|@|detected\s+at|price[=:\s])\s*([\d.]+)',
            re.IGNORECASE
        ),

        # Order: Various formats
        # - "Placing BUY MARKET order for 0.001 units..."
        # - "Placing SELL LIMIT order for 0.5 units"
        'order': re.compile(
            r'(?:Placing|Creating|Executing|Submitting)\s+(BUY|SELL)\s+'
            r'(?:MARKET|LIMIT)?\s*order\s+(?:for|qty[=:\s])?\s*([\d.]+)',
            re.IGNORECASE
        ),

        # User processing: "[1/8] Processing user cmi2z1w8p0000p9ewt9vsjw9a"
        'user': re.compile(
            r'\[(\d+)/(\d+)\]\s*Processing\s+user\s+(\w+)',
            re.IGNORECASE
        ),

        # Cycle start
        'cycle_start': re.compile(
            r'Cycle\s+Start|Starting\s+cycle|Begin\s+execution',
            re.IGNORECASE
        ),

        # Position opened: "Successfully entered position"
        'position_opened': re.compile(
            r'Successfully\s+entered\s+position|Position\s+opened',
            re.IGNORECASE
        ),

        # Position closed: "Position fully closed"
        'position_closed': re.compile(
            r'Position\s+(?:fully\s+)?closed|Position\s+exited',
            re.IGNORECASE
        ),

        # Exit reasons
        'exit_sl': re.compile(r'Stop\s*Loss', re.IGNORECASE),
        'exit_tp1': re.compile(r'Take\s*Profit\s*1|TP1\s+Hit', re.IGNORECASE),
        'exit_tp2': re.compile(r'Take\s*Profit\s*2|TP2\s+Hit|Final', re.IGNORECASE),
        'exit_trailing': re.compile(r'Trailing\s*(?:Stop\s*)?Hit|TSL\s+Hit', re.IGNORECASE),

        # Errors
        'error_400': re.compile(r'400\s+(?:Client\s+)?Error|Bad\s+Request', re.IGNORECASE),
        'error_422': re.compile(r'422\s+(?:Client\s+)?Error|Unprocessable', re.IGNORECASE),
        'error_qty_zero': re.compile(r'quantity\s+is\s+zero|Calculated\s+quantity\s+is\s+zero', re.IGNORECASE),
        'error_balance': re.compile(r'balance\s+is\s+0|insufficient|not\s+enough', re.IGNORECASE),

        # Order response (indicates SUCCESS)
        'order_response': re.compile(r'Order\s+response:', re.IGNORECASE),
    }

    def __init__(self):
        self.daily_stats: Dict[str, DailyStats] = {}
        self.current_date: Optional[str] = None
        self.current_user: Optional[str] = None
        self.seen_signals_today: Set[str] = set()

        # Track pending order to determine success/failure
        self.pending_order: Optional[Dict] = None  # {side, qty, date}

    def parse_file(self, filepath: str) -> Dict[str, DailyStats]:
        """Parse a single log file"""
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                self._parse_line(line.strip())
        # Finalize any remaining pending order
        self._finalize_pending_order(success=False)
        return self.daily_stats

    def parse_content(self, content: str) -> Dict[str, DailyStats]:
        """Parse log content from string"""
        for line in content.strip().split('\n'):
            self._parse_line(line.strip())
        # Finalize any remaining pending order
        self._finalize_pending_order(success=False)
        return self.daily_stats

    def parse_directory(self, dirpath: str, pattern: str = "*.log") -> Dict[str, DailyStats]:
        """Parse all log files in a directory"""
        path = Path(dirpath)
        for logfile in sorted(path.glob(pattern)):
            print(f"  Parsing: {logfile.name}")
            self.parse_file(str(logfile))
        return self.daily_stats

    def _get_or_create_stats(self, date: str) -> DailyStats:
        """Get or create DailyStats for a date"""
        if date not in self.daily_stats:
            self.daily_stats[date] = DailyStats(date=date)
        return self.daily_stats[date]

    def _finalize_pending_order(self, success: bool):
        """Finalize a pending order as success or failure"""
        if not self.pending_order:
            return

        date = self.pending_order['date']
        if date not in self.daily_stats:
            self.pending_order = None
            return

        stats = self.daily_stats[date]

        if success:
            # Count as successful order
            stats.total_user_orders += 1
            stats.total_qty += self.pending_order['qty']
            if self.pending_order['side'] == 'BUY':
                stats.buy_orders += 1
            else:
                stats.sell_orders += 1
        else:
            # Count as failed order
            stats.orders_failed += 1

        self.pending_order = None

    def _parse_line(self, line: str):
        """Parse a single log line"""
        if not line:
            return

        # Extract date from timestamp
        ts_match = self.PATTERNS['timestamp'].match(line)
        if ts_match:
            date_str = ts_match.group(1)
            if date_str != self.current_date:
                # Finalize any pending order from previous day
                self._finalize_pending_order(success=False)
                self.current_date = date_str
                self.seen_signals_today = set()
                self.current_user = None

        if not self.current_date:
            return

        stats = self._get_or_create_stats(self.current_date)

        # ===== CHECK FOR ERRORS FIRST (before new orders) =====
        # This catches errors from pending orders
        is_error = False
        if self.PATTERNS['error_400'].search(line):
            stats.errors['400'] += 1
            is_error = True
        if self.PATTERNS['error_422'].search(line):
            stats.errors['422'] += 1
            is_error = True
        if self.PATTERNS['error_qty_zero'].search(line):
            stats.errors['qty_zero'] += 1
            # Note: qty_zero happens BEFORE order placement, not an order failure
        if self.PATTERNS['error_balance'].search(line):
            stats.errors['balance'] += 1
            is_error = True

        # If error and we have a pending order, mark it as failed
        if is_error and self.pending_order:
            self._finalize_pending_order(success=False)
            return

        # ===== CHECK FOR ORDER SUCCESS =====
        # "Order response:" indicates the order succeeded
        if 'Order response:' in line and self.pending_order:
            self._finalize_pending_order(success=True)
            return

        # "Successfully entered position" also indicates success
        if self.PATTERNS['position_opened'].search(line):
            stats.positions_opened += 1
            if self.pending_order:
                self._finalize_pending_order(success=True)

        # ===== CHECK FOR CYCLE START =====
        if self.PATTERNS['cycle_start'].search(line):
            stats.cycles += 1

        # ===== CHECK FOR USER =====
        user_match = self.PATTERNS['user'].search(line)
        if user_match:
            # If moving to next user and have pending order, mark as failed (conservative)
            if self.pending_order and self.current_user and self.current_user != user_match.group(3):
                self._finalize_pending_order(success=False)

            self.current_user = user_match.group(3)
            stats.active_users.add(self.current_user)

        # ===== CHECK FOR SIGNAL =====
        signal_match = self.PATTERNS['signal'].search(line)
        if signal_match:
            side = signal_match.group(1).upper()
            if side == 'LONG':
                side = 'BUY'
            elif side == 'SHORT':
                side = 'SELL'

            price = float(signal_match.group(2))

            # Track unique signals by side+price combination
            signal_key = f"{side}_{price}"
            if signal_key not in self.seen_signals_today:
                self.seen_signals_today.add(signal_key)
                stats.bot_signals += 1
                stats.signal_prices.append((side, price))

        # ===== CHECK FOR ORDER PLACEMENT =====
        order_match = self.PATTERNS['order'].search(line)
        if order_match:
            # Finalize any previous pending order (shouldn't happen normally)
            if self.pending_order:
                self._finalize_pending_order(success=False)

            side = order_match.group(1).upper()
            qty = float(order_match.group(2))

            # Store as pending - will be finalized on success or error
            self.pending_order = {
                'side': side,
                'qty': qty,
                'date': self.current_date
            }

            # Track as attempted
            stats.orders_attempted += 1
            stats.qty_attempted += qty

        # ===== CHECK FOR POSITION CLOSED =====
        if self.PATTERNS['position_closed'].search(line):
            stats.positions_closed += 1

        # ===== CHECK FOR EXIT REASONS =====
        if self.PATTERNS['exit_sl'].search(line):
            stats.exits['stop_loss'] += 1
        if self.PATTERNS['exit_tp1'].search(line):
            stats.exits['tp1'] += 1
        if self.PATTERNS['exit_tp2'].search(line):
            stats.exits['tp2'] += 1
        if self.PATTERNS['exit_trailing'].search(line):
            stats.exits['trailing'] += 1

    def get_results(self, detailed: bool = False) -> List[Dict]:
        """Get results as list of dicts, sorted by date"""
        results = []
        for date in sorted(self.daily_stats.keys()):
            if detailed:
                results.append(self.daily_stats[date].to_detailed_dict())
            else:
                results.append(self.daily_stats[date].to_dict())
        return results

    def print_table(self, detailed: bool = False):
        """Print results as formatted table"""
        results = self.get_results(detailed)

        if not results:
            print("No data found in logs.")
            return

        # Get headers from first result
        headers = list(results[0].keys())

        # Calculate column widths
        widths = {h: len(str(h)) for h in headers}
        for row in results:
            for h in headers:
                val = str(row.get(h, ''))
                widths[h] = max(widths[h], len(val))

        # Print header
        header_line = " | ".join(str(h).ljust(widths[h]) for h in headers)
        separator = "-+-".join("-" * widths[h] for h in headers)

        print()
        print(header_line)
        print(separator)

        # Print rows
        for row in results:
            row_line = " | ".join(str(row.get(h, '')).ljust(widths[h]) for h in headers)
            print(row_line)

        print()

        # Print summary
        total_signals = sum(r['Bot Signals'] for r in results)
        total_orders = sum(r['Total User Orders'] for r in results)
        total_qty = sum(r['Total Qty'] for r in results)
        total_buys = sum(r['Buy Orders'] for r in results)
        total_sells = sum(r['Sell Orders'] for r in results)

        print(f"Summary: {len(results)} days | {total_signals} signals | {total_orders} orders | {total_qty:.3f} qty | {total_buys} buys | {total_sells} sells")

    def export_csv(self, filepath: str, detailed: bool = False):
        """Export results to CSV"""
        results = self.get_results(detailed)

        if not results:
            print("No data to export.")
            return

        headers = list(results[0].keys())

        with open(filepath, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=headers)
            writer.writeheader()
            writer.writerows(results)

        print(f"✓ Exported to {filepath}")

    def export_json(self, filepath: str, detailed: bool = False):
        """Export results to JSON"""
        results = self.get_results(detailed)

        # Also include raw stats for programmatic access
        output = {
            'summary': {
                'total_days': len(results),
                'total_signals': sum(r['Bot Signals'] for r in results),
                'total_orders': sum(r['Total User Orders'] for r in results),
                'total_qty': sum(r['Total Qty'] for r in results),
                'total_buys': sum(r['Buy Orders'] for r in results),
                'total_sells': sum(r['Sell Orders'] for r in results),
            },
            'daily': results
        }

        with open(filepath, 'w') as f:
            json.dump(output, f, indent=2)

        print(f"✓ Exported to {filepath}")


# =============================================================================
# CONVENIENCE FUNCTIONS FOR PLATFORM INTEGRATION
# =============================================================================

def analyze_logs(log_content: str, detailed: bool = False) -> List[Dict]:
    """
    Simple function for platform integration.

    Args:
        log_content: Raw log content as string
        detailed: Include error breakdown and exit reasons

    Returns:
        List of daily stats dicts
    """
    analyzer = XCoinAlgoLogAnalyzer()
    analyzer.parse_content(log_content)
    return analyzer.get_results(detailed)


def analyze_log_file(filepath: str, detailed: bool = False) -> List[Dict]:
    """Analyze a single log file."""
    analyzer = XCoinAlgoLogAnalyzer()
    analyzer.parse_file(filepath)
    return analyzer.get_results(detailed)


def analyze_log_directory(dirpath: str, pattern: str = "*.log", detailed: bool = False) -> List[Dict]:
    """Analyze all log files in a directory."""
    analyzer = XCoinAlgoLogAnalyzer()
    analyzer.parse_directory(dirpath, pattern)
    return analyzer.get_results(detailed)


# =============================================================================
# CLI
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description='Analyze XCoinAlgo strategy logs',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python log_analyzer.py --log strategy.log
  python log_analyzer.py --log strategy.log --csv report.csv
  python log_analyzer.py --log strategy.log --detailed
  python log_analyzer.py --log-dir /path/to/logs/
        """
    )

    parser.add_argument('--log', '-l', type=str, help='Path to log file')
    parser.add_argument('--log-dir', '-d', type=str, help='Path to directory containing log files')
    parser.add_argument('--csv', '-c', type=str, help='Export to CSV file')
    parser.add_argument('--json', '-j', type=str, help='Export to JSON file')
    parser.add_argument('--pattern', '-p', type=str, default='*.log', help='File pattern for directory mode')
    parser.add_argument('--detailed', action='store_true', help='Include detailed error/exit breakdown')

    args = parser.parse_args()

    if not args.log and not args.log_dir:
        parser.print_help()
        print("\nError: Please provide --log or --log-dir")
        return

    analyzer = XCoinAlgoLogAnalyzer()

    if args.log:
        print(f"Parsing: {args.log}")
        analyzer.parse_file(args.log)
    elif args.log_dir:
        print(f"Parsing directory: {args.log_dir}")
        analyzer.parse_directory(args.log_dir, args.pattern)

    # Print table
    analyzer.print_table(args.detailed)

    # Export if requested
    if args.csv:
        analyzer.export_csv(args.csv, args.detailed)

    if args.json:
        analyzer.export_json(args.json, args.detailed)


if __name__ == "__main__":
    main()
