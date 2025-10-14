"""
Strategy Executor
Unified entry point for executing trading strategies in both backtest and live modes.
Reads JSON input from stdin and outputs JSON results to stdout.
"""

import sys
import json
import os
import importlib.util
from typing import Dict, Any, List, Optional
from pathlib import Path
import traceback


def load_strategy_module(strategy_file_path: str):
    """
    Dynamically load a strategy Python file as a module

    Args:
        strategy_file_path: Absolute path to the strategy .py file

    Returns:
        Loaded module object
    """
    if not os.path.exists(strategy_file_path):
        raise FileNotFoundError(f"Strategy file not found: {strategy_file_path}")

    # Create module spec and load
    spec = importlib.util.spec_from_file_location("strategy_module", strategy_file_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Failed to create module spec for {strategy_file_path}")

    module = importlib.util.module_from_spec(spec)
    sys.modules["strategy_module"] = module
    spec.loader.exec_module(module)

    return module


def setup_logging(strategy_dir: str, strategy_id: str, mode: str):
    """
    Setup logging using the CsvHandler from the strategy module

    Args:
        strategy_dir: Directory where strategy files are located
        strategy_id: ID of the strategy
        mode: Execution mode (backtest or live)
    """
    # Import will be done in execute_strategy after module is loaded
    pass


def execute_backtest(module, settings: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute strategy in backtest mode with progress reporting

    Args:
        module: Loaded strategy module
        settings: Strategy settings including pair, capital, leverage, etc.

    Returns:
        Backtest results as dictionary
    """
    import sys
    import time

    try:
        # Get the Backtester class from the module
        Backtester = getattr(module, 'Backtester')

        # Create backtester instance
        backtester = Backtester(settings)

        # Extract parameters from settings
        pair = settings.get('pair')
        start_date = settings.get('start_date')
        end_date = settings.get('end_date')
        resolution = settings.get('resolution', '5m')
        initial_capital = settings.get('capital', 10000)
        leverage = settings.get('leverage', 1)
        commission_rate = settings.get('commission_rate', 0.0005)
        gst_rate = settings.get('gst_rate', 0.18)
        sl_rate = settings.get('sl_rate', 0.02)
        tp_rate = settings.get('tp_rate', 0.04)

        # Report progress: Fetching data
        print(json.dumps({
            "type": "progress",
            "stage": "fetching_data",
            "progress": 0.1,
            "message": f"Fetching historical data for {pair}..."
        }), file=sys.stderr, flush=True)

        fetch_start = time.time()

        # Fetch historical data
        df = Backtester.fetch_coindcx_data(pair, start_date, end_date, resolution)

        if df is None or df.empty:
            return {
                "success": False,
                "error": "Failed to fetch historical data or data is empty",
                "mode": "backtest"
            }

        fetch_duration = time.time() - fetch_start
        total_candles = len(df)

        # Report progress: Data fetched
        print(json.dumps({
            "type": "progress",
            "stage": "data_fetched",
            "progress": 0.3,
            "message": f"Fetched {total_candles:,} candles in {fetch_duration:.1f}s"
        }), file=sys.stderr, flush=True)

        # Report progress: Running backtest
        print(json.dumps({
            "type": "progress",
            "stage": "running_backtest",
            "progress": 0.4,
            "message": f"Executing backtest on {total_candles:,} candles...",
            "total_candles": total_candles
        }), file=sys.stderr, flush=True)

        backtest_start = time.time()

        # Execute trades
        trades_df = Backtester.execute_trades(
            df=df,
            initial_capital=initial_capital,
            leverage=leverage,
            commission_rate=commission_rate,
            gst_rate=gst_rate,
            sl_rate=sl_rate,
            tp_rate=tp_rate
        )

        backtest_duration = time.time() - backtest_start

        if trades_df is None or trades_df.empty:
            return {
                "success": False,
                "error": "No trades generated during backtest",
                "mode": "backtest"
            }

        # Report progress: Calculating metrics
        print(json.dumps({
            "type": "progress",
            "stage": "calculating_metrics",
            "progress": 0.9,
            "message": f"Calculating performance metrics...",
            "backtest_duration": round(backtest_duration, 1)
        }), file=sys.stderr, flush=True)

        # Evaluate metrics
        metrics = Backtester.evaluate_backtest_metrics(trades_df, initial_capital)

        # Convert trades_df to dictionary for JSON serialization
        trades_list = trades_df.to_dict('records') if not trades_df.empty else []

        total_duration = fetch_duration + backtest_duration

        # Report progress: Complete
        print(json.dumps({
            "type": "progress",
            "stage": "complete",
            "progress": 1.0,
            "message": f"Backtest complete! {len(trades_list)} trades executed in {total_duration:.1f}s"
        }), file=sys.stderr, flush=True)

        return {
            "success": True,
            "mode": "backtest",
            "metrics": metrics,
            "trades": trades_list,
            "total_trades": len(trades_list),
            "stats": {
                "total_candles": total_candles,
                "fetch_duration": round(fetch_duration, 1),
                "backtest_duration": round(backtest_duration, 1),
                "total_duration": round(total_duration, 1)
            }
        }

    except Exception as e:
        # Report error
        print(json.dumps({
            "type": "error",
            "stage": "error",
            "message": str(e)
        }), file=sys.stderr, flush=True)

        return {
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc(),
            "mode": "backtest"
        }


def execute_live(module, settings: Dict[str, Any], subscribers: List[Dict[str, Any]], strategy_dir: str) -> Dict[str, Any]:
    """
    Execute strategy in live mode with multiple subscribers

    Args:
        module: Loaded strategy module
        settings: Strategy settings
        subscribers: List of subscriber configurations with API keys
        strategy_dir: Directory for logs and output

    Returns:
        Execution results as dictionary
    """
    try:
        # Setup logging first
        CsvHandler = getattr(module, 'CsvHandler')
        logs_dir = os.path.join(strategy_dir, 'logs')
        os.makedirs(logs_dir, exist_ok=True)

        # Setup logging with strategy-specific log file
        log_filename = os.path.join(logs_dir, f"strategy_{settings.get('strategy_id', 'unknown')}.csv")
        CsvHandler.setup_logging(filename=log_filename)

        # Get the LiveTrader class
        LiveTrader = getattr(module, 'LiveTrader')

        # Create LiveTrader instance with settings
        # Note: LiveTrader __init__ only takes settings parameter
        live_trader = LiveTrader(settings)

        # Store subscribers in the instance (if LiveTrader needs it)
        # The strategy code should handle subscribers internally
        if hasattr(live_trader, 'subscribers'):
            live_trader.subscribers = subscribers

        # Run the live trader
        # This should:
        # 1. Get latest data
        # 2. Generate signal ONCE
        # 3. Execute trades for all subscribers
        result = live_trader.run()

        return {
            "success": True,
            "mode": "live",
            "result": result,
            "subscribers_count": len(subscribers)
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc(),
            "mode": "live"
        }


def execute_strategy(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Main execution function that routes to backtest or live mode

    Args:
        input_data: JSON input containing:
            - mode: "backtest" or "live"
            - strategy_file: absolute path to strategy .py file
            - settings: strategy configuration
            - subscribers: list of subscriber configs (for live mode only)

    Returns:
        Execution results as dictionary
    """
    try:
        # Validate input
        mode = input_data.get('mode')
        strategy_file = input_data.get('strategy_file')
        settings = input_data.get('settings', {})
        subscribers = input_data.get('subscribers', [])

        if not mode:
            return {
                "success": False,
                "error": "Missing 'mode' parameter"
            }

        if not strategy_file:
            return {
                "success": False,
                "error": "Missing 'strategy_file' parameter"
            }

        if mode not in ['backtest', 'live']:
            return {
                "success": False,
                "error": f"Invalid mode: {mode}. Must be 'backtest' or 'live'"
            }

        # Load the strategy module
        module = load_strategy_module(strategy_file)

        # Get strategy directory for logs
        strategy_dir = os.path.dirname(strategy_file)

        # Route to appropriate executor
        if mode == 'backtest':
            return execute_backtest(module, settings)
        else:  # mode == 'live'
            if not subscribers:
                return {
                    "success": False,
                    "error": "Live mode requires at least one subscriber",
                    "mode": "live"
                }
            return execute_live(module, settings, subscribers, strategy_dir)

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }


def main():
    """
    Main entry point - reads JSON from stdin, executes strategy, outputs JSON to stdout
    """
    try:
        # Read input from stdin
        input_data = json.load(sys.stdin)

        # Execute strategy
        result = execute_strategy(input_data)

        # Output result as JSON
        print(json.dumps(result, indent=2, default=str))

        # Exit with appropriate code
        sys.exit(0 if result.get('success') else 1)

    except json.JSONDecodeError as e:
        error_result = {
            "success": False,
            "error": f"Invalid JSON input: {str(e)}"
        }
        print(json.dumps(error_result, indent=2))
        sys.exit(1)

    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }
        print(json.dumps(error_result, indent=2))
        sys.exit(1)


if __name__ == "__main__":
    main()
