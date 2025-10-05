# XCoinAlgo Strategy SDK - Quick Start Guide

**For Quant Researchers & Strategy Developers**

Build, test, and deploy cryptocurrency trading strategies on the XCoinAlgo platform in minutes.

---

## Table of Contents
1. [Installation](#installation)
2. [Your First Strategy (5 Minutes)](#your-first-strategy-5-minutes)
3. [Understanding the SDK](#understanding-the-sdk)
4. [Example Strategies](#example-strategies)
5. [Local Backtesting](#local-backtesting)
6. [Deploying to Platform](#deploying-to-platform)
7. [API Reference](#api-reference)

---

## Installation

### Option 1: Install from PyPI (Recommended - Coming Soon)
```bash
pip install xcoinalgo-strategy-sdk
```

### Option 2: Install from Local Build
```bash
# Clone the repository
git clone https://github.com/punksapien/xcoinalgo.git
cd xcoinalgo/python-sdk

# Install in development mode
pip install -e .

# Or install from wheel
pip install dist/xcoinalgo_strategy_sdk-1.0.0-py3-none-any.whl
```

### Verify Installation
```bash
python -c "from crypto_strategy_sdk import BaseStrategy; print('✅ SDK installed successfully!')"
```

---

## Your First Strategy (5 Minutes)

### Step 1: Create Strategy File

Create a file called `my_first_strategy.py`:

```python
"""
Simple Moving Average Crossover Strategy
Buy when fast SMA crosses above slow SMA, Sell when it crosses below
"""

from crypto_strategy_sdk import BaseStrategy, StrategyConfig, SignalType
import pandas as pd

class SMAStrategy(BaseStrategy):
    """Simple Moving Average Crossover Strategy"""

    def initialize(self):
        """Initialize strategy parameters"""
        self.sma_fast = 10  # Fast moving average period
        self.sma_slow = 20  # Slow moving average period

        self.logger.info(f"Strategy initialized: SMA({self.sma_fast}, {self.sma_slow})")

    def generate_signals(self, df: pd.DataFrame) -> dict:
        """Generate trading signals based on SMA crossover"""

        # Need enough data for indicators
        if len(df) < self.sma_slow:
            return {'signal': SignalType.HOLD, 'confidence': 0.0}

        # Calculate moving averages using SDK's indicator library
        df['sma_fast'] = self.indicators.sma(df, self.sma_fast)
        df['sma_slow'] = self.indicators.sma(df, self.sma_slow)

        # Get latest values
        latest = df.iloc[-1]
        previous = df.iloc[-2]

        # Detect crossover
        if latest['sma_fast'] > latest['sma_slow'] and previous['sma_fast'] <= previous['sma_slow']:
            # Golden cross - bullish signal
            return {
                'signal': SignalType.LONG,
                'confidence': 0.8,
                'metadata': {
                    'reason': 'SMA golden cross',
                    'sma_fast': float(latest['sma_fast']),
                    'sma_slow': float(latest['sma_slow'])
                }
            }

        elif latest['sma_fast'] < latest['sma_slow'] and previous['sma_fast'] >= previous['sma_slow']:
            # Death cross - bearish signal
            return {
                'signal': SignalType.SHORT,
                'confidence': 0.8,
                'metadata': {
                    'reason': 'SMA death cross',
                    'sma_fast': float(latest['sma_fast']),
                    'sma_slow': float(latest['sma_slow'])
                }
            }

        # No clear signal - hold position
        return {'signal': SignalType.HOLD, 'confidence': 0.0}


# Configuration
if __name__ == "__main__":
    config = StrategyConfig(
        name="Simple SMA Crossover",
        code="SMA_CROSS_V1",
        author="Your Name",
        description="Buy when fast SMA crosses above slow SMA",
        pair="B-BTC_USDT",
        leverage=10,
        risk_per_trade=0.01,  # Risk 1% per trade
        resolution="5",  # 5-minute candles
        lookback_period=100
    )

    strategy = SMAStrategy(config)
    print(f"✅ Strategy '{config.name}' created successfully!")
    print(f"📊 Pair: {config.pair}")
    print(f"⚡ Leverage: {config.leverage}x")
    print(f"🎯 Risk per trade: {config.risk_per_trade * 100}%")
```

### Step 2: Test It Locally

```bash
python my_first_strategy.py
```

Expected output:
```
✅ Strategy 'Simple SMA Crossover' created successfully!
📊 Pair: B-BTC_USDT
⚡ Leverage: 10x
🎯 Risk per trade: 1.0%
```

### Step 3: Upload to Platform

1. Go to https://xcoinalgo.com/login
2. Sign in with your account
3. Navigate to Dashboard → Strategies → Upload Strategy
4. Upload `my_first_strategy.py`
5. Configure parameters and deploy!

---

## Understanding the SDK

### Core Components

#### 1. **BaseStrategy** (Abstract Class)
All strategies must inherit from `BaseStrategy` and implement:
- `initialize()` - Setup parameters (called once)
- `generate_signals(df)` - Generate trading signals (called every candle)

#### 2. **StrategyConfig**
Configuration object for strategy parameters:
```python
config = StrategyConfig(
    name="My Strategy",
    code="MY_STRAT_V1",  # Unique identifier
    author="Your Name",

    # Trading parameters
    pair="B-BTC_USDT",
    leverage=10,
    risk_per_trade=0.01,  # 1% of capital

    # Technical parameters
    resolution="5",  # 5-minute candles
    lookback_period=200,  # Historical data to fetch

    # Risk management
    sl_atr_multiplier=2.0,  # Stop loss: 2x ATR
    tp_atr_multiplier=2.5,  # Take profit: 2.5x ATR
    max_positions=1,
    max_daily_loss=0.05  # Max 5% daily loss
)
```

#### 3. **TechnicalIndicators**
Access via `self.indicators` in your strategy:
```python
# Moving averages
df['sma'] = self.indicators.sma(df, period=20)
df['ema'] = self.indicators.ema(df, period=12)

# Oscillators
df['rsi'] = self.indicators.rsi(df, period=14)
df['macd'], df['signal'], df['hist'] = self.indicators.macd(df)

# Volatility
df['atr'] = self.indicators.atr(df, period=14)
bb_lower, bb_mid, bb_upper = self.indicators.bollinger_bands(df)

# Trend
df['supertrend'], df['trend'] = self.indicators.supertrend(df)
```

#### 4. **RiskManager**
Automatic risk management via `self.risk_manager`:
```python
# Get current risk metrics
metrics = self.risk_manager.get_risk_metrics()
print(f"Current drawdown: {metrics['current_drawdown']}%")

# Risk manager automatically handles:
# - Position sizing based on risk_per_trade
# - Stop loss placement using ATR
# - Daily loss limits
# - Maximum position limits
```

#### 5. **SignalType Enum**
Return values for `generate_signals()`:
- `SignalType.LONG` - Enter long position
- `SignalType.SHORT` - Enter short position
- `SignalType.CLOSE_LONG` - Close long position
- `SignalType.CLOSE_SHORT` - Close short position
- `SignalType.HOLD` - Do nothing

---

## Example Strategies

### 1. RSI Mean Reversion

```python
class RSIMeanReversion(BaseStrategy):
    def initialize(self):
        self.rsi_period = 14
        self.rsi_oversold = 30
        self.rsi_overbought = 70

    def generate_signals(self, df):
        if len(df) < self.rsi_period:
            return {'signal': SignalType.HOLD, 'confidence': 0.0}

        df['rsi'] = self.indicators.rsi(df, self.rsi_period)
        rsi_value = df.iloc[-1]['rsi']

        if rsi_value < self.rsi_oversold:
            return {'signal': SignalType.LONG, 'confidence': 0.7}
        elif rsi_value > self.rsi_overbought:
            return {'signal': SignalType.SHORT, 'confidence': 0.7}

        return {'signal': SignalType.HOLD, 'confidence': 0.0}
```

### 2. MACD Trend Following

```python
class MACDStrategy(BaseStrategy):
    def initialize(self):
        self.macd_fast = 12
        self.macd_slow = 26
        self.macd_signal = 9

    def generate_signals(self, df):
        if len(df) < self.macd_slow:
            return {'signal': SignalType.HOLD, 'confidence': 0.0}

        macd, signal, histogram = self.indicators.macd(df)
        df['macd'] = macd
        df['signal'] = signal
        df['histogram'] = histogram

        latest = df.iloc[-1]
        previous = df.iloc[-2]

        # MACD crosses above signal line
        if latest['histogram'] > 0 and previous['histogram'] <= 0:
            return {'signal': SignalType.LONG, 'confidence': 0.75}

        # MACD crosses below signal line
        elif latest['histogram'] < 0 and previous['histogram'] >= 0:
            return {'signal': SignalType.SHORT, 'confidence': 0.75}

        return {'signal': SignalType.HOLD, 'confidence': 0.0}
```

### 3. Bollinger Bands Breakout

```python
class BollingerBands(BaseStrategy):
    def initialize(self):
        self.bb_period = 20
        self.bb_std = 2.0

    def generate_signals(self, df):
        if len(df) < self.bb_period:
            return {'signal': SignalType.HOLD, 'confidence': 0.0}

        bb_lower, bb_mid, bb_upper = self.indicators.bollinger_bands(
            df, period=self.bb_period, std_dev=self.bb_std
        )

        df['bb_lower'] = bb_lower
        df['bb_upper'] = bb_upper

        close = df.iloc[-1]['close']

        # Price breaks below lower band - oversold
        if close < df.iloc[-1]['bb_lower']:
            return {'signal': SignalType.LONG, 'confidence': 0.6}

        # Price breaks above upper band - overbought
        elif close > df.iloc[-1]['bb_upper']:
            return {'signal': SignalType.SHORT, 'confidence': 0.6}

        return {'signal': SignalType.HOLD, 'confidence': 0.0}
```

---

## Local Backtesting

Test your strategy on historical data before deploying:

```python
from crypto_strategy_sdk import BacktestEngine
import pandas as pd

# Load historical data (OHLCV format)
data = pd.read_csv('btc_5min_data.csv')
# Required columns: timestamp, open, high, low, close, volume

# Create strategy
config = StrategyConfig(
    name="SMA Strategy",
    code="SMA_V1",
    author="You",
    pair="B-BTC_USDT",
    leverage=10
)
strategy = SMAStrategy(config)

# Run backtest
backtest = BacktestEngine(
    strategy=strategy,
    initial_balance=10000,  # Starting capital in USDT
    commission=0.001,  # 0.1% commission per trade
    slippage=0.0005  # 0.05% slippage
)

results = backtest.run_backtest(data)

# Print results
print("\n📊 Backtest Results:")
print(f"Total Return: {results['summary']['total_return_pct']:.2f}%")
print(f"Sharpe Ratio: {results['summary']['sharpe_ratio']:.2f}")
print(f"Max Drawdown: {results['summary']['max_drawdown_pct']:.2f}%")
print(f"Win Rate: {results['summary']['win_rate']:.2f}%")
print(f"Total Trades: {results['summary']['total_trades']}")
print(f"Profit Factor: {results['summary']['profit_factor']:.2f}")

# Plot equity curve
backtest.plot_equity_curve()

# Export results
backtest.export_results('backtest_results.csv')
```

---

## Deploying to Platform

### Method 1: Web Upload (Recommended)

1. **Login**: Go to https://xcoinalgo.com/login
2. **Navigate**: Dashboard → Strategies → Upload Strategy
3. **Upload**: Select your `.py` file
4. **Configure**: Fill in the JSON configuration:

```json
{
  "name": "Simple SMA Crossover",
  "code": "SMA_CROSS_V1",
  "author": "Your Name",
  "pair": "BTC_USDT",
  "leverage": 10,
  "risk_per_trade": 0.01,
  "resolution": "5",
  "lookback_period": 200,
  "sl_atr_multiplier": 2.0,
  "tp_atr_multiplier": 2.5,
  "max_positions": 1,
  "max_daily_loss": 0.05
}
```

5. **Deploy**: Click "Upload & Validate"
6. **Start**: Enable the strategy to start trading

### Method 2: API Upload (Advanced)

```python
import requests

# Upload strategy file
with open('my_first_strategy.py', 'r') as f:
    strategy_code = f.read()

response = requests.post(
    'https://xcoinalgo.com/api/strategy-upload/upload',
    headers={'Authorization': 'Bearer YOUR_API_TOKEN'},
    files={'strategyFile': ('strategy.py', strategy_code)},
    data={
        'name': 'SMA Strategy',
        'description': 'Simple moving average crossover',
        'config': json.dumps(config.get_dict())
    }
)

print(response.json())
```

---

## API Reference

### BaseStrategy Methods

#### Required Methods (Must Implement)

**`initialize()`**
```python
def initialize(self) -> None:
    """
    Called once when strategy starts.
    Setup your parameters, indicators, and initial state here.
    """
    self.my_param = 10
    self.logger.info("Strategy initialized")
```

**`generate_signals(df: pd.DataFrame)`**
```python
def generate_signals(self, df: pd.DataFrame) -> dict:
    """
    Called for each new candle.

    Args:
        df: DataFrame with OHLCV data

    Returns:
        dict with 'signal', 'confidence', and optional 'metadata'
    """
    return {
        'signal': SignalType.LONG,
        'confidence': 0.8,
        'metadata': {'reason': 'Custom reason'}
    }
```

#### Optional Methods

**`on_tick(tick_data)`**
```python
def on_tick(self, tick_data: dict) -> None:
    """
    Process real-time tick data (optional).
    Called for every price update.
    """
    pass
```

**`on_trade(trade_data)`**
```python
def on_trade(self, trade_data: dict) -> None:
    """
    Handle trade execution events (optional).
    Called when a trade is executed.
    """
    pass
```

### Available Indicators

See full list in `TechnicalIndicators` class:
- **Trend**: SMA, EMA, MACD, Supertrend, ADX
- **Momentum**: RSI, Stochastic, Williams %R, CCI
- **Volatility**: ATR, Bollinger Bands, Keltner Channels
- **Volume**: MFI, OBV, VWAP

### Configuration Options

```python
class StrategyConfig:
    # Metadata
    name: str                    # Strategy name
    code: str                    # Unique code
    author: str                  # Your name
    description: str = ""        # Description
    version: str = "1.0.0"      # Version

    # Trading parameters
    leverage: int = 10           # 1-100x
    risk_per_trade: float = 0.005  # 0-1 (0.5%)
    margin_currency: str = "USDT"
    pair: str = "B-BTC_USDT"

    # Technical parameters
    resolution: str = "5"        # 1, 5, 15, 30, 60, 240, 1440
    lookback_period: int = 200   # Candles to fetch

    # Risk management
    sl_atr_multiplier: float = 2.0
    tp_atr_multiplier: float = 2.5
    max_positions: int = 1
    max_daily_loss: float = 0.05  # 5%

    # Environment
    environment: str = "development"  # development, staging, production
```

---

## Best Practices

### 1. **Always Validate Data**
```python
def generate_signals(self, df):
    if len(df) < self.required_periods:
        return {'signal': SignalType.HOLD, 'confidence': 0.0}
    # ... rest of logic
```

### 2. **Use Logging**
```python
self.logger.info("Generated LONG signal")
self.logger.warning("RSI above 90 - extreme overbought")
self.logger.error("Failed to calculate indicator")
```

### 3. **Handle Errors Gracefully**
```python
try:
    df['rsi'] = self.indicators.rsi(df, 14)
except Exception as e:
    self.logger.error(f"RSI calculation failed: {e}")
    return {'signal': SignalType.HOLD, 'confidence': 0.0}
```

### 4. **Backtest Before Deploying**
Always backtest on historical data to verify strategy logic.

### 5. **Start with Small Risk**
Use `risk_per_trade=0.001` (0.1%) when testing live.

---

## Getting Help

- **Documentation**: https://xcoinalgo.com/docs
- **GitHub Issues**: https://github.com/punksapien/xcoinalgo/issues
- **Discord Community**: [Join here]
- **Email Support**: support@xcoinalgo.com

---

## Next Steps

1. ✅ Install the SDK
2. ✅ Create your first strategy
3. ✅ Backtest locally
4. ✅ Upload to platform
5. 📈 Monitor live performance
6. 🔄 Iterate and improve

Happy Trading! 🚀
