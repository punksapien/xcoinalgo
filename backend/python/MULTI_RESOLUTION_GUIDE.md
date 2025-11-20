# Multi-Resolution Strategy Guide

## Overview

Multi-resolution strategies allow you to use different timeframes for:
- **Entry Signals**: Calculated on higher timeframes (e.g., 15m) to reduce noise
- **Exit Management**: Monitored on lower timeframes (e.g., 5m) for tighter risk control

## Configuration

Add `STRATEGY_CONFIG` constant at the top of your strategy.py file:

```python
# At the very top of strategy.py (before class definitions)
STRATEGY_CONFIG = {
    "is_multi_resolution": True,      # Enable multi-resolution support
    "signal_resolution": "15m",       # Timeframe for entry signal indicators
    "exit_resolution": "5m",          # Timeframe for position management
    "base_resolution": "5m"           # Base fetch resolution (from exchange)
}
```

## How It Works

### Execution Flow

1. **Scheduler triggers at base_resolution** (e.g., every 5 minutes)
2. **Wrapper fetches candles** at base_resolution (200 x 5m candles)
3. **Resampling** (if signal_resolution != base_resolution):
   - Resample 5m → 15m using OHLC aggregation rules
   - Calculate indicators (EMA, RSI, etc.) on 15m data
   - Generate entry signals on 15m
4. **Forward-fill signals** back to 5m resolution
5. **Per-subscriber execution**:
   - Users WITHOUT position: Check entry signals (from 15m analysis)
   - Users WITH position: Manage exits (using 5m precision)

### Resampling Rules

```
5m Candles:
  12:00 open=100 high=105 low=99  close=102
  12:05 open=102 high=107 low=101 close=106
  12:10 open=106 high=110 low=105 close=108

Resampled to 15m:
  12:00 open=100 high=110 low=99  close=108  (aggregates 3x 5m candles)
         ↑ first  ↑ max   ↑ min   ↑ last
```

## Example Strategy

```python
# ============================================================================
# STRATEGY CONFIG (Multi-Resolution)
# ============================================================================
STRATEGY_CONFIG = {
    "is_multi_resolution": True,
    "signal_resolution": "15m",   # Entry on 15m trend changes
    "exit_resolution": "5m",      # Exit on 5m SL/TP hits
    "base_resolution": "5m"       # Fetch 5m candles
}

# ============================================================================
# IMPORTS
# ============================================================================
import pandas as pd
import numpy as np
from datetime import datetime, timezone
import logging

# ============================================================================
# TRADER CLASS
# ============================================================================
class Trader:
    """Base trader class"""
    def __init__(self, settings):
        self.settings = settings

    def generate_signals(self, df, params):
        """
        Generate entry signals.

        Wrapper will pass:
        - df: Resampled to signal_resolution (15m) if multi-res enabled
        - params: Strategy settings

        Returns:
        - DataFrame with signal columns added
        """
        df = df.copy()

        # Calculate indicators on 15m timeframe (cleaner signals)
        df['ema_fast'] = df['close'].ewm(span=9).mean()
        df['ema_slow'] = df['close'].ewm(span=21).mean()

        # Generate signals
        df['signal'] = 0
        df.loc[df['ema_fast'] > df['ema_slow'], 'signal'] = 1   # Long
        df.loc[df['ema_fast'] < df['ema_slow'], 'signal'] = -1  # Short

        # Stop-loss and take-profit levels
        df['stop_loss'] = None
        df['take_profit'] = None

        return df

class LiveTrader(Trader):
    """Live trading implementation"""

    def __init__(self, settings):
        super().__init__(settings)
        # Your initialization code

    def get_latest_data(self):
        """Fetch base_resolution candles from exchange"""
        # Your data fetching code
        pass

    def check_for_new_signal(self, df, user_input_balance=None):
        """
        Check for NEW entry signals (users WITHOUT positions).

        Receives:
        - df: Base resolution (5m) with forward-filled signals from 15m
        - user_input_balance: Capital for position sizing
        """
        latest = df.iloc[-1]

        if latest['signal'] == 1:  # Long signal (from 15m analysis)
            logging.info("📈 Long signal detected (from 15m trend)")
            # Enter long position
        elif latest['signal'] == -1:  # Short signal
            logging.info("📉 Short signal detected (from 15m trend)")
            # Enter short position

    def check_and_manage_position(self, df):
        """
        Manage EXISTING positions (users WITH positions).

        Receives:
        - df: Base resolution (5m) for tight position management

        Note: Uses 5m data for tight stop-loss/take-profit monitoring
        """
        latest = df.iloc[-1]

        # Check stop-loss and take-profit on 5m precision
        if self.should_exit_position(latest):
            logging.info("🛑 Exiting position (5m exit signal)")
            # Close position
```

## Supported Resolutions

```python
"1m"   # 1-minute  (ultra-high frequency)
"5m"   # 5-minute  (high frequency)
"15m"  # 15-minute (medium frequency)
"30m"  # 30-minute
"1h"   # 1-hour
"4h"   # 4-hour
"1d"   # Daily
```

## Use Cases

### 1. Noise Reduction Strategy
```python
STRATEGY_CONFIG = {
    "is_multi_resolution": True,
    "signal_resolution": "15m",  # Cleaner trend on 15m
    "exit_resolution": "5m",     # Tight stops on 5m
    "base_resolution": "5m"
}
```
**Benefit:** Fewer false signals, faster exits

### 2. Swing Trading with Tight Stops
```python
STRATEGY_CONFIG = {
    "is_multi_resolution": True,
    "signal_resolution": "4h",   # Major trend on 4h
    "exit_resolution": "15m",    # Manage risk on 15m
    "base_resolution": "15m"
}
```
**Benefit:** Capture big moves, protect profits quickly

### 3. Single Resolution (Backward Compatible)
```python
STRATEGY_CONFIG = {
    "is_multi_resolution": False  # or omit STRATEGY_CONFIG entirely
}
```
**Benefit:** Simpler logic for strategies that don't need multi-res

## Performance Impact

- **Resampling time:** ~10ms for 200 candles (negligible)
- **API calls:** No increase (still fetches base_resolution once)
- **Memory:** Minimal (stores resampled df temporarily)
- **Idempotency:** Guaranteed (same input → same output)

## Debugging

Enable detailed logging to see multi-resolution flow:

```bash
# Check wrapper logs
pm2 logs strategy-scheduler --lines 100

# Look for:
# 📐 Multi-resolution strategy detected:
#    Signal Resolution: 15m
#    Exit Resolution: 5m
#    Resampling 5m → 15m for entry signals...
#    Forward-filling signal columns: ['signal', 'stop_loss']
#    ✅ Signals generated on 15m, applied to 5m
```

## Common Pitfalls

### ❌ Wrong: Hardcoding resolution in generate_signals
```python
def generate_signals(self, df, params):
    # Don't do this - wrapper already resamples!
    df_15m = df.resample('15T').agg(...)  # ❌ Wrong
```

### ✅ Correct: Let wrapper handle resampling
```python
def generate_signals(self, df, params):
    # df is already at signal_resolution (15m) if multi-res enabled
    df['ema'] = df['close'].ewm(span=21).mean()  # ✅ Correct
```

### ❌ Wrong: Assuming 5m data in check_and_manage_position
```python
def check_and_manage_position(self, df):
    # Wrapper passes 5m data, but don't assume specific resolution
    if df.index[0] - df.index[1] == timedelta(minutes=5):  # ❌ Fragile
```

### ✅ Correct: Use latest candle regardless of resolution
```python
def check_and_manage_position(self, df):
    latest = df.iloc[-1]  # ✅ Works with any resolution
    # Check exit conditions...
```

## Migration Guide

### Existing Single-Resolution Strategy → Multi-Resolution

1. **Add STRATEGY_CONFIG** at top of file
2. **Test backward compatibility** (set `is_multi_resolution: False`)
3. **Enable multi-resolution** (set to `True`)
4. **Adjust indicators** if needed (15m requires different parameters)
5. **Paper trade** for 1 week before going live

## FAQ

**Q: Can I use different resolutions per subscriber?**
A: No, `STRATEGY_CONFIG` is strategy-level. All subscribers use the same resolutions.

**Q: Can signal_resolution be lower than base_resolution?**
A: No, you can only resample UP (5m → 15m), not down (15m → 5m).

**Q: Does this work with backtesting?**
A: Currently only supported in live multi-tenant execution. Backtest mode uses single resolution.

**Q: How do I know which resolution my signals are using?**
A: Check wrapper logs for "Signals generated on {resolution}, applied to {base}"

## Support

For issues or questions, check:
- Wrapper logs: `pm2 logs strategy-scheduler`
- Strategy execution table: `prisma.strategyExecution`
- Redis locks: `redis-cli KEYS "lock:strategy:*"`
