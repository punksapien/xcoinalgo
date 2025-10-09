"""
{{strategy_name}}

{{description}}

Author: {{author_name}} <{{author_email}}>
Created: {{creation_date}}
Version: 1.0.0
"""

import pandas as pd
import pandas_ta as ta
import numpy as np
from datetime import datetime
from typing import Dict, Any, List, Optional


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

        # TODO: Add your indicator calculations here
        # Example: Simple Moving Averages
        df['sma_fast'] = ta.sma(df['close'], length=params['sma_fast_period'])
        df['sma_slow'] = ta.sma(df['close'], length=params['sma_slow_period'])

        # Add more indicators as needed
        # df['rsi'] = ta.rsi(df['close'], length=14)
        # df['atr'] = ta.atr(df['high'], df['low'], df['close'], length=14)
        # df.ta.bbands(length=20, std=2, append=True)

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
