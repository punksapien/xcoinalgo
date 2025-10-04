"""
Backtesting Engine Module

Comprehensive backtesting framework for strategy validation and optimization.
"""

import pandas as pd
import numpy as np
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
import copy

from .base_strategy import BaseStrategy, SignalType, PositionType
from .client import CoinDCXClient
from .utils import PerformanceTracker, Logger
from .strategy_config import StrategyConfig


class BacktestEngine:
    """
    Backtesting engine for strategy validation.

    Provides comprehensive backtesting capabilities with realistic
    slippage, commission, and market impact modeling.
    """
    # add gst rate as well
    def __init__(self,
                 strategy: BaseStrategy,
                 initial_balance: float = 10000.0,
                 commission_rate: float = 0.001,
                 slippage_rate: float = 0.0005):
        """
        Initialize backtesting engine.

        Args:
            strategy: Strategy instance to backtest
            initial_balance: Starting capital
            commission_rate: Commission rate per trade (0.1% default)
            slippage_rate: Slippage rate per trade (0.05% default)
        """
        self.strategy = strategy
        self.initial_balance = initial_balance
        self.commission_rate = commission_rate
        self.slippage_rate = slippage_rate

        self.logger = Logger(f"BacktestEngine-{strategy.config.code}")

        # Backtest state
        self.current_balance = initial_balance
        self.current_position_size = 0.0
        self.current_position_value = 0.0
        self.entry_price = 0.0
        self.position_type = PositionType.FLAT

        # Tracking
        self.performance_tracker = PerformanceTracker()
        self.equity_curve = []
        self.trade_log = []
        self.daily_returns = []

        # Configuration
        self.leverage = strategy.config.leverage
        self.risk_per_trade = strategy.config.risk_per_trade

        # Results
        self.results = None

    def run_backtest(self,
                    data: pd.DataFrame,
                    start_date: Optional[str] = None,
                    end_date: Optional[str] = None) -> Dict[str, Any]:
        """
        Run complete backtest on historical data.

        Args:
            data: DataFrame with OHLCV data and timestamp column
            start_date: Start date for backtest (YYYY-MM-DD)
            end_date: End date for backtest (YYYY-MM-DD)

        Returns:
            Comprehensive backtest results
        """
        self.logger.info(f"Starting backtest for {self.strategy.config.name}")

        # Validate and prepare data
        if not self._validate_data(data):
            raise ValueError("Invalid data format for backtesting")

        # Filter data by date range if specified
        if start_date or end_date:
            data = self._filter_data_by_date(data, start_date, end_date)

        if data.empty:
            raise ValueError("No data available for the specified date range")

        # Reset strategy and engine state
        self._reset_backtest_state()

        # Initialize strategy
        if not self.strategy.is_initialized:
            self.strategy.initialize()
            self.strategy.is_initialized = True

        # Calculate indicators
        data_with_indicators = self.strategy.calculate_indicators(data)
        if data_with_indicators.empty:
            data_with_indicators = data

        # Main backtesting loop
        self.logger.info(f"Processing {len(data_with_indicators)} data points")

        for i in range(len(data_with_indicators)):
            current_row = data_with_indicators.iloc[i]
            self._process_bar(current_row, i, data_with_indicators)

        # Calculate final results
        self.results = self._calculate_results(data_with_indicators)

        self.logger.info(f"Backtest completed. Final equity: ${self.current_balance:.2f}")
        return self.results

    def _validate_data(self, data: pd.DataFrame) -> bool:
        """Validate input data format."""
        required_columns = ['open', 'high', 'low', 'close', 'volume']

        if not all(col in data.columns for col in required_columns):
            self.logger.error(f"Data missing required columns: {required_columns}")
            return False

        if 'timestamp' not in data.columns:
            self.logger.error("Data missing 'timestamp' column")
            return False

        if data.empty:
            self.logger.error("Data is empty")
            return False

        return True

    def _filter_data_by_date(self,
                           data: pd.DataFrame,
                           start_date: Optional[str],
                           end_date: Optional[str]) -> pd.DataFrame:
        """Filter data by date range."""
        filtered_data = data.copy()

        if start_date:
            start_dt = pd.to_datetime(start_date)
            filtered_data = filtered_data[filtered_data['timestamp'] >= start_dt]

        if end_date:
            end_dt = pd.to_datetime(end_date)
            filtered_data = filtered_data[filtered_data['timestamp'] <= end_dt]

        return filtered_data.reset_index(drop=True)

    def _reset_backtest_state(self) -> None:
        """Reset all backtest state variables."""
        self.current_balance = self.initial_balance
        self.current_position_size = 0.0
        self.current_position_value = 0.0
        self.entry_price = 0.0
        self.position_type = PositionType.FLAT

        self.performance_tracker.reset()
        self.equity_curve = []
        self.trade_log = []
        self.daily_returns = []

        # Reset strategy state
        self.strategy.reset()

    def _process_bar(self,
                    current_bar: pd.Series,
                    bar_index: int,
                    full_data: pd.DataFrame) -> None:
        """Process a single data bar."""
        current_price = current_bar['close']
        current_time = current_bar['timestamp']

        # Update current data for strategy
        self.strategy.current_data = current_bar

        # Get historical data up to current point for signal generation
        historical_data = full_data.iloc[:bar_index + 1].copy()

        # Generate trading signals
        try:
            signal_data = self.strategy.generate_signals(historical_data)

            if signal_data and self.strategy.validate_signal(signal_data):
                signal = signal_data['signal']
                confidence = signal_data.get('confidence', 1.0)

                # Execute signal
                self._execute_signal(signal, current_price, current_time, confidence)

        except Exception as e:
            self.logger.error(f"Error processing bar at {current_time}: {e}")

        # Update equity curve
        current_equity = self._calculate_current_equity(current_price)
        self.equity_curve.append({
            'timestamp': current_time,
            'equity': current_equity,
            'price': current_price
        })

        self.performance_tracker.add_equity_point(current_equity, current_time)

    def _execute_signal(self,
                       signal: SignalType,
                       price: float,
                       timestamp: datetime,
                       confidence: float) -> None:
        """Execute trading signal with realistic costs."""

        if signal == SignalType.LONG and self.position_type == PositionType.FLAT:
            self._open_long_position(price, timestamp, confidence)

        elif signal == SignalType.SHORT and self.position_type == PositionType.FLAT:
            self._open_short_position(price, timestamp, confidence)

        elif signal == SignalType.CLOSE_LONG and self.position_type == PositionType.LONG:
            self._close_position(price, timestamp)

        elif signal == SignalType.CLOSE_SHORT and self.position_type == PositionType.SHORT:
            self._close_position(price, timestamp)

        elif signal in [SignalType.CLOSE_LONG, SignalType.CLOSE_SHORT]:
            # Close any position regardless of type
            if self.position_type != PositionType.FLAT:
                self._close_position(price, timestamp)

    def _open_long_position(self, price: float, timestamp: datetime, confidence: float) -> None:
        """Open long position."""
        # Calculate position size
        risk_amount = self.current_balance * self.risk_per_trade
        leveraged_amount = risk_amount * self.leverage

        # Apply slippage (buy at higher price)
        execution_price = price * (1 + self.slippage_rate)

        # Calculate position size
        self.current_position_size = leveraged_amount / execution_price
        self.current_position_value = leveraged_amount
        self.entry_price = execution_price
        self.position_type = PositionType.LONG

        # Calculate commission
        commission = leveraged_amount * self.commission_rate
        self.current_balance -= commission

        # Log trade opening
        self.trade_log.append({
            'timestamp': timestamp,
            'action': 'OPEN_LONG',
            'price': execution_price,
            'size': self.current_position_size,
            'value': leveraged_amount,
            'commission': commission,
            'confidence': confidence,
            'balance_after': self.current_balance
        })

        self.strategy.current_position = PositionType.LONG
        self.strategy.entry_price = execution_price
        self.strategy.entry_time = timestamp

        self.logger.info(f"Opened LONG position: {self.current_position_size:.6f} @ {execution_price:.4f}")

    def _open_short_position(self, price: float, timestamp: datetime, confidence: float) -> None:
        """Open short position."""
        # Calculate position size
        risk_amount = self.current_balance * self.risk_per_trade
        leveraged_amount = risk_amount * self.leverage

        # Apply slippage (sell at lower price)
        execution_price = price * (1 - self.slippage_rate)

        # Calculate position size
        self.current_position_size = leveraged_amount / execution_price
        self.current_position_value = leveraged_amount
        self.entry_price = execution_price
        self.position_type = PositionType.SHORT

        # Calculate commission
        commission = leveraged_amount * self.commission_rate
        self.current_balance -= commission

        # Log trade opening
        self.trade_log.append({
            'timestamp': timestamp,
            'action': 'OPEN_SHORT',
            'price': execution_price,
            'size': self.current_position_size,
            'value': leveraged_amount,
            'commission': commission,
            'confidence': confidence,
            'balance_after': self.current_balance
        })

        self.strategy.current_position = PositionType.SHORT
        self.strategy.entry_price = execution_price
        self.strategy.entry_time = timestamp

        self.logger.info(f"Opened SHORT position: {self.current_position_size:.6f} @ {execution_price:.4f}")

    def _close_position(self, price: float, timestamp: datetime) -> None:
        """Close current position."""
        if self.position_type == PositionType.FLAT:
            return

        # Apply slippage
        if self.position_type == PositionType.LONG:
            execution_price = price * (1 - self.slippage_rate)  # Sell at lower price
            pnl = (execution_price - self.entry_price) * self.current_position_size
        else:  # SHORT
            execution_price = price * (1 + self.slippage_rate)  # Buy at higher price
            pnl = (self.entry_price - execution_price) * self.current_position_size

        # Calculate commission
        position_value = self.current_position_size * execution_price
        commission = position_value * self.commission_rate

        # Update balance
        self.current_balance += pnl - commission

        # Log trade closing
        self.trade_log.append({
            'timestamp': timestamp,
            'action': f'CLOSE_{self.position_type.value.upper()}',
            'price': execution_price,
            'size': self.current_position_size,
            'value': position_value,
            'pnl': pnl,
            'commission': commission,
            'balance_after': self.current_balance,
            'entry_price': self.entry_price,
            'duration': (timestamp - self.strategy.entry_time).total_seconds() / 3600 if self.strategy.entry_time else 0
        })

        # Add to performance tracker
        trade_data = {
            'entry_price': self.entry_price,
            'exit_price': execution_price,
            'quantity': self.current_position_size,
            'side': self.position_type.value,
            'pnl': pnl,
            'commission': commission,
            'timestamp': timestamp
        }
        self.performance_tracker.add_trade(trade_data)

        # Update strategy performance
        self.strategy.update_performance_metrics(pnl - commission)

        self.logger.info(f"Closed {self.position_type.value.upper()} position: "
                        f"P&L: ${pnl:.2f}, Commission: ${commission:.2f}")

        # Reset position
        self.position_type = PositionType.FLAT
        self.strategy.current_position = PositionType.FLAT
        self.current_position_size = 0.0
        self.current_position_value = 0.0
        self.entry_price = 0.0

    def _calculate_current_equity(self, current_price: float) -> float:
        """Calculate current equity including unrealized P&L."""
        if self.position_type == PositionType.FLAT:
            return self.current_balance

        # Calculate unrealized P&L
        if self.position_type == PositionType.LONG:
            unrealized_pnl = (current_price - self.entry_price) * self.current_position_size
        else:  # SHORT
            unrealized_pnl = (self.entry_price - current_price) * self.current_position_size

        return self.current_balance + unrealized_pnl

    def _calculate_results(self, data: pd.DataFrame) -> Dict[str, Any]:
        """Calculate comprehensive backtest results."""
        # Close any open position at the end
        if self.position_type != PositionType.FLAT:
            last_price = data.iloc[-1]['close']
            last_timestamp = data.iloc[-1]['timestamp']
            self._close_position(last_price, last_timestamp)

        # Get performance metrics
        performance = self.performance_tracker.get_performance_metrics()

        # Calculate additional metrics
        total_return = ((self.current_balance - self.initial_balance) / self.initial_balance) * 100

        # Equity curve analysis
        equity_df = pd.DataFrame(self.equity_curve)
        if not equity_df.empty:
            peak_equity = equity_df['equity'].max()
            max_drawdown = self._calculate_max_drawdown_from_equity()

            # Daily returns for Sharpe calculation
            equity_df['daily_return'] = equity_df['equity'].pct_change()
            daily_returns = equity_df['daily_return'].dropna()

            if len(daily_returns) > 1:
                sharpe_ratio = daily_returns.mean() / daily_returns.std() * np.sqrt(252) if daily_returns.std() > 0 else 0
            else:
                sharpe_ratio = 0
        else:
            peak_equity = self.initial_balance
            max_drawdown = 0
            sharpe_ratio = 0

        # Trade analysis
        trades_df = pd.DataFrame(self.trade_log)
        trade_durations = []

        if not trades_df.empty:
            close_trades = trades_df[trades_df['action'].str.contains('CLOSE')]
            if not close_trades.empty:
                trade_durations = close_trades['duration'].dropna().tolist()

        # Compile results
        results = {
            'summary': {
                'initial_balance': self.initial_balance,
                'final_balance': self.current_balance,
                'total_return_pct': total_return,
                'total_return_abs': self.current_balance - self.initial_balance,
                'max_drawdown_pct': max_drawdown,
                'peak_equity': peak_equity,
                'sharpe_ratio': sharpe_ratio,
                'backtest_duration_days': (data.iloc[-1]['timestamp'] - data.iloc[0]['timestamp']).days
            },
            'performance_metrics': performance,
            'trade_statistics': {
                'avg_trade_duration_hours': np.mean(trade_durations) if trade_durations else 0,
                'median_trade_duration_hours': np.median(trade_durations) if trade_durations else 0,
                'total_commission_paid': sum(t.get('commission', 0) for t in self.trade_log),
                'trades_per_day': performance['total_trades'] / max((data.iloc[-1]['timestamp'] - data.iloc[0]['timestamp']).days, 1)
            },
            'equity_curve': self.equity_curve,
            'trade_log': self.trade_log,
            'configuration': self.strategy.config.get_dict()
        }

        return results

    def _calculate_max_drawdown_from_equity(self) -> float:
        """Calculate maximum drawdown from equity curve."""
        if not self.equity_curve:
            return 0.0

        equity_values = [point['equity'] for point in self.equity_curve]
        peak = equity_values[0]
        max_dd = 0.0

        for equity in equity_values:
            if equity > peak:
                peak = equity

            drawdown = (peak - equity) / peak if peak > 0 else 0
            max_dd = max(max_dd, drawdown)

        return max_dd * 100  # Return as percentage

    def export_results(self, filename: str, format: str = 'json') -> None:
        """
        Export backtest results to file.

        Args:
            filename: Output filename
            format: Export format ('json', 'csv', 'xlsx')
        """
        if self.results is None:
            raise ValueError("No backtest results to export. Run backtest first.")

        if format.lower() == 'json':
            import json
            with open(filename, 'w') as f:
                # Convert datetime objects to strings for JSON serialization
                results_copy = self._prepare_for_json_export(self.results)
                json.dump(results_copy, f, indent=2, default=str)

        elif format.lower() == 'csv':
            # Export trade log to CSV
            trades_df = pd.DataFrame(self.trade_log)
            trades_df.to_csv(filename, index=False)

        elif format.lower() == 'xlsx':
            # Export comprehensive Excel report
            with pd.ExcelWriter(filename) as writer:
                # Summary sheet
                summary_df = pd.DataFrame([self.results['summary']])
                summary_df.to_excel(writer, sheet_name='Summary', index=False)

                # Trade log
                trades_df = pd.DataFrame(self.trade_log)
                trades_df.to_excel(writer, sheet_name='Trades', index=False)

                # Equity curve
                equity_df = pd.DataFrame(self.equity_curve)
                equity_df.to_excel(writer, sheet_name='Equity_Curve', index=False)

        else:
            raise ValueError(f"Unsupported export format: {format}")

        self.logger.info(f"Results exported to {filename}")

    def _prepare_for_json_export(self, data: Any) -> Any:
        """Prepare data for JSON export by converting datetime objects."""
        if isinstance(data, dict):
            return {key: self._prepare_for_json_export(value) for key, value in data.items()}
        elif isinstance(data, list):
            return [self._prepare_for_json_export(item) for item in data]
        elif isinstance(data, pd.Timestamp):
            return data.isoformat()
        elif isinstance(data, datetime):
            return data.isoformat()
        else:
            return data

    def get_trade_analysis(self) -> Dict[str, Any]:
        """Get detailed trade analysis."""
        if not self.trade_log:
            return {'error': 'No trades executed'}

        trades_df = pd.DataFrame(self.trade_log)

        # Filter close trades for analysis
        close_trades = trades_df[trades_df['action'].str.contains('CLOSE')].copy()

        if close_trades.empty:
            return {'error': 'No completed trades'}

        analysis = {
            'total_trades': len(close_trades),
            'profitable_trades': len(close_trades[close_trades['pnl'] > 0]),
            'loss_trades': len(close_trades[close_trades['pnl'] < 0]),
            'avg_profit': close_trades[close_trades['pnl'] > 0]['pnl'].mean() if len(close_trades[close_trades['pnl'] > 0]) > 0 else 0,
            'avg_loss': close_trades[close_trades['pnl'] < 0]['pnl'].mean() if len(close_trades[close_trades['pnl'] < 0]) > 0 else 0,
            'largest_win': close_trades['pnl'].max(),
            'largest_loss': close_trades['pnl'].min(),
            'avg_duration_hours': close_trades['duration'].mean() if 'duration' in close_trades.columns else 0,
            'total_commission': close_trades['commission'].sum() if 'commission' in close_trades.columns else 0
        }

        return analysis
