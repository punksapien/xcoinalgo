# XCoinAlgo - Researcher Onboarding Guide

**Welcome to the XCoinAlgo Quant Team!**

This guide will take you from zero to deploying your first trading strategy in under 30 minutes.

---

## Table of Contents
1. [Getting Started](#getting-started)
2. [Development Setup](#development-setup)
3. [Your First Strategy](#your-first-strategy)
4. [Testing Locally](#testing-locally)
5. [Deploying to Production](#deploying-to-production)
6. [Best Practices](#best-practices)
7. [Getting Help](#getting-help)

---

## Getting Started

### Step 1: Get Platform Access

1. **Request Access**: Contact the platform admin for an invitation
2. **Create Account**:
   - Go to https://xcoinalgo.com/register
   - Sign up with your Google account or email
3. **Verify Email**: Check your inbox for verification link
4. **First Login**: https://xcoinalgo.com/login

### Step 2: Familiarize with Platform

**Take a tour of the platform:**
- 📊 **Dashboard**: Overview of your strategies and performance
- 🤖 **Strategies**: List of all your trading strategies
- 🚀 **Deployments**: Active/paused strategy deployments
- 📈 **Analytics**: Performance metrics and charts
- ⚙️ **Settings**: API keys, notifications, preferences

---

## Development Setup

### Prerequisites

Ensure you have installed:
- **Python 3.8+**: `python3 --version`
- **pip**: `pip --version`
- **Git**: `git --version`
- **Code Editor**: VS Code recommended

### Step 1: Install the SDK

#### Option A: From PyPI (Recommended - Coming Soon)
```bash
pip install xcoinalgo-strategy-sdk
```

#### Option B: From Local Build
```bash
# Clone repository
git clone https://github.com/punksapien/xcoinalgo.git
cd xcoinalgo/python-sdk

# Install SDK
pip install -e .

# Verify installation
python -c "from crypto_strategy_sdk import BaseStrategy; print('✅ SDK ready!')"
```

### Step 2: Set Up Development Environment

```bash
# Create project directory
mkdir ~/xcoinalgo-strategies
cd ~/xcoinalgo-strategies

# Create virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install SDK and dependencies
pip install xcoinalgo-strategy-sdk pandas numpy matplotlib

# Create project structure
mkdir strategies
mkdir backtests
mkdir data
```

### Step 3: Install Development Tools (Optional)

```bash
# Code formatting
pip install black flake8

# Testing
pip install pytest pytest-cov

# Jupyter for experimentation
pip install jupyter notebook
```

---

## Your First Strategy

### Understanding the SDK Architecture

Every strategy has two main components:

1. **Strategy Class** (Python code): Your trading logic
2. **Configuration** (JSON/YAML): Parameters and settings

### Template Strategy

Create `strategies/my_first_strategy.py`:

```python
"""
My First Trading Strategy
Author: [Your Name]
Date: 2025-10-05

Description:
A simple moving average crossover strategy for learning purposes.
"""

from crypto_strategy_sdk import BaseStrategy, StrategyConfig, SignalType
import pandas as pd

class MyFirstStrategy(BaseStrategy):
    """
    SMA Crossover Strategy
    - Buy when fast SMA crosses above slow SMA
    - Sell when fast SMA crosses below slow SMA
    """

    def initialize(self):
        """
        Called once when strategy starts.
        Define your parameters here.
        """
        # Strategy parameters
        self.sma_fast_period = 10
        self.sma_slow_period = 20
        self.min_confidence = 0.7

        # Log initialization
        self.logger.info(f"Strategy initialized with SMA({self.sma_fast_period}, {self.sma_slow_period})")

    def generate_signals(self, df: pd.DataFrame) -> dict:
        """
        Called for each new candle.
        Generate trading signals based on market data.

        Args:
            df: DataFrame with OHLCV columns (open, high, low, close, volume)

        Returns:
            dict: {
                'signal': SignalType (LONG/SHORT/HOLD),
                'confidence': float (0.0 to 1.0),
                'metadata': dict (optional additional info)
            }
        """

        # Need enough data for indicators
        if len(df) < self.sma_slow_period:
            return {
                'signal': SignalType.HOLD,
                'confidence': 0.0,
                'metadata': {'reason': 'Insufficient data'}
            }

        # Calculate indicators using SDK
        df['sma_fast'] = self.indicators.sma(df, self.sma_fast_period)
        df['sma_slow'] = self.indicators.sma(df, self.sma_slow_period)

        # Get latest and previous values
        latest = df.iloc[-1]
        previous = df.iloc[-2]

        # Detect crossovers
        fast_current = latest['sma_fast']
        fast_previous = previous['sma_fast']
        slow_current = latest['sma_slow']
        slow_previous = previous['sma_slow']

        # Golden Cross (bullish)
        if fast_current > slow_current and fast_previous <= slow_previous:
            self.logger.info(f"🟢 Golden Cross detected! Fast: {fast_current:.2f}, Slow: {slow_current:.2f}")
            return {
                'signal': SignalType.LONG,
                'confidence': 0.8,
                'metadata': {
                    'reason': 'Golden cross detected',
                    'sma_fast': float(fast_current),
                    'sma_slow': float(slow_current)
                }
            }

        # Death Cross (bearish)
        elif fast_current < slow_current and fast_previous >= slow_previous:
            self.logger.info(f"🔴 Death Cross detected! Fast: {fast_current:.2f}, Slow: {slow_current:.2f}")
            return {
                'signal': SignalType.SHORT,
                'confidence': 0.8,
                'metadata': {
                    'reason': 'Death cross detected',
                    'sma_fast': float(fast_current),
                    'sma_slow': float(slow_current)
                }
            }

        # No signal
        return {
            'signal': SignalType.HOLD,
            'confidence': 0.0,
            'metadata': {'reason': 'No crossover detected'}
        }


# Configuration
if __name__ == "__main__":
    # Create strategy config
    config = StrategyConfig(
        # Metadata
        name="My First Strategy",
        code="MY_FIRST_V1",
        author="Your Name",
        description="Simple SMA crossover strategy for BTC",
        version="1.0.0",
        tags=["sma", "crossover", "beginner"],

        # Trading parameters
        pair="B-BTC_USDT",
        leverage=10,
        risk_per_trade=0.01,  # Risk 1% per trade
        margin_currency="USDT",

        # Technical parameters
        resolution="5",  # 5-minute candles
        lookback_period=100,  # Fetch last 100 candles

        # Risk management
        sl_atr_multiplier=2.0,  # Stop loss at 2x ATR
        tp_atr_multiplier=3.0,  # Take profit at 3x ATR
        max_positions=1,
        max_daily_loss=0.05,  # Max 5% daily loss

        # Environment
        environment="development"
    )

    # Create strategy instance
    strategy = MyFirstStrategy(config)

    print("\n✅ Strategy created successfully!")
    print(f"📝 Name: {config.name}")
    print(f"🔖 Code: {config.code}")
    print(f"👤 Author: {config.author}")
    print(f"💱 Pair: {config.pair}")
    print(f"⚡ Leverage: {config.leverage}x")
    print(f"🎯 Risk: {config.risk_per_trade * 100}%")
```

### Run Your Strategy

```bash
python strategies/my_first_strategy.py
```

Expected output:
```
✅ Strategy created successfully!
📝 Name: My First Strategy
🔖 Code: MY_FIRST_V1
👤 Author: Your Name
💱 Pair: B-BTC_USDT
⚡ Leverage: 10x
🎯 Risk: 1.0%
```

---

## Testing Locally

**Before deploying to production, ALWAYS backtest your strategy!**

### Step 1: Get Historical Data

#### Option A: Download from Exchange

```python
import ccxt
import pandas as pd

# Initialize exchange
exchange = ccxt.binance()

# Fetch OHLCV data
ohlcv = exchange.fetch_ohlcv('BTC/USDT', '5m', limit=1000)

# Convert to DataFrame
df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')

# Save to CSV
df.to_csv('data/btc_5min.csv', index=False)
print(f"✅ Downloaded {len(df)} candles")
```

#### Option B: Use Sample Data

Download sample data from the platform or use provided datasets.

### Step 2: Create Backtest Script

Create `backtests/test_strategy.py`:

```python
from crypto_strategy_sdk import BacktestEngine, StrategyConfig
from strategies.my_first_strategy import MyFirstStrategy
import pandas as pd

# Load historical data
data = pd.read_csv('data/btc_5min.csv')
print(f"Loaded {len(data)} candles for backtesting")

# Create strategy
config = StrategyConfig(
    name="My First Strategy",
    code="MY_FIRST_V1",
    author="Your Name",
    pair="B-BTC_USDT",
    leverage=10,
    risk_per_trade=0.01
)

strategy = MyFirstStrategy(config)

# Create backtest engine
backtest = BacktestEngine(
    strategy=strategy,
    initial_balance=10000,  # Start with $10,000
    commission=0.001,  # 0.1% per trade
    slippage=0.0005  # 0.05% slippage
)

# Run backtest
print("\n🔄 Running backtest...")
results = backtest.run_backtest(data)

# Print results
print("\n" + "="*50)
print("📊 BACKTEST RESULTS")
print("="*50)
print(f"Total Return: {results['summary']['total_return_pct']:.2f}%")
print(f"Sharpe Ratio: {results['summary']['sharpe_ratio']:.2f}")
print(f"Max Drawdown: {results['summary']['max_drawdown_pct']:.2f}%")
print(f"Win Rate: {results['summary']['win_rate']:.2f}%")
print(f"Total Trades: {results['summary']['total_trades']}")
print(f"Winning Trades: {results['summary']['winning_trades']}")
print(f"Losing Trades: {results['summary']['losing_trades']}")
print(f"Profit Factor: {results['summary']['profit_factor']:.2f}")
print(f"Average Trade: {results['summary']['avg_trade_pct']:.2f}%")
print("="*50)

# Plot equity curve
backtest.plot_equity_curve()

# Export results
backtest.export_results('backtests/results.csv')
print("\n✅ Results exported to backtests/results.csv")
```

### Step 3: Run Backtest

```bash
python backtests/test_strategy.py
```

### Step 4: Analyze Results

**Good Strategy Indicators:**
- ✅ Positive total return
- ✅ Sharpe ratio > 1.0
- ✅ Max drawdown < 20%
- ✅ Win rate > 45%
- ✅ Profit factor > 1.2

**Red Flags:**
- ❌ Negative returns
- ❌ Max drawdown > 30%
- ❌ Win rate < 35%
- ❌ Too few trades (< 20)

---

## Deploying to Production

### Step 1: Finalize Your Strategy

Before deploying:

**Checklist:**
- [ ] Strategy passes backtesting
- [ ] Code is clean and commented
- [ ] Error handling implemented
- [ ] Logging added for debugging
- [ ] Risk parameters validated
- [ ] Code reviewed by peer (if possible)

### Step 2: Upload to Platform

1. **Login**: Go to https://xcoinalgo.com/login
2. **Navigate**: Dashboard → Strategies → Upload Strategy
3. **Upload File**: Select `my_first_strategy.py`
4. **Fill Form**:
   - **Name**: My First Strategy
   - **Description**: SMA crossover strategy for BTC/USDT

5. **Configuration JSON**:
```json
{
  "name": "My First Strategy",
  "code": "MY_FIRST_V1",
  "author": "Your Name",
  "pair": "BTC_USDT",
  "leverage": 10,
  "risk_per_trade": 0.01,
  "resolution": "5",
  "lookback_period": 100,
  "sl_atr_multiplier": 2.0,
  "tp_atr_multiplier": 3.0,
  "max_positions": 1,
  "max_daily_loss": 0.05
}
```

6. **Upload**: Click "Upload & Validate"

### Step 3: Deploy Strategy

1. **Verify Upload**: Check strategy appears in list
2. **Open Details**: Click on strategy name
3. **Deploy**:
   - Click "Deploy" button
   - Set execution interval: 300 seconds (5 minutes)
   - Enter API credentials (or use paper trading)
   - Confirm deployment

### Step 4: Monitor Performance

**Initial Monitoring (First 24 Hours):**
- Check every 2-3 hours
- Verify executions are running
- Watch for errors in logs
- Confirm trades are being placed correctly

**Ongoing Monitoring:**
- Daily performance check
- Weekly analytics review
- Monthly strategy optimization

---

## Best Practices

### Code Quality

**1. Use Type Hints**
```python
def generate_signals(self, df: pd.DataFrame) -> dict:
    ...
```

**2. Add Docstrings**
```python
def initialize(self):
    """
    Initialize strategy parameters.
    Sets up SMA periods and thresholds.
    """
    ...
```

**3. Handle Errors**
```python
try:
    df['rsi'] = self.indicators.rsi(df, 14)
except Exception as e:
    self.logger.error(f"RSI calculation failed: {e}")
    return {'signal': SignalType.HOLD, 'confidence': 0.0}
```

**4. Log Important Events**
```python
self.logger.info("Golden cross detected")
self.logger.warning("RSI above 90 - extreme condition")
self.logger.error("Failed to calculate indicators")
```

### Risk Management

**1. Start Conservative**
```python
risk_per_trade=0.001  # 0.1% - very conservative
leverage=5  # Lower leverage initially
max_daily_loss=0.02  # 2% max daily loss
```

**2. Use Stop Losses**
```python
sl_atr_multiplier=2.0  # Always use stop losses
```

**3. Limit Positions**
```python
max_positions=1  # Start with one position at a time
```

### Testing

**1. Backtest Multiple Timeframes**
- Last month
- Last 3 months
- Last year
- Bull market period
- Bear market period

**2. Forward Testing**
Deploy with minimal capital first (paper trading if available)

**3. Monitor Slippage**
Real trading ≠ backtesting due to slippage and latency

### Version Control

**Use Git for Strategy Management:**

```bash
# Initialize git
git init

# Create .gitignore
echo "*.pyc\n__pycache__/\nvenv/\n*.env\ndata/" > .gitignore

# Commit your strategy
git add strategies/my_first_strategy.py
git commit -m "Add: My First Strategy v1.0"

# Tag versions
git tag v1.0.0
```

---

## Development Workflow

### Iterative Process

1. **Idea** → Hypothesis about market behavior
2. **Research** → Study the concept, gather data
3. **Implement** → Write strategy code
4. **Backtest** → Test on historical data
5. **Optimize** → Improve parameters
6. **Paper Trade** → Test with fake money
7. **Deploy** → Go live with small capital
8. **Monitor** → Track performance
9. **Iterate** → Improve and repeat

### Example Timeline

**Week 1: Learning**
- Day 1-2: Setup environment, run examples
- Day 3-4: Understand SDK, read docs
- Day 5-7: Experiment with indicators

**Week 2: First Strategy**
- Day 1-3: Develop strategy
- Day 4-5: Backtest and optimize
- Day 6-7: Deploy and monitor

**Week 3+: Advanced Strategies**
- Multi-indicator strategies
- Machine learning integration
- Portfolio optimization

---

## Getting Help

### Resources

**Documentation:**
- SDK Quickstart: `python-sdk/SDK_QUICKSTART.md`
- API Reference: https://xcoinalgo.com/docs/api
- Examples: `python-sdk/examples/`

**Community:**
- Discord: [Join our community]
- GitHub Discussions: https://github.com/punksapien/xcoinalgo/discussions
- Email Support: support@xcoinalgo.com

### Common Questions

**Q: Can I use external libraries?**
A: Yes! pandas, numpy, scikit-learn are all supported.

**Q: How often does my strategy execute?**
A: Based on your execution_interval setting (e.g., every 5 minutes).

**Q: Can I access past trades?**
A: Yes, via `self.trade_history` in your strategy.

**Q: What happens if my strategy crashes?**
A: It will auto-restart. Check logs to debug issues.

**Q: Can I test with fake money first?**
A: Yes, enable paper trading in deployment settings.

---

## Next Steps

### Week 1 Goals
- [ ] Setup development environment
- [ ] Install SDK and run examples
- [ ] Create your first strategy
- [ ] Run local backtests
- [ ] Upload strategy to platform

### Week 2 Goals
- [ ] Deploy strategy with paper trading
- [ ] Monitor for 7 days
- [ ] Analyze performance metrics
- [ ] Iterate and improve

### Week 3 Goals
- [ ] Develop more complex strategy
- [ ] Experiment with multiple indicators
- [ ] Compare strategy performance
- [ ] Deploy with small real capital

### Long-term Goals
- Build portfolio of 3-5 strategies
- Achieve consistent profitability
- Share insights with team
- Contribute to platform improvements

---

## Code of Conduct

As a researcher on the XCoinAlgo team:

1. **Test Thoroughly**: Never deploy untested code
2. **Start Small**: Use minimal capital initially
3. **Monitor Actively**: Don't set and forget
4. **Document Well**: Help others understand your strategies
5. **Share Knowledge**: Contribute to team learning
6. **Respect Risk**: Don't risk more than you can afford to lose
7. **Be Honest**: Report bugs and issues promptly

---

## Welcome to the Team! 🚀

You're now ready to start building trading strategies on XCoinAlgo.

**Remember:**
- Start simple
- Test extensively
- Deploy cautiously
- Monitor continuously
- Iterate constantly

Happy trading! 📈

---

**Questions?** Reach out to the team lead or post in #help channel.

**Found a bug?** Report at https://github.com/punksapien/xcoinalgo/issues

**Have an idea?** Share in #strategy-ideas channel.
