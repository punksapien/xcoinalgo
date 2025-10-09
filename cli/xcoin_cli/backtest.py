"""
Backtesting engine for strategy testing
"""

import pandas as pd
import numpy as np
from pathlib import Path
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
from datetime import datetime
import importlib.util
import sys


@dataclass
class Trade:
    """Represents a single trade"""
    entry_time: datetime
    entry_price: float
    exit_time: Optional[datetime] = None
    exit_price: Optional[float] = None
    side: str = 'LONG'  # LONG or SHORT
    quantity: float = 1.0
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    pnl: float = 0.0
    pnl_percentage: float = 0.0
    exit_reason: str = ''


@dataclass
class BacktestResult:
    """Results of a backtest run"""
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    win_rate: float = 0.0
    total_pnl: float = 0.0
    total_pnl_percentage: float = 0.0
    max_drawdown: float = 0.0
    max_drawdown_percentage: float = 0.0
    sharpe_ratio: float = 0.0
    profit_factor: float = 0.0
    avg_win: float = 0.0
    avg_loss: float = 0.0
    largest_win: float = 0.0
    largest_loss: float = 0.0
    avg_trade_duration: float = 0.0
    trades: List[Trade] = field(default_factory=list)
    equity_curve: List[float] = field(default_factory=list)
    timestamps: List[datetime] = field(default_factory=list)


class BacktestEngine:
    """Backtesting engine for strategy execution"""

    def __init__(
        self,
        strategy_file: Path,
        initial_capital: float = 10000.0,
        commission: float = 0.001  # 0.1%
    ):
        """
        Initialize backtest engine

        Args:
            strategy_file: Path to strategy.py file
            initial_capital: Starting capital in USDT
            commission: Commission per trade (default 0.1%)
        """
        self.strategy_file = strategy_file
        self.initial_capital = initial_capital
        self.commission = commission

        # State
        self.capital = initial_capital
        self.position: Optional[Trade] = None
        self.trades: List[Trade] = []
        self.equity_curve: List[float] = [initial_capital]
        self.timestamps: List[datetime] = []

        # Load strategy
        self.strategy_module = self._load_strategy()

    def _load_strategy(self):
        """Dynamically load strategy module"""
        spec = importlib.util.spec_from_file_location("strategy", self.strategy_file)
        if not spec or not spec.loader:
            raise Exception(f"Failed to load strategy from {self.strategy_file}")

        module = importlib.util.module_from_spec(spec)
        sys.modules["strategy"] = module
        spec.loader.exec_module(module)

        return module

    def run(
        self,
        data: pd.DataFrame,
        settings: Dict[str, Any]
    ) -> BacktestResult:
        """
        Run backtest on historical data

        Args:
            data: DataFrame with OHLCV data
            settings: Strategy settings

        Returns:
            BacktestResult with performance metrics
        """
        # Reset state
        self.capital = self.initial_capital
        self.position = None
        self.trades = []
        self.equity_curve = [self.initial_capital]
        self.timestamps = []

        # Ensure data has datetime index
        if not isinstance(data.index, pd.DatetimeIndex):
            data.index = pd.to_datetime(data.index)

        # Get lookback period from settings
        lookback = settings.get('lookback_period', 100)

        # Iterate through data
        for i in range(lookback, len(data)):
            # Get historical candles for this iteration
            candles_df = data.iloc[max(0, i - lookback):i + 1]
            candles = self._dataframe_to_candles(candles_df)

            # Get current candle
            current_candle = data.iloc[i]
            current_time = current_candle.name
            current_price = float(current_candle['close'])

            # Check stop loss / take profit if in position
            if self.position:
                exit_signal = self._check_exit_conditions(
                    current_candle,
                    self.position
                )
                if exit_signal:
                    self._exit_position(
                        current_time,
                        current_price,
                        exit_signal
                    )

            # Generate signal from strategy
            try:
                signal_result = self.strategy_module.generate_signal(candles, settings)
            except Exception as e:
                # Skip this candle on error
                continue

            signal = signal_result.get('signal', 'HOLD')
            stop_loss = signal_result.get('stopLoss')
            take_profit = signal_result.get('takeProfit')

            # Execute signal
            if signal == 'LONG' and not self.position:
                self._enter_position(
                    current_time,
                    current_price,
                    'LONG',
                    stop_loss,
                    take_profit
                )
            elif signal == 'SHORT' and not self.position:
                self._enter_position(
                    current_time,
                    current_price,
                    'SHORT',
                    stop_loss,
                    take_profit
                )
            elif signal == 'EXIT_LONG' and self.position and self.position.side == 'LONG':
                self._exit_position(current_time, current_price, 'signal')
            elif signal == 'EXIT_SHORT' and self.position and self.position.side == 'SHORT':
                self._exit_position(current_time, current_price, 'signal')

            # Update equity curve
            current_equity = self._calculate_equity(current_price)
            self.equity_curve.append(current_equity)
            self.timestamps.append(current_time)

        # Close any open position at end
        if self.position:
            last_candle = data.iloc[-1]
            self._exit_position(
                last_candle.name,
                float(last_candle['close']),
                'backtest_end'
            )

        # Calculate metrics
        return self._calculate_metrics()

    def _dataframe_to_candles(self, df: pd.DataFrame) -> List[Dict]:
        """Convert DataFrame to list of candle dictionaries"""
        candles = []
        for timestamp, row in df.iterrows():
            candles.append({
                'timestamp': int(timestamp.timestamp() * 1000),
                'open': float(row['open']),
                'high': float(row['high']),
                'low': float(row['low']),
                'close': float(row['close']),
                'volume': float(row['volume'])
            })
        return candles

    def _check_exit_conditions(
        self,
        candle: pd.Series,
        position: Trade
    ) -> Optional[str]:
        """Check if stop loss or take profit is hit"""
        high = float(candle['high'])
        low = float(candle['low'])

        if position.side == 'LONG':
            # Check stop loss
            if position.stop_loss and low <= position.stop_loss:
                return 'stop_loss'
            # Check take profit
            if position.take_profit and high >= position.take_profit:
                return 'take_profit'
        else:  # SHORT
            # Check stop loss
            if position.stop_loss and high >= position.stop_loss:
                return 'stop_loss'
            # Check take profit
            if position.take_profit and low <= position.take_profit:
                return 'take_profit'

        return None

    def _enter_position(
        self,
        time: datetime,
        price: float,
        side: str,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None
    ):
        """Enter a new position"""
        # Calculate position size (using all capital)
        commission_cost = self.capital * self.commission
        quantity = (self.capital - commission_cost) / price

        self.position = Trade(
            entry_time=time,
            entry_price=price,
            side=side,
            quantity=quantity,
            stop_loss=stop_loss,
            take_profit=take_profit
        )

        # Deduct commission
        self.capital -= commission_cost

    def _exit_position(
        self,
        time: datetime,
        price: float,
        reason: str
    ):
        """Exit current position"""
        if not self.position:
            return

        # Use stop loss/take profit price if hit
        if reason == 'stop_loss' and self.position.stop_loss:
            exit_price = self.position.stop_loss
        elif reason == 'take_profit' and self.position.take_profit:
            exit_price = self.position.take_profit
        else:
            exit_price = price

        # Calculate PnL
        if self.position.side == 'LONG':
            pnl = (exit_price - self.position.entry_price) * self.position.quantity
        else:  # SHORT
            pnl = (self.position.entry_price - exit_price) * self.position.quantity

        # Deduct commission
        commission_cost = exit_price * self.position.quantity * self.commission
        pnl -= commission_cost

        # Update capital
        value = exit_price * self.position.quantity
        self.capital += value + pnl

        # Update trade record
        self.position.exit_time = time
        self.position.exit_price = exit_price
        self.position.pnl = pnl
        self.position.pnl_percentage = (pnl / (self.position.entry_price * self.position.quantity)) * 100
        self.position.exit_reason = reason

        # Add to completed trades
        self.trades.append(self.position)
        self.position = None

    def _calculate_equity(self, current_price: float) -> float:
        """Calculate current equity including open position"""
        equity = self.capital

        if self.position:
            # Add unrealized PnL
            if self.position.side == 'LONG':
                unrealized = (current_price - self.position.entry_price) * self.position.quantity
            else:  # SHORT
                unrealized = (self.position.entry_price - current_price) * self.position.quantity

            value = current_price * self.position.quantity
            equity += value + unrealized

        return equity

    def _calculate_metrics(self) -> BacktestResult:
        """Calculate performance metrics from trades"""
        result = BacktestResult()

        if not self.trades:
            return result

        result.trades = self.trades
        result.equity_curve = self.equity_curve
        result.timestamps = self.timestamps

        # Basic stats
        result.total_trades = len(self.trades)
        result.winning_trades = sum(1 for t in self.trades if t.pnl > 0)
        result.losing_trades = sum(1 for t in self.trades if t.pnl < 0)
        result.win_rate = (result.winning_trades / result.total_trades * 100) if result.total_trades > 0 else 0

        # PnL stats
        result.total_pnl = sum(t.pnl for t in self.trades)
        result.total_pnl_percentage = ((self.capital - self.initial_capital) / self.initial_capital) * 100

        winning_pnl = sum(t.pnl for t in self.trades if t.pnl > 0)
        losing_pnl = abs(sum(t.pnl for t in self.trades if t.pnl < 0))

        result.avg_win = winning_pnl / result.winning_trades if result.winning_trades > 0 else 0
        result.avg_loss = losing_pnl / result.losing_trades if result.losing_trades > 0 else 0
        result.largest_win = max((t.pnl for t in self.trades), default=0)
        result.largest_loss = min((t.pnl for t in self.trades), default=0)

        # Profit factor
        result.profit_factor = winning_pnl / losing_pnl if losing_pnl > 0 else 0

        # Drawdown
        equity_array = np.array(self.equity_curve)
        running_max = np.maximum.accumulate(equity_array)
        drawdown = (equity_array - running_max) / running_max * 100
        result.max_drawdown_percentage = abs(np.min(drawdown))
        result.max_drawdown = abs(np.min(equity_array - running_max))

        # Sharpe ratio (annualized, assuming daily data)
        if len(self.equity_curve) > 1:
            returns = pd.Series(self.equity_curve).pct_change().dropna()
            if len(returns) > 0 and returns.std() != 0:
                result.sharpe_ratio = (returns.mean() / returns.std()) * np.sqrt(252)

        # Average trade duration
        durations = []
        for trade in self.trades:
            if trade.exit_time:
                duration = (trade.exit_time - trade.entry_time).total_seconds() / 3600  # hours
                durations.append(duration)
        result.avg_trade_duration = np.mean(durations) if durations else 0

        return result


def load_historical_data(csv_path: Path) -> pd.DataFrame:
    """
    Load historical OHLCV data from CSV

    Expected CSV format:
        timestamp,open,high,low,close,volume
        2024-01-01 00:00:00,45000,45500,44800,45200,1000
        ...

    Args:
        csv_path: Path to CSV file

    Returns:
        DataFrame with datetime index
    """
    df = pd.read_csv(csv_path)

    # Parse timestamp
    if 'timestamp' in df.columns:
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df.set_index('timestamp', inplace=True)
    elif 'date' in df.columns:
        df['date'] = pd.to_datetime(df['date'])
        df.set_index('date', inplace=True)
    else:
        # Assume first column is timestamp
        df.iloc[:, 0] = pd.to_datetime(df.iloc[:, 0])
        df.set_index(df.columns[0], inplace=True)

    # Ensure numeric columns
    for col in ['open', 'high', 'low', 'close', 'volume']:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce')

    # Fill any NaN values
    df.fillna(method='ffill', inplace=True)

    return df
