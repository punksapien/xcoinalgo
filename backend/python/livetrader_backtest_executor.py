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

        # Verify LiveTrader class exists
        if 'LiveTrader' not in exec_scope:
            raise ValueError("Strategy code must define a 'LiveTrader' class")

        LiveTraderClass = exec_scope['LiveTrader']

        # Verify backtest method exists
        if not hasattr(LiveTraderClass, 'backtest'):
            raise ValueError("LiveTrader class must implement a 'backtest()' method")

        # Use the entire config as settings for LiveTrader
        # The config already has all necessary fields (pair, resolution, symbol, etc.)
        settings = config

        # Instantiate the LiveTrader
        logger.info(f"Instantiating LiveTrader with settings: {settings}")
        trader = LiveTraderClass(settings)

        # Run backtest
        logger.info("Running backtest...")
        backtest_results = trader.backtest()

        if not backtest_results or not isinstance(backtest_results, dict):
            raise ValueError(f"backtest() must return a dict, got {type(backtest_results)}")

        # Validate required metrics
        required_metrics = ['win_rate', 'total_pnl_pct', 'max_drawdown_pct', 'profit_factor', 'total_trades']
        missing = [m for m in required_metrics if m not in backtest_results]
        if missing:
            raise ValueError(f"Backtest results missing required metrics: {missing}")

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

