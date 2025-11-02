#!/usr/bin/env python3
"""
LiveTrader Executor - Backend subprocess for executing LiveTrader-format strategies

This executor runs uploaded LiveTrader strategies in multi-tenant mode with parallel processing.

Input (via stdin): JSON with strategy_code, settings, subscribers list
Output (via stdout): JSON with success status, logs

Usage:
    echo '{"settings": {...}, "subscribers": [...], "strategy_code": "..."}' | python live_trader_executor.py
"""

import sys
import json
import logging
import traceback
import inspect
from datetime import datetime
from typing import Dict, Any, List
from io import StringIO
from concurrent.futures import ThreadPoolExecutor, as_completed


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


def process_single_subscriber(
    subscriber: Dict[str, Any],
    settings: Dict[str, Any],
    LiveTrader: type,
    df_with_signals: Any,
    idx: int,
    total: int
) -> Dict[str, Any]:
    """
    Process a single subscriber in parallel.

    Returns:
        {
            'user_id': str,
            'success': bool,
            'error': str (if failed)
        }
    """
    user_id = subscriber.get('user_id')

    try:
        logging.info(f"\n   [{idx}/{total}] Processing user {user_id}...")

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
        subscriber_trader = LiveTrader(settings=subscriber_settings)

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

        logging.info(f"   ✅ User {user_id} processed successfully")

        return {
            'user_id': user_id,
            'success': True
        }

    except Exception as e:
        error_msg = str(e)
        logging.error(f"   ❌ User {user_id} failed: {error_msg}")
        logging.error(traceback.format_exc())

        return {
            'user_id': user_id,
            'success': False,
            'error': error_msg
        }


def execute_livetrader_strategy(input_data: Dict[str, Any], log_capture: LogCapture) -> Dict[str, Any]:
    """
    Execute LiveTrader strategy with subscribers list using multi-tenant approach.

    Multi-Tenant Approach:
        1. Execute strategy code to define classes/functions
        2. Fetch market data ONCE (shared across all subscribers)
        3. Generate signals ONCE (same for all subscribers)
        4. Execute strategy for EACH subscriber with their credentials

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
            'subscribers_processed': int,
            'trades_attempted': int,
            'errors': dict (per-subscriber errors)
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
        # STEP 1: Execute strategy code to define classes/functions
        # ====================================================================
        logging.info("📦 Loading strategy code...")

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
        # STEP 4: Execute strategy for EACH subscriber with their credentials (PARALLEL)
        # ====================================================================
        max_workers = input_data.get('max_workers', 10)  # Configurable, default 10
        logging.info(f"💼 Processing {len(subscribers)} subscribers in parallel (max_workers={max_workers})...")

        subscribers_processed = 0
        trades_attempted = 0
        errors = {}

        # Process subscribers in parallel using ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all subscriber processing tasks
            future_to_subscriber = {
                executor.submit(
                    process_single_subscriber,
                    subscriber,
                    settings,
                    LiveTrader,
                    df_with_signals,
                    idx,
                    len(subscribers)
                ): subscriber
                for idx, subscriber in enumerate(subscribers, 1)
            }

            # Collect results as they complete
            for future in as_completed(future_to_subscriber):
                subscriber = future_to_subscriber[future]
                try:
                    result = future.result()

                    if result['success']:
                        subscribers_processed += 1
                        trades_attempted += 1
                    else:
                        errors[result['user_id']] = result.get('error', 'Unknown error')

                except Exception as e:
                    # This catches errors in the future itself (unlikely)
                    user_id = subscriber.get('user_id', 'unknown')
                    error_msg = str(e)
                    errors[user_id] = error_msg
                    logging.error(f"   ❌ Future exception for user {user_id}: {error_msg}")
                    logging.error(traceback.format_exc())

        # ====================================================================
        # STEP 5: Return results
        # ====================================================================
        logging.info(f"\n🏁 Multi-Tenant Execution Complete")
        logging.info(f"   Subscribers Processed: {subscribers_processed}/{len(subscribers)}")
        logging.info(f"   Trades Attempted: {trades_attempted}")
        logging.info(f"   Errors: {len(errors)}")

        return {
            'success': True,
            'message': 'Execution complete',
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

