# Bulk Subscribe Script

Generalized script to bulk subscribe multiple users to a strategy with individual per-user settings.

## Usage

```bash
npx ts-node scripts/bulk-subscribe-from-csv.ts <csv-file-path> <strategy-id>
```

## CSV Format

The CSV file must have the following header and columns:

```csv
email,capital,risk_per_trade,leverage,api,secret
user1@example.com,10000,0.15,10,api_key_1,api_secret_1
user2@example.com,25000,0.20,15,api_key_2,api_secret_2
```

### Columns:
- **email**: User's email address (must exist in database)
- **capital**: Capital amount to allocate for the strategy
- **risk_per_trade**: Risk per trade as decimal (e.g., 0.15 = 15%)
- **leverage**: Leverage multiplier (e.g., 10 = 10x)
- **api**: CoinDCX API key
- **secret**: CoinDCX API secret

## Example

```bash
# Subscribe users from CSV to a specific strategy
npx ts-node scripts/bulk-subscribe-from-csv.ts users-batch-1.csv cmj7cm5rd0004p99liyiota9i
```

## What it does:

1. **Validates** all users exist in the database
2. **Updates/creates** broker credentials for each user
3. **Validates** API keys with CoinDCX
4. **Checks** wallet balances
5. **Creates subscriptions** with individual settings per user
6. **Reports** success/failure for each user

## Output

The script provides:
- Real-time progress for each user
- Summary statistics (success/failed/already subscribed)
- Detailed JSON results

## Notes

- Users must already exist in the database (use bulk user creation endpoint first if needed)
- Script validates credentials before creating subscriptions
- Skips users who are already subscribed to the strategy
- Checks wallet balance before subscription
- Safe to re-run (idempotent - won't duplicate subscriptions)
