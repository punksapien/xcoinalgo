# XcoinAlgo Strategy SDK

Python SDK for developing algorithmic trading strategies for the XcoinAlgo platform.

## Features

- **Simple API**: Just inherit from `BaseStrategy` and implement `on_data()`
- **Type Safety**: Full type hints and Pydantic models for validation
- **Local Testing**: Test and backtest strategies before deploying to production
- **Validation**: Catch errors early with comprehensive validation tools
- **Examples**: Learn from real working strategy implementations
- **Comprehensive Documentation**: Complete API reference and strategy guide

## Installation

```bash
pip install xcoinalgo-strategy-sdk
```

## Quick Start

```python
from xcoinalgo import BaseStrategy

class MyStrategy(BaseStrategy):
    def __init__(self):
        super().__init__()
        self.name = "My Strategy"
        self.version = "1.0.0"

    def on_data(self, data):
        # Your strategy logic here
        if len(data) < 20:
            return {"action": "HOLD"}

        # Calculate indicator
        sma = data['close'].rolling(20).mean().iloc[-1]
        current_price = data['close'].iloc[-1]

        # Generate signal
        if current_price > sma:
            return {
                "action": "BUY",
                "entryPrice": current_price,
                "stopLoss": current_price * 0.98,
                "takeProfit": current_price * 1.05
            }

        return {"action": "HOLD"}
```

## Testing Your Strategy

```python
from xcoinalgo.testing import StrategyTester
import pandas as pd

# Load historical data
data = pd.read_csv('historical_data.csv')

# Create and test strategy
strategy = MyStrategy()
tester = StrategyTester(strategy)

# Validate
is_valid, issues = tester.validate()
print(f"Valid: {is_valid}")

# Backtest
result = tester.backtest(data, initial_capital=10000, risk_per_trade=0.02)
print(f"Win Rate: {result.winRate:.2%}")
print(f"Total P&L: ${result.totalPnl:.2f}")
```

## Documentation

- **[API Reference](API_REFERENCE.md)** - Complete reference for all classes, methods, and models
- **[Strategy Guide](STRATEGY_GUIDE.md)** - Comprehensive guide with examples and best practices
- **[Examples](examples/)** - Working strategy implementations

## What's Included

### BaseStrategy Class
The abstract base class with lifecycle hooks:
- `on_data()` - Main strategy method (required)
- `on_start()` - Initialization hook (optional)
- `on_stop()` - Cleanup hook (optional)
- `on_trade()` - Trade callback (optional)

### Pydantic Models
Type-safe data models with validation:
- `Signal` - Trading signals with business logic validation
- `StrategyConfig` - Strategy metadata and configuration
- `BacktestResult` - Backtest statistics
- `Trade` - Individual trade records

### Testing Framework
Tools for local testing:
- `StrategyValidator` - Validate strategy implementation
- `StrategyTester` - Run backtests and single tests
- `validate_strategy_file()` - Validate Python files

## Requirements

- Python >= 3.8
- pandas >= 1.3.0
- numpy >= 1.20.0
- pydantic >= 2.0.0

## Examples

See the `examples/` directory for complete working strategies:
- **SMA Crossover** - Moving average crossover strategy
- **RSI Strategy** - RSI mean reversion strategy

## Development

Install development dependencies:

```bash
pip install -e ".[dev]"
```

Run tests:

```bash
pytest tests/
```

## License

MIT License

## Support

For questions and support:
- Documentation: See [API_REFERENCE.md](API_REFERENCE.md) and [STRATEGY_GUIDE.md](STRATEGY_GUIDE.md)
- Examples: Check the `examples/` directory
- Issues: Report bugs or request features on GitHub
