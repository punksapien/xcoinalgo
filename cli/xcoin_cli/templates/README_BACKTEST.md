# Custom Backtest Implementation Guide

## Overview

You can implement a custom `backtest()` method in your strategy to have full control over how backtesting is performed. If you don't implement it, the backend will use the default backtester that calls your `generate_signal()` method repeatedly.

## When to Use Custom Backtest

Use custom backtest when you need:
- **Vectorized operations** for faster backtesting (pandas operations on entire DataFrame)
- **Custom risk management** beyond the default position sizing
- **Complex entry/exit logic** that's easier to express in batch operations
- **Custom metrics** or performance calculations
- **Your own data preprocessing** or indicator calculations

## Implementation

### Method Signature

```python
def backtest(self, historical_data: pd.DataFrame, config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Custom backtest implementation

    Args:
        historical_data: DataFrame with columns ['timestamp', 'open', 'high', 'low', 'close', 'volume']
        config: Dict with {'initial_capital': float, 'risk_per_trade': float, 'leverage': int, 'commission': float}

    Returns:
        Dict with keys:
            - 'trades': List[Dict] - list of trade objects
            - 'metrics': Dict - performance metrics
            - 'equity_curve': List[Dict] - equity over time (optional)
    """
```

### Required Return Format

```python
{
    'trades': [
        {
            'entry_time': 1633024800000,  # timestamp in ms
            'exit_time': 1633111200000,
            'side': 'LONG',  # or 'SHORT'
            'entry_price': 45000.0,
            'exit_price': 46000.0,
            'quantity': 0.5,
            'pnl': 500.0,  # net P&L after commission
            'pnl_pct': 2.22,  # percentage return
            'reason': 'take_profit'  # 'stop_loss', 'take_profit', 'signal'
        },
        # ... more trades
    ],
    'metrics': {
        'total_trades': 10,
        'winning_trades': 6,
        'losing_trades': 4,
        'win_rate': 60.0,  # percentage
        'total_pnl': 1500.0,
        'total_pnl_pct': 15.0,  # percentage
        'max_drawdown': 500.0,
        'max_drawdown_pct': 5.0,
        'sharpe_ratio': 1.5,
        'profit_factor': 2.0
    },
    'equity_curve': [  # optional
        {'timestamp': 1633024800000, 'equity': 10000.0},
        {'timestamp': 1633111200000, 'equity': 10500.0},
        # ... more points
    ]
}
```

## Example

See `example_custom_backtest_strategy.py` for a complete working example showing:
- Vectorized signal generation using pandas
- Simple SMA crossover strategy
- Position sizing and risk management
- Stop loss and take profit handling
- Metrics calculation

## Fallback Behavior

If your `backtest()` method:
- Raises `NotImplementedError` → Backend uses default backtester
- Is missing → Backend uses default backtester
- Raises any other exception → Backtest fails with error message

## Testing

1. Implement your custom backtest
2. Deploy strategy: `xcoin deploy`
3. Check backend logs for "custom_backtest: true" to confirm it was used
4. Verify metrics appear in dashboard

## Tips

- **Vectorize operations** using pandas for speed (avoid Python loops when possible)
- **Test locally** before deploying (use sample data)
- **Handle edge cases** (empty data, no trades, etc.)
- **Validate inputs** (check DataFrame has required columns)
- **Calculate metrics accurately** (especially Sharpe ratio, max drawdown)
- **Include commission** in P&L calculations
- **Use proper timestamps** (milliseconds since epoch)

## Default Backtester

If you don't implement custom backtest, the default backtester:
- Calls your `generate_signal()` method for each candle with a sliding window
- Handles position management (open/close)
- Checks stop loss and take profit automatically
- Calculates all standard metrics
- Works well for most strategies

Choose custom backtest only if you need specific control or optimizations.

