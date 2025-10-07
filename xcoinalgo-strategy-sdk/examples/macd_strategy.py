"""
MACD (Moving Average Convergence Divergence) Strategy

This strategy uses MACD histogram crossovers to identify trend changes:
- BUY when MACD histogram crosses above zero (bullish momentum)
- SELL when MACD histogram crosses below zero (bearish momentum)
- Stop loss at 2% from entry
- Take profit at 4% from entry

Strategy Logic:
- MACD Line = EMA(12) - EMA(26)
- Signal Line = EMA(9) of MACD Line
- Histogram = MACD Line - Signal Line
- Bullish crossover: Histogram crosses from negative to positive
- Bearish crossover: Histogram crosses from positive to negative
"""

from xcoinalgo import BaseStrategy
import pandas as pd


class MACDStrategy(BaseStrategy):
    """
    MACD-based trend following strategy.
    """

    def __init__(
        self,
        fast_period: int = 12,
        slow_period: int = 26,
        signal_period: int = 9
    ):
        """
        Initialize the MACD strategy.

        Args:
            fast_period: Period for fast EMA (default: 12)
            slow_period: Period for slow EMA (default: 26)
            signal_period: Period for signal line EMA (default: 9)
        """
        super().__init__()
        self.name = "MACD Trend Following"
        self.version = "1.0.0"
        self.description = "Trend following strategy using MACD indicator"
        self.author = "XcoinAlgo Team"

        self.fast_period = fast_period
        self.slow_period = slow_period
        self.signal_period = signal_period

    def calculate_macd(self, data: pd.DataFrame):
        """
        Calculate MACD indicator.

        Args:
            data: Historical OHLCV data

        Returns:
            tuple: (macd_line, signal_line, histogram)
        """
        # Calculate EMAs
        ema_fast = data['close'].ewm(span=self.fast_period, adjust=False).mean()
        ema_slow = data['close'].ewm(span=self.slow_period, adjust=False).mean()

        # MACD line = difference between fast and slow EMAs
        macd_line = ema_fast - ema_slow

        # Signal line = EMA of MACD line
        signal_line = macd_line.ewm(span=self.signal_period, adjust=False).mean()

        # Histogram = difference between MACD and signal
        histogram = macd_line - signal_line

        return macd_line, signal_line, histogram

    def on_data(self, data: pd.DataFrame) -> dict:
        """
        Generate trading signal based on MACD.

        Args:
            data: Historical OHLCV data

        Returns:
            Trading signal dictionary
        """
        # Calculate MACD
        macd_line, signal_line, histogram = self.calculate_macd(data)

        # Check if we have enough data
        min_length = self.slow_period + self.signal_period + 1
        if len(data) < min_length:
            return {"action": "HOLD"}

        # Get current and previous histogram values
        current_hist = histogram.iloc[-1]
        prev_hist = histogram.iloc[-2]
        current_price = data['close'].iloc[-1]

        # Check for NaN
        if pd.isna(current_hist) or pd.isna(prev_hist):
            return {"action": "HOLD"}

        # Get MACD and signal line values for metadata
        current_macd = macd_line.iloc[-1]
        current_signal = signal_line.iloc[-1]

        # Bullish crossover - Histogram crosses from negative to positive
        # This indicates bullish momentum
        if prev_hist <= 0 and current_hist > 0:
            # Calculate confidence based on histogram strength
            confidence = min(0.9, 0.65 + abs(current_hist) * 0.0001)

            return {
                "action": "BUY",
                "entryPrice": current_price,
                "stopLoss": current_price * 0.98,  # 2% stop loss
                "takeProfit": current_price * 1.04,  # 4% take profit
                "confidence": confidence,
                "metadata": {
                    "macd": round(current_macd, 2),
                    "signal": round(current_signal, 2),
                    "histogram": round(current_hist, 2),
                    "signal_type": "bullish_crossover"
                }
            }

        # Bearish crossover - Histogram crosses from positive to negative
        # This indicates bearish momentum
        elif prev_hist >= 0 and current_hist < 0:
            # Calculate confidence based on histogram strength
            confidence = min(0.9, 0.65 + abs(current_hist) * 0.0001)

            return {
                "action": "SELL",
                "entryPrice": current_price,
                "stopLoss": current_price * 1.02,  # 2% stop loss
                "takeProfit": current_price * 0.96,  # 4% take profit
                "confidence": confidence,
                "metadata": {
                    "macd": round(current_macd, 2),
                    "signal": round(current_signal, 2),
                    "histogram": round(current_hist, 2),
                    "signal_type": "bearish_crossover"
                }
            }

        # No crossover, hold position
        return {"action": "HOLD"}


class MACDWithTrendFilter(BaseStrategy):
    """
    Enhanced MACD strategy with trend filter using 200-period SMA.

    Only takes signals in the direction of the overall trend:
    - BUY signals only when price > SMA(200) (uptrend)
    - SELL signals only when price < SMA(200) (downtrend)
    """

    def __init__(
        self,
        fast_period: int = 12,
        slow_period: int = 26,
        signal_period: int = 9,
        trend_period: int = 200
    ):
        """
        Initialize the enhanced MACD strategy.

        Args:
            fast_period: Period for fast EMA (default: 12)
            slow_period: Period for slow EMA (default: 26)
            signal_period: Period for signal line EMA (default: 9)
            trend_period: Period for trend filter SMA (default: 200)
        """
        super().__init__()
        self.name = "MACD with Trend Filter"
        self.version = "1.0.0"
        self.description = "MACD strategy with 200-SMA trend filter"
        self.author = "XcoinAlgo Team"

        self.fast_period = fast_period
        self.slow_period = slow_period
        self.signal_period = signal_period
        self.trend_period = trend_period

    def calculate_macd(self, data: pd.DataFrame):
        """Calculate MACD indicator."""
        ema_fast = data['close'].ewm(span=self.fast_period, adjust=False).mean()
        ema_slow = data['close'].ewm(span=self.slow_period, adjust=False).mean()
        macd_line = ema_fast - ema_slow
        signal_line = macd_line.ewm(span=self.signal_period, adjust=False).mean()
        histogram = macd_line - signal_line
        return macd_line, signal_line, histogram

    def on_data(self, data: pd.DataFrame) -> dict:
        """
        Generate trading signal based on MACD with trend filter.

        Args:
            data: Historical OHLCV data

        Returns:
            Trading signal dictionary
        """
        # Calculate MACD
        macd_line, signal_line, histogram = self.calculate_macd(data)

        # Calculate trend filter
        data['SMA_trend'] = data['close'].rolling(window=self.trend_period).mean()

        # Check if we have enough data
        min_length = max(self.slow_period + self.signal_period, self.trend_period) + 1
        if len(data) < min_length:
            return {"action": "HOLD"}

        # Get values
        current_hist = histogram.iloc[-1]
        prev_hist = histogram.iloc[-2]
        current_price = data['close'].iloc[-1]
        trend_sma = data['SMA_trend'].iloc[-1]

        # Check for NaN
        if pd.isna(current_hist) or pd.isna(prev_hist) or pd.isna(trend_sma):
            return {"action": "HOLD"}

        # Determine trend
        in_uptrend = current_price > trend_sma
        in_downtrend = current_price < trend_sma

        # Bullish crossover + uptrend
        if prev_hist <= 0 and current_hist > 0 and in_uptrend:
            confidence = min(0.9, 0.7 + abs(current_hist) * 0.0001)

            return {
                "action": "BUY",
                "entryPrice": current_price,
                "stopLoss": current_price * 0.98,
                "takeProfit": current_price * 1.04,
                "confidence": confidence,
                "metadata": {
                    "histogram": round(current_hist, 2),
                    "signal_type": "bullish_crossover_with_trend",
                    "trend": "bullish",
                    "price_vs_sma": f"+{((current_price/trend_sma - 1) * 100):.2f}%"
                }
            }

        # Bearish crossover + downtrend
        elif prev_hist >= 0 and current_hist < 0 and in_downtrend:
            confidence = min(0.9, 0.7 + abs(current_hist) * 0.0001)

            return {
                "action": "SELL",
                "entryPrice": current_price,
                "stopLoss": current_price * 1.02,
                "takeProfit": current_price * 0.96,
                "confidence": confidence,
                "metadata": {
                    "histogram": round(current_hist, 2),
                    "signal_type": "bearish_crossover_with_trend",
                    "trend": "bearish",
                    "price_vs_sma": f"{((current_price/trend_sma - 1) * 100):.2f}%"
                }
            }

        return {"action": "HOLD"}


if __name__ == "__main__":
    """
    Example usage and local testing.
    """
    from xcoinalgo import StrategyTester
    import numpy as np

    # Create sample data with trending movements
    dates = pd.date_range(start='2024-01-01', periods=500, freq='5min')
    np.random.seed(42)

    # Simulate trending price (better for MACD testing)
    trend = np.linspace(44000, 47000, 500)
    cycles = 300 * np.sin(np.linspace(0, 6 * np.pi, 500))
    noise = np.random.normal(0, 50, 500)
    prices = trend + cycles + noise

    sample_data = pd.DataFrame({
        'timestamp': [int(d.timestamp()) for d in dates],
        'open': prices,
        'high': prices * 1.01,
        'low': prices * 0.99,
        'close': prices,
        'volume': np.random.uniform(100, 1000, 500)
    })

    print("="*60)
    print("Testing Basic MACD Strategy")
    print("="*60)

    # Test basic MACD strategy
    strategy1 = MACDStrategy(fast_period=12, slow_period=26, signal_period=9)
    tester1 = StrategyTester(strategy1)

    is_valid, issues = tester1.validate()
    print(f"\nStrategy: {strategy1.name} v{strategy1.version}")
    print(f"Valid: {is_valid}")

    if is_valid:
        result1 = tester1.backtest(sample_data, initial_capital=10000, risk_per_trade=0.02)

        print(f"\nBacktest Results:")
        print(f"  Total Trades: {result1.totalTrades}")
        print(f"  Win Rate: {result1.winRate:.2%}")
        print(f"  Total P&L: ${result1.totalPnl:.2f}")
        print(f"  Max Drawdown: {result1.maxDrawdown:.2f}%")

    print("\n" + "="*60)
    print("Testing MACD with Trend Filter")
    print("="*60)

    # Test enhanced MACD strategy with trend filter
    strategy2 = MACDWithTrendFilter(
        fast_period=12,
        slow_period=26,
        signal_period=9,
        trend_period=200
    )
    tester2 = StrategyTester(strategy2)

    is_valid, issues = tester2.validate()
    print(f"\nStrategy: {strategy2.name} v{strategy2.version}")
    print(f"Valid: {is_valid}")

    if is_valid:
        result2 = tester2.backtest(sample_data, initial_capital=10000, risk_per_trade=0.02)

        print(f"\nBacktest Results:")
        print(f"  Total Trades: {result2.totalTrades}")
        print(f"  Win Rate: {result2.winRate:.2%}")
        print(f"  Total P&L: ${result2.totalPnl:.2f}")
        print(f"  Max Drawdown: {result2.maxDrawdown:.2f}%")

        print(f"\nComparison:")
        print(f"  Basic MACD P&L: ${result1.totalPnl:.2f}")
        print(f"  With Trend Filter P&L: ${result2.totalPnl:.2f}")
        print(f"  Difference: ${result2.totalPnl - result1.totalPnl:.2f}")
