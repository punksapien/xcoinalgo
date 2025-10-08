# Strategy Development Guide

Complete guide for writing trading strategies using the XcoinAlgo SDK.

## Table of Contents
1. [Getting Started](#getting-started)
2. [Strategy Structure](#strategy-structure)
3. [Signal Format](#signal-format)
4. [Best Practices](#best-practices)
5. [Testing](#testing)
6. [Common Patterns](#common-patterns)

## Getting Started

### Installation

```bash
pip install xcoinalgo-strategy-sdk
```

### Minimal Strategy

```python
from xcoinalgo import BaseStrategy

class MinimalStrategy(BaseStrategy):
    def __init__(self):
        super().__init__()
        self.name = "Minimal Strategy"
        self.version = "1.0.0"

    def on_data(self, data):
        return {"action": "HOLD"}
```

## Strategy Structure

### Required Methods

Every strategy must:
1. Inherit from `BaseStrategy`
2. Call `super().__init__()` in constructor
3. Implement `on_data()` method

### Complete Example

```python
from xcoinalgo import BaseStrategy
import pandas as pd

class MyStrategy(BaseStrategy):
    def __init__(self, param1=10, param2=20):
        super().__init__()

        # Required metadata
        self.name = "My Strategy"
        self.version = "1.0.0"
        self.description = "Description of strategy"
        self.author = "Your Name"

        # Strategy parameters
        self.param1 = param1
        self.param2 = param2

    def on_start(self):
        """Called once when strategy starts"""
        self.state = {}  # Initialize any state

    def on_data(self, data: pd.DataFrame) -> dict:
        """Called at each candle close"""

        # 1. Validate data
        if len(data) < self.param2:
            return {"action": "HOLD"}

        # 2. Calculate indicators
        data['SMA'] = data['close'].rolling(self.param1).mean()

        # 3. Check for NaN
        if pd.isna(data['SMA'].iloc[-1]):
            return {"action": "HOLD"}

        # 4. Generate signal
        current_price = data['close'].iloc[-1]

        if data['SMA'].iloc[-1] > current_price:
            return {
                "action": "BUY",
                "entryPrice": current_price,
                "stopLoss": current_price * 0.98,
                "takeProfit": current_price * 1.05
            }

        return {"action": "HOLD"}

    def on_stop(self):
        """Called once when strategy stops"""
        pass
```

## Signal Format

### Required Field

- `action`: Must be "BUY", "SELL", or "HOLD"

### Optional Fields

- `entryPrice`: Suggested entry price (defaults to current price)
- `stopLoss`: Stop loss price
- `takeProfit`: Take profit price
- `confidence`: Confidence 0.0-1.0
- `metadata`: Dict for logging

### Valid Signals

```python
# Minimal
{"action": "HOLD"}

# Buy with SL/TP
{
    "action": "BUY",
    "entryPrice": 45000.0,
    "stopLoss": 44100.0,
    "takeProfit": 46800.0
}

# With confidence and metadata
{
    "action": "SELL",
    "entryPrice": 45000.0,
    "stopLoss": 45900.0,
    "takeProfit": 43200.0,
    "confidence": 0.85,
    "metadata": {
        "indicator": "RSI",
        "value": 75.2
    }
}
```

## Best Practices

### 1. Always Check Data Length

```python
def on_data(self, data):
    if len(data) < 50:  # Need 50 candles
        return {"action": "HOLD"}
```

### 2. Handle NaN Values

```python
indicator = data['close'].rolling(20).mean()
if pd.isna(indicator.iloc[-1]):
    return {"action": "HOLD"}
```

### 3. Use Parameters

```python
# Good
class Strategy(BaseStrategy):
    def __init__(self, period=20):
        super().__init__()
        self.period = period

# Bad - hardcoded
class Strategy(BaseStrategy):
    def on_data(self, data):
        data['SMA'] = data['close'].rolling(20).mean()
```

### 4. Set Stop Loss

```python
# Always include stop loss
return {
    "action": "BUY",
    "stopLoss": current_price * 0.98
}
```

### 5. Add Metadata

```python
return {
    "action": "BUY",
    "metadata": {
        "reason": "golden_cross",
        "sma_fast": 100.5,
        "sma_slow": 98.2
    }
}
```

## Testing

### Local Testing

```python
from xcoinalgo import StrategyTester
import pandas as pd

# Load data
data = pd.read_csv('historical.csv')

# Create and test
strategy = MyStrategy()
tester = StrategyTester(strategy)

# Validate
is_valid, issues = tester.validate()
print("Valid:", is_valid)

# Backtest
result = tester.backtest(data, initial_capital=10000, risk_per_trade=0.02)
print(f"Win Rate: {result.winRate:.2%}")
print(f"Total P&L: ${result.totalPnl:.2f}")
```

### Data Format

Your CSV should have:
```
timestamp,open,high,low,close,volume
1640995200,46000,46500,45800,46200,1000
1640995500,46200,46400,46000,46100,1200
...
```

## Common Patterns

### Moving Average Crossover

```python
def on_data(self, data):
    data['SMA_20'] = data['close'].rolling(20).mean()
    data['SMA_50'] = data['close'].rolling(50).mean()

    if data['SMA_20'].iloc[-1] > data['SMA_50'].iloc[-1]:
        return {"action": "BUY"}
    return {"action": "HOLD"}
```

### RSI Overbought/Oversold

```python
def calculate_rsi(self, prices, period=14):
    delta = prices.diff()
    gain = delta.where(delta > 0, 0).rolling(period).mean()
    loss = -delta.where(delta < 0, 0).rolling(period).mean()
    rs = gain / loss
    return 100 - (100 / (1 + rs))

def on_data(self, data):
    rsi = self.calculate_rsi(data['close'])

    if rsi.iloc[-1] < 30:  # Oversold
        return {"action": "BUY"}
    elif rsi.iloc[-1] > 70:  # Overbought
        return {"action": "SELL"}
    return {"action": "HOLD"}
```

### Bollinger Bands

```python
def on_data(self, data):
    data['SMA'] = data['close'].rolling(20).mean()
    data['STD'] = data['close'].rolling(20).std()
    data['Upper'] = data['SMA'] + (2 * data['STD'])
    data['Lower'] = data['SMA'] - (2 * data['STD'])

    price = data['close'].iloc[-1]

    if price < data['Lower'].iloc[-1]:
        return {"action": "BUY"}
    elif price > data['Upper'].iloc[-1]:
        return {"action": "SELL"}
    return {"action": "HOLD"}
```

## Common Pitfalls

### ❌ Don't Look Ahead

```python
# Bad - uses future data
if data['close'].iloc[0] > 100:  # This is the future!
    return {"action": "BUY"}

# Good - uses past/current only
if data['close'].iloc[-1] > 100:
    return {"action": "BUY"}
```

### ❌ Don't Forget NaN

```python
# Bad
sma = data['close'].rolling(50).mean()
if sma.iloc[-1] > 100:  # Might be NaN!

# Good
sma = data['close'].rolling(50).mean()
if pd.isna(sma.iloc[-1]):
    return {"action": "HOLD"}
if sma.iloc[-1] > 100:
    return {"action": "BUY"}
```

### ❌ Don't Use Print

```python
# Bad
print(f"Price: {price}")

# Good
return {
    "action": "BUY",
    "metadata": {"price": price}
}
```

## Need Help?

- Check `examples/` directory
- Read API docs at docs.xcoinalgo.com
- Run example strategies to learn
