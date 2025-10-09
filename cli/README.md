# xcoin-cli

🚀 **xcoinalgo CLI** - Strategy development toolkit for quant teams

Build, test, and deploy algorithmic trading strategies with the xcoinalgo platform.

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/xcoinalgo/xcoin-cli)
[![Python](https://img.shields.io/badge/python-3.8+-blue.svg)](https://www.python.org/downloads/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

---

## Features

- 📦 **Strategy Scaffolding** - Generate SDK-compliant strategy templates
- ✅ **Local Validation** - Validate strategies before pushing (security, SDK compliance, config)
- 🧪 **Backtesting Engine** - Test strategies with historical data (P&L, win rate, Sharpe ratio)
- 🔗 **Git Integration** - Auto-sync strategies via GitHub/GitLab webhooks
- 📊 **Real-time Monitoring** - Stream execution logs and performance metrics
- 🚀 **One-Click Deployment** - Deploy to marketplace
- 🎨 **Beautiful CLI** - Rich terminal UI with colors, panels, and tables

---

## Quick Start

```bash
# 1. Install
git clone https://github.com/punksapien/xcoinalgo.git
cd xcoinalgo/cli
pip install -e .

# 2. Authenticate
xcoin login

# 3. Create strategy
xcoin init my-strategy
cd my-strategy

# 4. Develop
vim strategy.py

# 5. Validate & Test
xcoin validate
xcoin test --backtest data/sample.csv

# 6. Link to Git
xcoin link-git --auto-deploy

# 7. Deploy
git push origin main
xcoin deploy
```

---

## Installation

### From Source

```bash
# Clone the main xcoinalgo repository
git clone https://github.com/punksapien/xcoinalgo.git
cd xcoinalgo/cli

# Install in development mode
pip install -e .
```

### With Backtest Support

```bash
pip install -e ".[backtest]"
```

### Verify Installation

```bash
xcoin --version
```

---

## Commands

| Command | Description |
|---------|-------------|
| `xcoin init` | Initialize new strategy project |
| `xcoin validate` | Validate strategy code locally |
| `xcoin test` | Run backtest with historical data |
| `xcoin login` | Authenticate with platform |
| `xcoin link-git` | Link Git repository for auto-sync |
| `xcoin status` | Check strategy status on platform |
| `xcoin deploy` | Deploy strategy to marketplace |
| `xcoin logs` | View execution logs |

Run `xcoin COMMAND --help` for detailed usage.

---

## Complete Workflow

```bash
# Create and develop
xcoin init momentum-strategy
cd momentum-strategy
vim strategy.py

# Test locally
xcoin validate
xcoin test --backtest data/btc_2024.csv

# Link to platform
git remote add origin https://github.com/yourteam/momentum-strategy
xcoin link-git --auto-deploy

# Push and deploy
git add .
git commit -m "Implement momentum strategy"
git push origin main

# Monitor
xcoin status
xcoin logs
```

---

## Strategy Example

```python
import pandas as pd
from typing import Dict, Any, List

class MomentumStrategy(BaseStrategy):
    def generate_signal(self, candles: List[Dict], settings: Dict[str, Any]) -> Dict[str, Any]:
        # Convert to DataFrame
        df = pd.DataFrame(candles)

        # Initialize indicator helper (works with or without pandas_ta)
        indicators = IndicatorHelper()

        # Calculate indicators (works out-of-the-box)
        df['rsi'] = indicators.rsi(df['close'], length=14)
        df['sma'] = indicators.sma(df['close'], length=20)

        # Generate signal
        latest = df.iloc[-1]
        price = float(latest['close'])

        if latest['rsi'] < 30 and latest['close'] > latest['sma']:
            return {
                'signal': 'LONG',
                'price': price,
                'stopLoss': price * 0.98,
                'takeProfit': price * 1.05,
                'metadata': {'entry_reason': 'oversold_bounce'}
            }

        return {'signal': 'HOLD', 'price': price, 'metadata': {}}

strategy = MomentumStrategy()

def generate_signal(candles: List[Dict], settings: Dict[str, Any]) -> Dict[str, Any]:
    return strategy.generate_signal(candles, settings)
```

**Note:** The template includes a self-contained `IndicatorHelper` class that provides common indicators (SMA, EMA, RSI, MACD, ATR, Bollinger Bands) using only pandas built-in functions. No pandas_ta required!

---

## Validation

The CLI validates your strategy for:

✅ **Security**
- No file I/O operations
- No network operations
- No dangerous imports (os, subprocess, eval, etc.)

✅ **SDK Compliance**
- Correct BaseStrategy inheritance
- Valid generate_signal() implementation
- Proper return format

✅ **Configuration**
- Valid JSON schema
- Required fields present
- Correct parameter definitions

---

## Backtesting

Test your strategy with historical data:

```bash
xcoin test --backtest data/btc_2024.csv --capital 50000
```

**Metrics Provided:**
- Total P&L and percentage return
- Win rate, winning/losing trades
- Average win/loss, largest win/loss
- Maximum drawdown
- Profit factor
- Sharpe ratio
- Trade history with entry/exit details

**Example Output:**

```
📊 Performance Summary
  Initial Capital    $50,000.00
  Final Capital      $62,500.00
  Total P&L          ↗ $12,500.00 (+25.00%)

📈 Trade Statistics
  Total Trades       45
  Win Rate           62.2%
  Profit Factor      1.76
  Sharpe Ratio       1.42

⚠️ Risk Metrics
  Max Drawdown       4.5%
```

---

## Git Integration

Link your strategy to Git for automatic syncing:

```bash
xcoin link-git --auto-deploy
```

**Features:**
- Auto-sync on every push
- Automatic validation via webhooks
- Optional auto-deploy on successful validation
- Support for GitHub and GitLab

**Webhook Setup:**

GitHub: Settings → Webhooks → Add webhook (URL and secret provided by CLI)

GitLab: Settings → Webhooks (URL and secret provided by CLI)

---

## Documentation

📖 **[Complete User Guide](USER_GUIDE.md)** - Comprehensive documentation covering:
- Installation & Setup
- Command Reference
- Strategy Development Guide
- Backtesting Guide
- Git Integration
- Deployment
- Best Practices
- Troubleshooting

📚 **[Platform Documentation](https://docs.xcoinalgo.com/cli)** - Official docs

💡 **[Strategy Examples](https://github.com/xcoinalgo/strategy-examples)** - Example strategies

---

## Requirements

- **Python:** >= 3.8
- **Git:** For repository operations
- **Dependencies:** Installed automatically
  - click, rich, requests
  - pandas, numpy
  - PyYAML, cryptography

---

## Security

- ✅ API keys encrypted with Fernet
- ✅ Config files have restricted permissions (0600)
- ✅ Strategy security scanner checks for dangerous patterns
- ✅ No file I/O operations allowed in strategies
- ✅ No network operations allowed in strategies

---

## Development

```bash
# Clone repository
git clone https://github.com/punksapien/xcoinalgo.git
cd xcoinalgo/cli

# Install in development mode
pip install -e ".[dev]"

# Run tests
pytest

# Format code
black xcoin_cli/

# Lint
flake8 xcoin_cli/
```

---

## Support

- 📋 **Issues:** [GitHub Issues](https://github.com/xcoinalgo/xcoin-cli/issues)
- 💬 **Discord:** [xcoinalgo Community](https://discord.gg/xcoinalgo)
- 📧 **Email:** support@xcoinalgo.com

---

## License

MIT License - See [LICENSE](LICENSE) file for details.

---

## Changelog

### v0.1.0 (Beta)

**Features:**
- ✅ Strategy scaffolding with `xcoin init`
- ✅ Local validation with security scanner
- ✅ Backtesting engine with comprehensive metrics
- ✅ Git integration with webhooks
- ✅ Platform authentication
- ✅ Strategy deployment
- ✅ Execution log viewing
- ✅ Beautiful Rich terminal UI

**Coming Soon:**
- Real-time log streaming (`--tail`)
- Strategy marketplace browser
- Performance analytics dashboard
- Multi-strategy testing
- Parameter optimization

---

**Built with:** Click, Rich, Pandas

**Version:** 0.1.0 | **Status:** Beta | **Platform:** xcoinalgo
