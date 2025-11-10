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
import csv
import os
import inspect
from datetime import datetime
from typing import Dict, Any, List
from io import StringIO


class CsvHandler(logging.FileHandler):
    """
    Custom CSV logging handler that writes structured logs to CSV files.
    Automatically creates CSV header if file is new or empty.
    """
    def __init__(self, filename, mode='a', encoding=None, delay=False):
        # Ensure directory exists
        os.makedirs(os.path.dirname(filename) if os.path.dirname(filename) else '.', exist_ok=True)
        super().__init__(filename, mode, encoding, delay)
        # Write header if file is new or empty
        if not os.path.exists(filename) or os.path.getsize(filename) == 0:
            self._write_header()

    def _write_header(self):
        if self.stream is None:
            self.stream = self._open()
        csv_writer = csv.writer(self.stream)
        csv_writer.writerow(['timestamp', 'level', 'message', 'function', 'line'])
        self.flush()

    def emit(self, record):
        try:
            if self.stream is None:
                self.stream = self._open()
            csv_writer = csv.writer(self.stream)
            log_entry = [
                datetime.fromtimestamp(record.created).strftime('%Y-%m-%d %H:%M:%S'),
                record.levelname,
                record.getMessage(),
                record.funcName,
                record.lineno
            ]
            csv_writer.writerow(log_entry)
            self.flush()
        except Exception:
            self.handleError(record)


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


def _convert_settings_types(settings: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert string values from Redis to proper types automatically.

    This is a generalized solution that detects numeric strings and converts them
    to int or float as appropriate, without needing hardcoded field lists.

    Some fields must remain as strings even if they look numeric (e.g., resolution "15").
    """
    converted = {}

    # Fields that should ALWAYS remain as strings, even if they look numeric
    keep_as_string = {
        'resolution',  # API expects "15" not 15
        'pair',        # Symbol pair like "B-ETH_USDT"
        'name',        # Strategy name
        'author',      # Author name
        'tags',        # Tags
        'margin_currency',  # "INR" or "USDT"
        'user_id',     # User ID
        'api_key',     # API credentials
        'api_secret',  # API credentials
    }

    for key, value in settings.items():
        if isinstance(value, str):
            # Check if this field should stay as string
            if key in keep_as_string:
                converted[key] = value
            else:
                # Try to automatically detect and convert numeric strings
                try:
                    # First try int (for values like "10", "5", "100")
                    if '.' not in value and 'e' not in value.lower() and 'E' not in value:
                        # Looks like an integer
                        int_val = int(value)
                        converted[key] = int_val
                    else:
                        # Has decimal point or scientific notation - treat as float
                        float_val = float(value)
                        converted[key] = float_val
                except (ValueError, AttributeError):
                    # Not a number - keep as string
                    converted[key] = value
        else:
            # Already the right type
            converted[key] = value

    return converted


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

        # Convert string values from Redis to proper types
        settings = _convert_settings_types(settings)

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
        from datetime import datetime as dt_class, timezone, timedelta

        class ISTFormatter(logging.Formatter):
            """Custom formatter to show timestamps in IST (UTC+5:30)"""
            def formatTime(self, record, datefmt=None):
                ist = timezone(timedelta(hours=5, minutes=30))
                dt = dt_class.fromtimestamp(record.created, tz=ist)
                if datefmt:
                    return dt.strftime(datefmt)
                return dt.strftime('%Y-%m-%d %H:%M:%S IST')

        csv_handler = logging.FileHandler(log_file, mode='a')
        csv_formatter = ISTFormatter('%(asctime)s,%(levelname)s,%(message)s,%(funcName)s,%(lineno)d')
        csv_handler.setFormatter(csv_formatter)
        logging.getLogger().addHandler(csv_handler)

        # ✅ Add CsvHandler for structured logging
        # Creates logs/trading_bot.log (all logs) and logs/error_log.csv (errors only)
        trading_bot_log_path = os.path.join(logs_dir, 'trading_bot.log')
        trading_bot_handler = logging.FileHandler(trading_bot_log_path, mode='a')
        trading_bot_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        trading_bot_handler.setFormatter(trading_bot_formatter)
        logging.getLogger().addHandler(trading_bot_handler)

        error_log_path = os.path.join(logs_dir, 'error_log.csv')
        csv_error_handler = CsvHandler(error_log_path)
        csv_error_handler.setLevel(logging.ERROR)
        logging.getLogger().addHandler(csv_error_handler)

        logging.info(f"📝 Additional logs: {trading_bot_log_path}, {error_log_path}")

        # ✅ Redirect print() statements to file ONLY (prevent stdout pollution)
        class PrintLogger:
            def __init__(self, filename):
                self.terminal = sys.stdout
                self.log = open(filename, 'a')

            def write(self, message):
                # DO NOT write to terminal - this pollutes stdout and breaks JSON parsing
                # Only write to log file
                self.log.write(message)
                self.log.flush()

            def flush(self):
                # Only flush log file, not terminal
                self.log.flush()

        sys.stdout = PrintLogger(print_log_file)

        # ✅ Also redirect stderr to prevent error output pollution
        sys.stderr = PrintLogger(error_log_path)

        logging.info(f"📝 Logging to: {log_file}")
        logging.info(f"📝 Print output to: {print_log_file}")
        logging.info(f"📝 Error output to: {error_log_path}")

        exec_scope = {
            '__builtins__': __builtins__,
            'logging': logging,
            'sys': sys,
            'CsvHandler': CsvHandler,  # ✅ Make CsvHandler available to quant team for custom logs
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

        # Extract STRATEGY_CONFIG if defined (for multi-resolution support)
        strategy_config = exec_scope.get('STRATEGY_CONFIG', {})
        is_multi_resolution = strategy_config.get('is_multi_resolution', False)

        if is_multi_resolution:
            logging.info(f"📐 Multi-resolution strategy detected:")
            logging.info(f"   Signal Resolution: {strategy_config.get('signal_resolution')}")
            logging.info(f"   Exit Resolution: {strategy_config.get('exit_resolution')}")
            logging.info(f"   Base Resolution: {strategy_config.get('base_resolution', settings.get('resolution'))}")

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
        # STEP 3: Generate signals (BOTH 5m Exit and 15m Entry)
        # ====================================================================
        # NOTE: Original multi-resolution code commented out on 2025-11-10 10:19 AM ASIA/KOLKATA TZ
        # Previous implementation attempted to handle multi-resolution but was causing syntax errors
        #
        # Commented out original code:
        # logging.info("🧠 Generating signals...")
        # Multi-resolution signal generation
        # if is_multi_resolution:
        #     from strategy_helpers import resample_ohlcv
        #     signal_resolution = strategy_config.get('signal_resolution')
        #     base_resolution = strategy_config.get('base_resolution', settings.get('resolution'))
        #     if signal_resolution and signal_resolution != base_resolution:
        #         logging.info(f"   Resampling {base_resolution} → {signal_resolution} for entry signals...")
        #         df_signal = resample_ohlcv(df, base_resolution, signal_resolution)
        #         df_signal_indicators = temp_trader.generate_signals(df_signal, settings)
        #         signal_cols = [col for col in df_signal_indicators.columns
        #                        if 'signal' in col.lower() or col in ['stop_loss', 'take_profit']]
        #         logging.info(f"   Forward-filling signal columns: {signal_cols}")
        #         df_copy = df.copy()
        #         if 'time' in df_copy.columns:
        #             df_copy = df_copy.set_index('time')
        #         df_signal_copy = df_signal_indicators.copy()
        #         if 'time' in df_signal_copy.columns:
        #             df_signal_copy = df_signal_copy.set_index('time')
        #         for col in signal_cols:
        #             if col in df_signal_copy.columns:
        #                 df_copy[col] = df_signal_copy[col].reindex(df_copy.index, method='ffill')
        #         df_with_signals = df_copy.reset_index()
        #         logging.info(f"   ✅ Signals generated on {signal_resolution}, applied to {base_resolution}")
        #     else:
        #         df_with_signals = temp_trader.generate_signals(df, settings)
        # else:
        #     df_with_signals = temp_trader.generate_signals(df, settings)
        # if df_with_signals is None or (hasattr(df_with_signals, 'empty') and df_with_signals.empty):
        #     raise ValueError("Signal generation returned empty dataframe")
        # logging.info("✅ Signals generated")
        # ====================================================================
        logging.info("🧠 Generating signals...")

        # FIRST: Generate 5m indicators (for TSL / exit logic)
        logging.info("  Generating 5m indicators for exit logic (e.g., Trailingsl)...")
        # We use the base 'df' for this. Must be a copy.
        df_with_5m_indicators = temp_trader.generate_signals(df.copy(), settings)

        # Robustness Check: Ensure the 5m indicator was generated
        if 'Trailingsl' not in df_with_5m_indicators.columns:
            logging.error("  FATAL: 'Trailingsl' not found after generating 5m indicators. Aborting.")
            raise ValueError("Strategy's generate_signals did not produce 'Trailingsl' column on 5m data")
        else:
            logging.info("  ✅ 5m 'Trailingsl' generated.")

        # SECOND: Generate 15m signals (for entry logic)
        if is_multi_resolution:
            from strategy_helpers import resample_ohlcv

            signal_resolution = strategy_config.get('signal_resolution')
            base_resolution = strategy_config.get('base_resolution', settings.get('resolution'))

            if signal_resolution and signal_resolution != base_resolution:
                logging.info(f"  Resampling {base_resolution} -> {signal_resolution} for entry signals...")

                # Resample to signal resolution
                df_signal = resample_ohlcv(df, base_resolution, signal_resolution)

                # Generate signals on resampled timeframe
                df_15m_signals = temp_trader.generate_signals(df_signal.copy(), settings)

                # Identify ONLY the entry signal columns
                signal_cols = [col for col in df_15m_signals.columns
                               if 'signal' in col.lower()] # e.g., long_signal, short_signal

                if not signal_cols:
                     logging.warning("  No 'signal' columns found in 15m data. Entry may not work.")
                else:
                     logging.info(f"  Forward-filling entry signal columns: {signal_cols}")

                # Use the 5m dataframe (which has 'Trailingsl') as the base
                df_with_signals = df_with_5m_indicators.copy()
                if 'time' in df_with_signals.columns:
                    df_with_signals = df_with_signals.set_index('time')

                df_15m_copy = df_15m_signals.copy()
                if 'time' in df_15m_copy.columns:
                    df_15m_copy = df_15m_copy.set_index('time')

                # Forward-fill each 15m entry signal onto the 5m dataframe
                for col in signal_cols:
                    if col in df_15m_copy.columns:
                        df_with_signals[col] = df_15m_copy[col].reindex(df_with_signals.index, method='ffill')
                    else:
                        # Ensure column exists even if empty (e.g., 'short_signal' not present)
                        if col not in df_with_signals.columns:
                            df_with_signals[col] = False

                df_with_signals = df_with_signals.reset_index()

                logging.info(f"  ✅ 15m entry signals merged onto 5m indicator data.")
            else:
                # Signal resolution same as base
                df_with_signals = df_with_5m_indicators
        else:
            # Single resolution path
            df_with_signals = df_with_5m_indicators

        if df_with_signals is None or (hasattr(df_with_signals, 'empty') and df_with_signals.empty):
            raise ValueError("Signal generation returned empty dataframe")

        logging.info("✅ All signals generated and merged")


        # ====================================================================
        # STEP 4: Execute strategy for EACH subscriber with their credentials
        # ====================================================================
        logging.info(f"\n{'='*50}")
        logging.info(f"Cycle Start - In Position: Checking for {len(subscribers)} subscribers")
        logging.info(f"{'='*50}")

        subscribers_processed = 0
        trades_attempted = 0
        errors = {}

        for idx, subscriber in enumerate(subscribers, 1):
            user_id = subscriber.get('user_id')

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
                # (their __init__ sets up self.client with their credentials and loads state)
                subscriber_trader = LiveTrader(settings=subscriber_settings)

                # Log user position status
                logging.info(f"\n   [{idx}/{len(subscribers)}] Processing user {user_id} - In Position: {subscriber_trader.in_position}")

                # ✅ Position-aware execution: Call the appropriate method based on state
                if subscriber_trader.in_position:
                    # ✅ SYNC CHECK: Verify position still exists on exchange before managing it
                    try:
                        positions = subscriber_trader.client.list_positions(
                            margin_currency_short_name=[subscriber_settings['margin_currency']]
                        )
                        active_pos = next(
                            (p for p in positions if p['pair'] == subscriber_settings['pair'] and p['active_pos'] != 0.0),
                            None
                        )

                        if not active_pos:
                            logging.info(f"   Position closed manually or externally. Resetting state.")
                            subscriber_trader._reset_state()
                            # Skip position management since there's no position
                            subscribers_processed += 1
                            logging.info(f"   ✅ User {user_id} processed successfully (state reset)")
                            continue
                    except Exception as e:
                        logging.error(f"   Error checking position on exchange: {e}")
                        # Continue with position management if API call fails
                        pass

                    # User has an open position - manage it (check TP/SL, trailing stop, etc.)
                    if hasattr(subscriber_trader, 'check_and_manage_position'):
                        subscriber_trader.check_and_manage_position(df_with_signals)
                    else:
                        logging.warning(f"   Strategy missing check_and_manage_position method, skipping position management")
                else:
                    # User not in position - check for new entry signals
                    # Get capital for position sizing
                    capital = subscriber.get('capital', None)

                    # Check if strategy accepts user_input_balance parameter (backward compatibility)
                    sig = inspect.signature(subscriber_trader.check_for_new_signal)
                    accepts_capital_param = 'user_input_balance' in sig.parameters

                    # Execute their check_for_new_signal method
                    if accepts_capital_param and capital is not None:
                        # New strategy format - pass capital as parameter
                        logging.info(f"   Calling check_for_new_signal with user_input_balance={capital}")
                        subscriber_trader.check_for_new_signal(df_with_signals, user_input_balance=capital)
                    else:
                        # Old strategy format - backward compatible
                        if not accepts_capital_param:
                            logging.info(f"   Using backward compatible call (strategy doesn't accept user_input_balance)")
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
        resolution_minutes = int(settings.get('resolution', 5))
        logging.info(f"\n{'='*50}")
        logging.info(f"🏁 Multi-Tenant Execution Complete")
        logging.info(f"   Subscribers Processed: {subscribers_processed}/{len(subscribers)}")
        logging.info(f"   Trades Attempted: {trades_attempted}")
        logging.info(f"   Errors: {len(errors)}")
        logging.info(f"Cycle complete. Next execution in ~{resolution_minutes} minutes...")
        logging.info(f"{'='*50}")

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
