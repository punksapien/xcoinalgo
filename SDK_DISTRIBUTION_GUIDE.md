# XCoinAlgo SDK - Distribution Guide for Developers

## Installation (Recommended Method)

### Install Directly from GitHub

```bash
pip install git+https://github.com/punksapien/xcoinalgo.git#subdirectory=python-sdk
```

**Why this is best:**
- ✅ Always get the latest version
- ✅ Easy updates with same command
- ✅ No need to download files manually
- ✅ Works anywhere with internet

---

## Verify Installation

```bash
python -c "import crypto_strategy_sdk; print(f'SDK version: {crypto_strategy_sdk.__version__}')"
```

Expected output:
```
SDK version: 1.0.0
```

---

## Updating to Latest Version

When we release updates, simply run:

```bash
pip install --upgrade git+https://github.com/punksapien/xcoinalgo.git#subdirectory=python-sdk
```

Or force reinstall:
```bash
pip install --force-reinstall git+https://github.com/punksapien/xcoinalgo.git#subdirectory=python-sdk
```

---

## Install Specific Version

### By Version Tag
```bash
# Install version 1.0.0
pip install git+https://github.com/punksapien/xcoinalgo.git@v1.0.0#subdirectory=python-sdk

# Install version 1.1.0 (when available)
pip install git+https://github.com/punksapien/xcoinalgo.git@v1.1.0#subdirectory=python-sdk
```

### By Git Commit
```bash
# Install specific commit
pip install git+https://github.com/punksapien/xcoinalgo.git@abc123#subdirectory=python-sdk
```

### By Branch
```bash
# Install from development branch
pip install git+https://github.com/punksapien/xcoinalgo.git@dev#subdirectory=python-sdk
```

---

## Alternative: Install from Local Clone

If you want to modify the SDK or contribute:

```bash
# Clone the repository
git clone https://github.com/punksapien/xcoinalgo.git
cd xcoinalgo/python-sdk

# Install in editable mode
pip install -e .
```

Now any changes you make to the SDK code will be reflected immediately.

---

## Usage After Installation

### Quick Test
```python
from crypto_strategy_sdk import BaseStrategy, StrategyConfig, SignalType

config = StrategyConfig(
    name="Test Strategy",
    code="TEST_V1",
    author="Your Name",
    pair="BTC_USDT",
    leverage=10
)

print(f"✅ SDK loaded successfully!")
print(f"Version: {crypto_strategy_sdk.__version__}")
```

### Write Your First Strategy

Create `my_strategy.py`:
```python
from crypto_strategy_sdk import BaseStrategy, SignalType
import pandas as pd

class MyStrategy(BaseStrategy):
    def initialize(self):
        self.sma_period = 20

    def generate_signals(self, df: pd.DataFrame):
        if len(df) < self.sma_period:
            return {'signal': SignalType.HOLD, 'confidence': 0.0}

        df['sma'] = self.indicators.sma(df, self.sma_period)

        if df.iloc[-1]['close'] > df.iloc[-1]['sma']:
            return {'signal': SignalType.LONG, 'confidence': 0.8}
        return {'signal': SignalType.HOLD, 'confidence': 0.0}
```

### Upload to Platform

1. Go to http://13.53.120.232/login (or https://xcoinalgo.com)
2. Dashboard → Strategies → Upload
3. Upload `my_strategy.py`
4. Configure and deploy!

---

## Version Management (For Maintainers)

### Creating a New Release

1. **Update version in 3 places:**
   ```bash
   # python-sdk/setup.py
   version="1.1.0"

   # python-sdk/pyproject.toml
   version = "1.1.0"

   # python-sdk/crypto_strategy_sdk/__init__.py
   __version__ = "1.1.0"
   ```

2. **Update CHANGELOG.md:**
   ```markdown
   ## [1.1.0] - 2025-10-XX

   ### Added
   - New feature X

   ### Fixed
   - Bug fix Y
   ```

3. **Commit and tag:**
   ```bash
   git add .
   git commit -m "Release v1.1.0"
   git tag v1.1.0
   git push origin main
   git push origin v1.1.0
   ```

4. **Notify developers:**
   ```
   Hey team! New SDK version 1.1.0 is out 🚀

   Update with:
   pip install --upgrade git+https://github.com/punksapien/xcoinalgo.git#subdirectory=python-sdk

   Changelog:
   - Added feature X
   - Fixed bug Y
   ```

---

## Troubleshooting

### "Command not found: git"
Install Git:
- **macOS**: `brew install git`
- **Ubuntu**: `sudo apt install git`
- **Windows**: Download from https://git-scm.com/

### "Repository not found"
Make sure the GitHub repo is public or you have access.

### "No module named 'crypto_strategy_sdk'"
Reinstall:
```bash
pip uninstall crypto-strategy-sdk xcoinalgo-strategy-sdk
pip install git+https://github.com/punksapien/xcoinalgo.git#subdirectory=python-sdk
```

### Check installed version
```bash
pip list | grep strategy
```

### Uninstall
```bash
pip uninstall xcoinalgo-strategy-sdk
```

---

## For Developers: Complete Workflow

### 1. Install SDK
```bash
pip install git+https://github.com/punksapien/xcoinalgo.git#subdirectory=python-sdk
```

### 2. Create Strategy
```bash
mkdir ~/my-strategies
cd ~/my-strategies
# Write your strategy (see SDK_QUICKSTART.md for examples)
```

### 3. Test Locally
```bash
python my_strategy.py
# Or run backtests
```

### 4. Upload to Platform
- Login to https://xcoinalgo.com
- Upload `.py` file
- Deploy and monitor

### 5. Get Updates
```bash
# When new SDK version is released
pip install --upgrade git+https://github.com/punksapien/xcoinalgo.git#subdirectory=python-sdk
```

---

## SDK Documentation

- **Quick Start**: `python-sdk/SDK_QUICKSTART.md`
- **Full API Docs**: `python-sdk/README.md`
- **Examples**: `python-sdk/examples/`
- **Changelog**: `python-sdk/CHANGELOG.md`

---

## Summary

**Installation Command (Share this with developers):**
```bash
pip install git+https://github.com/punksapien/xcoinalgo.git#subdirectory=python-sdk
```

**Update Command:**
```bash
pip install --upgrade git+https://github.com/punksapien/xcoinalgo.git#subdirectory=python-sdk
```

**That's it!** No PyPI, no manual downloads, just one simple command.
