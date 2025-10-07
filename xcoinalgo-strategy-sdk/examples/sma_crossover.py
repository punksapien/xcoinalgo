"""
Simple Moving Average (SMA) Crossover Strategy

A classic momentum strategy that generates buy signals when a fast SMA crosses above
a slow SMA, and sell signals when the fast SMA crosses below the slow SMA.

Strategy Logic:
- Buy when SMA(20) crosses above SMA(50) (golden cross)
- Sell when SMA(20) crosses below SMA(50) (death cross)
- Use 2% stop loss and 4% take profit
"""

from xcoinalgo import BaseStrategy
import pandas as pd


class SMACrossoverStrategy(BaseStrategy):
    """
    SMA Crossover Strategy implementation.
    """

    def __init__(self, fast_period: int = 20, slow_period: int = 50):
        """
        Initialize the strategy.

        Args:
            fast_period: Period for fast SMA (default: 20)
            slow_period: Period for slow SMA (default: 50)
        """
        super().__init__()
        self.name = "SMA Crossover"
        self.version = "1.0.0"
        self.description = "Golden cross / death cross strategy using SMA"
        self.author = "XcoinAlgo Team"

        self.fast_period = fast_period
        self.slow_period = slow_period

    def on_data(self, data: pd.DataFrame) -> dict:
        """
        Generate trading signals based on SMA crossover.

        Args:
            data: Historical OHLCV data

        Returns:
            Trading signal dictionary
        """
        # Need enough data for slow SMA
        if len(data) < self.slow_period + 1:
            return {"action": "HOLD"}

        # Calculate SMAs
        data['SMA_fast'] = data['close'].rolling(window=self.fast_period).mean()
        data['SMA_slow'] = data['close'].rolling(window=self.slow_period).mean()

        # Get current and previous values
        current_fast = data['SMA_fast'].iloc[-1]
        current_slow = data['SMA_slow'].iloc[-1]
        prev_fast = data['SMA_fast'].iloc[-2]
        prev_slow = data['SMA_slow'].iloc[-2]

        # Skip if SMAs are not calculated yet
        if pd.isna(current_fast) or pd.isna(current_slow):
            return {"action": "HOLD"}

        current_price = data['close'].iloc[-1]

        # Golden cross: Fast SMA crosses above Slow SMA (BUY signal)
        if prev_fast <= prev_slow and current_fast > current_slow:
            return {
                "action": "BUY",
                "entryPrice": current_price,
                "stopLoss": current_price * 0.98,      # 2% stop loss
                "takeProfit": current_price * 1.04,    # 4% take profit
                "confidence": 0.7,
                "metadata": {
                    "fast_sma": current_fast,
                    "slow_sma": current_slow,
                    "crossover": "golden"
                }
            }

        # Death cross: Fast SMA crosses below Slow SMA (SELL signal)
        elif prev_fast >= prev_slow and current_fast < current_slow:
            return {
                "action": "SELL",
                "entryPrice": current_price,
                "stopLoss": current_price * 1.02,      # 2% stop loss
                "takeProfit": current_price * 0.96,    # 4% take profit
                "confidence": 0.7,
                "metadata": {
                    "fast_sma": current_fast,
                    "slow_sma": current_slow,
                    "crossover": "death"
                }
            }

        # No crossover - hold
        return {"action": "HOLD"}


# Example usage
if __name__ == "__main__":
    # This is how you would test the strategy locally
    from xcoinalgo import StrategyTester
    import numpy as np

    # Create sample data
    dates = pd.date_range(start='2024-01-01', periods=200, freq='5min')
    sample_data = pd.DataFrame({
        'timestamp': [int(d.timestamp()) for d in dates],
        'open': np.random.randn(200).cumsum() + 100,
        'high': np.random.randn(200).cumsum() + 101,
        'low': np.random.randn(200).cumsum() + 99,
        'close': np.random.randn(200).cumsum() + 100,
        'volume': np.random.randint(1000, 10000, 200)
    })

    # Create and test strategy
    strategy = SMACrossoverStrategy(fast_period=20, slow_period=50)
    tester = StrategyTester(strategy)

    # Validate strategy
    is_valid, issues = tester.validate()
    if is_valid:
        print("✓ Strategy is valid")
    else:
        print("✗ Strategy has issues:")
        for issue in issues:
            print(f"  - {issue}")

    # Run backtest
    print("\nRunning backtest...")
    result = tester.backtest(sample_data, initial_capital=10000, risk_per_trade=0.02)

    print(f"\nBacktest Results:")
    print(f"  Total Trades: {result.totalTrades}")
    print(f"  Winning Trades: {result.winningTrades}")
    print(f"  Losing Trades: {result.losingTrades}")
    print(f"  Win Rate: {result.winRate:.2%}")
    print(f"  Total P&L: ${result.totalPnl:.2f}")
    print(f"  Max Drawdown: {result.maxDrawdown:.2f}%")
    print(f"  Period: {result.startDate.date()} to {result.endDate.date()}")
