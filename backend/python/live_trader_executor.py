#!/usr/bin/env python3
"""
LiveTrader Executor - Backend subprocess for executing LiveTrader-format strategies

This executor runs uploaded LiveTrader strategies in multi-tenant mode.

Input (via stdin): JSON with strategy_code, settings, subscribers list
Output (via stdout): JSON with success status, logs

Usage:
    echo '{"settings": {...}, "subscribers": [...], "strategy_code": "..."}' | python live_trader_executor.py
"""

import sys
import json
import logging
import traceback
from datetime import datetime
from typing import Dict, Any, List
from io import StringIO


class LogCapture:
    """Captures logs from strategy execution"""

    def __init__(self):
        self.logs = []
        self.setup_logging()

    def setup_logging(self):
        """Setup logging to capture all output"""
        logger = logging.getLogger()
        logger.setLevel(logging.INFO)

        # Clear existing handlers
        if logger.hasHandlers():
            logger.handlers.clear()

        # Console handler (captures to list)
        handler = logging.StreamHandler(sys.stderr)  # Use stderr to not interfere with stdout JSON
        formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)

        # Also capture to our list
        class ListHandler(logging.Handler):
            def __init__(self, log_list):
                super().__init__()
                self.log_list = log_list

            def emit(self, record):
                self.log_list.append({
                    'timestamp': datetime.fromtimestamp(record.created).isoformat(),
                    'level': record.levelname,
                    'message': record.getMessage(),
                    'function': record.funcName,
                    'line': record.lineno
                })

        list_handler = ListHandler(self.logs)
        logger.addHandler(list_handler)


def execute_livetrader_strategy(input_data: Dict[str, Any], log_capture: LogCapture) -> Dict[str, Any]:
    """
    Execute LiveTrader strategy with subscribers list.

    Args:
        input_data: {
            'strategy_code': str (Python code defining LiveTrader class),
            'settings': dict (strategy settings),
            'subscribers': list (subscriber data with API keys)
        }
        log_capture: LogCapture instance

    Returns:
        {
            'success': bool,
            'message': str,
            'logs': list,
            'trades_attempted': int
        }
    """
    try:
        strategy_code = input_data.get('strategy_code')
        settings = input_data.get('settings', {})
        subscribers = input_data.get('subscribers', [])

        if not strategy_code:
            raise ValueError("Missing strategy_code in input")

        if not subscribers:
            raise ValueError("No subscribers provided")

        logging.info(f"Executing LiveTrader strategy for {len(subscribers)} subscribers")
        logging.info(f"Settings: pair={settings.get('pair')}, resolution={settings.get('resolution')}")

        # Execute strategy code to define LiveTrader class
        exec_scope = {
            '__builtins__': __builtins__,
            'logging': logging,
            'sys': sys,
            'os': __import__('os'),
            'json': json,
            'time': __import__('time'),
            'warnings': __import__('warnings'),
            'requests': __import__('requests'),
            'hmac': __import__('hmac'),
            'hashlib': __import__('hashlib'),
            'csv': __import__('csv'),
            'datetime': __import__('datetime'),
            'timezone': __import__('datetime').timezone,
            'Decimal': __import__('decimal').Decimal,
            'ROUND_DOWN': __import__('decimal').ROUND_DOWN,
        }

        # Import pandas, numpy, pandas_ta if available
        try:
            import pandas as pd
            import numpy as np
            exec_scope['pd'] = pd
            exec_scope['np'] = np
            exec_scope['pandas'] = pd
            exec_scope['numpy'] = np
        except ImportError as e:
            logging.warning(f"pandas/numpy not available: {e}")

        try:
            import pandas_ta as ta
            exec_scope['ta'] = ta
            exec_scope['pandas_ta'] = ta
        except ImportError:
            logging.warning("pandas_ta not available")

        # Execute the strategy code (defines LiveTrader class)
        logging.info("Executing strategy code...")
        exec(strategy_code, exec_scope)

        # Check if LiveTrader class is defined
        if 'LiveTrader' not in exec_scope:
            raise ValueError("Strategy code must define 'LiveTrader' class")

        LiveTrader = exec_scope['LiveTrader']

        # Instantiate LiveTrader with settings and subscribers
        logging.info("Instantiating LiveTrader...")
        bot = LiveTrader(settings=settings, subscribers=subscribers)

        # Fetch latest data
        logging.info("Fetching latest market data...")
        df = bot.get_latest_data()

        if df is None or (hasattr(df, 'empty') and df.empty):
            raise ValueError("Failed to fetch market data")

        logging.info(f"Fetched {len(df)} candles")

        # Check for new signal (this will place orders for all subscribers)
        logging.info("Checking for trading signals...")
        bot.check_for_new_signal(df)

        logging.info("Strategy execution completed successfully")

        return {
            'success': True,
            'message': 'Execution complete',
            'logs': log_capture.logs,
            'subscribers_processed': len(subscribers)
        }

    except Exception as e:
        logging.error(f"Strategy execution failed: {e}")
        logging.error(traceback.format_exc())

        return {
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc(),
            'logs': log_capture.logs
        }


def main():
    """Main entry point - reads from stdin, executes strategy, writes to stdout"""
    log_capture = LogCapture()

    try:
        # Read input from stdin
        input_text = sys.stdin.read()

        if not input_text.strip():
            result = {
                'success': False,
                'error': 'No input provided',
                'logs': log_capture.logs
            }
        else:
            # Parse JSON input
            try:
                input_data = json.loads(input_text)
            except json.JSONDecodeError as e:
                result = {
                    'success': False,
                    'error': f'Invalid JSON input: {e}',
                    'logs': log_capture.logs
                }
            else:
                # Execute strategy
                result = execute_livetrader_strategy(input_data, log_capture)

        # Write result to stdout as JSON
        print(json.dumps(result, indent=2))

        # Exit with appropriate code
        sys.exit(0 if result.get('success') else 1)

    except Exception as e:
        # Fatal error - write error to stdout and exit
        error_result = {
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc(),
            'logs': log_capture.logs
        }
        print(json.dumps(error_result, indent=2))
        sys.exit(1)


if __name__ == '__main__':
    main()

