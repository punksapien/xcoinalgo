"""
CDCX 50 V1 Strategy - Refactored using CoinDCX SDK

This is the original cdcx_50_v1.py strategy converted to use the new SDK framework.
Demonstrates how to migrate existing strategies to the standardized format.
"""

import pandas as pd
import numpy as np
from typing import Dict, Any

from coindcx_sdk import BaseStrategy, StrategyConfig, SignalType


class CDCX50V1Strategy(BaseStrategy):
    """
    CDCX 50 Bot V1 strategy using the new SDK framework.

    Advanced multi-indicator strategy combining Supertrend, MACD, Bollinger Bands,
    RSI, and MFI for Bitcoin futures trading.
    """

    def initialize(self) -> None:
        """Initialize strategy parameters and custom attributes."""
        # Technical indicator parameters (from original strategy)
        self.supertrend_period = 10
        self.supertrend_multiplier = 3.0

        self.macd_fast = 12
        self.macd_slow = 26
        self.macd_signal = 9

        self.bb_period = 20
        self.bb_std = 2.0

        self.rsi_period = 14
        self.mfi_period = 14
        self.atr_period = 14

        # Signal thresholds
        self.rsi_oversold = 35
        self.rsi_overbought = 65
        self.mfi_oversold = 35
        self.mfi_overbought = 65

        # Volatility filter
        self.bb_zscore_threshold = 0.5
        self.atr_filter_period = 20

        # State tracking
        self.custom_attributes['last_signal_time'] = None
        self.custom_attributes['signal_cooldown_bars'] = 5
        self.custom_attributes['bars_since_last_signal'] = 0

        self.logger.info(f"Initialized {self.config.name} strategy")

    def calculate_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """Calculate all required technical indicators."""
        # Use the SDK's TechnicalIndicators to calculate everything we need
        result_df = self.indicators.calculate_all_indicators(df)

        # Add custom indicators specific to this strategy
        result_df['bb_zscore'] = self.indicators.zscore(result_df['bb_width'], 20)

        # ATR filter (price volatility should be above average)
        result_df['atr_filter'] = result_df['atr'] > result_df['atr'].rolling(self.atr_filter_period).mean()

        return result_df

    def generate_signals(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Generate trading signals based on the original CDCX 50 V1 logic.

        Original signal logic:
        - LONG: trend_up AND ((macd_hist > 0) OR (close < bb_low AND rsi < 35)) AND mfi < 35 AND bb_zscore > 0.5 AND atr_filter
        - SHORT: NOT trend_up AND ((macd_hist < 0) OR (close > bb_high AND rsi > 65)) AND mfi > 65 AND bb_zscore > 0.5 AND atr_filter
        """
        if len(df) < max(self.supertrend_period, self.macd_slow, self.bb_period, self.rsi_period):
            return {'signal': SignalType.HOLD, 'confidence': 0.0}

        # Get the latest data point
        latest = df.iloc[-1]

        # Check signal cooldown
        if self.custom_attributes['bars_since_last_signal'] < self.custom_attributes['signal_cooldown_bars']:
            self.custom_attributes['bars_since_last_signal'] += 1
            return {'signal': SignalType.HOLD, 'confidence': 0.0, 'metadata': {'reason': 'signal_cooldown'}}

        # Basic signal conditions
        trend_up = latest['trend_up']
        macd_hist = latest['macd_histogram']
        close = latest['close']
        bb_low = latest['bb_lower']
        bb_high = latest['bb_upper']
        rsi = latest['rsi']
        mfi = latest['mfi']
        bb_zscore = latest['bb_zscore']
        atr_filter = latest['atr_filter']

        # Long signal conditions
        long_trend_condition = trend_up
        long_momentum_condition = (macd_hist > 0) or (close < bb_low and rsi < self.rsi_oversold)
        long_money_flow_condition = mfi < self.mfi_oversold
        long_volatility_condition = bb_zscore > self.bb_zscore_threshold
        long_atr_condition = atr_filter

        # Short signal conditions
        short_trend_condition = not trend_up
        short_momentum_condition = (macd_hist < 0) or (close > bb_high and rsi > self.rsi_overbought)
        short_money_flow_condition = mfi > self.mfi_overbought
        short_volatility_condition = bb_zscore > self.bb_zscore_threshold
        short_atr_condition = atr_filter

        # Calculate confidence scores based on how many conditions are met
        long_conditions = [
            long_trend_condition,
            long_momentum_condition,
            long_money_flow_condition,
            long_volatility_condition,
            long_atr_condition
        ]

        short_conditions = [
            short_trend_condition,
            short_momentum_condition,
            short_money_flow_condition,
            short_volatility_condition,
            short_atr_condition
        ]

        long_score = sum(long_conditions) / len(long_conditions)
        short_score = sum(short_conditions) / len(short_conditions)

        # Generate signals
        if all(long_conditions):
            self.custom_attributes['bars_since_last_signal'] = 0
            return {
                'signal': SignalType.LONG,
                'confidence': long_score,
                'metadata': {
                    'reason': 'all_long_conditions_met',
                    'trend_up': trend_up,
                    'macd_hist': macd_hist,
                    'rsi': rsi,
                    'mfi': mfi,
                    'bb_zscore': bb_zscore
                }
            }

        elif all(short_conditions):
            self.custom_attributes['bars_since_last_signal'] = 0
            return {
                'signal': SignalType.SHORT,
                'confidence': short_score,
                'metadata': {
                    'reason': 'all_short_conditions_met',
                    'trend_up': trend_up,
                    'macd_hist': macd_hist,
                    'rsi': rsi,
                    'mfi': mfi,
                    'bb_zscore': bb_zscore
                }
            }

        # Exit conditions (from original strategy)
        if self.current_position != self.current_position.FLAT:
            exit_signal = self._check_exit_conditions(df)
            if exit_signal:
                return exit_signal

        return {
            'signal': SignalType.HOLD,
            'confidence': max(long_score, short_score) * 0.5,  # Reduced confidence for hold
            'metadata': {
                'reason': 'conditions_not_met',
                'long_score': long_score,
                'short_score': short_score
            }
        }

    def _check_exit_conditions(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Check exit conditions for current position.

        Original exit logic:
        - Exit long if short signal OR stop loss/take profit
        - Exit short if long signal OR stop loss/take profit
        """
        latest = df.iloc[-1]

        # Get ATR for stop loss calculation
        atr_value = latest['atr']
        current_price = latest['close']

        # Calculate stop loss and take profit levels
        if self.entry_price > 0 and atr_value > 0:
            if self.current_position == self.current_position.LONG:
                stop_loss = self.entry_price - (atr_value * self.config.sl_atr_multiplier)
                take_profit = self.entry_price + (atr_value * self.config.tp_atr_multiplier)

                # Check stop loss/take profit
                if current_price <= stop_loss:
                    return {
                        'signal': SignalType.CLOSE_LONG,
                        'confidence': 1.0,
                        'metadata': {'reason': 'stop_loss', 'price': current_price, 'stop_loss': stop_loss}
                    }
                elif current_price >= take_profit:
                    return {
                        'signal': SignalType.CLOSE_LONG,
                        'confidence': 1.0,
                        'metadata': {'reason': 'take_profit', 'price': current_price, 'take_profit': take_profit}
                    }

                # Check opposite signal
                elif latest.get('short_signal', False):
                    return {
                        'signal': SignalType.CLOSE_LONG,
                        'confidence': 0.8,
                        'metadata': {'reason': 'opposite_signal'}
                    }

            elif self.current_position == self.current_position.SHORT:
                stop_loss = self.entry_price + (atr_value * self.config.sl_atr_multiplier)
                take_profit = self.entry_price - (atr_value * self.config.tp_atr_multiplier)

                # Check stop loss/take profit
                if current_price >= stop_loss:
                    return {
                        'signal': SignalType.CLOSE_SHORT,
                        'confidence': 1.0,
                        'metadata': {'reason': 'stop_loss', 'price': current_price, 'stop_loss': stop_loss}
                    }
                elif current_price <= take_profit:
                    return {
                        'signal': SignalType.CLOSE_SHORT,
                        'confidence': 1.0,
                        'metadata': {'reason': 'take_profit', 'price': current_price, 'take_profit': take_profit}
                    }

                # Check opposite signal
                elif latest.get('long_signal', False):
                    return {
                        'signal': SignalType.CLOSE_SHORT,
                        'confidence': 0.8,
                        'metadata': {'reason': 'opposite_signal'}
                    }

        return None

    def on_trade(self, trade_data: Dict[str, Any]) -> None:
        """Handle trade execution events."""
        self.logger.info(f"Trade executed: {trade_data}")

        # Update custom tracking
        if 'pnl' in trade_data:
            pnl = trade_data['pnl']
            self.logger.info(f"Trade P&L: ${pnl:.2f}")

    def on_tick(self, tick_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process real-time tick data (optional)."""
        # Could implement tick-based logic here if needed
        # For now, we'll rely on bar-based signals
        return None


def create_strategy() -> CDCX50V1Strategy:
    """Create and configure the CDCX 50 V1 strategy."""

    # Load configuration (this would typically come from a config file)
    config = StrategyConfig(
        name="CDCX 50 Bot V1 - Bitcoin",
        code="CDCX_50_V1_BTC",
        description="Advanced multi-indicator strategy combining Supertrend, MACD, Bollinger Bands, RSI, and MFI for Bitcoin futures trading",
        author="CoinDCX Quant Team",
        version="1.0.0",
        tags=["momentum", "reversal", "futures", "multi-timeframe", "high-frequency"],

        # Trading parameters
        leverage=10,
        risk_per_trade=0.005,
        margin_currency="USDT",
        pair="B-BTC_USDT",

        # Technical parameters
        resolution="5",
        lookback_period=200,

        # Risk management
        sl_atr_multiplier=2.7,
        tp_atr_multiplier=2.8,
        max_positions=1,
        max_daily_loss=0.05,

        # Environment
        environment="production"
    )

    # Create strategy instance
    strategy = CDCX50V1Strategy(config)

    return strategy


if __name__ == "__main__":
    # Example usage
    from coindcx_sdk import BacktestEngine
    import pandas as pd

    # Create strategy
    strategy = create_strategy()

    # Example: Load some test data (you would load real market data)
    # This is just for demonstration
    test_data = pd.DataFrame({
        'timestamp': pd.date_range('2024-01-01', periods=100, freq='5T'),
        'open': np.random.randn(100).cumsum() + 50000,
        'high': np.random.randn(100).cumsum() + 50100,
        'low': np.random.randn(100).cumsum() + 49900,
        'close': np.random.randn(100).cumsum() + 50000,
        'volume': np.random.randint(1000, 10000, 100)
    })

    # Run backtest
    backtest_engine = BacktestEngine(strategy, initial_balance=10000.0)
    results = backtest_engine.run_backtest(test_data)

    print("Backtest Results:")
    print(f"Total Return: {results['summary']['total_return_pct']:.2f}%")
    print(f"Max Drawdown: {results['summary']['max_drawdown_pct']:.2f}%")
    print(f"Total Trades: {results['performance_metrics']['total_trades']}")
    print(f"Win Rate: {results['performance_metrics']['win_rate']:.2f}%")