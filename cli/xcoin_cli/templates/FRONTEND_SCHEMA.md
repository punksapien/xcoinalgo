# Frontend Display Schema

## What the Frontend Shows and Where

This document maps EXACTLY how your backtest data appears in the frontend UI.

---

## Strategy Card View (Dashboard/Marketplace)

```
┌─────────────────────────────────────┐
│  📈 My Awesome Strategy             │
│  by: john@example.com               │
├─────────────────────────────────────┤
│  Win Rate: 65.5%  ← metrics.win_rate│
│  ROI: +15.3%      ← metrics.total_pnl_pct│
│  Max DD: -5.2%    ← metrics.max_drawdown_pct│
│  Sharpe: 1.8      ← metrics.sharpe_ratio│
│  Trades: 42       ← metrics.total_trades│
└─────────────────────────────────────┘
```

**Color Coding:**
- `win_rate`: Green if ≥50%, Red if <50%
- `total_pnl_pct`: Green if positive, Red if negative
- `max_drawdown_pct`: Always red (lower is better)
- `sharpe_ratio`: Green if >1, Yellow if 0.5-1, Red if <0.5

---

## Strategy Detail Page

### Performance Metrics Section

```
┌────────────────────────────────────────────────────────┐
│  Performance Metrics                                   │
├────────────────────────────────────────────────────────┤
│  Total Trades: 42          ← metrics.total_trades      │
│  Winning: 28 (66.7%)       ← metrics.winning_trades    │
│  Losing: 14 (33.3%)        ← metrics.losing_trades     │
│                                                         │
│  Total P&L: $1,530.50      ← metrics.total_pnl         │
│  Return: +15.31%           ← metrics.total_pnl_pct     │
│                                                         │
│  Max Drawdown: $520.00     ← metrics.max_drawdown      │
│  Max DD %: -5.20%          ← metrics.max_drawdown_pct  │
│                                                         │
│  Sharpe Ratio: 1.85        ← metrics.sharpe_ratio      │
│  Profit Factor: 2.15       ← metrics.profit_factor     │
└────────────────────────────────────────────────────────┘
```

### Equity Curve Chart

```
Equity ($)
  12000 ┤                            ╭─╮
  11500 ┤                 ╭─────────╯  ╰─╮
  11000 ┤        ╭───────╯               │
  10500 ┤   ╭───╯                        │
  10000 ┼───╯                            ╰─
        └────────────────────────────────────> Time

Data: equity_curve[{timestamp, equity}, ...]
- X-axis: timestamp (converted to date)
- Y-axis: equity
```

### Trade History Table

```
┌──────────────┬──────────────┬──────┬───────┬───────┬─────────┬──────────┬────────────┐
│ Entry Time   │ Exit Time    │ Side │ Entry │ Exit  │ Qty     │ P&L      │ Reason     │
├──────────────┼──────────────┼──────┼───────┼───────┼─────────┼──────────┼────────────┤
│ 2024-01-15   │ 2024-01-16   │ LONG │ 45000 │ 46500 │ 0.5     │ +$750.00 │ take_profit│
│ 10:30 AM     │ 2:15 PM      │      │       │       │         │ (+3.33%) │            │
├──────────────┼──────────────┼──────┼───────┼───────┼─────────┼──────────┼────────────┤
│ 2024-01-17   │ 2024-01-17   │SHORT │ 46000 │ 45500 │ 0.3     │ +$150.00 │ signal     │
│ 9:00 AM      │ 11:45 AM     │      │       │       │         │ (+1.09%) │            │
└──────────────┴──────────────┴──────┴───────┴───────┴─────────┴──────────┴────────────┘

Data: trades[{entry_time, exit_time, side, entry_price, exit_price, quantity, pnl, pnl_pct, reason}, ...]
- entry_time/exit_time: Converted from milliseconds to readable date/time
- side: Displayed as badge (LONG=green, SHORT=red)
- pnl: Color coded (green if positive, red if negative)
- pnl_pct: Shown in parentheses with % sign
- reason: Displayed as text label
```

---

## Required Data Format

### Complete Example

```python
{
    "trades": [
        {
            "entry_time": 1705315800000,      # Jan 15, 2024 10:30 AM (milliseconds)
            "exit_time": 1705402500000,       # Jan 16, 2024 2:15 PM
            "side": "LONG",                   # Must be "LONG" or "SHORT"
            "entry_price": 45000.0,
            "exit_price": 46500.0,
            "quantity": 0.5,
            "pnl": 750.0,                     # Net P&L (can be negative)
            "pnl_pct": 3.33,                  # Percentage (not decimal)
            "reason": "take_profit"           # "stop_loss", "take_profit", "signal", "manual"
        },
        {
            "entry_time": 1705488000000,
            "exit_time": 1705497900000,
            "side": "SHORT",
            "entry_price": 46000.0,
            "exit_price": 45500.0,
            "quantity": 0.3,
            "pnl": 150.0,
            "pnl_pct": 1.09,
            "reason": "signal"
        }
    ],
    "metrics": {
        "total_trades": 42,
        "winning_trades": 28,
        "losing_trades": 14,
        "win_rate": 66.67,                    # Percentage 0-100
        "total_pnl": 1530.50,
        "total_pnl_pct": 15.31,               # Percentage 0-100
        "max_drawdown": 520.00,
        "max_drawdown_pct": 5.20,             # Percentage 0-100
        "sharpe_ratio": 1.85,
        "profit_factor": 2.15
    },
    "equity_curve": [
        {"timestamp": 1705315800000, "equity": 10000.0},
        {"timestamp": 1705402200000, "equity": 10250.0},
        {"timestamp": 1705488600000, "equity": 10500.0},
        {"timestamp": 1705575000000, "equity": 10750.0},
        {"timestamp": 1705661400000, "equity": 11000.0}
    ]
}
```

---

## Validation Rules

### Trades
- ✅ `entry_time` and `exit_time` must be integers (milliseconds)
- ✅ `exit_time` must be AFTER `entry_time`
- ✅ `side` must be exactly "LONG" or "SHORT" (case-sensitive)
- ✅ `entry_price`, `exit_price`, `quantity` must be positive numbers
- ✅ `pnl` can be negative (losing trade)
- ✅ `pnl_pct` is percentage (e.g., 2.5 means 2.5%, not 0.025)
- ✅ `reason` must be one of: "stop_loss", "take_profit", "signal", "manual"

### Metrics
- ✅ All counts (`total_trades`, `winning_trades`, `losing_trades`) must be non-negative integers
- ✅ `total_trades` MUST equal `winning_trades + losing_trades`
- ✅ `win_rate` must be 0-100 (percentage)
- ✅ `total_pnl_pct` and `max_drawdown_pct` are percentages (0-100 scale)
- ✅ All numeric fields required (no null/undefined)

### Equity Curve
- ✅ `timestamp` must be integer (milliseconds)
- ✅ `equity` must be numeric
- ✅ Points must be in chronological order (timestamps ascending)
- ✅ Can be empty array `[]` if not available

---

## Common Mistakes to Avoid

❌ **Wrong timestamp format:**
```python
"entry_time": "2024-01-15 10:30:00"  # WRONG - must be int milliseconds
```
✅ **Correct:**
```python
"entry_time": 1705315800000  # Correct - milliseconds since epoch
```

❌ **Percentage as decimal:**
```python
"pnl_pct": 0.0333  # WRONG - frontend expects 3.33, not 0.0333
```
✅ **Correct:**
```python
"pnl_pct": 3.33  # Correct - percentage value
```

❌ **Wrong enum values:**
```python
"side": "long"      # WRONG - must be uppercase
"side": "BUY"       # WRONG - must be "LONG" or "SHORT"
"reason": "sl"      # WRONG - must be full word "stop_loss"
```
✅ **Correct:**
```python
"side": "LONG"
"reason": "stop_loss"
```

❌ **Missing required fields:**
```python
{
    "trades": [...],
    "metrics": {...}
    # WRONG - missing "equity_curve"
}
```
✅ **Correct:**
```python
{
    "trades": [...],
    "metrics": {...},
    "equity_curve": []  # Can be empty but must be present
}
```

---

## Testing Your Backtest

Before deploying, test your backtest locally:

```python
# In your strategy file
if __name__ == '__main__':
    import pandas as pd
    from datetime import datetime, timedelta

    # Create sample data
    dates = pd.date_range(start='2024-01-01', periods=100, freq='1H')
    df = pd.DataFrame({
        'timestamp': [int(d.timestamp() * 1000) for d in dates],
        'open': 45000 + np.random.randn(100) * 100,
        'high': 45100 + np.random.randn(100) * 100,
        'low': 44900 + np.random.randn(100) * 100,
        'close': 45000 + np.random.randn(100) * 100,
        'volume': 1000 + np.random.randn(100) * 100
    })

    # Run your backtest
    strategy = MyStrategy()
    result = strategy.backtest(df, {
        'initial_capital': 10000,
        'risk_per_trade': 0.01,
        'leverage': 10,
        'commission': 0.001
    })

    # Validate result
    from xcoin_cli.backtest_schema import validate_backtest_result, format_validation_errors

    is_valid, errors = validate_backtest_result(result)
    print(format_validation_errors(errors))

    if is_valid:
        print("✅ Backtest result is valid!")
        print(f"Total trades: {result['metrics']['total_trades']}")
        print(f"Win rate: {result['metrics']['win_rate']:.2f}%")
    else:
        print("❌ Fix the errors above before deploying")
```

---

## Questions?

If you're unsure about any field:
1. Check `cli/xcoin_cli/backtest_schema.py` for type definitions
2. See `cli/xcoin_cli/templates/example_custom_backtest_strategy.py` for working example
3. Run `xcoin validate` to check your strategy locally
4. Check backend logs after upload for validation errors

