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
            # Load strategy code and check for custom backtest method
            exec_scope = self._load_strategy_scope(strategy_code)

            if not exec_scope:
                return self._error_result("Failed to load strategy code")

            # Check if strategy has custom backtest() method
            custom_backtest = self._get_custom_backtest(exec_scope)

            if custom_backtest:
                # Use custom backtest implementation
                return self._run_custom_backtest(custom_backtest, historical_data, strategy_config)

            # Fall back to default backtest using generate_signal
            generate_signal = exec_scope.get('generate_signal') or exec_scope.get('generate_signals')

            if not generate_signal:
                return self._error_result("Failed to load strategy generate_signal function")

            # Process candles with sliding window
            lookback = strategy_config.get('lookback_period', 200)

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
                    continue

                if not signal:
                    continue

                # Update strategy state from metadata
                if 'metadata' in signal:
                    self.strategy_state = signal['metadata']

                # Process signal
                self._process_signal(signal, current_candle)

                # Update equity curve
                self._update_equity_curve(current_candle)

            # Close any open position at end
            if self.current_position:
                last_candle = historical_data[-1]
                self._close_position(last_candle, 'BACKTEST_END')

            # Calculate metrics
            metrics = self._calculate_metrics()

            return {
                'success': True,
                'trades': self.trades,
                'metrics': metrics,
                'equity_curve': self.equity_curve
            }

        except Exception as e:
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
        """Check if strategy has custom backtest() method"""
        try:
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

    def _run_custom_backtest(self, custom_backtest, historical_data: List[Dict], strategy_config: Dict) -> Dict[str, Any]:
        """Run custom backtest implementation provided by strategy"""
        try:
            # Convert historical data to DataFrame
            df = pd.DataFrame(historical_data)

            # Prepare config: merge backtest params with strategy params
            config = {
                **strategy_config,  # Include all strategy parameters
                'initial_capital': self.initial_capital,
                'risk_per_trade': self.risk_per_trade,
                'leverage': self.leverage,
                'commission': self.commission
            }

            # Call custom backtest
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
            return

        self.current_position = {
            'side': side,
            'entry_price': entry_price,
            'entry_time': candle['time'],
            'quantity': quantity,
            'stop_loss': stop_loss,
            'take_profit': take_profit
        }

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
        self.trades.append({
            'side': side,
            'entry_time': self.current_position['entry_time'],
            'exit_time': candle['time'],
            'entry_price': entry_price,
            'exit_price': exit_price,
            'quantity': quantity,
            'pnl': net_pnl,
            'pnl_pct': (net_pnl / (entry_price * quantity)) * 100,
            'commission': total_commission,
            'reason': reason
        })

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
        if not stop_loss:
            # No stop loss - use fixed risk amount
            risk_amount = self.capital * self.risk_per_trade
            return (risk_amount * self.leverage) / entry_price

        risk_amount = self.capital * self.risk_per_trade
        stop_distance = abs(entry_price - stop_loss)

        if stop_distance == 0:
            return 0

        return (risk_amount / stop_distance) * self.leverage

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
    try:
        # Read input from file if provided, otherwise from stdin
        if len(sys.argv) > 1:
            # File path provided as command line argument
            with open(sys.argv[1], 'r') as f:
                input_data = json.load(f)
        else:
            # Read from stdin
            input_data = json.loads(sys.stdin.read())

        # Extract parameters
        strategy_code = input_data['strategy_code']
        historical_data = input_data['historical_data']
        config = input_data['config']

        # Create backtest runner
        runner = BatchBacktestRunner({
            'initial_capital': input_data.get('initial_capital', 10000),
            'risk_per_trade': input_data.get('risk_per_trade', 0.01),
            'leverage': input_data.get('leverage', 10),
            'commission': input_data.get('commission', 0.001)
        })

        # Run backtest
        result = runner.run_backtest(strategy_code, historical_data, config)

        # Output result
        print(json.dumps(result))
        sys.exit(0 if result['success'] else 1)

    except Exception as e:
        error_result = {
            'success': False,
            'error': f"Fatal error: {str(e)}",
            'trades': [],
            'metrics': {},
            'traceback': traceback.format_exc()
        }
        # Log to stderr for debugging
        print(f"FATAL ERROR: {str(e)}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        print(json.dumps(error_result))
        sys.exit(1)


if __name__ == '__main__':
    main()
