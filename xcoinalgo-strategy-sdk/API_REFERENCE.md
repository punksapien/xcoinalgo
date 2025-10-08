# XcoinAlgo Strategy SDK - API Reference

Complete reference documentation for all classes, methods, and models in the XcoinAlgo Strategy SDK.

## Table of Contents

1. [BaseStrategy Class](#basestrategy-class)
2. [Pydantic Models](#pydantic-models)
3. [Testing Framework](#testing-framework)
4. [Data Formats](#data-formats)

---

## BaseStrategy Class

Located in `xcoinalgo.base`

The abstract base class that all trading strategies must inherit from.

### Class: `BaseStrategy`

```python
from xcoinalgo import BaseStrategy

class MyStrategy(BaseStrategy):
    pass
```

#### Attributes

- **`name`** (str): Strategy name for display
- **`version`** (str): Strategy version (recommended: semantic versioning)
- **`description`** (Optional[str]): Strategy description
- **`author`** (Optional[str]): Strategy author name

#### Methods

### `__init__(self)`

Initialize the strategy. Always call `super().__init__()` first.

**Example:**
```python
def __init__(self, param1=10):
    super().__init__()
    self.name = "My Strategy"
    self.version = "1.0.0"
    self.param1 = param1
```

---

### `on_data(self, data: pd.DataFrame) -> Dict[str, Any]` **(REQUIRED)**

Main strategy method called at each candle close. **Must be implemented by all strategies.**

**Parameters:**
- **`data`** (pd.DataFrame): Historical OHLCV data with columns:
  - `timestamp` (int): Unix timestamp
  - `open` (float): Opening price
  - `high` (float): Highest price in period
  - `low` (float): Lowest price in period
  - `close` (float): Closing price
  - `volume` (float): Trading volume

  The DataFrame is sorted by timestamp in ascending order. Use `.iloc[-1]` to access the most recent (current) candle.

**Returns:**
- **dict**: Trading signal with the following structure:

  **Required fields:**
  - `action` (str): One of `"BUY"`, `"SELL"`, or `"HOLD"`

  **Optional fields:**
  - `entryPrice` (float): Suggested entry price (defaults to current close if not specified)
  - `stopLoss` (float): Stop loss price
  - `takeProfit` (float): Take profit price
  - `confidence` (float): Confidence level between 0.0 and 1.0
  - `metadata` (dict): Additional information for logging

**Example:**
```python
def on_data(self, data: pd.DataFrame) -> dict:
    # Check minimum data length
    if len(data) < 50:
        return {"action": "HOLD"}

    # Calculate indicators
    data['SMA_20'] = data['close'].rolling(20).mean()
    data['SMA_50'] = data['close'].rolling(50).mean()

    # Check for NaN
    if pd.isna(data['SMA_50'].iloc[-1]):
        return {"action": "HOLD"}

    # Get current values
    current_price = data['close'].iloc[-1]
    sma_20 = data['SMA_20'].iloc[-1]
    sma_50 = data['SMA_50'].iloc[-1]

    # Golden cross (BUY signal)
    if sma_20 > sma_50:
        return {
            "action": "BUY",
            "entryPrice": current_price,
            "stopLoss": current_price * 0.98,
            "takeProfit": current_price * 1.04,
            "confidence": 0.75,
            "metadata": {
                "sma_20": sma_20,
                "sma_50": sma_50,
                "reason": "golden_cross"
            }
        }

    # Death cross (SELL signal)
    elif sma_20 < sma_50:
        return {
            "action": "SELL",
            "entryPrice": current_price,
            "stopLoss": current_price * 1.02,
            "takeProfit": current_price * 0.96
        }

    return {"action": "HOLD"}
```

---

### `on_start(self) -> None` *(Optional)*

Called once when the strategy starts, before the first `on_data()` call.

Use this to:
- Initialize state variables
- Load pre-trained models
- Set up indicators
- Perform any setup tasks

**Example:**
```python
def on_start(self):
    self.state = {
        'last_signal': None,
        'trade_count': 0
    }
    print(f"{self.name} started")
```

---

### `on_stop(self) -> None` *(Optional)*

Called once when the strategy stops, after the last `on_data()` call.

Use this to:
- Clean up resources
- Save state
- Log final statistics
- Perform teardown tasks

**Example:**
```python
def on_stop(self):
    print(f"{self.name} stopped after {self.state['trade_count']} trades")
    # Save state to file
    with open('strategy_state.json', 'w') as f:
        json.dump(self.state, f)
```

---

### `on_trade(self, trade: Dict[str, Any]) -> None` *(Optional)*

Called after a trade is executed (if strategy is running live).

**Parameters:**
- **`trade`** (dict): Information about the executed trade:
  - `action` (str): `"BUY"` or `"SELL"`
  - `symbol` (str): Trading pair (e.g., "BTCUSDT")
  - `quantity` (float): Amount traded
  - `price` (float): Execution price
  - `timestamp` (int): Execution time (Unix timestamp)

**Example:**
```python
def on_trade(self, trade: dict):
    self.state['trade_count'] += 1
    self.state['last_trade'] = trade
    print(f"Trade executed: {trade['action']} {trade['quantity']} @ {trade['price']}")
```

---

## Pydantic Models

Located in `xcoinalgo.models`

Type-safe data models with validation.

### Model: `Signal`

Trading signal returned by `on_data()`.

**Fields:**
- **`action`** (Literal["BUY", "SELL", "HOLD"]): Trading action (required)
- **`entryPrice`** (Optional[float]): Entry price, must be > 0
- **`stopLoss`** (Optional[float]): Stop loss price, must be > 0
- **`takeProfit`** (Optional[float]): Take profit price, must be > 0
- **`confidence`** (Optional[float]): Confidence level, must be between 0.0 and 1.0
- **`metadata`** (Optional[Dict[str, Any]]): Additional metadata

**Validation Rules:**
- For BUY signals: stopLoss must be < entryPrice, takeProfit must be > entryPrice
- For SELL signals: stopLoss must be > entryPrice, takeProfit must be < entryPrice

**Example:**
```python
from xcoinalgo.models import Signal

# Valid signal
signal = Signal(
    action="BUY",
    entryPrice=45000.0,
    stopLoss=44100.0,  # Below entry (valid for BUY)
    takeProfit=46800.0,  # Above entry (valid for BUY)
    confidence=0.85
)

# Invalid signal (will raise ValidationError)
signal = Signal(
    action="BUY",
    entryPrice=45000.0,
    stopLoss=46000.0  # Above entry (invalid for BUY!)
)
```

---

### Model: `StrategyConfig`

Strategy configuration and metadata.

**Fields:**
- **`name`** (str): Strategy name (1-100 chars)
- **`code`** (str): Unique strategy code (1-50 chars, lowercase alphanumeric + underscores)
- **`version`** (str): Version in semver format (e.g., "1.0.0")
- **`description`** (Optional[str]): Description (max 500 chars)
- **`author`** (str): Author name (1-100 chars)
- **`symbol`** (str): Trading pair (e.g., "BTCUSDT")
- **`resolution`** (str): Candle resolution in minutes ("1", "5", "15", "30", "60", "240", "1440")
- **`lookbackPeriod`** (int): Number of historical candles (1-1000, default 100)
- **`tags`** (Optional[str]): Comma-separated tags

**Example:**
```python
from xcoinalgo.models import StrategyConfig

config = StrategyConfig(
    name="SMA Crossover",
    code="sma_cross_v1",
    version="1.0.0",
    description="Simple moving average crossover strategy",
    author="John Doe",
    symbol="BTCUSDT",
    resolution="5",  # 5-minute candles
    lookbackPeriod=200,
    tags="momentum,trend-following"
)
```

---

### Model: `BacktestResult`

Results from a strategy backtest.

**Fields:**
- **`totalTrades`** (int): Total number of trades
- **`winningTrades`** (int): Number of winning trades
- **`losingTrades`** (int): Number of losing trades
- **`winRate`** (float): Win rate (0.0 to 1.0)
- **`totalPnl`** (float): Total profit/loss
- **`maxDrawdown`** (float): Maximum drawdown percentage
- **`sharpeRatio`** (Optional[float]): Sharpe ratio
- **`startDate`** (datetime): Backtest start date
- **`endDate`** (datetime): Backtest end date

**Example:**
```python
# Returned from StrategyTester.backtest()
result = tester.backtest(data, initial_capital=10000, risk_per_trade=0.02)

print(f"Total Trades: {result.totalTrades}")
print(f"Win Rate: {result.winRate:.2%}")
print(f"Total P&L: ${result.totalPnl:.2f}")
print(f"Max Drawdown: {result.maxDrawdown:.2f}%")
```

---

### Model: `Trade`

Individual trade record.

**Fields:**
- **`symbol`** (str): Trading pair
- **`side`** (Literal["BUY", "SELL"]): Trade side
- **`quantity`** (float): Trade quantity (> 0)
- **`entryPrice`** (float): Entry price (> 0)
- **`exitPrice`** (Optional[float]): Exit price (> 0)
- **`stopLoss`** (Optional[float]): Stop loss price (> 0)
- **`takeProfit`** (Optional[float]): Take profit price (> 0)
- **`entryTime`** (datetime): Entry timestamp
- **`exitTime`** (Optional[datetime]): Exit timestamp
- **`pnl`** (float): Profit/loss
- **`status`** (Literal["OPEN", "CLOSED"]): Trade status

---

## Testing Framework

Located in `xcoinalgo.testing`

Tools for validating and testing strategies locally.

### Class: `StrategyValidator`

Validates strategy implementation and signals.

#### `StrategyValidator.validate_signal(signal: Dict[str, Any]) -> tuple[bool, Optional[str]]`

Validate that a signal dictionary matches the expected format.

**Parameters:**
- **`signal`** (dict): Signal dictionary returned from `on_data()`

**Returns:**
- **tuple**: `(is_valid, error_message)`
  - `is_valid` (bool): True if signal is valid
  - `error_message` (Optional[str]): None if valid, error description if invalid

**Example:**
```python
from xcoinalgo.testing import StrategyValidator

# Valid signal
signal = {"action": "BUY", "entryPrice": 45000.0, "stopLoss": 44100.0}
is_valid, error = StrategyValidator.validate_signal(signal)
print(is_valid)  # True
print(error)     # None

# Invalid signal
signal = {"action": "INVALID"}
is_valid, error = StrategyValidator.validate_signal(signal)
print(is_valid)  # False
print(error)     # "action must be one of ['BUY', 'SELL', 'HOLD']"
```

---

#### `StrategyValidator.validate_strategy(strategy: BaseStrategy) -> tuple[bool, List[str]]`

Validate that a strategy correctly implements the BaseStrategy interface.

**Parameters:**
- **`strategy`** (BaseStrategy): Strategy instance to validate

**Returns:**
- **tuple**: `(is_valid, issues)`
  - `is_valid` (bool): True if strategy is valid
  - `issues` (List[str]): List of validation issues (empty if valid)

**Example:**
```python
from xcoinalgo.testing import StrategyValidator

strategy = MyStrategy()
is_valid, issues = StrategyValidator.validate_strategy(strategy)

if is_valid:
    print("Strategy is valid!")
else:
    print("Issues found:")
    for issue in issues:
        print(f"  - {issue}")
```

---

### Class: `StrategyTester`

Test strategies locally with historical data.

#### `__init__(self, strategy: BaseStrategy)`

Initialize the tester with a strategy.

**Parameters:**
- **`strategy`** (BaseStrategy): Strategy instance to test

**Example:**
```python
from xcoinalgo.testing import StrategyTester

strategy = MyStrategy()
tester = StrategyTester(strategy)
```

---

#### `validate(self) -> tuple[bool, List[str]]`

Validate the strategy implementation.

**Returns:**
- **tuple**: `(is_valid, issues)` (same as StrategyValidator.validate_strategy)

**Example:**
```python
is_valid, issues = tester.validate()
if not is_valid:
    print("Validation failed:", issues)
```

---

#### `run_single(self, data: pd.DataFrame) -> tuple[Dict[str, Any], bool, Optional[str]]`

Run strategy once with provided data.

**Parameters:**
- **`data`** (pd.DataFrame): Historical OHLCV DataFrame

**Returns:**
- **tuple**: `(signal, is_valid, error_message)`
  - `signal` (dict): Signal returned by strategy
  - `is_valid` (bool): True if signal is valid
  - `error_message` (Optional[str]): Error description if any

**Example:**
```python
import pandas as pd

# Load data
data = pd.read_csv('historical_data.csv')

# Test once
signal, is_valid, error = tester.run_single(data)

if is_valid:
    print(f"Signal: {signal}")
else:
    print(f"Error: {error}")
```

---

#### `backtest(self, data: pd.DataFrame, initial_capital: float = 10000.0, risk_per_trade: float = 0.02) -> BacktestResult`

Run a backtest simulation on historical data.

**Parameters:**
- **`data`** (pd.DataFrame): Historical OHLCV DataFrame with columns: [timestamp, open, high, low, close, volume]
- **`initial_capital`** (float): Starting capital (default: 10000.0)
- **`risk_per_trade`** (float): Risk per trade as decimal (default: 0.02 = 2%)

**Returns:**
- **BacktestResult**: Backtest statistics

**Note:** This is a simplified backtest for validation purposes. For production backtesting, use specialized tools like Backtrader or VectorBT.

**Example:**
```python
import pandas as pd

# Load historical data
data = pd.read_csv('BTCUSDT_5m_data.csv')

# Run backtest
result = tester.backtest(
    data,
    initial_capital=10000.0,
    risk_per_trade=0.02  # 2% risk per trade
)

# Print results
print(f"Total Trades: {result.totalTrades}")
print(f"Win Rate: {result.winRate:.2%}")
print(f"Winning Trades: {result.winningTrades}")
print(f"Losing Trades: {result.losingTrades}")
print(f"Total P&L: ${result.totalPnl:.2f}")
print(f"Max Drawdown: {result.maxDrawdown:.2f}%")
print(f"Period: {result.startDate} to {result.endDate}")
```

---

### Function: `validate_strategy_file(filepath: str) -> tuple[bool, List[str]]`

Validate a Python strategy file without importing it into your environment.

**Parameters:**
- **`filepath`** (str): Path to the strategy Python file

**Returns:**
- **tuple**: `(is_valid, issues)`
  - `is_valid` (bool): True if file is valid
  - `issues` (List[str]): List of validation issues

**Example:**
```python
from xcoinalgo.testing import validate_strategy_file

is_valid, issues = validate_strategy_file('my_strategy.py')

if is_valid:
    print("Strategy file is valid!")
else:
    print("Issues found:")
    for issue in issues:
        print(f"  - {issue}")
```

---

## Data Formats

### OHLCV DataFrame Format

The `data` parameter passed to `on_data()` is a pandas DataFrame with the following structure:

**Required Columns:**
- **`timestamp`** (int): Unix timestamp in seconds
- **`open`** (float): Opening price of the candle
- **`high`** (float): Highest price during the candle period
- **`low`** (float): Lowest price during the candle period
- **`close`** (float): Closing price of the candle
- **`volume`** (float): Trading volume during the candle period

**Data Ordering:**
- Sorted by `timestamp` in ascending order (oldest first, newest last)
- Use `.iloc[-1]` to access the most recent (current) candle
- Use `.iloc[-2]` to access the previous candle

**Example CSV Format:**
```csv
timestamp,open,high,low,close,volume
1640995200,46000.0,46500.0,45800.0,46200.0,1000.5
1640995500,46200.0,46400.0,46000.0,46100.0,1200.3
1640995800,46100.0,46300.0,45900.0,46050.0,980.7
```

**Example DataFrame:**
```python
import pandas as pd

data = pd.DataFrame({
    'timestamp': [1640995200, 1640995500, 1640995800],
    'open': [46000.0, 46200.0, 46100.0],
    'high': [46500.0, 46400.0, 46300.0],
    'low': [45800.0, 46000.0, 45900.0],
    'close': [46200.0, 46100.0, 46050.0],
    'volume': [1000.5, 1200.3, 980.7]
})

# Access most recent candle
current_close = data['close'].iloc[-1]  # 46050.0
previous_close = data['close'].iloc[-2]  # 46100.0
```

---

## Complete Example

Here's a complete example using all components:

```python
from xcoinalgo import BaseStrategy
from xcoinalgo.testing import StrategyTester, StrategyValidator
import pandas as pd

# 1. Define strategy
class MyStrategy(BaseStrategy):
    def __init__(self, fast=20, slow=50):
        super().__init__()
        self.name = "SMA Crossover"
        self.version = "1.0.0"
        self.fast_period = fast
        self.slow_period = slow

    def on_data(self, data):
        # Check minimum data
        if len(data) < self.slow_period:
            return {"action": "HOLD"}

        # Calculate indicators
        data['SMA_fast'] = data['close'].rolling(self.fast_period).mean()
        data['SMA_slow'] = data['close'].rolling(self.slow_period).mean()

        # Check for NaN
        if pd.isna(data['SMA_slow'].iloc[-1]):
            return {"action": "HOLD"}

        # Generate signal
        current_price = data['close'].iloc[-1]

        if data['SMA_fast'].iloc[-1] > data['SMA_slow'].iloc[-1]:
            return {
                "action": "BUY",
                "entryPrice": current_price,
                "stopLoss": current_price * 0.98,
                "takeProfit": current_price * 1.04
            }

        return {"action": "HOLD"}

# 2. Load data
data = pd.read_csv('historical_data.csv')

# 3. Create and validate strategy
strategy = MyStrategy(fast=20, slow=50)

# Validate implementation
is_valid, issues = StrategyValidator.validate_strategy(strategy)
print(f"Valid: {is_valid}")

# 4. Test with single run
tester = StrategyTester(strategy)
signal, is_valid, error = tester.run_single(data)
print(f"Signal: {signal}")

# 5. Backtest
result = tester.backtest(data, initial_capital=10000, risk_per_trade=0.02)
print(f"Win Rate: {result.winRate:.2%}")
print(f"Total P&L: ${result.totalPnl:.2f}")
print(f"Max Drawdown: {result.maxDrawdown:.2f}%")
```

---

## Best Practices

1. **Always check data length** before calculating indicators
2. **Handle NaN values** from rolling calculations
3. **Use parameters** instead of hardcoded values
4. **Always set stop loss** for risk management
5. **Add metadata** to signals for debugging
6. **Validate locally** before deploying
7. **Test thoroughly** with historical data
8. **Avoid look-ahead bias** (only use data up to current candle)

---

## Need Help?

- See `STRATEGY_GUIDE.md` for comprehensive development guide
- Check `examples/` directory for working strategies
- Read test files in `tests/` for usage examples
