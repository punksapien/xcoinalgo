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
            # Load strategy code
            generate_signal = self._load_strategy(strategy_code)

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

    def _load_strategy(self, strategy_code: str):
        """Execute strategy code and extract generate_signal function"""
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

            # Get generate_signal function
            if 'generate_signal' in exec_scope:
                return exec_scope['generate_signal']
            elif 'generate_signals' in exec_scope:
                return exec_scope['generate_signals']
            else:
                return None

        except Exception as e:
            print(f"Error loading strategy: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            return None

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
        # Also log to stderr for debugging
        print(f"FATAL ERROR: {str(e)}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        print(json.dumps(error_result))
        sys.exit(1)


if __name__ == '__main__':
    main()
