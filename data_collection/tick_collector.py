#!/usr/bin/env python3
"""
CoinDCX Tick Data Collector
===========================
Collects tick-by-tick trade data and price snapshots from CoinDCX Futures API.
Stores data in SQLite for precise backtesting.

Usage:
    python3 tick_collector.py --pair B-UNI_USDT
    python3 tick_collector.py --pair B-UNI_USDT --db /path/to/data.db

Data Sources:
    1. Trade History: Individual trades with price, quantity, timestamp
    2. Price Snapshots: Market state with last price, mark price, funding rate, etc.

API Endpoints Used (Public, no auth required):
    - https://public.coindcx.com/market_data/trade_history?pair={pair}&limit=100
    - https://public.coindcx.com/market_data/v3/current_prices/futures/rt
"""

import os
import sys
import time
import json
import sqlite3
import logging
import argparse
import signal
import threading
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# ==============================================================================
# CONFIGURATION
# ==============================================================================

DEFAULT_CONFIG = {
    "pair": "B-UNI_USDT",
    "db_path": "./tick_data.db",
    "trade_poll_interval": 1.0,      # seconds between trade history polls
    "snapshot_poll_interval": 5.0,   # seconds between price snapshot polls
    "trade_limit": 100,              # max trades per request
    "request_timeout": 10,           # HTTP request timeout
    "retry_attempts": 3,             # retry failed requests
    "log_level": "INFO",
    "log_file": "./tick_collector.log",
}

# ==============================================================================
# LOGGING SETUP
# ==============================================================================

def setup_logging(log_level: str = "INFO", log_file: str = None) -> logging.Logger:
    """Configure logging with both console and file output."""
    logger = logging.getLogger("tick_collector")
    logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # Clear existing handlers
    logger.handlers.clear()

    # Console handler
    console_fmt = logging.Formatter(
        '%(asctime)s | %(levelname)-8s | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(console_fmt)
    logger.addHandler(console_handler)

    # File handler (if specified)
    if log_file:
        file_fmt = logging.Formatter(
            '%(asctime)s | %(levelname)-8s | %(funcName)s:%(lineno)d | %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        file_handler = logging.FileHandler(log_file, mode='a')
        file_handler.setFormatter(file_fmt)
        logger.addHandler(file_handler)

    return logger

# ==============================================================================
# DATABASE MANAGER
# ==============================================================================

class DatabaseManager:
    """SQLite database manager for tick data storage."""

    SCHEMA = """
    -- Individual trades (tick-by-tick data)
    CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pair TEXT NOT NULL,
        price REAL NOT NULL,
        quantity REAL NOT NULL,
        symbol TEXT NOT NULL,
        trade_timestamp INTEGER NOT NULL,  -- milliseconds from API
        is_maker INTEGER NOT NULL,         -- 1 = maker, 0 = taker
        collected_at INTEGER NOT NULL,     -- when we fetched it (ms)
        UNIQUE(pair, trade_timestamp, price, quantity)
    );

    -- Price snapshots (market state at intervals)
    CREATE TABLE IF NOT EXISTS price_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pair TEXT NOT NULL,
        last_price REAL,
        mark_price REAL,
        high_24h REAL,
        low_24h REAL,
        volume REAL,
        funding_rate REAL,
        estimated_funding_rate REAL,
        price_change_pct REAL,
        skew INTEGER,
        api_timestamp INTEGER,      -- timestamp from API
        collected_at INTEGER NOT NULL
    );

    -- Collection statistics
    CREATE TABLE IF NOT EXISTS collection_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pair TEXT NOT NULL,
        stat_type TEXT NOT NULL,    -- 'trades' or 'snapshots'
        count INTEGER NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER NOT NULL,
        recorded_at INTEGER NOT NULL
    );

    -- Indexes for efficient querying
    CREATE INDEX IF NOT EXISTS idx_trades_pair_ts ON trades(pair, trade_timestamp);
    CREATE INDEX IF NOT EXISTS idx_trades_collected ON trades(collected_at);
    CREATE INDEX IF NOT EXISTS idx_snapshots_pair_ts ON price_snapshots(pair, collected_at);
    """

    def __init__(self, db_path: str, logger: logging.Logger):
        self.db_path = db_path
        self.logger = logger
        self._local = threading.local()
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        """Get thread-local database connection."""
        if not hasattr(self._local, 'conn') or self._local.conn is None:
            self._local.conn = sqlite3.connect(
                self.db_path,
                check_same_thread=False,
                timeout=30.0
            )
            self._local.conn.execute("PRAGMA journal_mode=WAL")
            self._local.conn.execute("PRAGMA synchronous=NORMAL")
            self._local.conn.execute("PRAGMA cache_size=10000")
        return self._local.conn

    def _init_db(self):
        """Initialize database schema."""
        conn = self._get_connection()
        conn.executescript(self.SCHEMA)
        conn.commit()
        self.logger.info(f"Database initialized: {self.db_path}")

    def insert_trades(self, pair: str, trades: List[Dict]) -> int:
        """Insert trades, ignoring duplicates. Returns count of new trades."""
        if not trades:
            return 0

        conn = self._get_connection()
        collected_at = int(time.time() * 1000)

        inserted = 0
        for trade in trades:
            try:
                conn.execute("""
                    INSERT OR IGNORE INTO trades
                    (pair, price, quantity, symbol, trade_timestamp, is_maker, collected_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    pair,
                    float(trade['p']),
                    float(trade['q']),
                    trade['s'],
                    int(trade['T']),
                    1 if trade.get('m', False) else 0,
                    collected_at
                ))
                if conn.total_changes > 0:
                    inserted += 1
            except (KeyError, ValueError, TypeError) as e:
                self.logger.warning(f"Skipping malformed trade: {trade} - {e}")

        conn.commit()
        return inserted

    def insert_snapshot(self, pair: str, snapshot: Dict) -> bool:
        """Insert a price snapshot."""
        conn = self._get_connection()
        collected_at = int(time.time() * 1000)

        try:
            conn.execute("""
                INSERT INTO price_snapshots
                (pair, last_price, mark_price, high_24h, low_24h, volume,
                 funding_rate, estimated_funding_rate, price_change_pct, skew,
                 api_timestamp, collected_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                pair,
                snapshot.get('ls'),       # last price
                snapshot.get('mp'),       # mark price
                snapshot.get('h'),        # high 24h
                snapshot.get('l'),        # low 24h
                snapshot.get('v'),        # volume
                snapshot.get('fr'),       # funding rate
                snapshot.get('efr'),      # estimated funding rate
                snapshot.get('pc'),       # price change %
                snapshot.get('skw'),      # skew
                snapshot.get('btST'),     # API timestamp
                collected_at
            ))
            conn.commit()
            return True
        except Exception as e:
            self.logger.error(f"Failed to insert snapshot: {e}")
            return False

    def get_stats(self, pair: str) -> Dict[str, Any]:
        """Get collection statistics for a pair."""
        conn = self._get_connection()
        cursor = conn.cursor()

        # Trade stats
        cursor.execute("""
            SELECT COUNT(*), MIN(trade_timestamp), MAX(trade_timestamp),
                   MIN(price), MAX(price), SUM(quantity)
            FROM trades WHERE pair = ?
        """, (pair,))
        trade_row = cursor.fetchone()

        # Snapshot stats
        cursor.execute("""
            SELECT COUNT(*), MIN(collected_at), MAX(collected_at)
            FROM price_snapshots WHERE pair = ?
        """, (pair,))
        snap_row = cursor.fetchone()

        return {
            "trades": {
                "count": trade_row[0] or 0,
                "first_ts": trade_row[1],
                "last_ts": trade_row[2],
                "min_price": trade_row[3],
                "max_price": trade_row[4],
                "total_volume": trade_row[5] or 0,
            },
            "snapshots": {
                "count": snap_row[0] or 0,
                "first_ts": snap_row[1],
                "last_ts": snap_row[2],
            }
        }

    def close(self):
        """Close database connection."""
        if hasattr(self._local, 'conn') and self._local.conn:
            self._local.conn.close()
            self._local.conn = None

# ==============================================================================
# API CLIENT
# ==============================================================================

class CoinDCXPublicClient:
    """CoinDCX Public API client for market data."""

    BASE_URL = "https://public.coindcx.com"

    def __init__(self, timeout: int = 10, retries: int = 3, logger: logging.Logger = None):
        self.timeout = timeout
        self.logger = logger or logging.getLogger(__name__)

        # Configure session with retry logic
        self.session = requests.Session()
        retry_strategy = Retry(
            total=retries,
            backoff_factor=0.5,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET"]
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)

    def get_trade_history(self, pair: str, limit: int = 100) -> List[Dict]:
        """
        Fetch recent trades for a pair.

        Returns list of trades:
            [{"p": price, "q": quantity, "s": symbol, "T": timestamp_ms, "m": is_maker}, ...]
        """
        url = f"{self.BASE_URL}/market_data/trade_history"
        params = {"pair": pair, "limit": limit}

        try:
            response = self.session.get(url, params=params, timeout=self.timeout)
            response.raise_for_status()
            data = response.json()

            if isinstance(data, list):
                return data
            else:
                self.logger.warning(f"Unexpected trade history format: {type(data)}")
                return []

        except requests.exceptions.RequestException as e:
            self.logger.error(f"Trade history request failed: {e}")
            return []
        except json.JSONDecodeError as e:
            self.logger.error(f"Failed to parse trade history JSON: {e}")
            return []

    def get_realtime_prices(self) -> Dict[str, Any]:
        """
        Fetch real-time prices for all futures pairs.

        Returns:
            {"ts": timestamp, "vs": version, "prices": {pair: data, ...}}
        """
        url = f"{self.BASE_URL}/market_data/v3/current_prices/futures/rt"

        try:
            response = self.session.get(url, timeout=self.timeout)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            self.logger.error(f"Realtime prices request failed: {e}")
            return {}
        except json.JSONDecodeError as e:
            self.logger.error(f"Failed to parse realtime prices JSON: {e}")
            return {}

    def get_price_for_pair(self, pair: str) -> Optional[Dict]:
        """Get real-time price data for a specific pair."""
        data = self.get_realtime_prices()
        prices = data.get("prices", {})
        return prices.get(pair)

# ==============================================================================
# TICK COLLECTOR
# ==============================================================================

class TickCollector:
    """
    Main tick data collector.

    Runs two collection loops:
    1. Trade collector: Polls trade history every N seconds
    2. Snapshot collector: Polls price snapshots every M seconds
    """

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.pair = config["pair"]
        self.running = False
        self._stop_event = threading.Event()

        # Setup logging
        self.logger = setup_logging(
            log_level=config.get("log_level", "INFO"),
            log_file=config.get("log_file")
        )

        # Initialize components
        self.db = DatabaseManager(config["db_path"], self.logger)
        self.client = CoinDCXPublicClient(
            timeout=config.get("request_timeout", 10),
            retries=config.get("retry_attempts", 3),
            logger=self.logger
        )

        # Statistics
        self.stats = {
            "trades_collected": 0,
            "snapshots_collected": 0,
            "errors": 0,
            "start_time": None,
        }

        # Track last seen trade to avoid duplicates
        self._last_trade_ts = 0

    def _collect_trades(self):
        """Trade collection loop."""
        interval = self.config.get("trade_poll_interval", 1.0)
        limit = self.config.get("trade_limit", 100)

        self.logger.info(f"Trade collector started (interval: {interval}s, limit: {limit})")

        while not self._stop_event.is_set():
            try:
                trades = self.client.get_trade_history(self.pair, limit=limit)

                if trades:
                    # Filter out trades we've already seen
                    new_trades = [t for t in trades if t.get('T', 0) > self._last_trade_ts]

                    if new_trades:
                        inserted = self.db.insert_trades(self.pair, new_trades)
                        self.stats["trades_collected"] += inserted

                        # Update last seen timestamp
                        max_ts = max(t.get('T', 0) for t in new_trades)
                        if max_ts > self._last_trade_ts:
                            self._last_trade_ts = max_ts

                        if inserted > 0:
                            self.logger.debug(f"Inserted {inserted} new trades")

            except Exception as e:
                self.stats["errors"] += 1
                self.logger.error(f"Trade collection error: {e}", exc_info=True)

            self._stop_event.wait(interval)

    def _collect_snapshots(self):
        """Price snapshot collection loop."""
        interval = self.config.get("snapshot_poll_interval", 5.0)

        self.logger.info(f"Snapshot collector started (interval: {interval}s)")

        while not self._stop_event.is_set():
            try:
                snapshot = self.client.get_price_for_pair(self.pair)

                if snapshot:
                    if self.db.insert_snapshot(self.pair, snapshot):
                        self.stats["snapshots_collected"] += 1
                        self.logger.debug(f"Snapshot: price={snapshot.get('ls')}, mark={snapshot.get('mp')}")
                else:
                    self.logger.warning(f"No snapshot data for {self.pair}")

            except Exception as e:
                self.stats["errors"] += 1
                self.logger.error(f"Snapshot collection error: {e}", exc_info=True)

            self._stop_event.wait(interval)

    def _log_status(self):
        """Periodic status logging."""
        while not self._stop_event.is_set():
            try:
                db_stats = self.db.get_stats(self.pair)
                runtime = time.time() - self.stats["start_time"] if self.stats["start_time"] else 0

                self.logger.info(
                    f"STATUS | Runtime: {runtime/3600:.1f}h | "
                    f"Trades: {db_stats['trades']['count']:,} | "
                    f"Snapshots: {db_stats['snapshots']['count']:,} | "
                    f"Errors: {self.stats['errors']}"
                )

                if db_stats['trades']['count'] > 0:
                    self.logger.info(
                        f"TRADES | Price range: {db_stats['trades']['min_price']:.4f} - "
                        f"{db_stats['trades']['max_price']:.4f} | "
                        f"Volume: {db_stats['trades']['total_volume']:,.2f}"
                    )

            except Exception as e:
                self.logger.error(f"Status logging error: {e}")

            # Log status every 5 minutes
            self._stop_event.wait(300)

    def start(self):
        """Start the tick collector."""
        if self.running:
            self.logger.warning("Collector already running")
            return

        self.running = True
        self.stats["start_time"] = time.time()
        self._stop_event.clear()

        self.logger.info("=" * 60)
        self.logger.info(f"TICK COLLECTOR STARTING")
        self.logger.info(f"Pair: {self.pair}")
        self.logger.info(f"Database: {self.config['db_path']}")
        self.logger.info("=" * 60)

        # Verify pair exists
        test_data = self.client.get_price_for_pair(self.pair)
        if not test_data:
            self.logger.error(f"Pair {self.pair} not found or API unavailable!")
            self.running = False
            return

        self.logger.info(f"Verified pair {self.pair}: last_price={test_data.get('ls')}")

        # Start collection threads
        self._threads = [
            threading.Thread(target=self._collect_trades, name="TradeCollector", daemon=True),
            threading.Thread(target=self._collect_snapshots, name="SnapshotCollector", daemon=True),
            threading.Thread(target=self._log_status, name="StatusLogger", daemon=True),
        ]

        for t in self._threads:
            t.start()
            self.logger.info(f"Started thread: {t.name}")

        self.logger.info("All collectors running. Press Ctrl+C to stop.")

    def stop(self):
        """Stop the tick collector gracefully."""
        if not self.running:
            return

        self.logger.info("Stopping collectors...")
        self._stop_event.set()
        self.running = False

        # Wait for threads to finish
        for t in self._threads:
            t.join(timeout=5)

        # Final stats
        runtime = time.time() - self.stats["start_time"] if self.stats["start_time"] else 0
        db_stats = self.db.get_stats(self.pair)

        self.logger.info("=" * 60)
        self.logger.info("FINAL STATISTICS")
        self.logger.info(f"Runtime: {runtime/3600:.2f} hours")
        self.logger.info(f"Total trades: {db_stats['trades']['count']:,}")
        self.logger.info(f"Total snapshots: {db_stats['snapshots']['count']:,}")
        self.logger.info(f"Total errors: {self.stats['errors']}")
        self.logger.info("=" * 60)

        self.db.close()

    def wait(self):
        """Wait for collector to be stopped."""
        try:
            while self.running:
                time.sleep(1)
        except KeyboardInterrupt:
            pass

# ==============================================================================
# MAIN
# ==============================================================================

def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="CoinDCX Tick Data Collector",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python3 tick_collector.py --pair B-UNI_USDT
    python3 tick_collector.py --pair B-SOL_USDT --db /data/sol_ticks.db
    python3 tick_collector.py --pair B-BTC_USDT --trade-interval 0.5 --snapshot-interval 2
        """
    )

    parser.add_argument(
        "--pair", "-p",
        default=DEFAULT_CONFIG["pair"],
        help=f"Trading pair to collect (default: {DEFAULT_CONFIG['pair']})"
    )

    parser.add_argument(
        "--db", "-d",
        default=DEFAULT_CONFIG["db_path"],
        help=f"SQLite database path (default: {DEFAULT_CONFIG['db_path']})"
    )

    parser.add_argument(
        "--trade-interval", "-t",
        type=float,
        default=DEFAULT_CONFIG["trade_poll_interval"],
        help=f"Trade poll interval in seconds (default: {DEFAULT_CONFIG['trade_poll_interval']})"
    )

    parser.add_argument(
        "--snapshot-interval", "-s",
        type=float,
        default=DEFAULT_CONFIG["snapshot_poll_interval"],
        help=f"Snapshot poll interval in seconds (default: {DEFAULT_CONFIG['snapshot_poll_interval']})"
    )

    parser.add_argument(
        "--log-level", "-l",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        default=DEFAULT_CONFIG["log_level"],
        help=f"Log level (default: {DEFAULT_CONFIG['log_level']})"
    )

    parser.add_argument(
        "--log-file",
        default=DEFAULT_CONFIG["log_file"],
        help=f"Log file path (default: {DEFAULT_CONFIG['log_file']})"
    )

    return parser.parse_args()


def main():
    """Main entry point."""
    args = parse_args()

    config = {
        "pair": args.pair,
        "db_path": args.db,
        "trade_poll_interval": args.trade_interval,
        "snapshot_poll_interval": args.snapshot_interval,
        "log_level": args.log_level,
        "log_file": args.log_file,
        "trade_limit": DEFAULT_CONFIG["trade_limit"],
        "request_timeout": DEFAULT_CONFIG["request_timeout"],
        "retry_attempts": DEFAULT_CONFIG["retry_attempts"],
    }

    collector = TickCollector(config)

    # Handle graceful shutdown
    def signal_handler(signum, frame):
        print("\nReceived shutdown signal...")
        collector.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Start collecting
    collector.start()
    collector.wait()


if __name__ == "__main__":
    main()
