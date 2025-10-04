# Strategy Development Request

Hey! I've built a complete Docker-based trading platform for automated strategy deployment. I need your help to test it with a real trading strategy.

## What I Need From You

### 1. **Simple Test Strategy (Python)**
A basic trading strategy that:
- Uses CoinDCX API for trading
- Has clear buy/sell logic
- Doesn't need to be profitable (just functional)
- Can be simple like moving average crossover

### 2. **Strategy Requirements**
The strategy should inherit from our base class structure:

```python
from base_strategy import BaseStrategy
from typing import Dict, Any

class YourStrategy(BaseStrategy):
    def __init__(self):
        super().__init__()
        # Your initialization here

    def on_market_data(self, market_data: Dict[str, Any]):
        """Handle incoming market data"""
        # Your strategy logic here
        pass

    def on_signal(self, signal: Dict[str, Any]):
        """Handle trading signals"""
        # Your buy/sell logic here
        pass

if __name__ == "__main__":
    strategy = YourStrategy()
    strategy.start()
```

## What the Platform Provides

### Base Strategy Framework
The platform includes a complete base class with:
- **CoinDCX API integration** (automatic authentication)
- **WebSocket market data** streaming
- **Risk management** (position sizing, stop losses)
- **Order management** (place, cancel, track orders)
- **Logging and monitoring**
- **Configuration management**

### Available Methods in Base Class
```python
# Market data
self.get_ticker(symbol)
self.get_orderbook(symbol)
self.get_candles(symbol, interval, limit)

# Trading
self.place_order(side, quantity, price=None)  # Market order if no price
self.cancel_order(order_id)
self.get_order_status(order_id)

# Portfolio
self.get_balance()
self.get_positions()
self.calculate_position_size(risk_percent)

# Configuration
self.config.pair  # Trading pair (e.g., "BTCINR")
self.config.leverage
self.config.risk_per_trade
self.config.custom_params  # Your custom parameters
```

### Configuration Example
```json
{
  "name": "Your Strategy Name",
  "code": "your_strategy_code",
  "author": "Your Name",
  "description": "Brief description",
  "leverage": 10,
  "risk_per_trade": 0.01,
  "pair": "BTCINR",
  "margin_currency": "INR",
  "resolution": "1m",
  "lookback_period": 100,
  "custom_params": {
    "your_param": "your_value"
  }
}
```

## Example Strategy Ideas

### 1. **Simple Moving Average Crossover**
```python
def on_market_data(self, market_data):
    # Get recent candles
    candles = self.get_candles(self.config.pair, "1m", 50)

    # Calculate moving averages
    short_ma = sum(c['close'] for c in candles[-10:]) / 10
    long_ma = sum(c['close'] for c in candles[-20:]) / 20

    # Generate signals
    if short_ma > long_ma and not self.has_position():
        self.place_buy_order()
    elif short_ma < long_ma and self.has_position():
        self.place_sell_order()
```

### 2. **RSI-based Strategy**
```python
def on_market_data(self, market_data):
    # Calculate RSI
    rsi = self.calculate_rsi(period=14)

    # Generate signals
    if rsi < 30 and not self.has_position():  # Oversold
        self.place_buy_order()
    elif rsi > 70 and self.has_position():    # Overbought
        self.place_sell_order()
```

## What I'll Test

1. **Strategy Loading**: Does the Python code load without errors?
2. **Market Data**: Does the strategy receive market data correctly?
3. **Signal Generation**: Does the strategy generate buy/sell signals?
4. **Order Placement**: Can the strategy place orders (we'll test with small amounts)?
5. **Resource Usage**: Does the strategy run within Docker container limits?
6. **Error Handling**: How does the strategy handle API errors or network issues?

## Testing Process

### Phase 1: Local Testing (No API Required)
- I'll test your strategy code with mock data first
- Validate it works with our framework
- Check for any missing dependencies

### Phase 2: VPS Testing (Your API Required)
- Deploy to VPS server
- You'll log in via web interface
- Upload your strategy securely
- Provide API credentials through secure form
- Test with real market data and small trades

## Security & Privacy

- ✅ **Your API keys**: Encrypted and secure
- ✅ **Strategy code**: Only you upload it, I can't see the code
- ✅ **Trading access**: You control all API permissions
- ✅ **Data privacy**: All data stays in the secure environment

## What You Get

- **Strategy deployment platform** you can use for your own trading
- **Real-time monitoring** of strategy performance
- **Risk management** and position tracking
- **P&L analysis** and reporting
- **Scalable infrastructure** for multiple strategies

## Next Steps

1. **Share a simple strategy** (just the Python file)
2. **Let me know your trading pair preference** (BTCINR, ETHINR, etc.)
3. **We'll schedule a call** to test the deployment together

The strategy doesn't need to be your best one - just something functional that we can use to validate the platform works correctly!

Looking forward to testing this together! 🚀