"""
XcoinAlgo Strategy SDK - Testing Framework

This module provides tools to validate and test strategies locally before deployment.
"""

from typing import List, Dict, Any, Optional
import pandas as pd
from pydantic import ValidationError

from .base import BaseStrategy
from .models import Signal, BacktestResult, Trade


class StrategyValidator:
    """
    Validates strategy implementation and signal format.
    """

    @staticmethod
    def validate_signal(signal: Dict[str, Any]) -> tuple[bool, Optional[str]]:
        """
        Validate that a signal dict matches the expected format.

        Args:
            signal: Signal dictionary returned from on_data()

        Returns:
            tuple: (is_valid, error_message)
                - is_valid: True if signal is valid
                - error_message: None if valid, error description if invalid
        """
        try:
            Signal(**signal)
            return True, None
        except ValidationError as e:
            return False, str(e)

    @staticmethod
    def validate_strategy(strategy: BaseStrategy) -> tuple[bool, List[str]]:
        """
        Validate that a strategy correctly implements the BaseStrategy interface.

        Args:
            strategy: Strategy instance to validate

        Returns:
            tuple: (is_valid, issues)
                - is_valid: True if strategy is valid
                - issues: List of validation issues (empty if valid)
        """
        issues = []

        # Check inheritance
        if not isinstance(strategy, BaseStrategy):
            issues.append("Strategy must inherit from BaseStrategy")
            return False, issues

        # Check required attributes
        if not hasattr(strategy, 'name') or not strategy.name:
            issues.append("Strategy must have a 'name' attribute")

        if not hasattr(strategy, 'version') or not strategy.version:
            issues.append("Strategy must have a 'version' attribute")

        # Check method implementation
        if strategy.on_data.__func__ is BaseStrategy.on_data:
            issues.append("Strategy must implement on_data() method")

        return len(issues) == 0, issues


class StrategyTester:
    """
    Test strategies locally with historical data.
    """

    def __init__(self, strategy: BaseStrategy):
        """
        Initialize the tester with a strategy.

        Args:
            strategy: Strategy instance to test
        """
        self.strategy = strategy
        self.trades: List[Trade] = []
        self.signals: List[Dict[str, Any]] = []

    def validate(self) -> tuple[bool, List[str]]:
        """
        Validate the strategy implementation.

        Returns:
            tuple: (is_valid, issues)
        """
        return StrategyValidator.validate_strategy(self.strategy)

    def run_single(self, data: pd.DataFrame) -> tuple[Dict[str, Any], bool, Optional[str]]:
        """
        Run strategy once with provided data.

        Args:
            data: Historical OHLCV DataFrame

        Returns:
            tuple: (signal, is_valid, error_message)
        """
        try:
            # Call strategy
            signal = self.strategy.on_data(data)

            # Validate signal format
            is_valid, error = StrategyValidator.validate_signal(signal)

            return signal, is_valid, error

        except Exception as e:
            return {}, False, f"Strategy execution error: {str(e)}"

    def backtest(
        self,
        data: pd.DataFrame,
        initial_capital: float = 10000.0,
        risk_per_trade: float = 0.02
    ) -> BacktestResult:
        """
        Run a simple backtest on historical data.

        Args:
            data: Historical OHLCV DataFrame with columns:
                  [timestamp, open, high, low, close, volume]
            initial_capital: Starting capital
            risk_per_trade: Risk per trade as decimal (e.g., 0.02 = 2%)

        Returns:
            BacktestResult: Backtest statistics

        Note:
            This is a simplified backtest for validation purposes.
            For production backtesting, use specialized tools.
        """
        capital = initial_capital
        trades = []
        position = None  # Current open position

        # Validate data
        required_cols = ['timestamp', 'open', 'high', 'low', 'close', 'volume']
        if not all(col in data.columns for col in required_cols):
            raise ValueError(f"Data must have columns: {required_cols}")

        # Sort by timestamp
        data = data.sort_values('timestamp').reset_index(drop=True)

        # Run strategy on each candle (using lookback window)
        lookback = 100  # Minimum candles needed

        for i in range(lookback, len(data)):
            # Get historical data window
            window = data.iloc[:i+1]

            # Run strategy
            signal, is_valid, error = self.run_single(window)

            if not is_valid:
                print(f"Warning: Invalid signal at index {i}: {error}")
                continue

            self.signals.append(signal)

            action = signal.get('action')
            current_price = data.iloc[i]['close']

            # Handle open position
            if position is not None:
                # Check stop loss / take profit
                hit_sl = False
                hit_tp = False

                if position['side'] == 'BUY':
                    if position.get('stopLoss') and current_price <= position['stopLoss']:
                        hit_sl = True
                    if position.get('takeProfit') and current_price >= position['takeProfit']:
                        hit_tp = True
                else:  # SELL
                    if position.get('stopLoss') and current_price >= position['stopLoss']:
                        hit_sl = True
                    if position.get('takeProfit') and current_price <= position['takeProfit']:
                        hit_tp = True

                # Close position if SL/TP hit or opposite signal
                if hit_sl or hit_tp or (action in ['BUY', 'SELL'] and action != position['side']):
                    exit_price = current_price

                    # Calculate P&L
                    if position['side'] == 'BUY':
                        pnl = (exit_price - position['entryPrice']) * position['quantity']
                    else:
                        pnl = (position['entryPrice'] - exit_price) * position['quantity']

                    capital += pnl

                    trades.append({
                        'side': position['side'],
                        'entryPrice': position['entryPrice'],
                        'exitPrice': exit_price,
                        'quantity': position['quantity'],
                        'pnl': pnl,
                        'entryIndex': position['entryIndex'],
                        'exitIndex': i
                    })

                    position = None

            # Open new position
            if action in ['BUY', 'SELL'] and position is None:
                entry_price = signal.get('entryPrice', current_price)
                stop_loss = signal.get('stopLoss')

                # Calculate position size based on risk
                if stop_loss:
                    risk_amount = capital * risk_per_trade
                    price_risk = abs(entry_price - stop_loss)
                    quantity = risk_amount / price_risk if price_risk > 0 else 0
                else:
                    quantity = (capital * risk_per_trade) / entry_price

                if quantity > 0:
                    position = {
                        'side': action,
                        'entryPrice': entry_price,
                        'stopLoss': stop_loss,
                        'takeProfit': signal.get('takeProfit'),
                        'quantity': quantity,
                        'entryIndex': i
                    }

        # Close any remaining position
        if position is not None:
            exit_price = data.iloc[-1]['close']
            if position['side'] == 'BUY':
                pnl = (exit_price - position['entryPrice']) * position['quantity']
            else:
                pnl = (position['entryPrice'] - exit_price) * position['quantity']

            capital += pnl

            trades.append({
                'side': position['side'],
                'entryPrice': position['entryPrice'],
                'exitPrice': exit_price,
                'quantity': position['quantity'],
                'pnl': pnl,
                'entryIndex': position['entryIndex'],
                'exitIndex': len(data) - 1
            })

        # Calculate statistics
        total_trades = len(trades)
        winning_trades = len([t for t in trades if t['pnl'] > 0])
        losing_trades = len([t for t in trades if t['pnl'] < 0])
        win_rate = winning_trades / total_trades if total_trades > 0 else 0
        total_pnl = capital - initial_capital

        # Calculate max drawdown
        equity_curve = [initial_capital]
        for trade in trades:
            equity_curve.append(equity_curve[-1] + trade['pnl'])

        peak = equity_curve[0]
        max_drawdown = 0
        for value in equity_curve:
            if value > peak:
                peak = value
            drawdown = ((peak - value) / peak) * 100 if peak > 0 else 0
            max_drawdown = max(max_drawdown, drawdown)

        return BacktestResult(
            totalTrades=total_trades,
            winningTrades=winning_trades,
            losingTrades=losing_trades,
            winRate=win_rate,
            totalPnl=total_pnl,
            maxDrawdown=max_drawdown,
            startDate=pd.to_datetime(data.iloc[0]['timestamp'], unit='s'),
            endDate=pd.to_datetime(data.iloc[-1]['timestamp'], unit='s')
        )


def validate_strategy_file(filepath: str) -> tuple[bool, List[str]]:
    """
    Validate a Python strategy file.

    Args:
        filepath: Path to the strategy Python file

    Returns:
        tuple: (is_valid, issues)
    """
    issues = []

    try:
        # Try to import the file
        import importlib.util
        spec = importlib.util.spec_from_file_location("strategy", filepath)
        if spec is None or spec.loader is None:
            return False, ["Could not load strategy file"]

        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        # Look for BaseStrategy subclasses
        from inspect import getmembers, isclass

        strategy_classes = [
            cls for name, cls in getmembers(module, isclass)
            if issubclass(cls, BaseStrategy) and cls is not BaseStrategy
        ]

        if not strategy_classes:
            issues.append("No BaseStrategy subclass found in file")
            return False, issues

        # Validate each strategy class
        for strategy_cls in strategy_classes:
            try:
                strategy = strategy_cls()
                is_valid, cls_issues = StrategyValidator.validate_strategy(strategy)
                issues.extend(cls_issues)
            except Exception as e:
                issues.append(f"Error instantiating {strategy_cls.__name__}: {str(e)}")

    except Exception as e:
        issues.append(f"Error loading file: {str(e)}")
        return False, issues

    return len(issues) == 0, issues
