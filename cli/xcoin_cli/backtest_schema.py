"""
Backtest Result Schema - Enforces contract between strategy code and frontend

This schema defines the EXACT format that the frontend expects for displaying
backtest results, trade reports, and performance metrics.

All custom backtest implementations MUST return data matching this schema.
"""

from typing import Dict, Any, List, TypedDict, Literal, Optional
from datetime import datetime


# ============================================
# Type Definitions
# ============================================

class Trade(TypedDict):
    """
    Individual trade record - displayed in trade history table

    Frontend displays:
    - Entry/exit times and prices
    - P&L with color coding (green/red)
    - Side indicator (LONG/SHORT badge)
    - Exit reason (stop loss, take profit, signal)
    """
    entry_time: int  # Timestamp in milliseconds (e.g., 1633024800000)
    exit_time: int   # Timestamp in milliseconds
    side: Literal['LONG', 'SHORT']  # Trade direction
    entry_price: float  # Entry price
    exit_price: float   # Exit price
    quantity: float     # Position size
    pnl: float          # Net P&L after commission (can be negative)
    pnl_pct: float      # Percentage return (e.g., 2.5 for 2.5%)
    reason: Literal['stop_loss', 'take_profit', 'signal', 'manual']  # Exit reason


class EquityCurvePoint(TypedDict):
    """
    Single point in equity curve - displayed in performance chart

    Frontend displays:
    - Line chart of equity over time
    - Drawdown visualization
    """
    timestamp: int  # Timestamp in milliseconds
    equity: float   # Account equity at this point


class BacktestMetrics(TypedDict):
    """
    Performance metrics - displayed in strategy detail cards and summary

    Frontend displays these in cards with icons and color coding:
    - Win rate (green if >50%, red if <50%)
    - Total P&L (green if positive, red if negative)
    - Max drawdown (always red, lower is better)
    - Sharpe ratio (green if >1, yellow if 0.5-1, red if <0.5)
    - Profit factor (green if >1.5, yellow if 1-1.5, red if <1)
    """
    # Trade counts
    total_trades: int       # Total number of trades
    winning_trades: int     # Number of profitable trades
    losing_trades: int      # Number of losing trades

    # Win rate
    win_rate: float         # Percentage (0-100), e.g., 65.5 for 65.5%

    # P&L metrics
    total_pnl: float        # Total profit/loss in currency
    total_pnl_pct: float    # Total return percentage, e.g., 15.5 for 15.5%

    # Risk metrics
    max_drawdown: float     # Maximum drawdown in currency
    max_drawdown_pct: float # Maximum drawdown percentage, e.g., 10.5 for 10.5%

    # Performance ratios
    sharpe_ratio: float     # Risk-adjusted return (typically -3 to 3)
    profit_factor: float    # Gross profit / Gross loss (>1 is profitable)


class BacktestResult(TypedDict):
    """
    Complete backtest result - this is what your backtest() method MUST return

    All fields are REQUIRED unless marked Optional.
    """
    trades: List[Trade]              # List of all trades (can be empty)
    metrics: BacktestMetrics         # Performance metrics
    equity_curve: List[EquityCurvePoint]  # Equity over time (can be empty)


# ============================================
# Validation Functions
# ============================================

def validate_trade(trade: Dict[str, Any], index: int) -> List[str]:
    """Validate a single trade object"""
    errors = []

    # Required fields
    required_fields = {
        'entry_time': int,
        'exit_time': int,
        'side': str,
        'entry_price': (int, float),
        'exit_price': (int, float),
        'quantity': (int, float),
        'pnl': (int, float),
        'pnl_pct': (int, float),
        'reason': str
    }

    for field, expected_type in required_fields.items():
        if field not in trade:
            errors.append(f"Trade {index}: Missing required field '{field}'")
        elif not isinstance(trade[field], expected_type):
            errors.append(f"Trade {index}: Field '{field}' must be {expected_type}, got {type(trade[field])}")

    # Validate side
    if 'side' in trade and trade['side'] not in ['LONG', 'SHORT']:
        errors.append(f"Trade {index}: 'side' must be 'LONG' or 'SHORT', got '{trade['side']}'")

    # Validate reason
    if 'reason' in trade and trade['reason'] not in ['stop_loss', 'take_profit', 'signal', 'manual']:
        errors.append(f"Trade {index}: 'reason' must be one of ['stop_loss', 'take_profit', 'signal', 'manual'], got '{trade['reason']}'")

    # Validate timestamps
    if 'entry_time' in trade and 'exit_time' in trade:
        if trade['exit_time'] <= trade['entry_time']:
            errors.append(f"Trade {index}: 'exit_time' must be after 'entry_time'")

    # Validate positive values
    for field in ['entry_price', 'exit_price', 'quantity']:
        if field in trade and trade[field] <= 0:
            errors.append(f"Trade {index}: '{field}' must be positive, got {trade[field]}")

    return errors


def validate_metrics(metrics: Dict[str, Any]) -> List[str]:
    """Validate metrics object"""
    errors = []

    # Required fields
    required_fields = {
        'total_trades': int,
        'winning_trades': int,
        'losing_trades': int,
        'win_rate': (int, float),
        'total_pnl': (int, float),
        'total_pnl_pct': (int, float),
        'max_drawdown': (int, float),
        'max_drawdown_pct': (int, float),
        'sharpe_ratio': (int, float),
        'profit_factor': (int, float)
    }

    for field, expected_type in required_fields.items():
        if field not in metrics:
            errors.append(f"Metrics: Missing required field '{field}'")
        elif not isinstance(metrics[field], expected_type):
            errors.append(f"Metrics: Field '{field}' must be {expected_type}, got {type(metrics[field])}")

    # Validate ranges
    if 'win_rate' in metrics and not (0 <= metrics['win_rate'] <= 100):
        errors.append(f"Metrics: 'win_rate' must be between 0 and 100, got {metrics['win_rate']}")

    if 'total_trades' in metrics and metrics['total_trades'] < 0:
        errors.append(f"Metrics: 'total_trades' must be non-negative, got {metrics['total_trades']}")

    if 'winning_trades' in metrics and metrics['winning_trades'] < 0:
        errors.append(f"Metrics: 'winning_trades' must be non-negative, got {metrics['winning_trades']}")

    if 'losing_trades' in metrics and metrics['losing_trades'] < 0:
        errors.append(f"Metrics: 'losing_trades' must be non-negative, got {metrics['losing_trades']}")

    # Validate consistency
    if all(k in metrics for k in ['total_trades', 'winning_trades', 'losing_trades']):
        if metrics['total_trades'] != metrics['winning_trades'] + metrics['losing_trades']:
            errors.append(f"Metrics: total_trades ({metrics['total_trades']}) must equal winning_trades + losing_trades ({metrics['winning_trades'] + metrics['losing_trades']})")

    return errors


def validate_equity_curve(equity_curve: List[Dict[str, Any]]) -> List[str]:
    """Validate equity curve"""
    errors = []

    for i, point in enumerate(equity_curve):
        if 'timestamp' not in point:
            errors.append(f"Equity curve point {i}: Missing 'timestamp'")
        elif not isinstance(point['timestamp'], int):
            errors.append(f"Equity curve point {i}: 'timestamp' must be int, got {type(point['timestamp'])}")

        if 'equity' not in point:
            errors.append(f"Equity curve point {i}: Missing 'equity'")
        elif not isinstance(point['equity'], (int, float)):
            errors.append(f"Equity curve point {i}: 'equity' must be numeric, got {type(point['equity'])}")

    # Validate chronological order
    if len(equity_curve) > 1:
        for i in range(1, len(equity_curve)):
            if equity_curve[i]['timestamp'] <= equity_curve[i-1]['timestamp']:
                errors.append(f"Equity curve: Points must be in chronological order (point {i} timestamp <= point {i-1})")
                break

    return errors


def validate_backtest_result(result: Dict[str, Any]) -> tuple[bool, List[str]]:
    """
    Validate complete backtest result

    Returns:
        (is_valid, errors) - is_valid is True if no errors, errors is list of error messages
    """
    errors = []

    # Check top-level structure
    if not isinstance(result, dict):
        return False, ["Backtest result must be a dictionary"]

    # Required top-level fields
    if 'trades' not in result:
        errors.append("Missing required field 'trades'")
    elif not isinstance(result['trades'], list):
        errors.append(f"'trades' must be a list, got {type(result['trades'])}")
    else:
        # Validate each trade
        for i, trade in enumerate(result['trades']):
            errors.extend(validate_trade(trade, i))

    if 'metrics' not in result:
        errors.append("Missing required field 'metrics'")
    elif not isinstance(result['metrics'], dict):
        errors.append(f"'metrics' must be a dict, got {type(result['metrics'])}")
    else:
        errors.extend(validate_metrics(result['metrics']))

    if 'equity_curve' not in result:
        errors.append("Missing required field 'equity_curve'")
    elif not isinstance(result['equity_curve'], list):
        errors.append(f"'equity_curve' must be a list, got {type(result['equity_curve'])}")
    else:
        errors.extend(validate_equity_curve(result['equity_curve']))

    return len(errors) == 0, errors


# ============================================
# Helper Functions
# ============================================

def format_validation_errors(errors: List[str]) -> str:
    """Format validation errors for display"""
    if not errors:
        return "✅ Backtest result is valid"

    error_msg = "❌ Backtest result validation failed:\n\n"
    for i, error in enumerate(errors, 1):
        error_msg += f"  {i}. {error}\n"

    return error_msg


def get_schema_documentation() -> str:
    """Get human-readable schema documentation"""
    return """
BACKTEST RESULT SCHEMA
======================

Your backtest() method must return a dictionary with this EXACT structure:

{
    "trades": [
        {
            "entry_time": 1633024800000,      # int - timestamp in milliseconds
            "exit_time": 1633111200000,       # int - timestamp in milliseconds
            "side": "LONG",                   # str - "LONG" or "SHORT"
            "entry_price": 45000.0,           # float - entry price
            "exit_price": 46000.0,            # float - exit price
            "quantity": 0.5,                  # float - position size
            "pnl": 500.0,                     # float - net P&L (can be negative)
            "pnl_pct": 2.22,                  # float - percentage return
            "reason": "take_profit"           # str - "stop_loss", "take_profit", "signal", or "manual"
        }
    ],
    "metrics": {
        "total_trades": 10,                   # int - total number of trades
        "winning_trades": 6,                  # int - number of winning trades
        "losing_trades": 4,                   # int - number of losing trades
        "win_rate": 60.0,                     # float - percentage (0-100)
        "total_pnl": 1500.0,                  # float - total P&L
        "total_pnl_pct": 15.0,                # float - total return percentage
        "max_drawdown": 500.0,                # float - max drawdown in currency
        "max_drawdown_pct": 5.0,              # float - max drawdown percentage
        "sharpe_ratio": 1.5,                  # float - risk-adjusted return
        "profit_factor": 2.0                  # float - gross profit / gross loss
    },
    "equity_curve": [
        {
            "timestamp": 1633024800000,       # int - timestamp in milliseconds
            "equity": 10000.0                 # float - account equity
        }
    ]
}

All fields are REQUIRED. Arrays can be empty but must be present.
"""


if __name__ == '__main__':
    # Print schema documentation
    print(get_schema_documentation())

