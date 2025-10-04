"""
Base Strategy Module

Abstract base class that all trading strategies must inherit from.
Provides standardized interface and common functionality.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List, Tuple
import pandas as pd
import logging
from datetime import datetime
from enum import Enum

from .strategy_config import StrategyConfig
from .indicators import TechnicalIndicators
from .risk_management import RiskManager
from .utils import Logger


class SignalType(Enum):
    """Trading signal types."""
    LONG = "long"
    SHORT = "short"
    CLOSE_LONG = "close_long"
    CLOSE_SHORT = "close_short"
    HOLD = "hold"


class PositionType(Enum):
    """Position types."""
    LONG = "long"
    SHORT = "short"
    FLAT = "flat"


class BaseStrategy(ABC):
    """
    Abstract base class for all trading strategies.

    All strategies must inherit from this class and implement the required methods:
    - initialize()
    - generate_signals()
    - on_tick() [optional]
    - on_trade() [optional]
    """

    def __init__(self, config: StrategyConfig):
        """
        Initialize the strategy with configuration.

        Args:
            config: StrategyConfig instance with strategy parameters
        """
        # Validate configuration
        if not config.is_valid():
            errors = config.validate()
            raise ValueError(f"Invalid configuration: {', '.join(errors)}")

        self.config = config
        self.indicators = TechnicalIndicators()
        self.risk_manager = RiskManager(config)
        self.logger = Logger(f"Strategy-{config.code}")

        # Strategy state
        self.is_initialized = False
        self.current_position = PositionType.FLAT
        self.current_data = None
        self.last_signal = SignalType.HOLD
        self.entry_price = 0.0
        self.entry_time = None

        # Performance tracking
        self.trade_count = 0
        self.winning_trades = 0
        self.total_pnl = 0.0
        self.max_drawdown = 0.0
        self.peak_equity = 0.0

        # Custom strategy attributes can be set in initialize()
        self.custom_attributes = {}

    @abstractmethod
    def initialize(self) -> None:
        """
        Initialize strategy-specific parameters, indicators, and state.
        This method is called once when the strategy starts.

        Example:
            def initialize(self):
                self.sma_fast = 12
                self.sma_slow = 26
                self.custom_attributes['last_signal_time'] = None
        """
        pass

    @abstractmethod
    def generate_signals(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Generate trading signals based on market data.

        Args:
            df: DataFrame with OHLCV data and any calculated indicators

        Returns:
            Dictionary containing:
            {
                'signal': SignalType,
                'confidence': float (0-1),
                'metadata': dict (optional additional information)
            }

        Example:
            def generate_signals(self, df):
                if df['sma_fast'].iloc[-1] > df['sma_slow'].iloc[-1]:
                    return {
                        'signal': SignalType.LONG,
                        'confidence': 0.8,
                        'metadata': {'reason': 'SMA crossover'}
                    }
                return {'signal': SignalType.HOLD, 'confidence': 0.0}
        """
        pass

    def on_tick(self, tick_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Process real-time tick data (optional override).

        Args:
            tick_data: Dictionary containing tick information

        Returns:
            Optional signal dictionary or None
        """
        return None

    def on_trade(self, trade_data: Dict[str, Any]) -> None:
        """
        Handle trade execution events (optional override).

        Args:
            trade_data: Dictionary containing trade information
        """
        pass

    def on_order_update(self, order_data: Dict[str, Any]) -> None:
        """
        Handle order status updates (optional override).

        Args:
            order_data: Dictionary containing order information
        """
        pass

    def on_position_update(self, position_data: Dict[str, Any]) -> None:
        """
        Handle position updates (optional override).

        Args:
            position_data: Dictionary containing position information
        """
        pass

    def calculate_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Calculate technical indicators for the strategy.
        Override this method to add custom indicators.

        Args:
            df: DataFrame with OHLCV data

        Returns:
            DataFrame with added indicators
        """
        return df

    def validate_signal(self, signal_data: Dict[str, Any]) -> bool:
        """
        Validate generated signals before execution.

        Args:
            signal_data: Signal dictionary from generate_signals()

        Returns:
            True if signal is valid, False otherwise
        """
        if 'signal' not in signal_data:
            return False

        signal = signal_data['signal']
        if not isinstance(signal, SignalType):
            return False

        # Risk management validation
        if not self.risk_manager.can_take_position(signal, self.current_position):
            self.logger.warning(f"Risk manager rejected signal: {signal}")
            return False

        return True

    def update_performance_metrics(self, pnl: float) -> None:
        """
        Update strategy performance metrics.

        Args:
            pnl: Profit/Loss from the trade
        """
        self.total_pnl += pnl
        self.trade_count += 1

        if pnl > 0:
            self.winning_trades += 1

        # Update drawdown
        if self.total_pnl > self.peak_equity:
            self.peak_equity = self.total_pnl

        current_drawdown = (self.peak_equity - self.total_pnl) / max(self.peak_equity, 1)
        self.max_drawdown = max(self.max_drawdown, current_drawdown)

    def get_performance_metrics(self) -> Dict[str, Any]:
        """
        Get current strategy performance metrics.

        Returns:
            Dictionary with performance statistics
        """
        win_rate = (self.winning_trades / max(self.trade_count, 1)) * 100

        return {
            'total_trades': self.trade_count,
            'winning_trades': self.winning_trades,
            'win_rate': win_rate,
            'total_pnl': self.total_pnl,
            'max_drawdown': self.max_drawdown * 100,
            'current_position': self.current_position.value,
            'last_signal': self.last_signal.value
        }

    def reset(self) -> None:
        """Reset strategy state (useful for backtesting)."""
        self.current_position = PositionType.FLAT
        self.last_signal = SignalType.HOLD
        self.entry_price = 0.0
        self.entry_time = None
        self.trade_count = 0
        self.winning_trades = 0
        self.total_pnl = 0.0
        self.max_drawdown = 0.0
        self.peak_equity = 0.0
        self.custom_attributes = {}

    def get_strategy_info(self) -> Dict[str, Any]:
        """
        Get strategy metadata and configuration.

        Returns:
            Dictionary with strategy information
        """
        return {
            'name': self.config.name,
            'code': self.config.code,
            'description': self.config.description,
            'author': self.config.author,
            'version': self.config.version,
            'tags': self.config.tags,
            'is_initialized': self.is_initialized,
            'config': self.config.get_dict(),
            'performance': self.get_performance_metrics()
        }

    def log_signal(self, signal_data: Dict[str, Any], price: float) -> None:
        """
        Log trading signal for monitoring and debugging.

        Args:
            signal_data: Signal dictionary
            price: Current market price
        """
        self.logger.info(
            f"Signal Generated: {signal_data['signal'].value} "
            f"@ {price:.4f} | Confidence: {signal_data.get('confidence', 0):.2f} "
            f"| Metadata: {signal_data.get('metadata', {})}"
        )

    def __str__(self) -> str:
        """String representation of the strategy."""
        return f"Strategy({self.config.code}): {self.config.name} by {self.config.author}"

    def __repr__(self) -> str:
        """Detailed string representation."""
        return (
            f"BaseStrategy(code='{self.config.code}', "
            f"name='{self.config.name}', "
            f"initialized={self.is_initialized}, "
            f"position={self.current_position.value})"
        )
