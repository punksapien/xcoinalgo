"""
{{strategy_name}}

{{description}}

Author: {{author_name}} <{{author_email}}>
Created: {{creation_date}}
Version: 1.0.0
"""

import pandas as pd
import numpy as np
from datetime import datetime
from typing import Dict, Any, List, Optional
import warnings


class IndicatorHelper:
    """
    Self-contained technical indicator calculator.

    Works out-of-the-box with pandas built-in functions, with optional
    pandas_ta support for enhanced performance and additional indicators.

    Tier 1: Always available (pandas built-in)
        - SMA, EMA, Standard Deviation, Bollinger Bands

    Tier 2: Pandas implementation (no external library needed)
        - RSI, MACD, ATR

    Tier 3: Enhanced with pandas_ta (if installed)
        - All of the above with better performance
        - Additional indicators via .ta accessor

    Usage:
        indicators = IndicatorHelper()
        df['sma'] = indicators.sma(df['close'], length=20)
        df['rsi'] = indicators.rsi(df['close'], length=14)

        # If pandas_ta is installed, access additional indicators:
        if indicators.has_pandas_ta:
            df['adx'] = indicators.ta.adx(df['high'], df['low'], df['close'])
    """

    def __init__(self):
        """Initialize indicator helper and detect available libraries."""
        self._has_pandas_ta = False
        self._pandas_ta = None
        self._check_libraries()

    def _check_libraries(self) -> None:
        """Check what technical analysis libraries are available."""
        try:
            import pandas_ta as ta
            self._pandas_ta = ta
            self._has_pandas_ta = True
        except ImportError:
            pass

    @property
    def has_pandas_ta(self) -> bool:
        """Check if pandas_ta is available."""
        return self._has_pandas_ta

    @property
    def ta(self):
        """
        Access pandas_ta directly (if available).

        Raises:
            ImportError: If pandas_ta is not installed

        Example:
            if indicators.has_pandas_ta:
                df['adx'] = indicators.ta.adx(df['high'], df['low'], df['close'])
        """
        if not self._has_pandas_ta:
            raise ImportError(
                "pandas_ta is not installed. To use advanced indicators:\n"
                "  pip install pandas-ta\n\n"
                "Or use the built-in indicators: sma, ema, rsi, macd, atr, bbands"
            )
        return self._pandas_ta

    def _validate_series(self, series: pd.Series, name: str = "series") -> None:
        """Validate input series."""
        if not isinstance(series, pd.Series):
            raise TypeError(f"{name} must be a pandas Series, got {type(series)}")

        if series.empty:
            raise ValueError(f"{name} is empty")

        if np.isinf(series).any():
            raise ValueError(f"{name} contains infinite values")

    def _validate_length(self, length: int, data_size: int, indicator_name: str) -> None:
        """Validate indicator length parameter."""
        if not isinstance(length, (int, np.integer)):
            raise TypeError(f"{indicator_name} length must be an integer, got {type(length)}")

        if length <= 0:
            raise ValueError(f"{indicator_name} length must be positive, got {length}")

        if length > data_size:
            warnings.warn(
                f"{indicator_name} length ({length}) exceeds data size ({data_size}). "
                f"Result will contain only NaN values.",
                UserWarning
            )

    # Tier 1: Always Available (Pandas Built-in)

    def sma(self, series: pd.Series, length: int = 20) -> pd.Series:
        """
        Simple Moving Average (always available via pandas).

        Args:
            series: Price series (typically close prices)
            length: Lookback period (default: 20)

        Returns:
            Series with SMA values

        Raises:
            TypeError: If inputs are invalid types
            ValueError: If length <= 0 or series is empty
        """
        self._validate_series(series, "series")
        self._validate_length(length, len(series), "SMA")

        if self._has_pandas_ta:
            return self._pandas_ta.sma(series, length=length)

        return series.rolling(window=length, min_periods=length).mean()

    def ema(self, series: pd.Series, length: int = 20) -> pd.Series:
        """
        Exponential Moving Average (always available via pandas).

        Args:
            series: Price series (typically close prices)
            length: Lookback period (default: 20)

        Returns:
            Series with EMA values

        Raises:
            TypeError: If inputs are invalid types
            ValueError: If length <= 0 or series is empty
        """
        self._validate_series(series, "series")
        self._validate_length(length, len(series), "EMA")

        if self._has_pandas_ta:
            return self._pandas_ta.ema(series, length=length)

        return series.ewm(span=length, adjust=False, min_periods=length).mean()

    def std(self, series: pd.Series, length: int = 20) -> pd.Series:
        """
        Standard Deviation (always available via pandas).

        Args:
            series: Price series
            length: Lookback period (default: 20)

        Returns:
            Series with standard deviation values
        """
        self._validate_series(series, "series")
        self._validate_length(length, len(series), "STD")

        return series.rolling(window=length, min_periods=length).std()

    def bbands(self, series: pd.Series, length: int = 20, std: float = 2.0) -> Dict[str, pd.Series]:
        """
        Bollinger Bands (always available via pandas).

        Args:
            series: Price series (typically close prices)
            length: Lookback period (default: 20)
            std: Number of standard deviations (default: 2.0)

        Returns:
            Dictionary with 'upper', 'middle', 'lower' bands
        """
        self._validate_series(series, "series")
        self._validate_length(length, len(series), "Bollinger Bands")

        if self._has_pandas_ta:
            result = self._pandas_ta.bbands(series, length=length, std=std)
            return {
                'upper': result[f'BBU_{length}_{std}'],
                'middle': result[f'BBM_{length}_{std}'],
                'lower': result[f'BBL_{length}_{std}']
            }

        middle = self.sma(series, length)
        std_dev = self.std(series, length)

        return {
            'upper': middle + (std_dev * std),
            'middle': middle,
            'lower': middle - (std_dev * std)
        }

    # Tier 2: Pandas Implementation (No External Library)

    def rsi(self, series: pd.Series, length: int = 14) -> pd.Series:
        """
        Relative Strength Index (pure pandas implementation).

        Args:
            series: Price series (typically close prices)
            length: Lookback period (default: 14)

        Returns:
            Series with RSI values (0-100)
        """
        self._validate_series(series, "series")
        self._validate_length(length, len(series), "RSI")

        if self._has_pandas_ta:
            return self._pandas_ta.rsi(series, length=length)

        # Calculate price changes
        delta = series.diff()

        # Separate gains and losses
        gains = delta.where(delta > 0, 0.0)
        losses = -delta.where(delta < 0, 0.0)

        # Calculate average gains and losses using EMA
        avg_gains = gains.ewm(span=length, adjust=False, min_periods=length).mean()
        avg_losses = losses.ewm(span=length, adjust=False, min_periods=length).mean()

        # Calculate RS and RSI
        rs = avg_gains / avg_losses
        rsi = 100 - (100 / (1 + rs))

        return rsi

    def macd(self, series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> Dict[str, pd.Series]:
        """
        MACD - Moving Average Convergence Divergence (pure pandas implementation).

        Args:
            series: Price series (typically close prices)
            fast: Fast EMA period (default: 12)
            slow: Slow EMA period (default: 26)
            signal: Signal line EMA period (default: 9)

        Returns:
            Dictionary with 'macd', 'signal', 'histogram' series
        """
        self._validate_series(series, "series")

        if self._has_pandas_ta:
            result = self._pandas_ta.macd(series, fast=fast, slow=slow, signal=signal)
            return {
                'macd': result[f'MACD_{fast}_{slow}_{signal}'],
                'signal': result[f'MACDs_{fast}_{slow}_{signal}'],
                'histogram': result[f'MACDh_{fast}_{slow}_{signal}']
            }

        # Calculate MACD line
        ema_fast = self.ema(series, length=fast)
        ema_slow = self.ema(series, length=slow)
        macd_line = ema_fast - ema_slow

        # Calculate signal line
        signal_line = macd_line.ewm(span=signal, adjust=False, min_periods=signal).mean()

        # Calculate histogram
        histogram = macd_line - signal_line

        return {
            'macd': macd_line,
            'signal': signal_line,
            'histogram': histogram
        }

    def atr(self, high: pd.Series, low: pd.Series, close: pd.Series, length: int = 14) -> pd.Series:
        """
        Average True Range (pure pandas implementation).

        Args:
            high: High price series
            low: Low price series
            close: Close price series
            length: Lookback period (default: 14)

        Returns:
            Series with ATR values
        """
        self._validate_series(high, "high")
        self._validate_series(low, "low")
        self._validate_series(close, "close")
        self._validate_length(length, len(close), "ATR")

        if self._has_pandas_ta:
            return self._pandas_ta.atr(high=high, low=low, close=close, length=length)

        # Calculate True Range
        prev_close = close.shift(1)
        tr1 = high - low
        tr2 = abs(high - prev_close)
        tr3 = abs(low - prev_close)

        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

        # Calculate ATR using EMA
        atr = tr.ewm(span=length, adjust=False, min_periods=length).mean()

        return atr


class BaseStrategy:
    """Base class for all trading strategies"""

    def __init__(self):
        self.name = "{{strategy_name}}"
        self.version = "1.0.0"

    def generate_signal(self, candles: List[Dict], settings: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate trading signal based on candle data and settings.

        Args:
            candles: List of OHLCV dictionaries with keys:
                - timestamp (int): Unix timestamp in milliseconds
                - open (float): Opening price
                - high (float): High price
                - low (float): Low price
                - close (float): Closing price
                - volume (float): Trading volume

            settings: Dictionary containing strategy parameters and state

        Returns:
            Dictionary with:
                - signal (str): 'LONG', 'SHORT', 'HOLD', 'EXIT_LONG', or 'EXIT_SHORT'
                - price (float): Current price
                - stopLoss (float, optional): Stop loss price
                - takeProfit (float, optional): Take profit price
                - metadata (dict): Additional data including state for next execution
        """
        raise NotImplementedError("Subclasses must implement generate_signal")


class {{strategy_class_name}}(BaseStrategy):
    """
    {{strategy_name}} implementation

    TODO: Add detailed strategy description here
    """

    def __init__(self):
        super().__init__()

    def generate_signal(self, candles: List[Dict], settings: Dict[str, Any]) -> Dict[str, Any]:
        """Generate trading signal"""

        try:
            # Extract parameters from settings
            params = self._extract_parameters(settings)

            # Convert candles to DataFrame
            df = self._candles_to_dataframe(candles)

            if df.empty or len(df) < params['lookback_period']:
                return self._hold_signal(df.iloc[-1]['close'] if not df.empty else 0, {
                    'reason': 'insufficient_data',
                    'candles_available': len(df),
                    'required': params['lookback_period']
                })

            # Calculate technical indicators
            df = self._calculate_indicators(df, params)

            # Generate trading signals
            df = self._generate_signals(df, params)

            # Get latest candle data
            latest = df.iloc[-1]
            current_price = float(latest['close'])

            # Get previous state (for position tracking)
            previous_state = settings.get('previous_state', {})
            in_position = previous_state.get('in_position', False)

            # TODO: Implement your strategy logic here
            # Check for exit conditions if in position
            # Check for entry signals if not in position

            # Example: Simple moving average crossover
            if not in_position:
                # Entry logic
                if 'sma_fast' in df.columns and 'sma_slow' in df.columns:
                    if latest['sma_fast'] > latest['sma_slow']:
                        return {
                            'signal': 'LONG',
                            'price': current_price,
                            'stopLoss': current_price * 0.98,  # 2% stop loss
                            'takeProfit': current_price * 1.05,  # 5% take profit
                            'metadata': {
                                'in_position': True,
                                'position_type': 'LONG',
                                'entry_price': current_price,
                                'reason': 'sma_crossover'
                            }
                        }

            # No signal - hold
            return self._hold_signal(current_price, {
                'in_position': in_position,
                'reason': 'no_signal'
            })

        except Exception as e:
            # Return error as hold signal
            return {
                'signal': 'HOLD',
                'price': 0,
                'metadata': {
                    'error': str(e),
                    'error_type': type(e).__name__
                }
            }

    def _extract_parameters(self, settings: Dict[str, Any]) -> Dict[str, Any]:
        """Extract and validate strategy parameters from settings"""
        return {
            # Add your parameters here
            'lookback_period': int(settings.get('lookback_period', 100)),
            'sma_fast_period': int(settings.get('sma_fast_period', 10)),
            'sma_slow_period': int(settings.get('sma_slow_period', 30)),
            'symbol': settings.get('symbol', '{{default_pair}}'),
        }

    def _candles_to_dataframe(self, candles: List[Dict]) -> pd.DataFrame:
        """Convert candle list to pandas DataFrame"""
        if not candles:
            return pd.DataFrame()

        df = pd.DataFrame(candles)
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms', utc=True)
        df.set_index('timestamp', inplace=True)

        for col in ['open', 'high', 'low', 'close', 'volume']:
            df[col] = pd.to_numeric(df[col], errors='coerce')

        return df

    def _calculate_indicators(self, df: pd.DataFrame, params: Dict) -> pd.DataFrame:
        """Calculate technical indicators"""

        # Initialize indicator helper (works with or without pandas_ta)
        indicators = IndicatorHelper()

        # TODO: Add your indicator calculations here
        # Example: Simple Moving Averages (always available)
        df['sma_fast'] = indicators.sma(df['close'], length=params['sma_fast_period'])
        df['sma_slow'] = indicators.sma(df['close'], length=params['sma_slow_period'])

        # Add more indicators as needed (all work without pandas_ta):
        # df['rsi'] = indicators.rsi(df['close'], length=14)
        # df['ema'] = indicators.ema(df['close'], length=20)
        # df['atr'] = indicators.atr(df['high'], df['low'], df['close'], length=14)
        #
        # # Bollinger Bands (returns dict with upper, middle, lower)
        # bbands = indicators.bbands(df['close'], length=20, std=2.0)
        # df['bb_upper'] = bbands['upper']
        # df['bb_middle'] = bbands['middle']
        # df['bb_lower'] = bbands['lower']
        #
        # # MACD (returns dict with macd, signal, histogram)
        # macd = indicators.macd(df['close'], fast=12, slow=26, signal=9)
        # df['macd'] = macd['macd']
        # df['macd_signal'] = macd['signal']
        # df['macd_histogram'] = macd['histogram']
        #
        # # If pandas_ta is installed, you can use additional indicators:
        # if indicators.has_pandas_ta:
        #     df['adx'] = indicators.ta.adx(df['high'], df['low'], df['close'], length=14)
        #     df['stoch'] = indicators.ta.stoch(df['high'], df['low'], df['close'])

        return df

    def _generate_signals(self, df: pd.DataFrame, params: Dict) -> pd.DataFrame:
        """Generate buy/sell signals based on indicators"""

        # TODO: Implement your signal generation logic
        # Example: SMA crossover signals
        df['long_signal'] = df['sma_fast'] > df['sma_slow']
        df['short_signal'] = df['sma_fast'] < df['sma_slow']

        # Fill NaN with False
        df['long_signal'] = df['long_signal'].fillna(False).astype(bool)
        df['short_signal'] = df['short_signal'].fillna(False).astype(bool)

        return df

    def _hold_signal(self, price: float, metadata: Dict) -> Dict[str, Any]:
        """Return a HOLD signal with metadata"""
        return {
            'signal': 'HOLD',
            'price': float(price),
            'metadata': metadata
        }


# Create strategy instance
strategy = {{strategy_class_name}}()


def generate_signal(candles: List[Dict], settings: Dict[str, Any]) -> Dict[str, Any]:
    """
    Main entry point for SDK - called by strategy_runner.py

    Args:
        candles: List of OHLCV dictionaries
        settings: Strategy parameters and state

    Returns:
        Signal dictionary with signal, price, stopLoss, takeProfit, metadata
    """
    return strategy.generate_signal(candles, settings)
