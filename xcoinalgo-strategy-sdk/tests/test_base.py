"""
Unit tests for BaseStrategy and models
"""

import pytest
import pandas as pd
import numpy as np
from xcoinalgo import BaseStrategy, StrategyTester, StrategyValidator, Signal


class SimpleTestStrategy(BaseStrategy):
    """Simple strategy for testing"""

    def __init__(self):
        super().__init__()
        self.name = "Test Strategy"
        self.version = "1.0.0"

    def on_data(self, data: pd.DataFrame) -> dict:
        if len(data) < 10:
            return {"action": "HOLD"}

        if data['close'].iloc[-1] > 100:
            return {
                "action": "BUY",
                "entryPrice": data['close'].iloc[-1],
                "stopLoss": data['close'].iloc[-1] * 0.98,
                "takeProfit": data['close'].iloc[-1] * 1.05
            }

        return {"action": "HOLD"}


def create_sample_data(n=100):
    """Create sample OHLCV data for testing"""
    dates = pd.date_range(start='2024-01-01', periods=n, freq='5min')
    prices = np.random.randn(n).cumsum() + 100

    return pd.DataFrame({
        'timestamp': [int(d.timestamp()) for d in dates],
        'open': prices,
        'high': prices + np.abs(np.random.randn(n)),
        'low': prices - np.abs(np.random.randn(n)),
        'close': prices,
        'volume': np.random.randint(1000, 10000, n)
    })


def test_strategy_inheritance():
    """Test that strategy inherits from BaseStrategy"""
    strategy = SimpleTestStrategy()
    assert isinstance(strategy, BaseStrategy)
    assert strategy.name == "Test Strategy"
    assert strategy.version == "1.0.0"


def test_strategy_on_data():
    """Test that on_data returns valid signal"""
    strategy = SimpleTestStrategy()
    data = create_sample_data()

    signal = strategy.on_data(data)

    assert isinstance(signal, dict)
    assert "action" in signal
    assert signal["action"] in ["BUY", "SELL", "HOLD"]


def test_strategy_validator():
    """Test strategy validation"""
    strategy = SimpleTestStrategy()
    is_valid, issues = StrategyValidator.validate_strategy(strategy)

    assert is_valid
    assert len(issues) == 0


def test_signal_validation():
    """Test signal format validation"""
    # Valid signal
    valid_signal = {"action": "BUY"}
    is_valid, error = StrategyValidator.validate_signal(valid_signal)
    assert is_valid
    assert error is None

    # Invalid action
    invalid_signal = {"action": "INVALID"}
    is_valid, error = StrategyValidator.validate_signal(invalid_signal)
    assert not is_valid

    # Missing action
    invalid_signal = {}
    is_valid, error = StrategyValidator.validate_signal(invalid_signal)
    assert not is_valid


def test_signal_with_prices():
    """Test signal with entry, stop loss, take profit"""
    signal = {
        "action": "BUY",
        "entryPrice": 100,
        "stopLoss": 98,
        "takeProfit": 105
    }

    is_valid, error = StrategyValidator.validate_signal(signal)
    assert is_valid


def test_strategy_tester():
    """Test strategy tester"""
    strategy = SimpleTestStrategy()
    tester = StrategyTester(strategy)
    data = create_sample_data()

    # Test validation
    is_valid, issues = tester.validate()
    assert is_valid

    # Test single run
    signal, is_valid, error = tester.run_single(data)
    assert is_valid
    assert signal["action"] in ["BUY", "SELL", "HOLD"]


def test_backtest():
    """Test backtesting"""
    strategy = SimpleTestStrategy()
    tester = StrategyTester(strategy)
    data = create_sample_data(200)

    result = tester.backtest(data, initial_capital=10000, risk_per_trade=0.02)

    assert result.totalTrades >= 0
    assert result.winningTrades >= 0
    assert result.losingTrades >= 0
    assert result.winRate >= 0.0 and result.winRate <= 1.0
    assert isinstance(result.totalPnl, float)
    assert result.maxDrawdown >= 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
