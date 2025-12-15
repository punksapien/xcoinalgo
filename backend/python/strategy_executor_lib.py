import sys
import json
import logging
import traceback
import csv
import os
import inspect
import threading
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List
from io import StringIO

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('StrategyExecutorLib')

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
        # We don't want to mess with the root logger in the worker process
        # So we create a specific logger for capture
        pass

    def append(self, record):
        self.logs.append({
            'timestamp': datetime.fromtimestamp(record.created).isoformat(),
            'level': record.levelname,
            'message': record.getMessage(),
            'function': record.funcName,
            'line': record.lineno
        })

def _convert_settings_types(settings: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert string values from Redis to proper types automatically.
    """
    converted = {}
    # Fields that should ALWAYS remain as strings
    keep_as_string = {
        'resolution', 'pair', 'name', 'author', 'tags',
        'margin_currency', 'user_id', 'api_key', 'api_secret'
    }

    for key, value in settings.items():
        if isinstance(value, str):
            if key in keep_as_string:
                converted[key] = value
            else:
                try:
                    if '.' not in value and 'e' not in value.lower() and 'E' not in value:
                        converted[key] = int(value)
                    else:
                        converted[key] = float(value)
                except (ValueError, AttributeError):
                    converted[key] = value
        else:
            converted[key] = value
    return converted

class StrategyExecutor:
    def __init__(self):
        pass

    def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute quant team's strategy for multiple subscribers.
        """
        log_capture = [] # Simple list for now

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

            logger.info(f"🚀 Multi-Tenant Execution Started for {settings.get('pair')}")

            # ====================================================================
            # STEP 1: Execute quant's strategy code to define classes/functions
            # ====================================================================

            # Setup execution scope
            exec_scope = {
                '__builtins__': __builtins__,
                'logging': logging, # Use standard logging
                'sys': sys,
                'CsvHandler': CsvHandler,
            }

            # Import common dependencies
            try:
                import pandas as pd
                import numpy as np
                exec_scope['pd'] = pd
                exec_scope['np'] = np
                exec_scope['pandas'] = pd
                exec_scope['numpy'] = np
            except ImportError as e:
                logger.warning(f"pandas/numpy not available: {e}")

            try:
                import pandas_ta as ta
                exec_scope['ta'] = ta
                exec_scope['pandas_ta'] = ta
            except ImportError:
                logger.warning("pandas_ta not available")

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

            # Execute the strategy code
            exec(strategy_code, exec_scope)

            if 'LiveTrader' not in exec_scope:
                raise ValueError("Strategy code must define 'LiveTrader' class")

            LiveTrader = exec_scope['LiveTrader']

            # ====================================================================
            # TRADE INTERCEPTION
            # ====================================================================
            if 'CoinDCXClient' in exec_scope:
                CoinDCXClient = exec_scope['CoinDCXClient']
                original_create_order = CoinDCXClient.create_order

                _trade_context = threading.local()

                def set_trade_context(context):
                    _trade_context.data = context

                def get_trade_context():
                    return getattr(_trade_context, 'data', {})

                def report_trade_to_backend(trade_data):
                    # In worker mode, we might want to push to Redis instead of HTTP
                    # For now, keep HTTP to minimize changes
                    try:
                        import requests
                        backend_url = os.environ.get('BACKEND_URL', 'http://localhost:3001')
                        internal_key = os.environ.get('INTERNAL_API_KEY', 'xcoinalgo-internal-key-2024')

                        response = requests.post(
                            f"{backend_url}/api/strategies/trades",
                            json=trade_data,
                            headers={
                                'Content-Type': 'application/json',
                                'X-Internal-Key': internal_key
                            },
                            timeout=5
                        )
                    except Exception as e:
                        logger.warning(f"⚠️ Trade reporting error (non-fatal): {e}")

                def intercepted_create_order(self, pair, side, order_type, total_quantity, leverage, **kwargs):
                    response = original_create_order(self, pair, side, order_type, total_quantity, leverage, **kwargs)

                    try:
                        context = get_trade_context()
                        client_order_id = kwargs.get('client_order_id', '')
                        is_exit = '_ex' in client_order_id if client_order_id else False

                        trade_data = {
                            'subscriptionId': context.get('subscription_id'),
                            'strategyId': context.get('strategy_id'),
                            'userId': context.get('user_id'),
                            'symbol': pair,
                            'side': side,
                            'quantity': total_quantity,
                            'leverage': leverage,
                            'orderType': order_type,
                            'stopLoss': kwargs.get('stop_loss_price'),
                            'takeProfit': kwargs.get('take_profit_price'),
                            'clientOrderId': client_order_id,
                            'marginCurrency': kwargs.get('margin_currency_short_name'),
                            'metadata': {
                                'raw_response': response if isinstance(response, dict) else str(response),
                                'timestamp': datetime.now().isoformat()
                            }
                        }

                        if is_exit:
                            trade_data['exitReason'] = context.get('exit_reason', 'signal')

                        # Report trade asynchronously
                        report_thread = threading.Thread(target=report_trade_to_backend, args=(trade_data,))
                        report_thread.daemon = True
                        report_thread.start()

                    except Exception as e:
                        logger.warning(f"⚠️ Trade interception error: {e}")

                    return response

                CoinDCXClient.create_order = intercepted_create_order
                exec_scope['_set_trade_context'] = set_trade_context

            # ====================================================================
            # STEP 2: Fetch market data ONCE
            # ====================================================================
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

            # ====================================================================
            # STEP 3: Generate signals
            # ====================================================================
            # Generate 5m indicators
            df_with_5m_indicators = temp_trader.generate_signals(df.copy(), settings)

            # Simple single resolution path for now to match original logic
            df_with_signals = df_with_5m_indicators

            if df_with_signals is None or (hasattr(df_with_signals, 'empty') and df_with_signals.empty):
                raise ValueError("Signal generation returned empty dataframe")

            # ====================================================================
            # STEP 4: Execute strategy for EACH subscriber
            # ====================================================================
            subscribers_processed = 0
            trades_attempted = 0
            errors = {}

            for idx, subscriber in enumerate(subscribers, 1):
                user_id = subscriber.get('user_id')
                try:
                    if '_set_trade_context' in exec_scope:
                        exec_scope['_set_trade_context']({
                            'user_id': user_id,
                            'subscription_id': subscriber.get('subscription_id'),
                            'strategy_id': settings.get('strategy_id'),
                            'pair': settings.get('pair'),
                            'margin_currency': settings.get('margin_currency')
                        })

                    subscriber_settings = {
                        **settings,
                        'user_id': subscriber['user_id'],
                        'api_key': subscriber['api_key'],
                        'api_secret': subscriber['api_secret'],
                        'leverage': subscriber.get('leverage', 10),
                        'risk_per_trade': subscriber.get('risk_per_trade', 0.02),
                        'initial_capital': subscriber.get('capital', 10000),
                    }

                    subscriber_trader = LiveTrader(settings=subscriber_settings)

                    if subscriber_trader.in_position:
                        # Manage position
                        if hasattr(subscriber_trader, 'check_and_manage_position'):
                            subscriber_trader.check_and_manage_position(df_with_signals)
                    else:
                        # Check for new signal
                        subscriber_trader.check_for_new_signal(df_with_signals)

                    subscribers_processed += 1
                    trades_attempted += 1

                except Exception as e:
                    error_msg = str(e)
                    errors[user_id] = error_msg
                    logger.error(f"User {user_id} failed: {error_msg}")

            return {
                'success': True,
                'subscribers_processed': subscribers_processed,
                'trades_attempted': trades_attempted,
                'errors': errors if errors else None
            }

        except Exception as e:
            logger.error(f"Execution failed: {e}")
            logger.error(traceback.format_exc())
            return {
                'success': False,
                'error': str(e),
                'traceback': traceback.format_exc()
            }
