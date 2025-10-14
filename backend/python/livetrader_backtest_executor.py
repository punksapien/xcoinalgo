"""
LiveTrader Backtest Executor
Executes the backtest() method of uploaded LiveTrader strategies
"""
import sys
import json
import logging
import warnings
import pandas as pd
import pandas_ta as ta
import numpy as np
from decimal import Decimal, ROUND_DOWN
from datetime import datetime, timezone
import requests
import hmac
import hashlib
import csv
import time
import os

warnings.filterwarnings("ignore")

# Setup basic logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stderr)]
)
logger = logging.getLogger(__name__)


def run_livetrader_backtest(strategy_code: str, config: dict) -> dict:
    """
    Dynamically execute LiveTrader strategy's backtest() method

    Args:
        strategy_code: The uploaded strategy code containing LiveTrader class
        config: Configuration with backtest parameters

    Returns:
        dict: Backtest metrics (winRate, roi, maxDrawdown, profitFactor, totalTrades)
    """
    try:
        # Create execution scope with required imports
        exec_scope = {
            'pd': pd,
            'ta': ta,
            'np': np,
            'logging': logging,
            'Decimal': Decimal,
            'ROUND_DOWN': ROUND_DOWN,
            'datetime': datetime,
            'timezone': timezone,
            'requests': requests,
            'hmac': hmac,
            'hashlib': hashlib,
            'json': json,
            'csv': csv,
            'time': time,
            'warnings': warnings,
            'sys': sys,
            'os': os
        }

        # Execute the strategy code
        logger.info("Executing LiveTrader strategy code...")
        exec(strategy_code, exec_scope)

        # Check for Backtester class first (preferred), then LiveTrader
        if 'Backtester' in exec_scope:
            logger.info("Backtester class found - using Backtester.run() method")
            BacktesterClass = exec_scope['Backtester']

            # Instantiate the Backtester
            logger.info(f"Instantiating Backtester with settings: {config}")
            backtester = BacktesterClass(settings=config)

            # Run backtest - returns list of trades
            logger.info("Running Backtester.run()...")
            trades_history = backtester.run()

            if not trades_history:
                raise ValueError("Backtester.run() returned no trades")

            # Calculate metrics using the strategy's calculate_metrics function
            if 'calculate_metrics' not in exec_scope:
                raise ValueError("Strategy must define calculate_metrics function")

            calculate_metrics_func = exec_scope['calculate_metrics']
            trades_df = pd.DataFrame(trades_history)
            backtest_results = calculate_metrics_func(trades_df, config.get('capital', 10000))

            # Standardize metric names
            backtest_results = {
                'win_rate': backtest_results.get('Win Rate (%)', backtest_results.get('winRate', 0)),
                'total_pnl_pct': backtest_results.get('Total Return (%)', backtest_results.get('roi', 0)),
                'max_drawdown_pct': backtest_results.get('Max Drawdown (%)', backtest_results.get('maxDrawdown', 0)),
                'profit_factor': backtest_results.get('Profit Factor', backtest_results.get('profitFactor', 0)),
                'total_trades': backtest_results.get('Total Trades', backtest_results.get('totalTrades', len(trades_history)))
            }

        elif 'LiveTrader' in exec_scope:
            logger.info("LiveTrader class found - using LiveTrader.backtest() method")
            LiveTraderClass = exec_scope['LiveTrader']

            # Verify backtest method exists
            if not hasattr(LiveTraderClass, 'backtest'):
                raise ValueError("LiveTrader class must implement a 'backtest()' method")

            # Instantiate the LiveTrader
            logger.info(f"Instantiating LiveTrader with settings: {config}")
            trader = LiveTraderClass(config)

            # Run backtest
            logger.info("Running LiveTrader.backtest()...")
            backtest_results = trader.backtest()

            if not backtest_results or not isinstance(backtest_results, dict):
                raise ValueError(f"backtest() must return a dict, got {type(backtest_results)}")

            # Validate required metrics
            required_metrics = ['win_rate', 'total_pnl_pct', 'max_drawdown_pct', 'profit_factor', 'total_trades']
            missing = [m for m in required_metrics if m not in backtest_results]
            if missing:
                raise ValueError(f"Backtest results missing required metrics: {missing}")
        else:
            raise ValueError("Strategy code must define either a 'Backtester' or 'LiveTrader' class")

        # Return standardized metrics
        metrics = {
            'winRate': float(backtest_results['win_rate']),
            'roi': float(backtest_results['total_pnl_pct']),
            'maxDrawdown': float(backtest_results['max_drawdown_pct']),
            'profitFactor': float(backtest_results['profit_factor']),
            'totalTrades': int(backtest_results['total_trades']),
            'success': True
        }

        logger.info(f"Backtest completed successfully: {metrics}")
        return metrics

    except Exception as e:
        logger.error(f"Backtest failed: {str(e)}", exc_info=True)
        return {
            'success': False,
            'error': str(e),
            'error_type': type(e).__name__
        }


if __name__ == '__main__':
    try:
        # Read input from stdin
        input_data = json.loads(sys.stdin.read())
        strategy_code = input_data['strategy_code']
        config = input_data['config']

        logger.info(f"Received config: {json.dumps(config, indent=2)}")

        # Run backtest
        result = run_livetrader_backtest(strategy_code, config)

        # Output result as JSON
        print(json.dumps(result))
        sys.exit(0 if result.get('success') else 1)

    except Exception as e:
        logger.error(f"Fatal error: {str(e)}", exc_info=True)
        print(json.dumps({
            'success': False,
            'error': str(e),
            'error_type': type(e).__name__
        }))
        sys.exit(1)

