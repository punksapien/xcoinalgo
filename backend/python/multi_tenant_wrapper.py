#!/usr/bin/env python3
"""
Multi-Tenant Strategy Wrapper

Takes quant team's single-tenant strategy code and executes it for multiple subscribers,
each with their own API credentials and capital allocation.

Input (via stdin): JSON with:
  - strategy_code: Complete Python code from quant team
  - settings: Strategy settings (pair, resolution, params)
  - subscribers: List of subscriber configs with credentials

Output (via stdout): JSON with:
  - success: bool
  - subscribers_processed: int
  - trades_attempted: int
  - logs: list
  - errors: dict (per-subscriber errors)
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

        # Console handler (stderr to not interfere with stdout JSON)
        console_handler = logging.StreamHandler(sys.stderr)
        formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)

        # List handler to capture logs
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


def execute_multi_tenant_strategy(input_data: Dict[str, Any], log_capture: LogCapture) -> Dict[str, Any]:
    """
    Execute quant team's strategy for multiple subscribers.

    Strategy Anatomy (what we expect from quant team):
        - class CoinDCXClient: API communication
        - class Trader: Contains generate_signals(df, params) method for strategy logic
        - class LiveTrader: Single-tenant live execution
        - class Backtester: Backtesting (optional)

    Multi-Tenant Approach:
        1. Execute quant's code to define their classes
        2. For each subscriber:
           a. Initialize LiveTrader with subscriber's credentials
           b. Fetch market data (shared across subscribers)
           c. Generate signals using Trader.generate_signals method
           d. Execute check_for_new_signal with subscriber's LiveTrader

    Args:
        input_data: {
            'strategy_code': str,
            'settings': dict (pair, resolution, strategy params),
            'subscribers': list of {user_id, api_key, api_secret, capital, risk_per_trade, leverage}
        }
        log_capture: LogCapture instance

    Returns:
        {
            'success': bool,
            'subscribers_processed': int,
            'trades_attempted': int,
            'logs': list,
            'errors': dict
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

        logging.info(f"🚀 Multi-Tenant Execution Started")
        logging.info(f"   Pair: {settings.get('pair')}")
        logging.info(f"   Resolution: {settings.get('resolution')}")
        logging.info(f"   Subscribers: {len(subscribers)}")

        # ====================================================================
        # STEP 1: Execute quant's strategy code to define classes/functions
        # ====================================================================
        logging.info("📦 Loading strategy code...")

        # ✅ Setup CSV logging in logs/ directory (current working directory is the strategy folder)
        import os
        logs_dir = os.path.join(os.getcwd(), 'logs')
        os.makedirs(logs_dir, exist_ok=True)

        strategy_id = settings.get('strategy_id', 'unknown')
        log_file = os.path.join(logs_dir, f'live_trader_{strategy_id}.csv')
        print_log_file = os.path.join(logs_dir, f'print_output_{strategy_id}.log')

        # Add CSV file handler for persistent logs with IST timezone
        from datetime import timezone, timedelta

        class ISTFormatter(logging.Formatter):
            """Custom formatter to show timestamps in IST (UTC+5:30)"""
            def formatTime(self, record, datefmt=None):
                ist = timezone(timedelta(hours=5, minutes=30))
                dt = datetime.fromtimestamp(record.created, tz=ist)
                if datefmt:
                    return dt.strftime(datefmt)
                return dt.strftime('%Y-%m-%d %H:%M:%S IST')

        csv_handler = logging.FileHandler(log_file, mode='a')
        csv_formatter = ISTFormatter('%(asctime)s,%(levelname)s,%(message)s,%(funcName)s,%(lineno)d')
        csv_handler.setFormatter(csv_formatter)
        logging.getLogger().addHandler(csv_handler)

        # ✅ Redirect print() statements to file
        class PrintLogger:
            def __init__(self, filename):
                self.terminal = sys.stdout
                self.log = open(filename, 'a')

            def write(self, message):
                self.terminal.write(message)  # Still show in console
                self.log.write(message)  # Also write to file
                self.log.flush()

            def flush(self):
                self.terminal.flush()
                self.log.flush()

        sys.stdout = PrintLogger(print_log_file)

        logging.info(f"📝 Logging to: {log_file}")
        logging.info(f"📝 Print output to: {print_log_file}")

        exec_scope = {
            '__builtins__': __builtins__,
            'logging': logging,
            'sys': sys,
        }

        # Import common dependencies that quant team uses
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

        # Import other common modules
        for module_name in ['os', 'json', 'time', 'warnings', 'requests', 'hmac', 'hashlib', 'csv']:
            try:
                exec_scope[module_name] = __import__(module_name)
            except ImportError:
                pass

        # Import datetime components
        try:
            from datetime import datetime, timezone
            from decimal import Decimal, ROUND_DOWN
            from typing import List, Dict, Any, Optional
            exec_scope['datetime'] = datetime
            exec_scope['timezone'] = timezone
            exec_scope['Decimal'] = Decimal
            exec_scope['ROUND_DOWN'] = ROUND_DOWN
            exec_scope['List'] = List
            exec_scope['Dict'] = Dict
            exec_scope['Any'] = Any
            exec_scope['Optional'] = Optional
        except ImportError:
            pass

        # Execute the strategy code (defines CoinDCXClient, LiveTrader, etc.)
        logging.info("⚙️  Executing strategy code to define classes...")
        exec(strategy_code, exec_scope)

        # Verify required components exist
        if 'LiveTrader' not in exec_scope:
            raise ValueError("Strategy code must define 'LiveTrader' class")

        if 'Trader' not in exec_scope:
            raise ValueError("Strategy code must define 'Trader' class (base class for LiveTrader)")

        LiveTrader = exec_scope['LiveTrader']

        logging.info("✅ Strategy classes loaded successfully")

        # ====================================================================
        # STEP 2: Fetch market data ONCE (shared across all subscribers)
        # ====================================================================
        logging.info("📊 Fetching market data (shared across subscribers)...")

        # Use first subscriber's credentials just to fetch data
        # (market data is public, but API requires auth)
        first_subscriber = subscribers[0]
        temp_settings = {
            **settings,
            'api_key': first_subscriber['api_key'],
            'api_secret': first_subscriber['api_secret']
        }

        temp_trader = LiveTrader(settings=temp_settings)
        df = temp_trader.get_latest_data()

        if df is None or (hasattr(df, 'empty') and df.empty):
            raise ValueError("Failed to fetch market data")

        logging.info(f"   Fetched {len(df)} candles")

        # ====================================================================
        # STEP 3: Generate signals ONCE (same for all subscribers)
        # ====================================================================
        logging.info("🧠 Generating signals...")

        # Use the LiveTrader instance's inherited generate_signals method
        df_with_signals = temp_trader.generate_signals(df, settings)

        if df_with_signals is None or (hasattr(df_with_signals, 'empty') and df_with_signals.empty):
            raise ValueError("Signal generation returned empty dataframe")

        logging.info("✅ Signals generated")

        # ====================================================================
        # STEP 4: Execute strategy for EACH subscriber with their credentials
        # ====================================================================
        logging.info(f"💼 Processing {len(subscribers)} subscribers...")

        subscribers_processed = 0
        trades_attempted = 0
        errors = {}

        for idx, subscriber in enumerate(subscribers, 1):
            user_id = subscriber.get('user_id')
            logging.info(f"\n   [{idx}/{len(subscribers)}] Processing user {user_id}...")

            try:
                # Create subscriber-specific settings
                subscriber_settings = {
                    **settings,
                    'user_id': subscriber['user_id'],  # For unique state file paths
                    'api_key': subscriber['api_key'],
                    'api_secret': subscriber['api_secret'],
                    'leverage': subscriber.get('leverage', 10),
                    'risk_per_trade': subscriber.get('risk_per_trade', 0.02),
                    'initial_capital': subscriber.get('capital', 10000),
                }

                # Initialize LiveTrader for this subscriber
                # (their __init__ sets up self.client with their credentials)
                subscriber_trader = LiveTrader(settings=subscriber_settings)

                # Execute their check_for_new_signal method
                # (this contains all their custom trading logic)
                subscriber_trader.check_for_new_signal(df_with_signals)

                subscribers_processed += 1
                trades_attempted += 1

                logging.info(f"   ✅ User {user_id} processed successfully")

            except Exception as e:
                error_msg = str(e)
                errors[user_id] = error_msg
                logging.error(f"   ❌ User {user_id} failed: {error_msg}")
                logging.error(traceback.format_exc())
                # Continue with next subscriber even if this one fails

        # ====================================================================
        # STEP 5: Return results
        # ====================================================================
        logging.info(f"\n🏁 Multi-Tenant Execution Complete")
        logging.info(f"   Subscribers Processed: {subscribers_processed}/{len(subscribers)}")
        logging.info(f"   Trades Attempted: {trades_attempted}")
        logging.info(f"   Errors: {len(errors)}")

        return {
            'success': True,
            'subscribers_processed': subscribers_processed,
            'trades_attempted': trades_attempted,
            'logs': log_capture.logs,
            'errors': errors if errors else None
        }

    except Exception as e:
        logging.error(f"💥 Multi-tenant execution failed: {e}")
        logging.error(traceback.format_exc())

        return {
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc(),
            'logs': log_capture.logs,
            'subscribers_processed': 0,
            'trades_attempted': 0
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
                # Execute multi-tenant strategy
                result = execute_multi_tenant_strategy(input_data, log_capture)

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
