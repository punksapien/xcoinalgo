#!/usr/bin/env python3
"""
Batch Backtest Runner - Optimized for Performance

Processes ALL candles in a single Python execution instead of spawning
separate processes for each candle.

Input: JSON via stdin
{
  "strategy_code": "...",  // Full Python strategy code
  "historical_data": [],   // ALL candles for backtest
  "config": {},            // Strategy parameters
  "initial_capital": 10000,
  "risk_per_trade": 0.01,
  "leverage": 10,
  "commission": 0.001
}

Output: JSON via stdout
{
  "success": true,
  "trades": [],
  "metrics": {}
}
"""

import sys
import json
import traceback
from typing import Dict, Any, List, Optional
from datetime import datetime
import pandas as pd
import numpy as np
import os
from pathlib import Path
from loguru import logger


def configure_logging():
    """Configure loguru to log to file with rotation"""
    # Get logs directory (relative to this file)
    script_dir = Path(__file__).parent
    logs_dir = script_dir.parent / 'logs'

    # Create logs directory if it doesn't exist
    logs_dir.mkdir(exist_ok=True)

    # Remove default handler
    logger.remove()

    # Add file handler with rotation (10 MB max, keep 5 files)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    log_file = logs_dir / f'backtest_{timestamp}.log'
    signal_log_file = logs_dir / f'signals_{timestamp}.log'

    # Main backtest log (everything)
    logger.add(
        log_file,
        rotation="10 MB",
        retention=5,
        level="DEBUG",
        format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {message}",
        enqueue=True  # Thread-safe
    )

    # Signals-only log (only INFO level with signals)
    logger.add(
        signal_log_file,
        rotation="10 MB",
        retention=5,
        level="INFO",
        format="{time:YYYY-MM-DD HH:mm:ss} | {message}",
        filter=lambda record: "Signal Generated" in record["message"] or "OPENED" in record["message"] or "CLOSED" in record["message"],
        enqueue=True
    )

    # Also add stderr for immediate feedback
    logger.add(
        sys.stderr,
        level="INFO",
        format="{time:HH:mm:ss} | {level: <8} | {message}"
    )

    logger.info(f"Logging configured - Log file: {log_file}")
    logger.info(f"Signals log file: {signal_log_file}")
    return str(log_file)


class BatchBacktestRunner:
    """Runs backtest on ALL candles in single execution"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.initial_capital = config.get('initial_capital', 10000.0)
        self.risk_per_trade = config.get('risk_per_trade', 0.01)
        self.leverage = config.get('leverage', 10)
        self.commission = config.get('commission', 0.001)

        self.capital = self.initial_capital
        self.max_equity = self.capital
        self.trades: List[Dict] = []
        self.equity_curve: List[Dict] = []
        self.current_position: Optional[Dict] = None

        # Strategy state (for stateful strategies)
        self.strategy_state = {}

    def run_backtest(
        self,
        strategy_code: str,
        historical_data: List[Dict],
        strategy_config: Dict
    ) -> Dict[str, Any]:
        """
        Run backtest on all candles in single pass

        Args:
            strategy_code: Full Python strategy code
            historical_data: ALL candles for backtest
            strategy_config: Strategy parameters
        """
        try:
            logger.info("="*80)
            logger.info("BACKTEST STARTED")
            logger.info(f"Symbol: {strategy_config.get('symbol', 'N/A')}")
            logger.info(f"Resolution: {strategy_config.get('resolution', 'N/A')}")
            logger.info(f"Historical data points: {len(historical_data)}")
            logger.info(f"Initial capital: ${self.initial_capital:,.2f}")
            logger.info(f"Risk per trade: {self.risk_per_trade*100}%")
            logger.info(f"Leverage: {self.leverage}x")
            logger.info(f"Commission: {self.commission*100}%")
            logger.info("="*80)

            # Load strategy code and check for custom backtest method
            logger.debug("Loading strategy code...")
            exec_scope = self._load_strategy_scope(strategy_code)

            if not exec_scope:
                logger.error("Failed to load strategy code")
                return self._error_result("Failed to load strategy code")

            # Check if strategy has custom backtest() method
            logger.debug("Checking for custom backtest implementation...")
            custom_backtest = self._get_custom_backtest(exec_scope)

            if custom_backtest:
                logger.info("✓ Custom backtest() method found - using custom implementation")
                # Use custom backtest implementation (pass exec_scope for STRATEGY_CONFIG access)
                return self._run_custom_backtest(custom_backtest, historical_data, strategy_config, exec_scope)

            # Fall back to default backtest using generate_signal
            logger.info("Using default backtest with generate_signal()")
            generate_signal = exec_scope.get('generate_signal') or exec_scope.get('generate_signals')

            if not generate_signal:
                logger.error("Strategy must define generate_signal() function")
                return self._error_result("Failed to load strategy generate_signal function")

            # Process candles with sliding window
            lookback = strategy_config.get('lookback_period', 200)
            logger.info(f"Processing {len(historical_data)} candles with {lookback} lookback period...")

            for i in range(max(lookback, 50), len(historical_data)):
                # Get historical window for strategy
                candle_window = historical_data[max(0, i - lookback):i + 1]
                current_candle = historical_data[i]

                # Add strategy state to settings
                settings = {
                    **strategy_config,
                    'previous_state': self.strategy_state.copy()
                }

                # Generate signal
                try:
                    signal = generate_signal(candle_window, settings)
                except Exception as e:
                    # Strategy error - skip this candle
                    logger.debug(f"Strategy error at candle {i}: {str(e)}")
                    continue

                if not signal:
                    continue

                # Log the signal details
                signal_type = signal.get('signal', 'UNKNOWN')
                if signal_type != 'HOLD':
                    logger.info(f"🎯 Signal Generated: {signal_type} | Price: ${signal.get('price', 0):,.2f} | SL: {signal.get('stopLoss', 'N/A')} | TP: {signal.get('takeProfit', 'N/A')}")
                    if 'metadata' in signal:
                        logger.debug(f"Signal metadata: {signal['metadata']}")

                # Update strategy state from metadata
                if 'metadata' in signal:
                    self.strategy_state = signal['metadata']

                # Process signal
                self._process_signal(signal, current_candle)

                # Update equity curve
                self._update_equity_curve(current_candle)

            # Close any open position at end
            if self.current_position:
                logger.info("Closing open position at end of backtest...")
                last_candle = historical_data[-1]
                self._close_position(last_candle, 'BACKTEST_END')

            # Calculate metrics
            logger.info("Calculating performance metrics...")
            metrics = self._calculate_metrics()

            logger.info("="*80)
            logger.info("BACKTEST COMPLETED SUCCESSFULLY")
            logger.info(f"Total Trades: {metrics['totalTrades']}")
            logger.info(f"Win Rate: {metrics['winRate']:.2f}%")
            logger.info(f"Total P&L: ${metrics['totalPnl']:,.2f} ({metrics['totalPnlPct']:.2f}%)")
            logger.info(f"Max Drawdown: ${metrics['maxDrawdown']:,.2f} ({metrics['maxDrawdownPct']:.2f}%)")
            logger.info(f"Sharpe Ratio: {metrics['sharpeRatio']:.2f}")
            logger.info(f"Profit Factor: {metrics['profitFactor']:.2f}")
            logger.info(f"Final Capital: ${metrics['finalCapital']:,.2f}")
            logger.info("="*80)

            return {
                'success': True,
                'trades': self.trades,
                'metrics': metrics,
                'equity_curve': self.equity_curve
            }

        except Exception as e:
            logger.error(f"Backtest failed with error: {str(e)}")
            logger.error(traceback.format_exc())
            return self._error_result(f"Backtest failed: {str(e)}\n{traceback.format_exc()}")

    def _load_strategy_scope(self, strategy_code: str):
        """Execute strategy code and return execution scope"""
        try:
            # Create execution scope with common imports
            import pandas as pd
            import numpy as np

            # Try to import optional dependencies
            try:
                import talib
            except ImportError:
                talib = None

            exec_scope = {
                '__builtins__': __builtins__,
                'pd': pd,
                'pandas': pd,
                'np': np,
                'numpy': np,
                'talib': talib,
                'datetime': datetime,
                'Dict': Dict,
                'Any': Any,
                'List': List,
                'Optional': Optional,
            }

            # Execute strategy code
            exec(strategy_code, exec_scope)

            return exec_scope

        except Exception as e:
            print(f"Error loading strategy: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            return None

    def _get_custom_backtest(self, exec_scope: Dict):
        """Check if strategy has custom backtest() method or Backtester class"""
        try:
            # Look for Backtester class with execute_trades() method (eshan/quant team's pattern)
            if 'Backtester' in exec_scope:
                backtester_class = exec_scope['Backtester']

                # Check for execute_trades() method first (primary pattern)
                if hasattr(backtester_class, 'execute_trades') and callable(getattr(backtester_class, 'execute_trades')):
                    logger.info("Found Backtester class with execute_trades() method")
                    # Return a marker to use execute_trades pattern
                    return ('execute_trades', backtester_class)

                # Check for run() method (legacy pattern)
                if hasattr(backtester_class, 'run') and callable(getattr(backtester_class, 'run')):
                    logger.info("Found Backtester class with run() method")
                    # Return a wrapper that calls Backtester.run()
                    def wrapper(df, config):
                        return backtester_class.run(df, config)
                    return wrapper

            # Look for strategy instance with backtest method
            if 'strategy' in exec_scope:
                strategy_instance = exec_scope['strategy']
                if hasattr(strategy_instance, 'backtest') and callable(getattr(strategy_instance, 'backtest')):
                    return strategy_instance.backtest

            # Look for standalone backtest function
            if 'backtest' in exec_scope and callable(exec_scope['backtest']):
                return exec_scope['backtest']

            return None
        except Exception as e:
            print(f"Error checking for custom backtest: {e}", file=sys.stderr)
            return None

    def _run_custom_backtest(self, custom_backtest, historical_data: List[Dict], strategy_config: Dict, exec_scope: Dict = None) -> Dict[str, Any]:
        """Run custom backtest implementation provided by strategy"""
        try:
            # Check if this is the execute_trades pattern (tuple marker)
            if isinstance(custom_backtest, tuple) and custom_backtest[0] == 'execute_trades':
                return self._run_execute_trades_backtest(custom_backtest[1], historical_data, strategy_config, exec_scope)

            logger.info("Executing custom backtest() implementation...")

            # Convert historical data to DataFrame
            df = pd.DataFrame(historical_data)
            logger.debug(f"Converted {len(df)} candles to DataFrame")

            # Prepare config: merge backtest params with strategy params
            config = {
                **strategy_config,  # Include all strategy parameters
                'initial_capital': self.initial_capital,
                'risk_per_trade': self.risk_per_trade,
                'leverage': self.leverage,
                'commission': self.commission
            }

            # Call custom backtest
            logger.debug("Calling custom backtest function...")
            result = custom_backtest(df, config)

            # Validate result format (strict validation)
            validation_errors = self._validate_backtest_result(result)
            if validation_errors:
                error_msg = "Custom backtest result validation failed:\n" + "\n".join(validation_errors)
                return self._error_result(error_msg)

            # Mark as successful
            result['success'] = True
            result['custom_backtest'] = True

            return result

        except NotImplementedError:
            # Custom backtest not implemented, fall back to default
            return None
        except Exception as e:
            return self._error_result(f"Custom backtest failed: {str(e)}\n{traceback.format_exc()}")

    def _run_execute_trades_backtest(self, backtester_class, historical_data: List[Dict], strategy_config: Dict, exec_scope: Dict = None) -> Dict[str, Any]:
        """Run backtest using Backtester.execute_trades() pattern (eshan's strategy pattern)"""
        try:
            logger.info("Executing backtest using Backtester.execute_trades() pattern...")

            # Extract STRATEGY_CONFIG from exec_scope if available
            strategy_config_from_code = exec_scope.get('STRATEGY_CONFIG', {}) if exec_scope else {}

            # Merge configs: STRATEGY_CONFIG takes precedence, then strategy_config, then defaults
            merged_config = {
                **strategy_config,
                **strategy_config_from_code,
            }

            # Log what config we're using
            logger.info(f"Using initial_capital from STRATEGY_CONFIG: {merged_config.get('initial_capital', 'NOT FOUND')}")
            logger.info(f"Using leverage from STRATEGY_CONFIG: {merged_config.get('leverage', 'NOT FOUND')}")

            # Create backtester instance with merged config
            backtester = backtester_class(merged_config)

            # Convert historical data to DataFrame
            df = pd.DataFrame(historical_data)
            logger.debug(f"Converted {len(df)} candles to DataFrame")

            # Get parameters - use STRATEGY_CONFIG values, NO DEFAULTS
            def require_param(key: str, alt_key: str = None):
                """Get required parameter, raise error if missing"""
                if key in merged_config:
                    return merged_config[key]
                if alt_key and alt_key in merged_config:
                    return merged_config[alt_key]
                alt_msg = f" or '{alt_key}'" if alt_key else ""
                raise ValueError(f"Missing required parameter: '{key}'{alt_msg} not found in config. Available keys: {list(merged_config.keys())}")

            initial_capital = require_param('initial_capital', 'capital')
            leverage = require_param('leverage')
            commission_rate = require_param('commission_rate', 'commission')
            gst_rate = merged_config.get('gst_rate', 0)  # GST is optional, default 0
            risk_per_trade = require_param('risk_per_trade')

            # Optional TP/SL parameters
            optional_params = {}
            optional_keys = [
                'sl_rate', 'tp_rate',
                'long_tp1_inp', 'long_tp1_qty', 'long_tp2_inp', 'long_tp2_qty',
                'short_tp1_inp', 'short_tp1_qty', 'short_tp2_inp', 'short_tp2_qty'
            ]
            for key in optional_keys:
                if key in merged_config:
                    optional_params[key] = merged_config[key]

            logger.info(f"Calling execute_trades with initial_capital={initial_capital}, leverage={leverage}")

            # Fetch data using Backtester's method if available, otherwise use provided data
            if hasattr(backtester, 'fetch_coindcx_data') and callable(getattr(backtester, 'fetch_coindcx_data')):
                pair = merged_config.get('pair', strategy_config.get('symbol', 'B-ETH_USDT'))
                resolution = str(merged_config.get('resolution', '5')).rstrip('m')

                # Get date range from STRATEGY_CONFIG, or use defaults (1 year of data)
                start_date = merged_config.get('start_date')
                end_date = merged_config.get('end_date')

                # If no dates specified, default to 1 year of historical data
                if not start_date or not end_date:
                    from datetime import datetime, timedelta
                    end_dt = datetime.now()
                    start_dt = end_dt - timedelta(days=365)
                    start_date = start_dt.strftime('%Y-%m-%d')
                    end_date = end_dt.strftime('%Y-%m-%d')
                    logger.info(f"No date range in config, using default 1 year: {start_date} to {end_date}")

                logger.info(f"Fetching data via Backtester.fetch_coindcx_data: {pair} {resolution}m from {start_date} to {end_date}")
                df = backtester.fetch_coindcx_data(pair, start_date, end_date, resolution)

                if df is None or df.empty:
                    logger.warning("fetch_coindcx_data returned empty, falling back to provided historical data")
                    df = pd.DataFrame(historical_data)

            # Call generate_signals first if the method exists (required before execute_trades)
            if hasattr(backtester, 'generate_signals') and callable(getattr(backtester, 'generate_signals')):
                logger.info("Calling generate_signals() before execute_trades...")
                df = backtester.generate_signals(df, merged_config)
                if df is None or df.empty:
                    return self._error_result("generate_signals returned empty DataFrame")
                logger.info(f"generate_signals() completed. DataFrame has {len(df)} rows")

            # Call execute_trades
            trades_df = backtester.execute_trades(
                df=df,
                initial_capital=initial_capital,
                leverage=leverage,
                commission_rate=commission_rate,
                gst_rate=gst_rate,
                risk_per_trade=risk_per_trade,
                **optional_params
            )

            # Convert trades DataFrame to list of dicts
            if trades_df is None or trades_df.empty:
                logger.warning("No trades generated by execute_trades()")
                trades_list = []
            else:
                trades_list = trades_df.to_dict('records')
                logger.info(f"execute_trades() returned {len(trades_list)} trades")

            # Calculate metrics from trades
            metrics = self._calculate_metrics_from_trades(trades_list, initial_capital)

            # Build equity curve from trades
            equity_curve = self._build_equity_curve_from_trades(trades_list, initial_capital)

            # Convert trade format to match expected schema
            formatted_trades = self._format_trades_for_output(trades_list)

            return {
                'success': True,
                'custom_backtest': True,
                'execute_trades_pattern': True,
                'trades': formatted_trades,
                'metrics': metrics,
                'equity_curve': equity_curve
            }

        except Exception as e:
            logger.error(f"execute_trades backtest failed: {str(e)}")
            logger.error(traceback.format_exc())
            return self._error_result(f"execute_trades backtest failed: {str(e)}\n{traceback.format_exc()}")

    def _calculate_metrics_from_trades(self, trades: List[Dict], initial_capital: float) -> Dict[str, Any]:
        """Calculate metrics from trade list"""
        if not trades:
            return {
                'totalTrades': 0,
                'winningTrades': 0,
                'losingTrades': 0,
                'winRate': 0,
                'totalPnl': 0,
                'totalPnlPct': 0,
                'maxDrawdown': 0,
                'maxDrawdownPct': 0,
                'sharpeRatio': 0,
                'profitFactor': 0,
                'finalCapital': initial_capital
            }

        # Extract PnL values (handle different column names)
        pnl_column = None
        for col in ['pnl', 'PnL', 'net_pnl', 'realized_pnl', 'profit']:
            if trades and col in trades[0]:
                pnl_column = col
                break

        if not pnl_column:
            logger.warning("Could not find PnL column in trades, using 0")
            pnls = [0] * len(trades)
        else:
            pnls = [float(t.get(pnl_column, 0)) for t in trades]

        total_trades = len(trades)
        winning_trades = sum(1 for p in pnls if p > 0)
        losing_trades = sum(1 for p in pnls if p < 0)

        total_pnl = sum(pnls)
        total_pnl_pct = (total_pnl / initial_capital) * 100 if initial_capital > 0 else 0

        total_wins = sum(p for p in pnls if p > 0)
        total_losses = abs(sum(p for p in pnls if p < 0))

        profit_factor = total_wins / total_losses if total_losses > 0 else (float('inf') if total_wins > 0 else 0)

        # Calculate max drawdown
        equity = initial_capital
        peak = initial_capital
        max_drawdown = 0
        max_drawdown_pct = 0

        for pnl in pnls:
            equity += pnl
            if equity > peak:
                peak = equity
            drawdown = peak - equity
            drawdown_pct = (drawdown / peak) * 100 if peak > 0 else 0
            if drawdown > max_drawdown:
                max_drawdown = drawdown
                max_drawdown_pct = drawdown_pct

        # Calculate Sharpe ratio
        if len(pnls) > 1:
            returns = [p / initial_capital for p in pnls]
            avg_return = sum(returns) / len(returns)
            variance = sum((r - avg_return) ** 2 for r in returns) / len(returns)
            std_dev = variance ** 0.5
            sharpe_ratio = (avg_return / std_dev) * (252 ** 0.5) if std_dev > 0 else 0
        else:
            sharpe_ratio = 0

        return {
            'totalTrades': total_trades,
            'winningTrades': winning_trades,
            'losingTrades': losing_trades,
            'winRate': (winning_trades / total_trades * 100) if total_trades > 0 else 0,
            'totalPnl': total_pnl,
            'totalPnlPct': total_pnl_pct,
            'maxDrawdown': max_drawdown,
            'maxDrawdownPct': max_drawdown_pct,
            'sharpeRatio': sharpe_ratio,
            'profitFactor': profit_factor if profit_factor != float('inf') else 999.99,
            'finalCapital': initial_capital + total_pnl
        }

    def _build_equity_curve_from_trades(self, trades: List[Dict], initial_capital: float) -> List[Dict]:
        """Build equity curve from trades"""
        equity_curve = []
        equity = initial_capital

        # Find PnL and time columns
        pnl_column = None
        time_column = None

        for col in ['pnl', 'PnL', 'net_pnl', 'realized_pnl', 'profit']:
            if trades and col in trades[0]:
                pnl_column = col
                break

        for col in ['exit_time', 'close_time', 'timestamp', 'time']:
            if trades and col in trades[0]:
                time_column = col
                break

        for i, trade in enumerate(trades):
            pnl = float(trade.get(pnl_column, 0)) if pnl_column else 0
            equity += pnl

            # Get timestamp
            if time_column and trade.get(time_column):
                timestamp = trade[time_column]
                if isinstance(timestamp, str):
                    try:
                        timestamp = int(pd.Timestamp(timestamp).timestamp() * 1000)
                    except:
                        timestamp = i
            else:
                timestamp = i

            equity_curve.append({
                'timestamp': timestamp,
                'equity': equity
            })

        return equity_curve

    def _convert_timestamp(self, ts) -> int:
        """Convert pandas Timestamp to milliseconds since epoch"""
        if isinstance(ts, pd.Timestamp):
            return int(ts.timestamp() * 1000)
        elif isinstance(ts, str):
            try:
                return int(pd.Timestamp(ts).timestamp() * 1000)
            except:
                return 0
        elif isinstance(ts, (int, float)):
            return int(ts)
        return 0

    def _format_trades_for_output(self, trades: List[Dict]) -> List[Dict]:
        """Format trades to match expected output schema"""
        formatted = []

        for trade in trades:
            # Map common field names
            formatted_trade = {
                'entry_time': self._convert_timestamp(trade.get('entry_time', trade.get('open_time', 0))),
                'exit_time': self._convert_timestamp(trade.get('exit_time', trade.get('close_time', 0))),
                'side': trade.get('side', trade.get('direction', 'UNKNOWN')).upper(),
                'entry_price': float(trade.get('entry_price', trade.get('open_price', 0))),
                'exit_price': float(trade.get('exit_price', trade.get('close_price', 0))),
                'quantity': float(trade.get('quantity', trade.get('size', trade.get('qty', 0)))),
                'pnl': float(trade.get('pnl', trade.get('PnL', trade.get('net_pnl', 0)))),
                'pnl_pct': float(trade.get('pnl_pct', trade.get('pnl_percent', 0))),
                'reason': trade.get('reason', trade.get('exit_reason', 'signal'))
            }

            # Normalize reason to expected values
            reason = formatted_trade['reason'].lower()
            if 'stop' in reason or 'sl' in reason:
                formatted_trade['reason'] = 'stop_loss'
            elif 'take' in reason or 'tp' in reason or 'profit' in reason:
                formatted_trade['reason'] = 'take_profit'
            elif 'signal' in reason:
                formatted_trade['reason'] = 'signal'
            else:
                formatted_trade['reason'] = 'manual'

            formatted.append(formatted_trade)

        return formatted

    def _validate_backtest_result(self, result: Dict[str, Any]) -> List[str]:
        """Validate backtest result matches frontend schema"""
        errors = []

        # Check top-level structure
        if not isinstance(result, dict):
            return ["Result must be a dictionary"]

        # Required fields
        if 'trades' not in result:
            errors.append("Missing required field 'trades'")
        elif not isinstance(result['trades'], list):
            errors.append(f"'trades' must be a list, got {type(result['trades'])}")
        else:
            # Validate each trade
            for i, trade in enumerate(result['trades']):
                errors.extend(self._validate_trade(trade, i))

        if 'metrics' not in result:
            errors.append("Missing required field 'metrics'")
        elif not isinstance(result['metrics'], dict):
            errors.append(f"'metrics' must be a dict, got {type(result['metrics'])}")
        else:
            errors.extend(self._validate_metrics(result['metrics']))

        if 'equity_curve' not in result:
            errors.append("Missing required field 'equity_curve'")
        elif not isinstance(result['equity_curve'], list):
            errors.append(f"'equity_curve' must be a list, got {type(result['equity_curve'])}")
        else:
            errors.extend(self._validate_equity_curve(result['equity_curve']))

        return errors

    def _validate_trade(self, trade: Dict, index: int) -> List[str]:
        """Validate single trade"""
        errors = []
        required_fields = {
            'entry_time': int,
            'exit_time': int,
            'side': str,
            'entry_price': (int, float),
            'exit_price': (int, float),
            'quantity': (int, float),
            'pnl': (int, float),
            'pnl_pct': (int, float),
            'reason': str
        }

        for field, expected_type in required_fields.items():
            if field not in trade:
                errors.append(f"Trade {index}: Missing '{field}'")
            elif not isinstance(trade[field], expected_type):
                errors.append(f"Trade {index}: '{field}' must be {expected_type}")

        # Validate enums
        if 'side' in trade and trade['side'] not in ['LONG', 'SHORT']:
            errors.append(f"Trade {index}: 'side' must be 'LONG' or 'SHORT'")

        if 'reason' in trade and trade['reason'] not in ['stop_loss', 'take_profit', 'signal', 'manual']:
            errors.append(f"Trade {index}: 'reason' must be one of ['stop_loss', 'take_profit', 'signal', 'manual']")

        # Validate logic
        if 'entry_time' in trade and 'exit_time' in trade and trade['exit_time'] <= trade['entry_time']:
            errors.append(f"Trade {index}: exit_time must be after entry_time")

        return errors

    def _validate_metrics(self, metrics: Dict) -> List[str]:
        """Validate metrics"""
        errors = []
        required_fields = {
            'total_trades': int,
            'winning_trades': int,
            'losing_trades': int,
            'win_rate': (int, float),
            'total_pnl': (int, float),
            'total_pnl_pct': (int, float),
            'max_drawdown': (int, float),
            'max_drawdown_pct': (int, float),
            'sharpe_ratio': (int, float),
            'profit_factor': (int, float)
        }

        for field, expected_type in required_fields.items():
            if field not in metrics:
                errors.append(f"Metrics: Missing '{field}'")
            elif not isinstance(metrics[field], expected_type):
                errors.append(f"Metrics: '{field}' must be {expected_type}")

        # Validate ranges
        if 'win_rate' in metrics and not (0 <= metrics['win_rate'] <= 100):
            errors.append(f"Metrics: win_rate must be 0-100, got {metrics['win_rate']}")

        # Validate consistency
        if all(k in metrics for k in ['total_trades', 'winning_trades', 'losing_trades']):
            if metrics['total_trades'] != metrics['winning_trades'] + metrics['losing_trades']:
                errors.append("Metrics: total_trades must equal winning_trades + losing_trades")

        return errors

    def _validate_equity_curve(self, equity_curve: List) -> List[str]:
        """Validate equity curve"""
        errors = []

        for i, point in enumerate(equity_curve):
            if not isinstance(point, dict):
                errors.append(f"Equity point {i}: Must be a dict")
                continue

            if 'timestamp' not in point:
                errors.append(f"Equity point {i}: Missing 'timestamp'")
            elif not isinstance(point['timestamp'], int):
                errors.append(f"Equity point {i}: 'timestamp' must be int")

            if 'equity' not in point:
                errors.append(f"Equity point {i}: Missing 'equity'")
            elif not isinstance(point['equity'], (int, float)):
                errors.append(f"Equity point {i}: 'equity' must be numeric")

        return errors

    def _process_signal(self, signal: Dict, candle: Dict):
        """Process trading signal"""
        signal_type = signal.get('signal', 'HOLD')
        current_price = float(candle['close'])

        if signal_type == 'HOLD':
            return

        # Check if we need to close position
        if self.current_position:
            if signal_type in ['EXIT_LONG', 'EXIT_SHORT']:
                self._close_position(candle, 'SIGNAL')
                return

            # Check stop loss / take profit
            if self._check_exit_conditions(candle):
                return

        # Open new position
        if not self.current_position and signal_type in ['LONG', 'SHORT']:
            self._open_position(signal, candle)

    def _open_position(self, signal: Dict, candle: Dict):
        """Open a new trading position"""
        side = signal['signal']
        entry_price = float(candle['close'])
        stop_loss = signal.get('stopLoss')
        take_profit = signal.get('takeProfit')

        # Calculate position size
        quantity = self._calculate_position_size(entry_price, stop_loss)

        if quantity <= 0:
            logger.warning(f"Invalid position size (quantity={quantity}), skipping trade")
            return

        self.current_position = {
            'side': side,
            'entry_price': entry_price,
            'entry_time': candle['time'],
            'quantity': quantity,
            'stop_loss': stop_loss,
            'take_profit': take_profit
        }

        logger.info(f"📈 OPENED {side} position @ ${entry_price:,.2f} | Qty: {quantity:.4f} | SL: {stop_loss} | TP: {take_profit}")

    def _close_position(self, candle: Dict, reason: str):
        """Close current position"""
        if not self.current_position:
            return

        exit_price = float(candle['close'])
        side = self.current_position['side']
        entry_price = self.current_position['entry_price']
        quantity = self.current_position['quantity']

        # Calculate P&L
        if side == 'LONG':
            pnl = (exit_price - entry_price) * quantity
        else:  # SHORT
            pnl = (entry_price - exit_price) * quantity

        # Calculate commission
        entry_commission = entry_price * quantity * self.commission
        exit_commission = exit_price * quantity * self.commission
        total_commission = entry_commission + exit_commission

        # Net P&L
        net_pnl = pnl - total_commission
        self.capital += net_pnl

        # Record trade
        pnl_pct = (net_pnl / (entry_price * quantity)) * 100

        self.trades.append({
            'side': side,
            'entry_time': self.current_position['entry_time'],
            'exit_time': candle['time'],
            'entry_price': entry_price,
            'exit_price': exit_price,
            'quantity': quantity,
            'pnl': net_pnl,
            'pnl_pct': pnl_pct,
            'commission': total_commission,
            'reason': reason
        })

        profit_emoji = "✅" if net_pnl > 0 else "❌"
        logger.info(f"{profit_emoji} CLOSED {side} @ ${exit_price:,.2f} | P&L: ${net_pnl:,.2f} ({pnl_pct:+.2f}%) | Reason: {reason}")

        self.current_position = None

    def _check_exit_conditions(self, candle: Dict) -> bool:
        """Check if stop loss or take profit hit"""
        if not self.current_position:
            return False

        side = self.current_position['side']
        stop_loss = self.current_position.get('stop_loss')
        take_profit = self.current_position.get('take_profit')

        candle_high = float(candle['high'])
        candle_low = float(candle['low'])

        if side == 'LONG':
            # Check stop loss
            if stop_loss and candle_low <= stop_loss:
                self._close_position(candle, 'STOP_LOSS')
                return True
            # Check take profit
            if take_profit and candle_high >= take_profit:
                self._close_position(candle, 'TAKE_PROFIT')
                return True

        elif side == 'SHORT':
            # Check stop loss
            if stop_loss and candle_high >= stop_loss:
                self._close_position(candle, 'STOP_LOSS')
                return True
            # Check take profit
            if take_profit and candle_low <= take_profit:
                self._close_position(candle, 'TAKE_PROFIT')
                return True

        return False

    def _calculate_position_size(self, entry_price: float, stop_loss: Optional[float]) -> float:
        """Calculate position size based on risk management"""
        MIN_QUANTITY = 0.007  # Minimum quantity for ETH futures

        if not stop_loss:
            # No stop loss - use fixed risk amount
            risk_amount = self.capital * self.risk_per_trade
            quantity = (risk_amount * self.leverage) / entry_price
        else:
            risk_amount = self.capital * self.risk_per_trade
            stop_distance = abs(entry_price - stop_loss)

            if stop_distance == 0:
                return 0

            quantity = (risk_amount / stop_distance) * self.leverage

        # Enforce minimum quantity
        if 0 < quantity < MIN_QUANTITY:
            logger.warning(f"Calculated quantity {quantity:.4f} below minimum {MIN_QUANTITY}, adjusting to minimum")
            return MIN_QUANTITY

        return quantity

    def _update_equity_curve(self, candle: Dict):
        """Update equity curve with current equity"""
        current_equity = self.capital

        # Add unrealized P&L if in position
        if self.current_position:
            current_price = float(candle['close'])
            side = self.current_position['side']
            entry_price = self.current_position['entry_price']
            quantity = self.current_position['quantity']

            if side == 'LONG':
                unrealized_pnl = (current_price - entry_price) * quantity
            else:
                unrealized_pnl = (entry_price - current_price) * quantity

            current_equity += unrealized_pnl

        self.max_equity = max(self.max_equity, current_equity)
        drawdown = self.max_equity - current_equity

        self.equity_curve.append({
            'time': candle['time'],
            'equity': current_equity,
            'drawdown': drawdown
        })

    def _calculate_metrics(self) -> Dict[str, Any]:
        """Calculate backtest performance metrics"""
        total_trades = len(self.trades)

        if total_trades == 0:
            return {
                'totalTrades': 0,
                'winningTrades': 0,
                'losingTrades': 0,
                'winRate': 0,
                'totalPnl': 0,
                'totalPnlPct': 0,
                'maxDrawdown': 0,
                'maxDrawdownPct': 0,
                'sharpeRatio': 0,
                'profitFactor': 0,
                'finalCapital': self.capital
            }

        winning_trades = [t for t in self.trades if t['pnl'] > 0]
        losing_trades = [t for t in self.trades if t['pnl'] < 0]

        total_pnl = self.capital - self.initial_capital
        total_pnl_pct = (total_pnl / self.initial_capital) * 100

        total_wins = sum(t['pnl'] for t in winning_trades)
        total_losses = abs(sum(t['pnl'] for t in losing_trades))

        profit_factor = total_wins / total_losses if total_losses > 0 else (float('inf') if total_wins > 0 else 0)

        # Calculate max drawdown
        max_drawdown = 0
        max_drawdown_pct = 0
        peak = self.initial_capital

        for point in self.equity_curve:
            if point['equity'] > peak:
                peak = point['equity']
            drawdown = peak - point['equity']
            drawdown_pct = (drawdown / peak) * 100 if peak > 0 else 0

            if drawdown > max_drawdown:
                max_drawdown = drawdown
                max_drawdown_pct = drawdown_pct

        # Calculate Sharpe ratio
        returns = [t['pnl_pct'] / 100 for t in self.trades]
        avg_return = sum(returns) / len(returns) if returns else 0

        if len(returns) > 1:
            variance = sum((r - avg_return) ** 2 for r in returns) / len(returns)
            std_dev = variance ** 0.5
            sharpe_ratio = (avg_return / std_dev) * (252 ** 0.5) if std_dev > 0 else 0
        else:
            sharpe_ratio = 0

        return {
            'totalTrades': total_trades,
            'winningTrades': len(winning_trades),
            'losingTrades': len(losing_trades),
            'winRate': (len(winning_trades) / total_trades * 100) if total_trades > 0 else 0,
            'totalPnl': total_pnl,
            'totalPnlPct': total_pnl_pct,
            'maxDrawdown': max_drawdown,
            'maxDrawdownPct': max_drawdown_pct,
            'sharpeRatio': sharpe_ratio,
            'profitFactor': profit_factor,
            'finalCapital': self.capital
        }

    def _error_result(self, error_msg: str) -> Dict[str, Any]:
        """Return error result"""
        return {
            'success': False,
            'error': error_msg,
            'trades': [],
            'metrics': {}
        }


def main():
    """Main entry point"""
    # Save original stdout for final JSON output
    original_stdout = sys.stdout

    try:
        # Configure logging first
        log_file = configure_logging()

        # Redirect stdout to stderr to prevent user code print() from polluting JSON output
        sys.stdout = sys.stderr

        logger.info(f"Backtest process started - PID: {os.getpid()}")

        # Read input from file if provided, otherwise from stdin
        if len(sys.argv) > 1:
            # File path provided as command line argument
            logger.info(f"Reading input from file: {sys.argv[1]}")
            with open(sys.argv[1], 'r') as f:
                input_data = json.load(f)
        else:
            # Read from stdin
            logger.info("Reading input from stdin")
            input_data = json.loads(sys.stdin.read())

        # Extract parameters
        strategy_code = input_data['strategy_code']
        historical_data = input_data['historical_data']
        config = input_data['config']

        logger.debug(f"Strategy code length: {len(strategy_code)} chars")
        logger.debug(f"Config: {config}")

        # Create backtest runner
        runner = BatchBacktestRunner({
            'initial_capital': input_data.get('initial_capital', 10000),
            'risk_per_trade': input_data.get('risk_per_trade', 0.01),
            'leverage': input_data.get('leverage', 10),
            'commission': input_data.get('commission', 0.001)
        })

        # Run backtest
        logger.info("Starting backtest execution...")
        result = runner.run_backtest(strategy_code, historical_data, config)

        # Add log file path to result
        result['log_file'] = log_file

        # Output result
        logger.info(f"Backtest finished - Success: {result['success']}")
        # Write JSON to original stdout (not redirected stderr)
        print(json.dumps(result, default=str), file=original_stdout)
        sys.exit(0 if result['success'] else 1)

    except Exception as e:
        logger.error(f"FATAL ERROR: {str(e)}")
        logger.error(traceback.format_exc())

        error_result = {
            'success': False,
            'error': f"Fatal error: {str(e)}",
            'trades': [],
            'metrics': {},
            'traceback': traceback.format_exc(),
            'log_file': log_file if 'log_file' in locals() else None
        }
        # Log to stderr for debugging
        print(f"FATAL ERROR: {str(e)}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        # Write error JSON to original stdout
        print(json.dumps(error_result), file=original_stdout)
        sys.exit(1)


if __name__ == '__main__':
    main()
