# CoinDCX Multi-User Strategy P&L Report

Generate consolidated trade reports for all active subscribers of your CoinDCX trading strategy.

## 📋 Overview

This script automatically:
- Fetches trade data from all 20 active subscribers
- Decrypts API credentials securely
- Matches entry/exit orders to calculate P&L
- Generates consolidated reports across all users
- Exports detailed CSV reports

## 🚀 Quick Start - Google Colab

### Step 1: Install Dependencies

```bash
!pip install pandas requests
```

### Step 2: Upload the Script

1. Click the folder icon 📁 in the left sidebar
2. Click "Upload to session storage"
3. Select `coindcx_pnl_report.py`

### Step 3: Run the Script

```python
!python coindcx_pnl_report.py
```

### Step 4: Download Reports

After the script completes, you'll find these CSV files:
- `consolidated_trades_B-ETH_USDT_<timestamp>.csv` - All trades from all users
- `user_summaries_B-ETH_USDT_<timestamp>.csv` - Per-user performance summary
- `overall_metrics_B-ETH_USDT_<timestamp>.csv` - Overall strategy metrics
- `daily_pnl_B-ETH_USDT_<timestamp>.csv` - Daily P&L breakdown

Click the download button next to each file to save them locally.

## 🖥️ Local Usage

### Prerequisites

```bash
pip install pandas requests
```

### Run

```bash
python coindcx_pnl_report.py
```

## 📊 Output Explanation

### Consolidated Trades CSV
Contains all matched trades from all users with columns:
- User ID (anonymized)
- Entry/Exit times and prices
- Position type (LONG/SHORT)
- Quantity
- Gross P&L
- Commission
- Net P&L
- P&L %
- Order IDs

### User Summaries CSV
Per-user performance with:
- Total trades
- Winning/Losing trades
- Win rate
- Net P&L
- Profit factor
- Max drawdown

### Overall Metrics CSV
Strategy-wide performance:
- Total trades across all users
- Overall win rate
- Aggregate P&L
- Average win/loss
- Largest win/loss
- Total commission paid

### Daily P&L CSV
Day-by-day breakdown:
- Date
- Daily P&L
- Number of trades
- Cumulative P&L

## 🔧 Configuration

Edit these variables in the script if needed:

```python
PAIR = "B-ETH_USDT"           # Trading pair
DAYS_BACK = 30                # Days of history to fetch
COMMISSION_RATE = 0.0005      # 0.05%
GST_RATE = 0.18               # 18%
```

## 🔒 Security Notes

- API credentials are stored directly in the script (from database)
- User IDs are truncated in reports for privacy
- **NEVER share this script or generated CSV files publicly** (they contain sensitive API credentials and user data)
- Keep the script file secure and delete after use if running in shared environments

## 📝 Strategy Information

- **Strategy ID**: `cmh7lyx0y0000p91hb96tpbl6`
- **Strategy Name**: ETH_USDT Strategy
- **Trading Pair**: B-ETH_USDT (Bitcoin-denominated ETH/USDT futures)
- **Active Subscribers**: 20
- **Total Capital Allocated**: $235,000 across all users

## 🐛 Troubleshooting

### "No trades found"
- Check if the strategy has executed any trades in the last 30 days
- Verify the `client_order_id` prefix is `xc_` or `xcoin_`

### Invalid API credentials
- Verify the API keys/secrets from the database are correct
- Check that subscriber data was copied correctly from the database query

### API Rate Limits
- The script automatically adds 0.2s delays between API calls
- If you hit rate limits, increase the `time.sleep()` value in `fetch_all_trades()`

## 📞 Support

For issues or questions:
1. Check that subscriber data is up-to-date
2. Verify API credentials are valid
3. Contact your platform administrator

## 📜 License

This script is part of the XcoinAlgo trading platform backend.
