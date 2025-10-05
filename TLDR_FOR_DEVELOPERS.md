# TL;DR: How Developers Use XCoinAlgo SDK

## For Quant Developers

### Step 1: Install SDK (One Command)

```bash
pip install git+https://github.com/punksapien/xcoinalgo.git#subdirectory=python-sdk
```

### Step 2: Write Strategy (5 Minutes)

Create `my_strategy.py`:

```python
from crypto_strategy_sdk import BaseStrategy, SignalType

class MyStrategy(BaseStrategy):
    def initialize(self):
        self.sma_period = 20

    def generate_signals(self, df):
        if len(df) < self.sma_period:
            return {'signal': SignalType.HOLD, 'confidence': 0.0}

        sma = df['close'].rolling(self.sma_period).mean()

        if df.iloc[-1]['close'] > sma.iloc[-1]:
            return {'signal': SignalType.LONG, 'confidence': 0.8}
        else:
            return {'signal': SignalType.SHORT, 'confidence': 0.8}
```

### Step 3: Upload to Platform

1. Go to: **http://13.53.120.232/login** (or **https://xcoinalgo.com**)
2. Dashboard → **Upload Strategy**
3. Upload `my_strategy.py`
4. **Deploy!**

---

## When You Make SDK Updates

Developers update with the same command:

```bash
pip install --upgrade git+https://github.com/punksapien/xcoinalgo.git#subdirectory=python-sdk
```

---

## Version Management

### Release New Version

**1. Update version in 3 files:**

```bash
# python-sdk/setup.py
version="1.1.0"

# python-sdk/pyproject.toml
version = "1.1.0"

# python-sdk/crypto_strategy_sdk/__init__.py
__version__ = "1.1.0"
```

**2. Update CHANGELOG.md:**

```markdown
## [1.1.0] - 2025-10-XX

### Added
- New feature

### Fixed
- Bug fix
```

**3. Commit and tag:**

```bash
cd /Users/macintosh/Developer/coindcx_client/coindcx-trading-platform

git add python-sdk/
git commit -m "Release SDK v1.1.0"
git tag v1.1.0

GIT_SSH_COMMAND="ssh -i ~/.ssh/punksapien_github" git push origin main
GIT_SSH_COMMAND="ssh -i ~/.ssh/punksapien_github" git push origin v1.1.0
```

**4. Notify developers:**

```
🚀 SDK v1.1.0 is out!

Update with:
pip install --upgrade git+https://github.com/punksapien/xcoinalgo.git#subdirectory=python-sdk

What's new:
- Feature X
- Bug fix Y
```

---

## Install Specific Version

```bash
# Latest
pip install git+https://github.com/punksapien/xcoinalgo.git#subdirectory=python-sdk

# Specific version
pip install git+https://github.com/punksapien/xcoinalgo.git@v1.0.0#subdirectory=python-sdk

# Development branch
pip install git+https://github.com/punksapien/xcoinalgo.git@dev#subdirectory=python-sdk
```

---

## Advantages of Git-Based Distribution

✅ **Auto-updates**: Developers always get latest with simple command
✅ **Version control**: Tag releases (v1.0.0, v1.1.0, etc.)
✅ **No manual sharing**: No need to email .whl files
✅ **No PyPI needed**: Works immediately
✅ **Easy rollback**: Install specific version if needed

---

## That's It!

**Share this with developers:**

```bash
# Install SDK
pip install git+https://github.com/punksapien/xcoinalgo.git#subdirectory=python-sdk

# Verify
python -c "import crypto_strategy_sdk; print(crypto_strategy_sdk.__version__)"

# Write strategy, upload to platform, done!
```

**Documentation:**
- Quick Start: `python-sdk/SDK_QUICKSTART.md`
- Full Guide: `/Users/macintosh/Developer/coindcx_client/RESEARCHER_ONBOARDING.md`
- Examples: `python-sdk/examples/`
