#!/usr/bin/env python3
"""
Strategy Runner - Python Subprocess

Executes user strategy code in isolated environment and returns trading signals.

Input: JSON via stdin containing:
  {
    "strategy_id": "...",
    "execution_time": "2025-10-07T12:05:00Z",
    "settings": {
      "symbol": "BTC_USDT",
      "resolution": "5",
      "lookback_period": 200,
      ...
    }
  }

Output: JSON via stdout containing:
  {
    "success": true,
    "signal": {
      "signal": "LONG" | "SHORT" | "HOLD" | "EXIT_LONG" | "EXIT_SHORT",
      "price": 45000.0,
      "stopLoss": 44000.0,
      "takeProfit": 46000.0,
      "metadata": {}
    },
    "logs": ["..."]
  }
"""

import sys
import json
import traceback
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
import sqlite3
import os


class StrategyRunner:
    def __init__(self, database_path: str):
        self.database_path = database_path
        self.logs: List[str] = []

    def log(self, message: str):
        """Add log message to output."""
        self.logs.append(f"[{datetime.utcnow().isoformat()}] {message}")

    def load_strategy_code(self, strategy_id: str) -> Optional[str]:
        """Load strategy code from database."""
        try:
            conn = sqlite3.connect(self.database_path)
            cursor = conn.cursor()

            cursor.execute(
                "SELECT code FROM Strategy WHERE id = ?",
                (strategy_id,)
            )

            result = cursor.fetchone()
            conn.close()

            if result:
                self.log(f"Loaded strategy code for {strategy_id}")
                return result[0]
            else:
                self.log(f"Strategy {strategy_id} not found in database")
                return None

        except Exception as e:
            self.log(f"Failed to load strategy code: {str(e)}")
            return None

    def fetch_candle_data(
        self,
        symbol: str,
        resolution: str,
        lookback_period: int,
        execution_time: datetime
    ) -> Optional[Dict[str, Any]]:
        """
        Fetch candle data from exchange or database.

        For MVP, this returns mock data.
        In production, this should fetch from:
        1. Exchange API (CoinDCX)
        2. Local candle cache/database
        3. Third-party data provider
        """
        try:
            self.log(f"Fetching {lookback_period} candles for {symbol} @ {resolution}m")

            # Mock data for MVP
            # In production, fetch real candle data here
            resolution_minutes = int(resolution)
            candles = []

            for i in range(lookback_period):
                candle_time = execution_time - timedelta(minutes=resolution_minutes * (lookback_period - i))
                candles.append({
                    'timestamp': int(candle_time.timestamp() * 1000),
                    'open': 45000.0 + (i % 100),
                    'high': 45100.0 + (i % 100),
                    'low': 44900.0 + (i % 100),
                    'close': 45000.0 + (i % 100),
                    'volume': 1000.0 + (i % 50)
                })

            self.log(f"Fetched {len(candles)} candles")

            return {
                'symbol': symbol,
                'resolution': resolution,
                'candles': candles
            }

        except Exception as e:
            self.log(f"Failed to fetch candle data: {str(e)}")
            return None

    def execute_strategy(
        self,
        strategy_code: str,
        settings: Dict[str, Any],
        market_data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Execute user strategy code in isolated scope.

        Strategy code must define a function called `generate_signal` that:
        - Takes (candles, settings) as arguments
        - Returns dict with keys: signal, price, stopLoss, takeProfit, metadata
        """
        try:
            self.log("Executing strategy code")

            # Create execution scope
            execution_scope = {
                '__builtins__': __builtins__,
                'candles': market_data['candles'],
                'settings': settings,
                'symbol': settings['symbol'],
                'resolution': settings['resolution']
            }

            # Execute user code (defines generate_signal function)
            exec(strategy_code, execution_scope)

            # Check if generate_signal function exists
            if 'generate_signal' not in execution_scope:
                raise ValueError("Strategy code must define 'generate_signal' function")

            # Call generate_signal function
            generate_signal = execution_scope['generate_signal']
            signal = generate_signal(market_data['candles'], settings)

            # Validate signal structure
            required_keys = ['signal', 'price']
            for key in required_keys:
                if key not in signal:
                    raise ValueError(f"Signal must contain '{key}' key")

            valid_signals = ['LONG', 'SHORT', 'HOLD', 'EXIT_LONG', 'EXIT_SHORT']
            if signal['signal'] not in valid_signals:
                raise ValueError(f"Invalid signal type: {signal['signal']}")

            self.log(f"Generated signal: {signal['signal']} @ {signal.get('price')}")

            return signal

        except Exception as e:
            self.log(f"Strategy execution error: {str(e)}")
            self.log(traceback.format_exc())
            return None

    def run(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Main execution pipeline."""
        try:
            # Support two input formats:
            # 1. Backtesting: {strategy_code, historical_data, config}
            # 2. Live execution: {strategy_id, execution_time, settings}

            if 'strategy_code' in input_data:
                # Backtesting mode: code and data provided directly
                strategy_code = input_data['strategy_code']
                historical_data = input_data.get('historical_data', [])
                config = input_data.get('config', {})

                self.log(f"Backtesting mode: {len(historical_data)} candles, code length: {len(strategy_code)}")

                # Convert historical_data to market_data format
                market_data = {
                    'symbol': config.get('symbol', 'UNKNOWN'),
                    'resolution': config.get('resolution', '5'),
                    'candles': historical_data
                }

                # Use config as settings
                settings = config

            else:
                # Live execution mode: load from database
                strategy_id = input_data['strategy_id']
                execution_time = datetime.fromisoformat(
                    input_data['execution_time'].replace('Z', '+00:00')
                )
                settings = input_data['settings']

                self.log(f"Starting execution for strategy {strategy_id}")

                # Load strategy code
                strategy_code = self.load_strategy_code(strategy_id)
                if not strategy_code:
                    return {
                        'success': False,
                        'signal': None,
                        'error': 'Failed to load strategy code',
                        'logs': self.logs
                    }

                # Fetch candle data
                market_data = self.fetch_candle_data(
                    settings['symbol'],
                    settings['resolution'],
                    settings.get('lookback_period', 200),
                    execution_time
                )

                if not market_data:
                    return {
                        'success': False,
                        'signal': None,
                        'error': 'Failed to fetch candle data',
                        'logs': self.logs
                    }

            # Execute strategy
            signal = self.execute_strategy(strategy_code, settings, market_data)

            if not signal:
                return {
                    'success': False,
                    'signal': None,
                    'error': 'Strategy execution failed',
                    'logs': self.logs
                }

            # Return HOLD signals as null (no trade action)
            if signal['signal'] == 'HOLD':
                return {
                    'success': True,
                    'signal': None,
                    'logs': self.logs
                }

            return {
                'success': True,
                'signal': signal,
                'logs': self.logs
            }

        except Exception as e:
            self.log(f"Fatal error: {str(e)}")
            self.log(traceback.format_exc())
            return {
                'success': False,
                'signal': None,
                'error': str(e),
                'logs': self.logs
            }


def main():
    """Main entry point - reads from stdin, writes to stdout."""
    try:
        # Read input from stdin
        input_line = sys.stdin.read()
        input_data = json.loads(input_line)

        # Get database path from environment or default
        database_path = os.getenv(
            'DATABASE_PATH',
            '/Users/macintosh/Developer/coindcx_client/coindcx-trading-platform/backend/prisma/dev.db'
        )

        # Run strategy
        runner = StrategyRunner(database_path)
        result = runner.run(input_data)

        # Output result as JSON to stdout
        print(json.dumps(result))
        sys.exit(0)

    except Exception as e:
        # Fatal error - output error JSON
        error_result = {
            'success': False,
            'signal': None,
            'error': f"Fatal error: {str(e)}",
            'logs': [traceback.format_exc()]
        }
        print(json.dumps(error_result))
        sys.exit(1)


if __name__ == '__main__':
    main()
