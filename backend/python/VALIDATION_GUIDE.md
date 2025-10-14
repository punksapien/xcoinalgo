# Strategy Signature Validation Guide

## For Quant Team: Adding Extra Arguments to Methods

### ✅ ALLOWED - You CAN do this:

#### 1. Add optional parameters with defaults
```python
# BEFORE
def __init__(self, settings):
    pass

# AFTER - Adding extra params with defaults ✅
def __init__(self, settings, debug_mode=False, log_level='INFO'):
    pass
```

#### 2. Add *args and **kwargs
```python
# BEFORE
def __init__(self, settings):
    pass

# AFTER - Adding flexibility ✅
def __init__(self, settings, *args, **kwargs):
    pass
```

#### 3. Add more parameters after required ones
```python
# BEFORE
def generate_signals(self, df, params):
    pass

# AFTER - Adding extra context ✅
def generate_signals(self, df, params, indicators=None, timeframe='5m', backtest_mode=False):
    pass
```

#### 4. Combine everything
```python
# BEFORE
def check_for_new_signal(self, df):
    pass

# AFTER - Maximum flexibility ✅
def check_for_new_signal(self, df, risk_multiplier=1.0, confirmation_candles=2, *args, **kwargs):
    pass
```

---

### ❌ NOT ALLOWED - You CANNOT do this:

#### 1. Remove required parameters
```python
# BEFORE
def __init__(self, settings):
    pass

# AFTER - Missing required param ❌
def __init__(self):  # ERROR: Missing 'settings'
    pass
```

#### 2. Rename required parameters
```python
# BEFORE
def __init__(self, settings):
    pass

# AFTER - Wrong param name ❌
def __init__(self, config):  # ERROR: Should be 'settings' not 'config'
    pass
```

#### 3. Reorder required parameters
```python
# BEFORE
def generate_signals(self, df, params):
    pass

# AFTER - Wrong order ❌
def generate_signals(self, params, df):  # ERROR: 'df' must come before 'params'
    pass
```

#### 4. Change parameter before adding new ones
```python
# BEFORE
def __init__(self, settings):
    pass

# AFTER - Extra param comes before required ❌
def __init__(self, debug_mode, settings):  # ERROR: 'settings' must be first (after self)
    pass
```

---

## Rules Summary

### ✅ YOU CAN:
- Add MORE parameters after the required ones
- Add optional parameters with default values
- Add `*args` and `**kwargs` for flexibility
- Increase parameter count as much as needed

### ❌ YOU CANNOT:
- Remove required parameters
- Have FEWER parameters than required
- Rename required parameters
- Reorder required parameters
- Add new parameters BEFORE required ones

---

## Real-World Examples

### Example 1: Enhanced LiveTrader
```python
# Original required signature:
# def __init__(self, settings):

# Your improved version - ✅ VALID
class LiveTrader:
    def __init__(self, settings, max_positions=3, risk_multiplier=1.0, use_trailing_sl=False):
        self.settings = settings
        self.max_positions = max_positions
        self.risk_multiplier = risk_multiplier
        self.use_trailing_sl = use_trailing_sl
```

### Example 2: Enhanced Backtester
```python
# Original required signature:
# def fetch_coindcx_data(pair, start_date, end_date, resolution):

# Your improved version - ✅ VALID
@staticmethod
def fetch_coindcx_data(pair, start_date, end_date, resolution,
                       retry_count=3, timeout=30, use_cache=True):
    # Your enhanced implementation
    pass
```

### Example 3: Enhanced signal generation
```python
# Original required signature:
# def generate_signals(self, df, params):

# Your improved version - ✅ VALID
def generate_signals(self, df, params,
                    min_confidence=0.7,
                    lookback_periods=20,
                    use_ml_filter=False,
                    **extra_filters):
    # Your enhanced implementation
    pass
```

---

## Quick Test

Want to test if your signature will pass validation?

**ASK YOURSELF:**
1. Does my method have ALL the original required parameters? → YES ✅
2. Are they in the SAME ORDER as before? → YES ✅
3. Do they have the SAME NAMES as before? → YES ✅
4. Are my extra parameters AFTER the required ones? → YES ✅

If all answers are YES, your code will validate! 🎉

---

## Need Help?

If you're unsure about a signature change, test it:
```bash
cd backend/python
python3 test_signature_validation.py
```

Or contact the backend team - we're here to help! 🚀
