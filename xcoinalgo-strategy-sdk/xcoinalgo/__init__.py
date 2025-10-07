"""
XcoinAlgo Strategy SDK

A Python SDK for developing algorithmic trading strategies for the XcoinAlgo platform.

Usage:
    from xcoinalgo import BaseStrategy, StrategyTester

    class MyStrategy(BaseStrategy):
        def on_data(self, data):
            # Your strategy logic here
            return {"action": "HOLD"}

    # Test locally
    strategy = MyStrategy()
    tester = StrategyTester(strategy)
    result = tester.backtest(historical_data)
"""

__version__ = "1.0.0"
__author__ = "XcoinAlgo Team"

from .base import BaseStrategy
from .models import Signal, StrategyConfig, BacktestResult, Trade
from .testing import StrategyTester, StrategyValidator, validate_strategy_file

__all__ = [
    "BaseStrategy",
    "Signal",
    "StrategyConfig",
    "BacktestResult",
    "Trade",
    "StrategyTester",
    "StrategyValidator",
    "validate_strategy_file",
]
