# PyPI Publishing Guide for CoinDCX Strategy SDK

This guide walks you through publishing the CoinDCX Strategy SDK to PyPI so researchers can install it with `pip install coindcx-strategy-sdk`.

## Prerequisites

### 1. PyPI Account Setup
```bash
# Create accounts on both PyPI and Test PyPI
# PyPI (production): https://pypi.org/account/register/
# Test PyPI (testing): https://test.pypi.org/account/register/
```

### 2. API Token Setup
1. **PyPI**: Go to https://pypi.org/manage/account/token/
2. **Test PyPI**: Go to https://test.pypi.org/manage/account/token/
3. Create API tokens with scope "Entire account"
4. Store tokens securely (they're shown only once)

### 3. Configure ~/.pypirc
```ini
[distutils]
index-servers =
    pypi
    testpypi

[pypi]
repository = https://upload.pypi.org/legacy/
username = __token__
password = pypi-your-api-token-here

[testpypi]
repository = https://test.pypi.org/legacy/
username = __token__
password = pypi-your-test-api-token-here
```

## Local Development Setup

### 1. Install Build Tools
```bash
cd python-sdk
pip install --upgrade pip setuptools wheel build twine
```

### 2. Install Development Dependencies
```bash
make install-dev
# or
pip install -e ".[dev]"
```

### 3. Run Quality Checks
```bash
make check
# This runs: lint, type-check, and test
```

## Publishing Process

### Option 1: Manual Publishing (Recommended for first time)

#### Step 1: Test Everything Locally
```bash
# Clean previous builds
make clean

# Run all checks
make check

# Build the package
make build

# Check the built package
twine check dist/*
```

#### Step 2: Test on Test PyPI
```bash
# Upload to Test PyPI first
make publish-test
# or
twine upload --repository testpypi dist/*

# Test installation from Test PyPI
pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ coindcx-strategy-sdk

# Test the package works
python -c "from coindcx_sdk import BaseStrategy; print('✅ SDK installed successfully')"
```

#### Step 3: Publish to Production PyPI
```bash
# If Test PyPI worked, publish to production
make publish
# or
twine upload dist/*
```

#### Step 4: Verify Installation
```bash
# Test installation from production PyPI
pip install coindcx-strategy-sdk

# Verify it works
python -c "from coindcx_sdk import BaseStrategy, StrategyConfig; print('✅ Production install successful')"
```

### Option 2: GitHub Actions (Automated)

#### Setup GitHub Secrets
1. Go to your GitHub repository
2. Settings → Secrets and variables → Actions
3. Add these secrets:
   - `PYPI_API_TOKEN`: Your PyPI API token
   - `TEST_PYPI_API_TOKEN`: Your Test PyPI API token

#### Publish via GitHub Release
```bash
# Tag and create a release
git tag v1.0.0
git push origin v1.0.0

# Create a GitHub release at:
# https://github.com/your-org/coindcx-strategy-sdk/releases/new
# This will automatically trigger the publish workflow
```

#### Manual Trigger (for testing)
```bash
# Go to GitHub → Actions → "Publish to PyPI"
# Click "Run workflow"
# Choose "Publish to Test PyPI" for testing
```

## Version Management

### Updating Version
1. Update version in `pyproject.toml`:
```toml
[project]
version = "1.0.1"  # Increment version
```

2. Update version in `coindcx_sdk/__init__.py`:
```python
__version__ = "1.0.1"
```

3. Create a CHANGELOG entry:
```markdown
## [1.0.1] - 2024-01-XX
### Added
- New feature X

### Fixed
- Bug fix Y
```

### Version Strategy
- **Major (1.0.0 → 2.0.0)**: Breaking changes
- **Minor (1.0.0 → 1.1.0)**: New features, backward compatible
- **Patch (1.0.0 → 1.0.1)**: Bug fixes, backward compatible

## Package Structure Verification

Before publishing, ensure your package structure is correct:

```
python-sdk/
├── coindcx_sdk/           # Main package
│   ├── __init__.py        # Exports and version
│   ├── base_strategy.py   # Core strategy class
│   ├── indicators.py      # Technical indicators
│   ├── risk_management.py # Risk management
│   ├── backtesting.py     # Backtesting engine
│   ├── strategy_config.py # Configuration
│   ├── client.py          # API client
│   ├── utils.py           # Utilities
│   └── validation.py      # Validation logic
├── examples/              # Example strategies
├── tests/                 # Test files
├── pyproject.toml         # Modern Python packaging
├── setup.py               # Legacy setup (backup)
├── requirements.txt       # Dependencies
├── MANIFEST.in            # Package inclusion rules
├── LICENSE                # MIT license
├── README.md              # Documentation
└── .github/workflows/     # CI/CD
    └── publish.yml
```

## Testing Installation

### Test Different Installation Methods
```bash
# 1. Test local installation
pip install -e .

# 2. Test from built wheel
pip install dist/coindcx_strategy_sdk-1.0.0-py3-none-any.whl

# 3. Test from PyPI
pip install coindcx-strategy-sdk

# 4. Test with optional dependencies
pip install "coindcx-strategy-sdk[all]"
```

### Test Package Functionality
```python
# test_installation.py
import sys
import importlib

def test_package():
    try:
        # Test basic imports
        from coindcx_sdk import BaseStrategy, StrategyConfig
        from coindcx_sdk import TechnicalIndicators, RiskManager
        from coindcx_sdk import BacktestEngine, CoinDCXClient

        print("✅ All imports successful")

        # Test version
        import coindcx_sdk
        print(f"✅ Version: {coindcx_sdk.__version__}")

        # Test basic functionality
        config = StrategyConfig(
            name="Test",
            code="TEST",
            author="Test",
            pair="B-BTC_USDT"
        )
        print("✅ Configuration creation successful")

        return True

    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    success = test_package()
    sys.exit(0 if success else 1)
```

## Common Issues and Solutions

### Issue: "Package already exists"
**Solution**: Increment version number in `pyproject.toml`

### Issue: "Invalid credentials"
**Solution**: Check your API token in `~/.pypirc`

### Issue: "File already exists"
**Solution**: Clean build directory with `make clean`

### Issue: Import errors after installation
**Solution**: Check `__init__.py` exports and dependencies

### Issue: Missing files in package
**Solution**: Update `MANIFEST.in` to include necessary files

## Package Maintenance

### Regular Tasks
1. **Monitor downloads**: Check PyPI stats
2. **Update dependencies**: Keep requirements current
3. **Security updates**: Monitor for vulnerabilities
4. **Documentation**: Keep README and examples updated

### Setting up Monitoring
```bash
# Check package stats
pip install pypistats
pypistats recent coindcx-strategy-sdk

# Monitor security
pip install safety
safety check
```

## Final Checklist

Before each release:

- [ ] All tests pass (`make test`)
- [ ] Linting passes (`make lint`)
- [ ] Type checking passes (`make type-check`)
- [ ] Version incremented in both places
- [ ] CHANGELOG updated
- [ ] README reflects current version
- [ ] Examples work with new version
- [ ] Test installation from Test PyPI
- [ ] GitHub release created
- [ ] PyPI package verified

## Usage After Publishing

Once published, researchers can use:

```bash
# Install the SDK
pip install coindcx-strategy-sdk

# Use in their code
from coindcx_sdk import BaseStrategy

class MyStrategy(BaseStrategy):
    def generate_signals(self, df):
        return {'signal': 'LONG', 'confidence': 0.8}
```

This achieves the goal of separating the SDK from the main platform while making it easily accessible to researchers worldwide.