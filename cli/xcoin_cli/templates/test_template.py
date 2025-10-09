"""
Unit tests for {{strategy_name}}

Run with: pytest tests/test_strategy.py -v
"""

import pytest
import pandas as pd
from datetime import datetime
from strategy import generate_signal, {{strategy_class_name}}


@pytest.fixture
def sample_candles():
    """Generate sample candle data for testing"""
    timestamps = [
        1633024800000 + (i * 60000) for i in range(100)
    ]  # 100 minutes of data

    candles = []
    for i, ts in enumerate(timestamps):
        candles.append({
            'timestamp': ts,
            'open': 45000.0 + (i % 10),
            'high': 45100.0 + (i % 10),
            'low': 44900.0 + (i % 10),
            'close': 45000.0 + (i % 10),
            'volume': 1000.0 + (i % 50)
        })

    return candles


@pytest.fixture
def sample_settings():
    """Sample settings/parameters"""
    return {
        'lookback_period': 50,
        'sma_fast_period': 10,
        'sma_slow_period': 30,
        'symbol': '{{default_pair}}',
    }


class TestStrategyBasics:
    """Test basic strategy functionality"""

    def test_strategy_initialization(self):
        """Test strategy can be initialized"""
        strategy = {{strategy_class_name}}()
        assert strategy.name == "{{strategy_name}}"
        assert strategy.version == "1.0.0"

    def test_generate_signal_callable(self):
        """Test generate_signal function exists and is callable"""
        assert callable(generate_signal)

    def test_generate_signal_with_empty_candles(self, sample_settings):
        """Test behavior with empty candle list"""
        result = generate_signal([], sample_settings)

        assert isinstance(result, dict)
        assert 'signal' in result
        assert result['signal'] == 'HOLD'

    def test_generate_signal_with_insufficient_data(self, sample_settings):
        """Test behavior with insufficient candles"""
        candles = [
            {
                'timestamp': 1633024800000,
                'open': 45000.0,
                'high': 45100.0,
                'low': 44900.0,
                'close': 45000.0,
                'volume': 1000.0
            }
        ]

        result = generate_signal(candles, sample_settings)

        assert isinstance(result, dict)
        assert result['signal'] == 'HOLD'
        assert 'metadata' in result
        assert result['metadata']['reason'] == 'insufficient_data'


class TestSignalGeneration:
    """Test signal generation logic"""

    def test_generate_signal_returns_correct_format(self, sample_candles, sample_settings):
        """Test signal has correct format"""
        result = generate_signal(sample_candles, sample_settings)

        assert isinstance(result, dict)
        assert 'signal' in result
        assert 'price' in result
        assert 'metadata' in result

        # Check signal is valid
        valid_signals = ['LONG', 'SHORT', 'HOLD', 'EXIT_LONG', 'EXIT_SHORT']
        assert result['signal'] in valid_signals

    def test_signal_price_is_numeric(self, sample_candles, sample_settings):
        """Test signal price is a valid number"""
        result = generate_signal(sample_candles, sample_settings)

        assert isinstance(result['price'], (int, float))
        assert result['price'] >= 0

    def test_stop_loss_take_profit_present_on_entry(self, sample_candles, sample_settings):
        """Test SL/TP are set when entering position"""
        result = generate_signal(sample_candles, sample_settings)

        if result['signal'] in ['LONG', 'SHORT']:
            # Entry signals should have SL/TP
            assert 'stopLoss' in result or 'takeProfit' in result

            if 'stopLoss' in result:
                assert isinstance(result['stopLoss'], (int, float))

            if 'takeProfit' in result:
                assert isinstance(result['takeProfit'], (int, float))


class TestStateManagement:
    """Test strategy state management"""

    def test_state_persistence_in_metadata(self, sample_candles, sample_settings):
        """Test state is stored in metadata"""
        result = generate_signal(sample_candles, sample_settings)

        assert 'metadata' in result
        assert isinstance(result['metadata'], dict)

    def test_previous_state_handling(self, sample_candles, sample_settings):
        """Test strategy handles previous state correctly"""
        # First call - no previous state
        result1 = generate_signal(sample_candles, sample_settings)

        # Second call - pass previous state
        settings_with_state = sample_settings.copy()
        settings_with_state['previous_state'] = result1['metadata']

        result2 = generate_signal(sample_candles, settings_with_state)

        assert isinstance(result2, dict)
        assert 'signal' in result2


class TestParameterHandling:
    """Test parameter extraction and validation"""

    def test_default_parameters(self, sample_candles):
        """Test strategy works with minimal parameters"""
        minimal_settings = {'symbol': '{{default_pair}}'}
        result = generate_signal(sample_candles, minimal_settings)

        assert isinstance(result, dict)

    def test_custom_parameters(self, sample_candles):
        """Test strategy respects custom parameters"""
        custom_settings = {
            'lookback_period': 200,
            'sma_fast_period': 5,
            'sma_slow_period': 20,
            'symbol': 'B-BTC_USDT'
        }

        result = generate_signal(sample_candles, custom_settings)

        assert isinstance(result, dict)


class TestErrorHandling:
    """Test error handling"""

    def test_malformed_candle_data(self, sample_settings):
        """Test handling of malformed candle data"""
        bad_candles = [
            {'timestamp': 'invalid', 'close': 'bad'}
        ]

        result = generate_signal(bad_candles, sample_settings)

        # Should return HOLD with error info
        assert result['signal'] == 'HOLD'
        assert 'metadata' in result

    def test_missing_required_fields(self, sample_candles):
        """Test handling of missing settings"""
        empty_settings = {}

        result = generate_signal(sample_candles, empty_settings)

        # Should handle gracefully
        assert isinstance(result, dict)
        assert 'signal' in result


# TODO: Add strategy-specific tests here
class TestStrategyLogic:
    """Test strategy-specific logic"""

    @pytest.mark.skip(reason="Implement after strategy logic is complete")
    def test_long_entry_conditions(self):
        """Test long entry conditions"""
        pass

    @pytest.mark.skip(reason="Implement after strategy logic is complete")
    def test_short_entry_conditions(self):
        """Test short entry conditions"""
        pass

    @pytest.mark.skip(reason="Implement after strategy logic is complete")
    def test_exit_conditions(self):
        """Test exit conditions"""
        pass


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
