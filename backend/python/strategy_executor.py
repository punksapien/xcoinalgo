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
from concurrent.futures import ThreadPoolExecutor, as_completed


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


def normalize_metrics(raw_metrics: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize metrics from strategy's format to backend's expected format.

    Converts from:
        {'Win Rate (%)': '56.23%', 'Profit Factor': '2.45', ...}
    To:
        {'winRate': 56.23, 'profitFactor': 2.45, ...}

    Args:
        raw_metrics: Metrics dictionary from strategy's evaluate_backtest_metrics

    Returns:
        Normalized metrics dictionary with camelCase keys and numeric values
    """
    import re

    def parse_percentage(value: str) -> float:
        """Parse percentage string like '56.23%' to float 56.23"""
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            # Remove % sign, $ sign, and commas
            clean = value.replace('%', '').replace('$', '').replace(',', '').strip()
            try:
                return float(clean)
            except:
                return 0.0
        return 0.0

    # Map user's keys to backend's expected keys
    normalized = {}

    for key, value in raw_metrics.items():
        lower_key = key.lower()

        if 'win rate' in lower_key or 'winrate' in lower_key:
            normalized['winRate'] = parse_percentage(value)
        elif 'total return' in lower_key or 'roi' in lower_key:
            normalized['roi'] = parse_percentage(value)
        elif 'max drawdown' in lower_key and '%' in str(value):
            normalized['maxDrawdown'] = parse_percentage(value)
        elif 'profit factor' in lower_key:
            normalized['profitFactor'] = parse_percentage(value)
        elif 'net pnl' in lower_key:
            normalized['netPnl'] = parse_percentage(value)
        elif 'expectancy' in lower_key:
            normalized['expectancy'] = parse_percentage(value)

    return normalized


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
        # Strip 'm' from resolution if present (e.g., "5m" -> "5")
        resolution = resolution.rstrip('m') if isinstance(resolution, str) else str(resolution)
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

        # Report progress: Generating signals
        print(json.dumps({
            "type": "progress",
            "stage": "generating_signals",
            "progress": 0.35,
            "message": "Generating trading signals..."
        }), file=sys.stderr, flush=True)

        # Generate signals using Trader.generate_signals (Backtester inherits from Trader)
        # Use the backtester instance to call both generate_signals AND execute_trades
        df = backtester.generate_signals(df, settings)

        # Reset DataFrame index to ensure clean sequential integer indices
        # This prevents index corruption issues with large datasets after merge_asof/dropna operations
        if df is not None and not df.empty:
            df = df.reset_index(drop=True)

        if df is None or df.empty:
            return {
                "success": False,
                "error": "Signal generation failed or returned empty dataframe",
                "mode": "backtest"
            }

        # Report progress: Running backtest
        print(json.dumps({
            "type": "progress",
            "stage": "running_backtest",
            "progress": 0.4,
            "message": f"Executing backtest on {total_candles:,} candles...",
            "total_candles": total_candles
        }), file=sys.stderr, flush=True)

        backtest_start = time.time()

        # Execute trades (use instance method, not static method)
        trades_df = backtester.execute_trades(
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
        raw_metrics = Backtester.evaluate_backtest_metrics(trades_df, initial_capital)
        # Normalize metrics to backend's expected format (camelCase keys, numeric values)
        metrics = normalize_metrics(raw_metrics)

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


def process_single_subscriber_live(
    subscriber: Dict[str, Any],
    settings: Dict[str, Any],
    LiveTrader: type,
    df_with_signals: Any,
    idx: int,
    total: int
) -> Dict[str, Any]:
    """
    Process a single subscriber in parallel for live execution.

    Returns:
        {
            'user_id': str,
            'success': bool,
            'error': str (if failed)
        }
    """
    import logging

    user_id = subscriber.get('user_id')

    try:
        logging.info(f"\n   [{idx}/{total}] Processing user {user_id}...")

        # Create subscriber-specific settings
        subscriber_settings = {
            **settings,
            'user_id': subscriber['user_id'],  # For unique state file paths
            'api_key': subscriber['api_key'],
            'api_secret': subscriber['api_secret'],
            'leverage': subscriber.get('leverage', 10),
            'risk_per_trade': subscriber.get('risk_per_trade', 0.02),
            'initial_capital': subscriber.get('capital', 10000),
        }

        # Initialize LiveTrader for this subscriber
        subscriber_trader = LiveTrader(settings=subscriber_settings)

        # Execute their check_for_new_signal method
        subscriber_trader.check_for_new_signal(df_with_signals)

        logging.info(f"   ✅ User {user_id} processed successfully")

        return {
            'user_id': user_id,
            'success': True
        }

    except Exception as e:
        error_msg = str(e)
        logging.error(f"   ❌ User {user_id} failed: {error_msg}")
        logging.error(traceback.format_exc())

        return {
            'user_id': user_id,
            'success': False,
            'error': error_msg
        }


def execute_live(module, settings: Dict[str, Any], subscribers: List[Dict[str, Any]], strategy_dir: str) -> Dict[str, Any]:
    """
    Execute strategy in live mode with multiple subscribers using multi-tenant approach.

    Multi-Tenant Approach:
        1. Fetch market data ONCE (shared across all subscribers)
        2. Generate signals ONCE (same for all subscribers)
        3. Execute strategy for EACH subscriber with their credentials

    Args:
        module: Loaded strategy module
        settings: Strategy settings
        subscribers: List of subscriber configurations with API keys
        strategy_dir: Directory for logs and output

    Returns:
        Execution results as dictionary
    """
    import logging

    try:
        # Setup logging first
        CsvHandler = getattr(module, 'CsvHandler')
        logs_dir = os.path.join(strategy_dir, 'logs')
        os.makedirs(logs_dir, exist_ok=True)

        # Setup logging with strategy-specific log file
        log_filename = os.path.join(logs_dir, f"strategy_{settings.get('strategy_id', 'unknown')}.csv")
        CsvHandler.setup_logging(filename=log_filename)

        # Get required classes from module
        LiveTrader = getattr(module, 'LiveTrader')

        logging.info(f"🚀 Multi-Tenant Execution Started")
        logging.info(f"   Pair: {settings.get('pair')}")
        logging.info(f"   Resolution: {settings.get('resolution')}")
        logging.info(f"   Subscribers: {len(subscribers)}")

        # ====================================================================
        # STEP 1: Fetch market data ONCE (shared across all subscribers)
        # ====================================================================
        logging.info("📊 Fetching market data (shared across subscribers)...")

        # Use first subscriber's credentials just to fetch data
        first_subscriber = subscribers[0]
        temp_settings = {
            **settings,
            'api_key': first_subscriber['api_key'],
            'api_secret': first_subscriber['api_secret']
        }

        temp_trader = LiveTrader(settings=temp_settings)
        df = temp_trader.get_latest_data()

        if df is None or (hasattr(df, 'empty') and df.empty):
            raise ValueError("Failed to fetch market data")

        logging.info(f"   Fetched {len(df)} candles")

        # ====================================================================
        # STEP 2: Generate signals ONCE (same for all subscribers)
        # ====================================================================
        logging.info("🧠 Generating signals...")

        # Use the LiveTrader instance's inherited generate_signals method
        df_with_signals = temp_trader.generate_signals(df, settings)

        if df_with_signals is None or (hasattr(df_with_signals, 'empty') and df_with_signals.empty):
            raise ValueError("Signal generation returned empty dataframe")

        logging.info("✅ Signals generated")

        # ====================================================================
        # STEP 3: Execute strategy for EACH subscriber with their credentials (PARALLEL)
        # ====================================================================
        max_workers = settings.get('max_workers', 10)  # Configurable, default 10
        logging.info(f"💼 Processing {len(subscribers)} subscribers in parallel (max_workers={max_workers})...")

        subscribers_processed = 0
        trades_attempted = 0
        errors = {}

        # Process subscribers in parallel using ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all subscriber processing tasks
            future_to_subscriber = {
                executor.submit(
                    process_single_subscriber_live,
                    subscriber,
                    settings,
                    LiveTrader,
                    df_with_signals,
                    idx,
                    len(subscribers)
                ): subscriber
                for idx, subscriber in enumerate(subscribers, 1)
            }

            # Collect results as they complete
            for future in as_completed(future_to_subscriber):
                subscriber = future_to_subscriber[future]
                try:
                    result = future.result()

                    if result['success']:
                        subscribers_processed += 1
                        trades_attempted += 1
                    else:
                        errors[result['user_id']] = result.get('error', 'Unknown error')

                except Exception as e:
                    # This catches errors in the future itself (unlikely)
                    user_id = subscriber.get('user_id', 'unknown')
                    error_msg = str(e)
                    errors[user_id] = error_msg
                    logging.error(f"   ❌ Future exception for user {user_id}: {error_msg}")
                    logging.error(traceback.format_exc())

        # ====================================================================
        # STEP 4: Return results
        # ====================================================================
        logging.info(f"\n🏁 Multi-Tenant Execution Complete")
        logging.info(f"   Subscribers Processed: {subscribers_processed}/{len(subscribers)}")
        logging.info(f"   Trades Attempted: {trades_attempted}")
        logging.info(f"   Errors: {len(errors)}")

        return {
            "success": True,
            "mode": "live",
            "subscribers_processed": subscribers_processed,
            "trades_attempted": trades_attempted,
            "errors": errors if errors else None
        }

    except Exception as e:
        logging.error(f"💥 Multi-tenant execution failed: {e}")
        logging.error(traceback.format_exc())

        return {
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc(),
            "mode": "live",
            "subscribers_processed": 0,
            "trades_attempted": 0
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

        # Output result as JSON (single line for parsing)
        print(json.dumps(result, default=str))

        # Exit with appropriate code
        sys.exit(0 if result.get('success') else 1)

    except json.JSONDecodeError as e:
        error_result = {
            "success": False,
            "error": f"Invalid JSON input: {str(e)}"
        }
        print(json.dumps(error_result))
        sys.exit(1)

    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }
        print(json.dumps(error_result))
        sys.exit(1)


if __name__ == "__main__":
    main()
