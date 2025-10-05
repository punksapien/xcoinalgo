# XCoinAlgo SDK - Versioning & Version Locking Guide

## Yes! Git-based versioning works EXACTLY like PyPI

Your developers can install any specific version, just like with PyPI packages.

---

## Installing Specific Versions

### Latest Version (Default)
```bash
pip install git+https://github.com/punksapien/xcoinalgo.git#subdirectory=python-sdk
```

### Specific Version by Tag
```bash
# Install version 1.0.0
pip install git+https://github.com/punksapien/xcoinalgo.git@v1.0.0#subdirectory=python-sdk

# Install version 1.1.0 (when available)
pip install git+https://github.com/punksapien/xcoinalgo.git@v1.1.0#subdirectory=python-sdk

# Install version 2.0.0 (future)
pip install git+https://github.com/punksapien/xcoinalgo.git@v2.0.0#subdirectory=python-sdk
```

### By Commit Hash (Advanced)
```bash
# Install specific commit
pip install git+https://github.com/punksapien/xcoinalgo.git@abc123def#subdirectory=python-sdk
```

### By Branch
```bash
# Development/testing branch
pip install git+https://github.com/punksapien/xcoinalgo.git@dev#subdirectory=python-sdk

# Staging branch
pip install git+https://github.com/punksapien/xcoinalgo.git@staging#subdirectory=python-sdk
```

---

## Version Locking in requirements.txt

**Just like PyPI packages!**

### Old Way (PyPI)
```txt
# requirements.txt
pandas==2.0.0
numpy==1.24.0
scikit-learn==1.3.0
```

### New Way (Git + Versions)
```txt
# requirements.txt
pandas==2.0.0
numpy==1.24.0
git+https://github.com/punksapien/xcoinalgo.git@v1.0.0#subdirectory=python-sdk
```

**Install with:**
```bash
pip install -r requirements.txt
```

---

## Version Locking in Virtual Environments

### Example: Strategy Needs SDK v1.0.0

**Create isolated environment:**
```bash
# Create new venv for this strategy
python -m venv strategy_old_venv
source strategy_old_venv/bin/activate  # Windows: strategy_old_venv\Scripts\activate

# Install specific SDK version
pip install git+https://github.com/punksapien/xcoinalgo.git@v1.0.0#subdirectory=python-sdk

# Verify version
python -c "import crypto_strategy_sdk; print(crypto_strategy_sdk.__version__)"
# Output: 1.0.0
```

**Save dependencies:**
```bash
pip freeze > requirements_v1.txt
```

**Later, recreate exact environment:**
```bash
python -m venv new_venv
source new_venv/bin/activate
pip install -r requirements_v1.txt
```

---

## Real-World Use Cases

### Use Case 1: Legacy Strategy Requires Old SDK

```bash
# Strategy developed with SDK v1.0.0
# New SDK is v2.0.0 with breaking changes

# Solution: Lock to v1.0.0
pip install git+https://github.com/punksapien/xcoinalgo.git@v1.0.0#subdirectory=python-sdk
```

### Use Case 2: Testing New SDK Before Upgrading

```bash
# Test new version in separate environment
python -m venv test_new_sdk
source test_new_sdk/bin/activate

# Install new version
pip install git+https://github.com/punksapien/xcoinalgo.git@v2.0.0#subdirectory=python-sdk

# Test strategy with new SDK
python my_strategy.py

# If works: upgrade production
# If breaks: stay on v1.0.0
```

### Use Case 3: Different Strategies, Different Versions

```bash
# Project structure
my-strategies/
├── strategy_a/
│   ├── venv/  # Uses SDK v1.0.0
│   └── strategy.py
├── strategy_b/
│   ├── venv/  # Uses SDK v1.5.0
│   └── strategy.py
└── strategy_c/
    ├── venv/  # Uses SDK v2.0.0 (latest)
    └── strategy.py
```

Each has isolated environment with different SDK version!

---

## Semantic Versioning (Your Release Strategy)

Follow [SemVer](https://semver.org/): **MAJOR.MINOR.PATCH** (e.g., 2.3.1)

### MAJOR version (1.x.x → 2.x.x)
**When:** Breaking changes that require code updates

**Example:**
```python
# SDK v1.0.0
def generate_signals(self, df):
    return {'signal': SignalType.LONG}

# SDK v2.0.0 (breaking change)
def generate_signals(self, df, context):  # Added parameter
    return {'signal': SignalType.LONG}
```

**Users must:** Update their code or lock to v1.x.x

### MINOR version (1.0.x → 1.1.x)
**When:** New features, backward compatible

**Example:**
```python
# SDK v1.0.0
self.indicators.sma()
self.indicators.ema()

# SDK v1.1.0 (new feature added)
self.indicators.sma()
self.indicators.ema()
self.indicators.vwap()  # NEW
```

**Users can:** Upgrade safely, old code still works

### PATCH version (1.0.0 → 1.0.1)
**When:** Bug fixes, no new features

**Example:**
```python
# SDK v1.0.0 - Bug: RSI calculation error
# SDK v1.0.1 - Fixed: RSI now calculates correctly
```

**Users should:** Always upgrade patches (bug fixes)

---

## Release Workflow

### Release v1.1.0 (Example)

**1. Update version in 3 files:**

```python
# python-sdk/crypto_strategy_sdk/__init__.py
__version__ = "1.1.0"
```

```python
# python-sdk/setup.py
version="1.1.0"
```

```toml
# python-sdk/pyproject.toml
version = "1.1.0"
```

**2. Update CHANGELOG.md:**

```markdown
## [1.1.0] - 2025-10-15

### Added
- New indicator: VWAP (Volume Weighted Average Price)
- Support for multiple timeframes in backtesting

### Fixed
- RSI calculation edge case for small datasets

### Changed
- Improved performance of SMA calculation by 30%
```

**3. Commit, tag, and push:**

```bash
cd /Users/macintosh/Developer/coindcx_client/coindcx-trading-platform

git add python-sdk/
git commit -m "Release SDK v1.1.0

- Add VWAP indicator
- Fix RSI edge case
- Improve SMA performance"

git tag -a v1.1.0 -m "SDK v1.1.0 - VWAP indicator and performance improvements"

GIT_SSH_COMMAND="ssh -i ~/.ssh/punksapien_github" git push origin main
GIT_SSH_COMMAND="ssh -i ~/.ssh/punksapien_github" git push origin v1.1.0
```

**4. Notify developers:**

```
🚀 SDK v1.1.0 Released!

New Features:
✨ VWAP indicator now available
✨ Multiple timeframe backtesting support

Bug Fixes:
🐛 Fixed RSI calculation edge case

Performance:
⚡ SMA calculation 30% faster

Upgrade:
pip install --upgrade git+https://github.com/punksapien/xcoinalgo.git#subdirectory=python-sdk

Or lock to this version:
pip install git+https://github.com/punksapien/xcoinalgo.git@v1.1.0#subdirectory=python-sdk

Changelog: https://github.com/punksapien/xcoinalgo/blob/main/python-sdk/CHANGELOG.md
```

---

## Version Constraints (Like PyPI)

### In requirements.txt

```txt
# Exact version
git+https://github.com/punksapien/xcoinalgo.git@v1.0.0#subdirectory=python-sdk

# Can also document constraints in comments
# SDK >= 1.0.0, < 2.0.0 (use tags v1.0.0, v1.5.0, etc.)
git+https://github.com/punksapien/xcoinalgo.git@v1.5.0#subdirectory=python-sdk
```

### In setup.py (for strategy packages)

```python
install_requires=[
    'pandas>=2.0.0',
    'numpy>=1.20.0',
    # Note: Git deps typically go in requirements.txt
    # But can document here:
    # 'xcoinalgo-strategy-sdk @ git+https://github.com/punksapien/xcoinalgo.git@v1.0.0#subdirectory=python-sdk'
]
```

---

## Checking Installed Version

```bash
# Method 1: Python code
python -c "import crypto_strategy_sdk; print(crypto_strategy_sdk.__version__)"

# Method 2: pip list
pip list | grep xcoinalgo

# Method 3: pip show
pip show xcoinalgo-strategy-sdk
```

**Output:**
```
Name: xcoinalgo-strategy-sdk
Version: 1.0.0
Location: /path/to/site-packages
```

---

## Migration Strategy (Version Upgrades)

### Example: Upgrading from v1.x to v2.0 (Breaking Changes)

**v2.0 introduces breaking changes:**
- `generate_signals()` now requires `context` parameter
- `StrategyConfig` renamed to `Config`

**Migration Guide:**

```python
# OLD (v1.x)
from crypto_strategy_sdk import BaseStrategy, StrategyConfig

class MyStrategy(BaseStrategy):
    def generate_signals(self, df):
        return {'signal': SignalType.LONG, 'confidence': 0.8}

config = StrategyConfig(name="My Strategy")
```

```python
# NEW (v2.0)
from crypto_strategy_sdk import BaseStrategy, Config  # Renamed

class MyStrategy(BaseStrategy):
    def generate_signals(self, df, context):  # Added context
        # Access additional data via context
        account_balance = context.get('balance')
        return {'signal': SignalType.LONG, 'confidence': 0.8}

config = Config(name="My Strategy")  # New name
```

**For legacy strategies:**
```bash
# Stay on v1.x until ready to migrate
pip install git+https://github.com/punksapien/xcoinalgo.git@v1.9.9#subdirectory=python-sdk
```

---

## Rollback Strategy

**If new version has critical bug:**

```bash
# Developers can instantly rollback
pip install git+https://github.com/punksapien/xcoinalgo.git@v1.0.0#subdirectory=python-sdk

# Or you can delete the bad tag
git tag -d v1.1.0  # Delete locally
git push origin :refs/tags/v1.1.0  # Delete from GitHub

# Then release fixed version as v1.1.1
```

---

## Comparison: Git vs PyPI

| Feature | PyPI | Git (Your Approach) |
|---------|------|---------------------|
| Install specific version | `pip install pkg==1.0.0` | `pip install git+...@v1.0.0#...` |
| Install latest | `pip install pkg` | `pip install git+...#...` |
| Version locking | ✅ requirements.txt | ✅ requirements.txt |
| Multiple versions in venvs | ✅ | ✅ |
| Rollback to old version | ✅ | ✅ |
| Private distribution | ❌ (needs paid PyPI) | ✅ (private repo) |
| Setup complexity | High (account, tokens) | Low (just Git) |
| Update speed | Slow (manual publish) | Fast (just push) |

**Verdict:** Git approach gives you **all the benefits** with **less complexity**!

---

## Best Practices

### 1. Never Delete Tags
Once released, keep tags forever (even if buggy). Release patches instead.

### 2. Semantic Versioning
Follow SemVer strictly so developers know what to expect.

### 3. Changelog
Always update CHANGELOG.md with every release.

### 4. Breaking Changes
Bump major version and provide migration guide.

### 5. Test Before Tagging
Tag only after thorough testing.

### 6. Communicate
Announce releases with changelog highlights.

---

## Example: Complete Version History

```bash
# Your SDK version timeline
v1.0.0 - Initial release (Oct 5, 2025)
v1.0.1 - Bug fix: RSI calculation
v1.0.2 - Bug fix: Memory leak in backtesting
v1.1.0 - Feature: VWAP indicator
v1.1.1 - Bug fix: VWAP edge case
v1.2.0 - Feature: Multi-timeframe support
v2.0.0 - Breaking: New signal format
v2.0.1 - Bug fix: Signal conversion
v2.1.0 - Feature: ML integration helpers
```

**Developers can install ANY of these:**
```bash
pip install git+https://github.com/punksapien/xcoinalgo.git@v1.0.0#subdirectory=python-sdk
pip install git+https://github.com/punksapien/xcoinalgo.git@v1.2.0#subdirectory=python-sdk
pip install git+https://github.com/punksapien/xcoinalgo.git@v2.1.0#subdirectory=python-sdk
```

---

## Summary

✅ **Git versioning = PyPI versioning** (same functionality)
✅ **Lock strategies to specific SDK versions** (requirements.txt)
✅ **Virtual envs with different versions** (full isolation)
✅ **Semantic versioning** (MAJOR.MINOR.PATCH)
✅ **Easy rollback** (install old tag anytime)
✅ **No PyPI setup needed** (instant updates via Git)

**Your developers get all PyPI benefits with simpler setup!**

---

## Quick Reference

```bash
# Install latest
pip install git+https://github.com/punksapien/xcoinalgo.git#subdirectory=python-sdk

# Install v1.0.0
pip install git+https://github.com/punksapien/xcoinalgo.git@v1.0.0#subdirectory=python-sdk

# Update to latest
pip install --upgrade git+https://github.com/punksapien/xcoinalgo.git#subdirectory=python-sdk

# Check version
python -c "import crypto_strategy_sdk; print(crypto_strategy_sdk.__version__)"

# Lock in requirements.txt
git+https://github.com/punksapien/xcoinalgo.git@v1.0.0#subdirectory=python-sdk
```
