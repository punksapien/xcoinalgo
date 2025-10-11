# xcoin-cli User Guide

> **⚠️ NOTICE: This document is partially outdated.**
>
> **Please refer to [README.md](./README.md) as the primary documentation source.**
>
> The README reflects the current CLI implementation where **Git integration is OPTIONAL**.
> This guide incorrectly describes Git as required, which is no longer accurate.

**Version:** 0.1.0
**Status:** Beta (Documentation Outdated - See README.md)
**Platform:** xcoinalgo - Algorithmic Trading Platform

---

## Table of Contents

1. [Introduction](#introduction)
2. [Installation](#installation)
3. [Quick Start](#quick-start)
4. [Command Reference](#command-reference)
5. [Complete Workflow](#complete-workflow)
6. [Strategy Development](#strategy-development)
7. [Backtesting](#backtesting)
8. [Git Integration](#git-integration)
9. [Deployment](#deployment)
10. [Best Practices](#best-practices)
11. [Troubleshooting](#troubleshooting)

---

## Introduction

`xcoin-cli` is a command-line interface tool designed for quantitative teams to develop, test, and deploy algorithmic trading strategies on the xcoinalgo platform.

### Features

✅ **Strategy Scaffolding** - Generate SDK-compliant strategy templates
✅ **Local Validation** - Validate strategies before pushing (security, SDK compliance, config)
✅ **Backtesting Engine** - Test strategies with historical data
✅ **Git Integration** - Auto-sync strategies via GitHub/GitLab webhooks
✅ **Real-time Monitoring** - Stream execution logs
✅ **One-Click Deployment** - Deploy to marketplace

---

## Installation

### Prerequisites

- Python >= 3.8
- pip
- Git (for repository operations)

### Install from Source

```bash
# Clone the repository
git clone https://github.com/xcoinalgo/xcoin-cli.git
cd xcoin-cli

# Install in development mode
pip install -e .

# Verify installation
xcoin --version
```

### Install from PyPI (Coming Soon)

```bash
pip install xcoin-cli
```

### Dependencies

Core dependencies are installed automatically:
- `click` - CLI framework
- `rich` - Terminal UI
- `requests` - API communication
- `pandas` - Data manipulation
- `numpy` - Numerical computing
- `PyYAML` - Configuration management
- `cryptography` - Secure key storage

Optional dependencies for backtesting:
```bash
pip install xcoin-cli[backtest]
```

---

## Quick Start

### 1. Authenticate

Get your API key from the platform dashboard:

```bash
xcoin login
```

You'll be prompted to enter your API key (input is hidden for security).

### 2. Create a New Strategy

```bash
xcoin init my-momentum-strategy
cd my-momentum-strategy
```

This creates a complete project structure:

```
my-momentum-strategy/
├── strategy.py          # Main strategy code
├── config.json          # Strategy metadata
├── requirements.txt     # Python dependencies
├── README.md            # Documentation
├── .gitignore          # Git ignore rules
├── tests/
│   └── test_strategy.py # Unit tests
├── data/
│   └── sample.csv       # Sample backtest data
└── .xcoin/
    └── config.yml       # Local configuration
```

### 3. Implement Your Strategy

Edit `strategy.py` and implement your trading logic in the `generate_signal()` method.

### 4. Validate Locally

```bash
xcoin validate
```

This checks for:
- Python syntax errors
- SDK compliance
- Security issues (no file I/O, dangerous imports, etc.)
- Configuration validity

### 5. Test with Backtest

```bash
xcoin test --backtest data/sample.csv
```

Or with custom parameters:

```bash
xcoin test --backtest data/btc_2024.csv --capital 50000 --commission 0.001
```

### 6. Link to Git Repository

```bash
# Initialize git if not already done
git remote add origin https://github.com/yourteam/my-momentum-strategy.git

# Link to platform
xcoin link-git --auto-deploy
```

Follow the webhook setup instructions displayed.

### 7. Push Your Code

```bash
git add .
git commit -m "Implement momentum strategy"
git push origin main
```

The platform will automatically validate your strategy via webhook.

### 8. Check Status

```bash
xcoin status
```

Displays:
- Git integration status
- Validation results
- Deployment status
- Performance metrics

### 9. Deploy to Marketplace

```bash
xcoin deploy
```

Your strategy is now live and users can subscribe!

### 10. Monitor Logs

```bash
xcoin logs --lines 100
```

---

## Command Reference

### `xcoin init [name]`

Initialize a new strategy project with complete scaffolding.

**Usage:**
```bash
xcoin init my-strategy                    # Interactive mode
xcoin init my-strategy --non-interactive  # Use defaults
```

**Options:**
- `--non-interactive` - Skip prompts, use default values

**Creates:**
- SDK-compliant strategy template
- Configuration files
- Unit tests
- Documentation
- Git repository

**Example:**
```bash
xcoin init trend-following-strategy
cd trend-following-strategy
```

---

### `xcoin validate`

Validate strategy code locally before pushing.

**Usage:**
```bash
xcoin validate                    # Validate current directory
xcoin validate --path ./strategy  # Validate specific directory
xcoin validate --strict           # Treat warnings as errors
```

**Options:**
- `--path` - Path to strategy project (default: current directory)
- `--strict` - Fail on warnings

**Checks:**
- **Security Scanner**: Detects dangerous imports, file I/O, network operations
- **SDK Compliance**: Verifies BaseStrategy class, generate_signal() method
- **Config Validation**: Validates JSON schema, required fields
- **Requirements**: Checks for requirements.txt

**Example Output:**
```
┌─────────────────────┐
│ 🔍 Strategy Validator │
└─────────────────────┘

✓ Security
  ✓ No security issues detected

✓ SDK Compliance
  ✓ Found BaseStrategy class
  ✓ Found strategy class: MyStrategy
  ✓ Found generate_signal() entry point

✓ Config
  ✓ All required fields present

✓ Validation passed!
```

**Exit Codes:**
- `0` - Validation passed
- `1` - Validation failed

---

### `xcoin login`

Authenticate with the xcoinalgo platform.

**Usage:**
```bash
xcoin login                                  # Interactive prompt
xcoin login --api-key YOUR_KEY               # Provide key directly
xcoin login --api-url http://localhost:3000  # Custom API URL
```

**Options:**
- `--api-key` - Your API key (or will prompt)
- `--api-url` - API base URL (default: http://localhost:3000)

**Where to get your API key:**
1. Log in to xcoinalgo platform
2. Go to Settings > API Keys
3. Create a new API key

**Security:**
- API keys are encrypted using Fernet encryption
- Stored in `~/.xcoin/config.yml` with 0600 permissions
- Never committed to version control

---

### `xcoin link-git`

Link strategy to Git repository for auto-sync.

**Usage:**
```bash
xcoin link-git                                      # Auto-detect from .git
xcoin link-git --repo https://github.com/...       # Specify repo URL
xcoin link-git --branch develop                    # Use specific branch
xcoin link-git --auto-deploy                       # Enable auto-deploy
```

**Options:**
- `--repo` - Git repository URL (auto-detected if not provided)
- `--branch` - Branch name (default: main)
- `--auto-deploy` - Auto-deploy on successful validation

**What it does:**
1. Creates strategy on platform (if not exists)
2. Links Git repository
3. Provides webhook URL and secret
4. Saves configuration locally

**Webhook Setup:**

For **GitHub**:
1. Go to repository settings: `Settings > Webhooks > Add webhook`
2. Enter webhook URL and secret (displayed by command)
3. Content type: `application/json`
4. Events: "Just the push event"

For **GitLab**:
1. Go to: `Settings > Webhooks`
2. Enter webhook URL and secret
3. Check "Push events"

**Verification:**
```bash
git push origin main
xcoin status  # Check sync status
```

---

### `xcoin test`

Test strategy with historical data using backtest engine.

**Usage:**
```bash
xcoin test --backtest data/sample.csv
xcoin test --backtest data/btc_2024.csv --capital 50000
xcoin test --backtest data.csv --start-date 2024-01-01 --end-date 2024-06-01
```

**Options:**
- `--backtest` - CSV file with historical OHLCV data
- `--capital` - Initial capital in USDT (default: 10000)
- `--commission` - Commission rate (default: 0.001 = 0.1%)
- `--start-date` - Start date (YYYY-MM-DD)
- `--end-date` - End date (YYYY-MM-DD)

**CSV Format:**
```csv
timestamp,open,high,low,close,volume
2024-01-01 00:00:00,45000,45500,44800,45200,1000
2024-01-01 01:00:00,45200,45600,45100,45400,1200
...
```

**Performance Metrics:**
- Total P&L and percentage return
- Win rate, winning/losing trades
- Average win/loss, largest win/loss
- Maximum drawdown
- Profit factor
- Sharpe ratio
- Average trade duration

**Example Output:**
```
📊 Performance Summary
  Initial Capital    $10,000.00
  Final Capital      $12,500.00
  Total P&L          ↗ $2,500.00 (+25.00%)

📈 Trade Statistics
  Total Trades       45
  Winning Trades     28 (62.2%)
  Losing Trades      17 (37.8%)
  Average Win        $150.50
  Average Loss       $85.30

⚠️ Risk Metrics
  Max Drawdown       $450.00 (4.5%)
  Profit Factor      1.76
  Sharpe Ratio       1.42
```

---

### `xcoin status`

Check strategy status on platform.

**Usage:**
```bash
xcoin status                      # Check current strategy
xcoin status --strategy-id ID     # Check specific strategy
```

**Options:**
- `--strategy-id` - Strategy ID (auto-detected if not provided)

**Shows:**
- Strategy info (name, code, version)
- Git repository info (URL, branch, last sync)
- Validation status (passed/failed/pending)
- Deployment status
- Performance metrics (subscribers, executions, success rate)

---

### `xcoin deploy`

Deploy strategy to marketplace.

**Usage:**
```bash
xcoin deploy             # Deploy with confirmation
xcoin deploy --force     # Skip confirmation
```

**Options:**
- `--force` - Skip confirmation prompt
- `--strategy-id` - Strategy ID (auto-detected if not provided)

**Requirements:**
- Latest validation must have passed
- No active errors
- Strategy config complete

**What happens:**
1. Checks validation status
2. Displays strategy info
3. Prompts for confirmation (unless --force)
4. Deploys to marketplace
5. Returns strategy URL

---

### `xcoin logs`

View strategy execution logs.

**Usage:**
```bash
xcoin logs                        # Show recent logs
xcoin logs --lines 100            # Show last 100 lines
xcoin logs --tail                 # Stream real-time logs (coming soon)
```

**Options:**
- `--lines` - Number of log entries to show (default: 50)
- `--tail` - Stream logs in real-time (not yet implemented)
- `--strategy-id` - Strategy ID (auto-detected if not provided)

**Log Format:**

Each log entry shows:
- Timestamp
- Type (INFO, SUCCESS, WARNING, ERROR)
- Signal (LONG, SHORT, HOLD, EXIT_LONG, EXIT_SHORT)
- Price
- Additional details

---

### `xcoin list`

List all your strategies.

**Usage:**
```bash
xcoin list                          # List all strategies
xcoin list --marketplace            # Show only marketplace-published strategies
xcoin list --active                 # Show only active strategies
xcoin list --limit 50               # Show up to 50 strategies
```

**Options:**
- `--marketplace` - Show only strategies published to marketplace
- `--active` - Show only active strategies
- `--limit` - Maximum number of strategies to display (default: 20)

**Output:**

Displays a table with:
- Strategy name and code
- Version
- Status (Active/Inactive)
- Marketplace status
- Creation date
- Last updated date

**Example:**
```
┌──────────────────┬─────────┬────────┬──────────────┬─────────────┐
│ Name             │ Version │ Status │ Marketplace  │ Updated     │
├──────────────────┼─────────┼────────┼──────────────┼─────────────┤
│ Momentum Strategy│ 1.2.0   │ Active │ Published    │ 2024-10-10  │
│ Mean Reversion   │ 1.0.1   │ Active │ Not Published│ 2024-10-08  │
└──────────────────┴─────────┴────────┴──────────────┴─────────────┘
```

---

### `xcoin delete`

Delete a strategy from the platform.

**Usage:**
```bash
xcoin delete                        # Delete current strategy (context-aware)
xcoin delete my-strategy            # Delete by name
xcoin delete --strategy-id xyz      # Delete by ID
xcoin delete --yes                  # Skip confirmation prompt
```

**Options:**
- `strategy_name` - Strategy name (optional, auto-detected from current directory)
- `--strategy-id` - Strategy ID (if not using name)
- `--yes`, `-y` - Skip confirmation prompt

**Context-Aware Mode:**

When run from a strategy directory, automatically detects the strategy ID from:
1. `.xcoin/strategy.json` (created by `xcoin deploy`)
2. `.xcoin/config.yml` (legacy format)

**Requirements:**
- No active deployments (must be stopped first)
- Strategy must exist on platform

**What it does:**
1. Fetches strategy details
2. Displays strategy information
3. Prompts for confirmation (unless `--yes` flag)
4. Deletes strategy from platform
5. Local files are **not** deleted

**Warning:** This action removes the strategy from the platform permanently. Active deployments must be stopped first.

**Example:**
```bash
# From strategy directory
cd my-momentum-strategy
xcoin delete

# Or explicit naming
xcoin delete momentum-strategy --yes
```

---

### `xcoin unpublish`

Remove strategy from marketplace without deleting it.

**Usage:**
```bash
xcoin unpublish                     # Unpublish current strategy (context-aware)
xcoin unpublish my-strategy         # Unpublish by name
xcoin unpublish --strategy-id xyz   # Unpublish by ID
xcoin unpublish --yes               # Skip confirmation prompt
```

**Options:**
- `strategy_name` - Strategy name (optional, auto-detected from current directory)
- `--strategy-id` - Strategy ID (if not using name)
- `--yes`, `-y` - Skip confirmation prompt

**Context-Aware Mode:**

Similar to `xcoin delete`, automatically detects strategy ID from local config.

**What it does:**
1. Fetches strategy details
2. Displays strategy information
3. Prompts for confirmation (unless `--yes` flag)
4. Removes strategy from marketplace
5. Strategy remains in your account

**Difference from Delete:**

- `xcoin unpublish` - Removes from marketplace, keeps in your account, can republish later
- `xcoin delete` - Permanently removes from platform

**Re-publishing:**

You can republish anytime with:
```bash
xcoin deploy --marketplace
```

**Example:**
```bash
# From strategy directory
cd my-momentum-strategy
xcoin unpublish

# Or explicit naming
xcoin unpublish momentum-strategy --yes
```

---

## Complete Workflow

### Development Workflow

```bash
# 1. Create strategy
xcoin init my-strategy
cd my-strategy

# 2. Develop locally
vim strategy.py

# 3. Validate
xcoin validate

# 4. Test with backtest
xcoin test --backtest data/sample.csv

# 5. Iterate until satisfied
# ... make changes ...
xcoin validate
xcoin test --backtest data/historical.csv --capital 50000

# 6. Initialize git
git init
git remote add origin https://github.com/yourteam/my-strategy.git

# 7. Link to platform
xcoin link-git --auto-deploy

# 8. Push code
git add .
git commit -m "Initial implementation"
git push origin main

# 9. Monitor status
xcoin status

# 10. Deploy when ready
xcoin deploy

# 11. Monitor performance
xcoin logs
xcoin status
```

### Continuous Development Workflow

After initial setup:

```bash
# 1. Make changes
vim strategy.py

# 2. Validate locally
xcoin validate

# 3. Test changes
xcoin test --backtest data/recent.csv

# 4. Commit and push
git add .
git commit -m "Optimize entry logic"
git push

# Platform automatically validates via webhook

# 5. Check validation status
xcoin status

# 6. If validation passed and you enabled auto-deploy, done!
# Otherwise, manually deploy:
xcoin deploy
```

---

## Strategy Development

### SDK Interface

All strategies must implement this interface:

```python
from typing import Dict, Any, List

def generate_signal(
    candles: List[Dict],
    settings: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Generate trading signal based on candle data and settings.

    Args:
        candles: List of OHLCV dictionaries with keys:
            - timestamp (int): Unix timestamp in milliseconds
            - open (float): Opening price
            - high (float): High price
            - low (float): Low price
            - close (float): Closing price
            - volume (float): Trading volume

        settings: Dictionary containing strategy parameters and state

    Returns:
        Dictionary with:
            - signal (str): 'LONG', 'SHORT', 'HOLD', 'EXIT_LONG', or 'EXIT_SHORT'
            - price (float): Current price
            - stopLoss (float, optional): Stop loss price
            - takeProfit (float, optional): Take profit price
            - metadata (dict): Additional data including state for next execution
    """
    pass
```

### Strategy Template Structure

```python
class BaseStrategy:
    """Base class for all trading strategies"""

    def __init__(self):
        self.name = "My Strategy"
        self.version = "1.0.0"

    def generate_signal(self, candles: List[Dict], settings: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError()


class MyStrategyStrategy(BaseStrategy):
    """Your strategy implementation"""

    def generate_signal(self, candles: List[Dict], settings: Dict[str, Any]) -> Dict[str, Any]:
        # Extract parameters
        params = self._extract_parameters(settings)

        # Convert candles to DataFrame
        df = self._candles_to_dataframe(candles)

        # Calculate indicators
        df = self._calculate_indicators(df, params)

        # Generate signals
        latest = df.iloc[-1]
        current_price = float(latest['close'])

        # Your trading logic here
        if latest['sma_fast'] > latest['sma_slow']:
            return {
                'signal': 'LONG',
                'price': current_price,
                'stopLoss': current_price * 0.98,
                'takeProfit': current_price * 1.05,
                'metadata': {
                    'in_position': True,
                    'entry_price': current_price
                }
            }

        return {
            'signal': 'HOLD',
            'price': current_price,
            'metadata': {}
        }


# Module-level function (required)
strategy = MyStrategyStrategy()

def generate_signal(candles: List[Dict], settings: Dict[str, Any]) -> Dict[str, Any]:
    return strategy.generate_signal(candles, settings)
```

### State Management

Strategies are stateless between executions. Use the `metadata` field to persist state:

```python
# Get previous state
previous_state = settings.get('previous_state', {})
in_position = previous_state.get('in_position', False)

# Return new state
return {
    'signal': 'LONG',
    'price': current_price,
    'metadata': {
        'in_position': True,
        'entry_price': current_price,
        'entry_time': timestamp
    }
}
```

The `metadata` returned becomes `previous_state` in the next execution.

### Security Constraints

**Forbidden Operations:**
- ❌ File I/O (`open()`, `with open()`)
- ❌ Network operations (no `requests`, `urllib`, `http`)
- ❌ System operations (`os`, `sys`, `subprocess`)
- ❌ Dynamic code execution (`eval`, `exec`, `compile`)
- ❌ Importing dangerous modules

**Allowed:**
- ✅ `pandas`, `numpy` for data manipulation
- ✅ `pandas_ta` or `ta-lib` for indicators
- ✅ Mathematical operations
- ✅ DataFrame operations

### Using Technical Indicators

```python
import pandas_ta as ta

def _calculate_indicators(self, df: pd.DataFrame, params: Dict) -> pd.DataFrame:
    # Moving averages
    df['sma_fast'] = ta.sma(df['close'], length=params['sma_fast_period'])
    df['sma_slow'] = ta.sma(df['close'], length=params['sma_slow_period'])

    # RSI
    df['rsi'] = ta.rsi(df['close'], length=14)

    # Bollinger Bands
    bb = ta.bbands(df['close'], length=20, std=2)
    df = pd.concat([df, bb], axis=1)

    # MACD
    macd = ta.macd(df['close'])
    df = pd.concat([df, macd], axis=1)

    # ATR for stop loss
    df['atr'] = ta.atr(df['high'], df['low'], df['close'], length=14)

    return df
```

---

## Backtesting

### Preparing Historical Data

Download historical OHLCV data in CSV format:

```csv
timestamp,open,high,low,close,volume
2024-01-01 00:00:00,45000,45500,44800,45200,1000
2024-01-01 01:00:00,45200,45600,45100,45400,1200
```

**Data Sources:**
- Exchange APIs (Binance, CoinDCX, etc.)
- Market data providers
- Historical data exporters

### Running Backtests

Basic backtest:
```bash
xcoin test --backtest data/btc_2024.csv
```

With custom parameters:
```bash
xcoin test \
  --backtest data/btc_2024.csv \
  --capital 50000 \
  --commission 0.001 \
  --start-date 2024-01-01 \
  --end-date 2024-06-01
```

### Interpreting Results

**Performance Summary:**
- **Total P&L**: Absolute profit/loss
- **P&L Percentage**: Return on initial capital
- **Win Rate**: Percentage of winning trades

**Trade Statistics:**
- **Total Trades**: Number of completed trades
- **Average Win/Loss**: Average profit/loss per trade
- **Largest Win/Loss**: Best and worst single trades

**Risk Metrics:**
- **Max Drawdown**: Largest peak-to-trough decline
- **Profit Factor**: Gross profit / gross loss (>1 is profitable)
- **Sharpe Ratio**: Risk-adjusted return (>1 is good, >2 is excellent)

### Optimizing Strategies

1. **Test Multiple Timeframes:**
   ```bash
   xcoin test --backtest data/btc_1h.csv
   xcoin test --backtest data/btc_4h.csv
   xcoin test --backtest data/btc_1d.csv
   ```

2. **Adjust Parameters** in `config.json`:
   ```json
   {
     "parameters": [
       {
         "name": "sma_fast_period",
         "default": 10,
         "min": 5,
         "max": 50
       }
     ]
   }
   ```

3. **Test Different Market Conditions:**
   - Bull market period
   - Bear market period
   - Sideways market period

4. **Walk-Forward Testing:**
   ```bash
   # Train period
   xcoin test --backtest data.csv --start-date 2024-01-01 --end-date 2024-03-31

   # Test period
   xcoin test --backtest data.csv --start-date 2024-04-01 --end-date 2024-06-30
   ```

---

## Git Integration

### Setting Up GitHub Integration

1. **Link your repository:**
   ```bash
   xcoin link-git
   ```

2. **Copy webhook URL and secret** from command output

3. **Configure GitHub webhook:**
   - Go to: `https://github.com/yourteam/strategy/settings/hooks`
   - Click "Add webhook"
   - Paste webhook URL
   - Set content type to `application/json`
   - Paste secret
   - Select "Just the push event"
   - Click "Add webhook"

4. **Test webhook:**
   ```bash
   git push origin main
   ```

5. **Verify on platform:**
   ```bash
   xcoin status
   ```

### Auto-Deploy on Push

Enable auto-deploy to automatically deploy validated strategies:

```bash
xcoin link-git --auto-deploy
```

**Workflow:**
1. Push code to GitHub
2. Webhook triggers platform validation
3. If validation passes → auto-deploy
4. If validation fails → notification sent

### Managing Multiple Branches

Use different branches for development:

```bash
# Development branch
git checkout -b develop
# ... make changes ...
git push origin develop

# Link develop branch
xcoin link-git --branch develop

# When ready for production
git checkout main
git merge develop
git push origin main
```

---

## Deployment

### Pre-Deployment Checklist

Before deploying to marketplace:

- [ ] Strategy passes local validation (`xcoin validate`)
- [ ] Backtest results are satisfactory
- [ ] Strategy is pushed to Git
- [ ] Platform validation passed (`xcoin status`)
- [ ] Config is complete (description, parameters, risk profile)
- [ ] README documentation is complete

### Deploying

```bash
xcoin deploy
```

Or skip confirmation:

```bash
xcoin deploy --force
```

### Post-Deployment

After deployment:

1. **Monitor logs:**
   ```bash
   xcoin logs
   ```

2. **Check performance:**
   ```bash
   xcoin status
   ```

3. **Track subscribers:**
   - View in platform dashboard
   - Monitor subscriber growth

4. **Iterate and improve:**
   - Analyze execution logs
   - Optimize based on live performance
   - Push updates (auto-syncs via Git)

### Updating Deployed Strategies

To update a deployed strategy:

```bash
# 1. Make changes
vim strategy.py

# 2. Test locally
xcoin validate
xcoin test --backtest data/recent.csv

# 3. Push changes
git add .
git commit -m "Optimize SL/TP logic"
git push

# 4. Platform auto-validates
# 5. If auto-deploy enabled, automatically deploys
# Otherwise:
xcoin deploy
```

---

## Best Practices

### Strategy Development

1. **Start Simple**
   - Begin with basic logic
   - Add complexity incrementally
   - Test each addition

2. **Use Version Control**
   - Commit frequently
   - Use meaningful commit messages
   - Tag releases

3. **Document Everything**
   - Update README with strategy description
   - Comment complex logic
   - Document parameter ranges

4. **Test Thoroughly**
   - Backtest on multiple timeframes
   - Test in different market conditions
   - Walk-forward validation

5. **Manage Risk**
   - Always use stop losses
   - Limit position sizes
   - Set maximum drawdown limits

### Code Quality

1. **Follow SDK Interface**
   - Implement required methods
   - Return correct signal format
   - Handle errors gracefully

2. **Validate Inputs**
   - Check for sufficient data
   - Handle missing values
   - Validate parameter ranges

3. **Optimize Performance**
   - Use vectorized operations (pandas)
   - Avoid loops when possible
   - Cache calculations

4. **Handle Errors**
   ```python
   try:
       # Strategy logic
       return signal
   except Exception as e:
       # Return safe signal on error
       return {
           'signal': 'HOLD',
           'price': 0,
           'metadata': {'error': str(e)}
       }
   ```

### Security

1. **Never Commit Secrets**
   - API keys
   - Passwords
   - Private keys

2. **Review Code**
   - Check for security issues
   - Run `xcoin validate` before pushing

3. **Use .gitignore**
   - Exclude sensitive files
   - Exclude local config

### Git Workflow

1. **Use Branches**
   ```bash
   # Feature branch
   git checkout -b feature/new-indicator

   # After testing
   git checkout main
   git merge feature/new-indicator
   ```

2. **Meaningful Commits**
   ```bash
   git commit -m "Add RSI indicator for trend confirmation"
   git commit -m "Optimize entry logic based on backtest results"
   ```

3. **Tag Releases**
   ```bash
   git tag -a v1.0.0 -m "Initial production release"
   git push origin v1.0.0
   ```

---

## Troubleshooting

### Common Issues

#### Installation Issues

**Problem:** `pip install` fails
```bash
error: externally-managed-environment
```

**Solution:** Use virtual environment
```bash
python3 -m venv venv
source venv/bin/activate
pip install -e .
```

---

**Problem:** pandas-ta installation fails

**Solution:** pandas-ta is optional
```bash
pip install pandas-ta
# OR
pip install -e ".[backtest]"
```

#### Authentication Issues

**Problem:** `Not authenticated` error

**Solution:**
```bash
xcoin login --api-key YOUR_API_KEY
```

Check stored credentials:
```bash
cat ~/.xcoin/config.yml
```

---

**Problem:** API connection refused

**Solution:** Check API URL
```bash
xcoin login --api-url http://localhost:3000
```

#### Validation Issues

**Problem:** `Network operation not allowed`

**Solution:** Remove network imports
```python
# ❌ Not allowed
import requests

# ✅ Allowed
import pandas as pd
import numpy as np
import pandas_ta as ta
```

---

**Problem:** `File I/O operation not allowed`

**Solution:** Use metadata for state instead of files
```python
# ❌ Not allowed
with open('state.json', 'w') as f:
    json.dump(state, f)

# ✅ Allowed
return {
    'signal': 'LONG',
    'metadata': {'state': state}
}
```

#### Backtest Issues

**Problem:** `Failed to load data`

**Solution:** Check CSV format
```csv
timestamp,open,high,low,close,volume
2024-01-01 00:00:00,45000,45500,44800,45200,1000
```

---

**Problem:** `Syntax error in strategy`

**Solution:** Run validation first
```bash
xcoin validate
```

---

**Problem:** No trades in backtest

**Solution:** Check signal generation logic
```python
# Add debug logging
print(f"Signal: {signal}, Price: {current_price}")
```

#### Git Integration Issues

**Problem:** Webhook not triggering

**Solution:**
1. Verify webhook URL is correct
2. Check webhook secret matches
3. Test webhook in GitHub settings
4. Check webhook delivery history

---

**Problem:** `Strategy ID not found`

**Solution:** Link repository first
```bash
xcoin link-git
```

#### Deployment Issues

**Problem:** `Validation has not passed`

**Solution:**
1. Check status: `xcoin status`
2. View validation errors
3. Fix issues and push again

---

**Problem:** Can't deploy without Git

**Solution (OUTDATED):** Git is NO LONGER REQUIRED for deployment!

You can deploy directly without Git using:
```bash
xcoin deploy
```

If you still want to use Git integration (optional), you can link it:
```bash
git remote add origin https://github.com/yourteam/strategy.git
xcoin link-git --auto-deploy
```

See [README.md](./README.md) for the current seamless deployment workflow.

### Getting Help

1. **Check Documentation**
   - This user guide
   - Platform documentation: https://docs.xcoinalgo.com

2. **Command Help**
   ```bash
   xcoin --help
   xcoin init --help
   xcoin validate --help
   ```

3. **Check Logs**
   ```bash
   xcoin logs
   ```

4. **Contact Support**
   - GitHub Issues: https://github.com/xcoinalgo/xcoin-cli/issues
   - Discord: https://discord.gg/xcoinalgo
   - Email: support@xcoinalgo.com

### Debug Mode

For verbose output:
```bash
# Set environment variable
export XCOIN_DEBUG=1

# Run command
xcoin validate
```

---

## Appendix

### Configuration Files

**Global Config:** `~/.xcoin/config.yml`
```yaml
api_key: <encrypted>
api_url: http://localhost:3000
user:
  email: john@quantteam.com
  role: quant
  team: quantteam
```

**Local Config:** `.xcoin/config.yml` (per strategy)
```yaml
strategy_id: 507f1f77bcf86cd799439011
git:
  repository: https://github.com/yourteam/strategy
  branch: main
  webhookUrl: https://platform.com/api/webhooks/github
  webhookSecret: <secret>
  autoDeploy: true
```

### Strategy Config Schema

**config.json:**
```json
{
  "name": "My Strategy",
  "code": "MY_STRATEGY_V1",
  "author": {
    "name": "John Doe",
    "email": "john@example.com"
  },
  "description": "Strategy description",
  "pairs": ["B-BTC_USDT", "B-ETH_USDT"],
  "timeframes": ["15m", "1h"],
  "parameters": [
    {
      "name": "lookback_period",
      "type": "integer",
      "default": 100,
      "min": 10,
      "max": 500,
      "description": "Number of historical candles"
    }
  ],
  "riskProfile": {
    "maxDrawdown": 0.15,
    "volatility": "medium",
    "leverage": 5
  }
}
```

### Exit Codes

- `0` - Success
- `1` - Error (validation failed, command failed, etc.)

### Environment Variables

- `XCOIN_DEBUG` - Enable debug output (0 or 1)
- `XCOIN_CONFIG_DIR` - Custom config directory (default: ~/.xcoin)

---

**End of User Guide**

For the latest documentation, visit: https://docs.xcoinalgo.com/cli
