#!/usr/bin/env python3
"""
Test suite for batch_backtest.py
Tests the execute_trades pattern and STRATEGY_CONFIG reading
"""

import sys
import json
import unittest
from unittest.mock import patch, MagicMock
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

# Import the module we're testing
from batch_backtest import BatchBacktestRunner


class TestBatchBacktestRunner(unittest.TestCase):
    """Test the BatchBacktestRunner class"""

    def setUp(self):
        """Set up test fixtures"""
        self.config = {
            'initial_capital': 100,  # This should be used, not 10000
            'risk_per_trade': 0.1,
            'leverage': 25,
            'commission': 0.0004
        }
        self.runner = BatchBacktestRunner(self.config)

    def test_config_values_used(self):
        """Test that config values are used instead of defaults"""
        self.assertEqual(self.runner.initial_capital, 100)
        self.assertEqual(self.runner.leverage, 25)
        self.assertEqual(self.runner.risk_per_trade, 0.1)

    def test_get_custom_backtest_finds_execute_trades(self):
        """Test that _get_custom_backtest detects execute_trades pattern"""
        # Create a mock Backtester class with execute_trades method
        class MockBacktester:
            def __init__(self, config):
                self.config = config

            @staticmethod
            def execute_trades(df, initial_capital, leverage, commission_rate, gst_rate, risk_per_trade, **kwargs):
                return pd.DataFrame()

        exec_scope = {'Backtester': MockBacktester}
        result = self.runner._get_custom_backtest(exec_scope)

        # Should return tuple marker for execute_trades pattern
        self.assertIsInstance(result, tuple)
        self.assertEqual(result[0], 'execute_trades')
        self.assertEqual(result[1], MockBacktester)

    def test_get_custom_backtest_finds_run_method(self):
        """Test that _get_custom_backtest detects run() pattern"""
        class MockBacktester:
            @staticmethod
            def run(df, config):
                return {'trades': [], 'metrics': {}, 'equity_curve': []}

        exec_scope = {'Backtester': MockBacktester}
        result = self.runner._get_custom_backtest(exec_scope)

        # Should return a callable wrapper
        self.assertTrue(callable(result))

    def test_get_custom_backtest_returns_none_for_generate_signal(self):
        """Test that strategies with only generate_signal return None"""
        def generate_signal(candles, settings):
            return {'signal': 'HOLD'}

        exec_scope = {'generate_signal': generate_signal}
        result = self.runner._get_custom_backtest(exec_scope)

        self.assertIsNone(result)

    def test_calculate_metrics_from_trades(self):
        """Test metrics calculation from trade list"""
        trades = [
            {'pnl': 10, 'entry_time': 1, 'exit_time': 2},
            {'pnl': -5, 'entry_time': 3, 'exit_time': 4},
            {'pnl': 15, 'entry_time': 5, 'exit_time': 6},
            {'pnl': -3, 'entry_time': 7, 'exit_time': 8},
        ]

        metrics = self.runner._calculate_metrics_from_trades(trades, 100)

        self.assertEqual(metrics['totalTrades'], 4)
        self.assertEqual(metrics['winningTrades'], 2)
        self.assertEqual(metrics['losingTrades'], 2)
        self.assertEqual(metrics['winRate'], 50.0)
        self.assertEqual(metrics['totalPnl'], 17)  # 10-5+15-3
        self.assertEqual(metrics['totalPnlPct'], 17.0)  # 17/100 * 100
        self.assertEqual(metrics['finalCapital'], 117)  # 100 + 17

    def test_calculate_metrics_empty_trades(self):
        """Test metrics calculation with no trades"""
        metrics = self.runner._calculate_metrics_from_trades([], 100)

        self.assertEqual(metrics['totalTrades'], 0)
        self.assertEqual(metrics['winRate'], 0)
        self.assertEqual(metrics['finalCapital'], 100)

    def test_format_trades_for_output(self):
        """Test trade formatting"""
        trades = [
            {
                'entry_time': 1000,
                'exit_time': 2000,
                'side': 'long',
                'entry_price': 100.0,
                'exit_price': 110.0,
                'quantity': 1.0,
                'pnl': 10.0,
                'pnl_pct': 10.0,
                'reason': 'TP1'
            }
        ]

        formatted = self.runner._format_trades_for_output(trades)

        self.assertEqual(len(formatted), 1)
        self.assertEqual(formatted[0]['side'], 'LONG')
        self.assertEqual(formatted[0]['reason'], 'take_profit')

    def test_format_trades_stop_loss_reason(self):
        """Test that SL reasons are normalized"""
        trades = [
            {'entry_time': 1, 'exit_time': 2, 'side': 'short', 'entry_price': 100,
             'exit_price': 105, 'quantity': 1, 'pnl': -5, 'pnl_pct': -5, 'reason': 'SL'}
        ]

        formatted = self.runner._format_trades_for_output(trades)
        self.assertEqual(formatted[0]['reason'], 'stop_loss')

    def test_build_equity_curve(self):
        """Test equity curve building"""
        trades = [
            {'pnl': 10, 'exit_time': 1000},
            {'pnl': -5, 'exit_time': 2000},
            {'pnl': 15, 'exit_time': 3000},
        ]

        equity_curve = self.runner._build_equity_curve_from_trades(trades, 100)

        self.assertEqual(len(equity_curve), 3)
        self.assertEqual(equity_curve[0]['equity'], 110)  # 100 + 10
        self.assertEqual(equity_curve[1]['equity'], 105)  # 110 - 5
        self.assertEqual(equity_curve[2]['equity'], 120)  # 105 + 15


class TestExecuteTradesPattern(unittest.TestCase):
    """Test the execute_trades pattern specifically"""

    def test_run_execute_trades_backtest_extracts_strategy_config(self):
        """Test that STRATEGY_CONFIG is extracted and used"""
        runner = BatchBacktestRunner({
            'initial_capital': 10000,  # Default that should be overridden
            'risk_per_trade': 0.01,
            'leverage': 10,
            'commission': 0.001
        })

        # Mock Backtester class
        class MockBacktester:
            def __init__(self, config):
                self.config = config

            def execute_trades(self, df, initial_capital, leverage, commission_rate, gst_rate, risk_per_trade, **kwargs):
                # Return a DataFrame with trades
                return pd.DataFrame([{
                    'entry_time': 1000,
                    'exit_time': 2000,
                    'side': 'LONG',
                    'entry_price': 100.0,
                    'exit_price': 110.0,
                    'quantity': 1.0,
                    'pnl': 10.0,
                    'pnl_pct': 10.0,
                    'reason': 'signal'
                }])

        # Exec scope with STRATEGY_CONFIG
        exec_scope = {
            'STRATEGY_CONFIG': {
                'initial_capital': 100,  # This should be used!
                'leverage': 25,
                'commission_rate': 0.0004,
                'gst_rate': 0.18,
                'risk_per_trade': 0.1,
            },
            'Backtester': MockBacktester
        }

        historical_data = [
            {'time': 1000, 'open': 100, 'high': 105, 'low': 95, 'close': 102, 'volume': 1000},
            {'time': 2000, 'open': 102, 'high': 110, 'low': 100, 'close': 108, 'volume': 1200},
        ]

        result = runner._run_execute_trades_backtest(
            MockBacktester,
            historical_data,
            {'symbol': 'B-BTC_USDT'},
            exec_scope
        )

        self.assertTrue(result['success'])
        self.assertTrue(result.get('execute_trades_pattern', False))
        # Check that metrics use correct initial capital
        self.assertEqual(result['metrics']['finalCapital'], 110)  # 100 + 10

    def test_missing_required_param_raises_error(self):
        """Test that missing required params cause errors, not silent defaults"""
        runner = BatchBacktestRunner({
            'initial_capital': 10000,
            'risk_per_trade': 0.01,
            'leverage': 10,
            'commission': 0.001
        })

        class MockBacktester:
            def __init__(self, config):
                self.config = config

            def execute_trades(self, df, **kwargs):
                return pd.DataFrame()

        # Exec scope WITHOUT required params
        exec_scope = {
            'STRATEGY_CONFIG': {
                # Missing initial_capital, leverage, etc.
            },
            'Backtester': MockBacktester
        }

        historical_data = [{'time': 1000, 'open': 100, 'high': 105, 'low': 95, 'close': 102, 'volume': 1000}]

        result = runner._run_execute_trades_backtest(
            MockBacktester,
            historical_data,
            {},
            exec_scope
        )

        # Should fail with error about missing params
        self.assertFalse(result['success'])
        self.assertIn('Missing required parameter', result['error'])


class TestFullBacktestFlow(unittest.TestCase):
    """Test the full backtest flow with realistic strategy code"""

    def test_full_backtest_with_execute_trades_strategy(self):
        """Test complete backtest with a strategy using execute_trades pattern"""

        # Realistic strategy code (simplified version of eshan's pattern)
        strategy_code = '''
import pandas as pd
import numpy as np

STRATEGY_CONFIG = {
    "pair": "B-BTC_USDT",
    "resolution": "30",
    "initial_capital": 100,
    "leverage": 25,
    "risk_per_trade": 0.1,
    "commission_rate": 0.0004,
    "gst_rate": 0.18,
}

class Backtester:
    def __init__(self, config):
        self.config = config

    def execute_trades(self, df, initial_capital, leverage, commission_rate, gst_rate, risk_per_trade, **kwargs):
        """Simplified execute_trades that generates some trades"""
        trades = []
        capital = initial_capital

        for i in range(1, min(5, len(df))):
            entry_price = float(df.iloc[i-1]['close'])
            exit_price = float(df.iloc[i]['close'])
            pnl = (exit_price - entry_price) * 0.01 * leverage  # Simplified PnL calc

            trades.append({
                'entry_time': int(df.iloc[i-1]['time']),
                'exit_time': int(df.iloc[i]['time']),
                'side': 'LONG',
                'entry_price': entry_price,
                'exit_price': exit_price,
                'quantity': 0.01,
                'pnl': pnl,
                'pnl_pct': (pnl / capital) * 100,
                'reason': 'signal'
            })
            capital += pnl

        return pd.DataFrame(trades)
'''

        # Historical data
        historical_data = []
        base_time = 1700000000000
        base_price = 50000
        for i in range(10):
            historical_data.append({
                'time': base_time + i * 1800000,  # 30 min intervals
                'open': base_price + i * 100,
                'high': base_price + i * 100 + 50,
                'low': base_price + i * 100 - 50,
                'close': base_price + i * 100 + 25,
                'volume': 1000 + i * 100
            })

        runner = BatchBacktestRunner({
            'initial_capital': 10000,  # This should be overridden by STRATEGY_CONFIG
            'risk_per_trade': 0.01,
            'leverage': 10,
            'commission': 0.001
        })

        config = {
            'symbol': 'B-BTC_USDT',
            'resolution': '30m'
        }

        result = runner.run_backtest(strategy_code, historical_data, config)

        # Verify success
        self.assertTrue(result['success'], f"Backtest failed: {result.get('error', 'Unknown error')}")

        # Verify we got trades
        self.assertGreater(len(result['trades']), 0, "No trades generated")

        # Verify metrics exist
        self.assertIn('metrics', result)
        self.assertIn('totalTrades', result['metrics'])

        # Most importantly: verify initial_capital from STRATEGY_CONFIG was used (100, not 10000)
        # The finalCapital should be close to 100, not close to 10000
        final_capital = result['metrics']['finalCapital']
        self.assertLess(final_capital, 500,
            f"Final capital {final_capital} suggests wrong initial capital was used (expected ~100, got result suggesting 10000)")

        print(f"\n✅ Full backtest test passed!")
        print(f"   Trades: {result['metrics']['totalTrades']}")
        print(f"   Win Rate: {result['metrics']['winRate']:.2f}%")
        print(f"   Final Capital: ${result['metrics']['finalCapital']:.2f}")
        print(f"   (Started with $100 from STRATEGY_CONFIG)")


if __name__ == '__main__':
    # Run tests with verbose output
    print("=" * 60)
    print("Testing batch_backtest.py")
    print("=" * 60)

    # Create test suite
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    # Add test classes
    suite.addTests(loader.loadTestsFromTestCase(TestBatchBacktestRunner))
    suite.addTests(loader.loadTestsFromTestCase(TestExecuteTradesPattern))
    suite.addTests(loader.loadTestsFromTestCase(TestFullBacktestFlow))

    # Run with verbosity
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    # Print summary
    print("\n" + "=" * 60)
    if result.wasSuccessful():
        print("✅ ALL TESTS PASSED")
    else:
        print("❌ SOME TESTS FAILED")
        for failure in result.failures + result.errors:
            print(f"   - {failure[0]}")
    print("=" * 60)

    sys.exit(0 if result.wasSuccessful() else 1)
