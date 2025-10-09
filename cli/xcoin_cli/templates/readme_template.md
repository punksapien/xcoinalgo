# {{strategy_name}}

{{description}}

**Author:** {{author_name}} <{{author_email}}>
**Created:** {{creation_date}}
**Version:** 1.0.0
**Type:** {{strategy_type}}

---

## 📝 Description

{{detailed_description}}

## 🎯 Strategy Logic

TODO: Describe your strategy logic here:
- Entry conditions
- Exit conditions
- Risk management rules
- Market regime detection (if applicable)

## 📊 Technical Indicators

TODO: List indicators used:
- SMA Fast ({{sma_fast_period}} periods)
- SMA Slow ({{sma_slow_period}} periods)
- Add more indicators as you implement them

## ⚙️ Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `lookback_period` | 100 | Number of historical candles to load |
| `sma_fast_period` | 10 | Fast SMA period |
| `sma_slow_period` | 30 | Slow SMA period |

## 🧪 Testing

### Run Local Validation
```bash
xcoin validate
```

### Run Backtest
```bash
xcoin test --backtest data/historical.csv
```

### Run Unit Tests
```bash
pytest tests/
```

## 🚀 Deployment

### Link to Platform
```bash
xcoin link-git --repo https://github.com/{{github_username}}/{{strategy_folder}}
```

### Deploy to Marketplace
```bash
xcoin deploy
```

## 📈 Performance

TODO: Add backtest results here once tested:
- Win Rate: X%
- Profit Factor: X.X
- Max Drawdown: X%
- Sharpe Ratio: X.X

## 🔧 Development

### Local Setup
```bash
# Install dependencies
pip install -r requirements.txt

# Run validation
xcoin validate

# Test locally
python -c "from strategy import generate_signal; print(generate_signal)"
```

### Project Structure
```
{{strategy_folder}}/
├── strategy.py          # Main strategy code
├── config.json          # Strategy metadata
├── requirements.txt     # Python dependencies
├── tests/
│   └── test_strategy.py # Unit tests
└── data/
    └── sample.csv       # Sample backtest data
```

## 📚 Resources

- [xcoinalgo Documentation](https://docs.xcoinalgo.com)
- [Strategy SDK Guide](https://docs.xcoinalgo.com/sdk)
- [CLI Reference](https://docs.xcoinalgo.com/cli)

## 📄 License

This strategy is proprietary and confidential.

---

Generated with `xcoin-cli` v{{xcoin_version}}
