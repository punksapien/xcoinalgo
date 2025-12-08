# Data Collection Scripts

This folder contains scripts for collecting market data from CoinDCX for backtesting and analysis.

## Tick Collector

`tick_collector.py` - Collects tick-by-tick trade data and price snapshots from CoinDCX Futures API.

### Features
- **Trade History**: Collects individual trades with price, quantity, timestamp, maker/taker flag
- **Price Snapshots**: Periodic market state including last price, mark price, funding rate, volume
- **SQLite Storage**: Lightweight, single-file database for easy querying
- **Deduplication**: Automatically prevents duplicate trade entries
- **Robust**: Auto-retry on failures, graceful error handling
- **Long-running**: Designed to run for weeks/months via PM2

### Data Schema

**trades table:**
| Column | Type | Description |
|--------|------|-------------|
| pair | TEXT | Trading pair (e.g., B-UNI_USDT) |
| price | REAL | Trade price |
| quantity | REAL | Trade quantity |
| symbol | TEXT | Symbol (e.g., UNIUSDT) |
| trade_timestamp | INTEGER | Trade time (ms) from API |
| is_maker | INTEGER | 1=maker, 0=taker |
| collected_at | INTEGER | When we collected it (ms) |

**price_snapshots table:**
| Column | Type | Description |
|--------|------|-------------|
| pair | TEXT | Trading pair |
| last_price | REAL | Last traded price |
| mark_price | REAL | Mark price |
| high_24h | REAL | 24h high |
| low_24h | REAL | 24h low |
| volume | REAL | 24h volume |
| funding_rate | REAL | Current funding rate |
| estimated_funding_rate | REAL | Next funding rate estimate |
| price_change_pct | REAL | 24h price change % |

### Usage

```bash
# Basic usage (UNI by default)
python3 tick_collector.py

# Specify pair and database
python3 tick_collector.py --pair B-UNI_USDT --db /home/ubuntu/tick_data/uni_ticks.db

# Custom intervals
python3 tick_collector.py --pair B-SOL_USDT --trade-interval 0.5 --snapshot-interval 2

# All options
python3 tick_collector.py --help
```

### PM2 Deployment

```bash
# Start with PM2
pm2 start tick_collector.py --name tick-uni --interpreter python3 -- --pair B-UNI_USDT --db /home/ubuntu/tick_data/uni_ticks.db

# Or use ecosystem config
pm2 start ecosystem.tick_collector.config.js

# Monitor
pm2 logs tick-uni
pm2 monit
```

### Querying Data

```sql
-- Recent trades
SELECT * FROM trades WHERE pair = 'B-UNI_USDT' ORDER BY trade_timestamp DESC LIMIT 100;

-- Price range over time
SELECT
    date(trade_timestamp/1000, 'unixepoch') as date,
    MIN(price) as low,
    MAX(price) as high,
    COUNT(*) as trade_count
FROM trades
GROUP BY date
ORDER BY date;

-- Volume by hour
SELECT
    strftime('%Y-%m-%d %H:00', trade_timestamp/1000, 'unixepoch') as hour,
    SUM(quantity) as volume,
    COUNT(*) as trades
FROM trades
GROUP BY hour
ORDER BY hour DESC;
```

### API Endpoints Used

- `GET https://public.coindcx.com/market_data/trade_history?pair={pair}&limit=100`
- `GET https://public.coindcx.com/market_data/v3/current_prices/futures/rt`

Both are **public endpoints** - no authentication required.
