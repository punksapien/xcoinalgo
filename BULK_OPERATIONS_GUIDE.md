# Bulk Operations Guide

Complete guide for bulk user creation and strategy deployment on the xcoinalgo platform.

---

## 📋 Table of Contents

1. [Bulk User Creation](#bulk-user-creation)
2. [Bulk Strategy Deployment](#bulk-strategy-deployment)
3. [Common Issues & Troubleshooting](#common-issues--troubleshooting)

---

## 1. Bulk User Creation

### Overview
Creates multiple user accounts with validated CoinDCX API credentials.

### Script Location
```bash
/home/ubuntu/xcoinalgo/backend/scripts/bulk_user_creator.py
```

### Prerequisites
- CSV file with user data (Email, Name, API KEY, SECRET KEY)
- Admin credentials
- Backend running on http://localhost:3001

### CSV Format
```csv
Email ID,Name,API KEY,SECRET KEY,WhatsApp No
user@example.com,John Doe,abc123...,xyz789...,+91-1234567890
```

### Usage

**From CSV file:**
```bash
python3 bulk_user_creator.py users.csv
```

**From hardcoded array (edit script first):**
```bash
python3 bulk_user_creator.py
```

### Process Flow

1. **Load Users** from CSV or hardcoded array
2. **Validate Credentials** - ALL credentials validated with CoinDCX API FIRST
3. **Filter Results:**
   - ✅ Valid credentials → Create user
   - ❌ Invalid credentials → Skip (report only)
   - ⚠️ Duplicate emails → Skip (report only)
4. **Create Users** - Only users with validated credentials
5. **Generate Report** - JSON file with detailed results

### Configuration
```python
BACKEND_URL = "http://184.72.102.221:3001"
DEFAULT_PASSWORD = "Crypto@1234"
ADMIN_EMAIL = "your_admin@example.com"
ADMIN_PASSWORD = "your_admin_password"
```

### Output
```
✅ Users created: 79
❌ Invalid credentials: 23
⚠️  Duplicate emails: 5

Report saved to: bulk_import_report_20251120_133830.json
```

### Important Notes
- ⚠️ **Duplicate Check**: If same email exists with different API keys, validation may mark as invalid
- 🔐 **Default Password**: All created users get `Crypto@1234` as password
- 📊 **Validation First**: No user is created without valid CoinDCX credentials
- 📝 **Report**: Always check the JSON report for detailed results

---

## 2. Bulk Strategy Deployment

### Overview
Subscribes multiple users to a specific strategy with systematic wallet validation.

### Script Location
```bash
/home/ubuntu/bulk_strategy_deployer.py
```

### Prerequisites
- Users must already exist in the platform
- Users must have active broker credentials
- Users must have sufficient funds in CoinDCX futures wallet

### Usage

**Test Mode (Single User):**
```bash
python3 bulk_strategy_deployer.py --test-user user@example.com
```

**Bulk Mode (First 3 users from CSV):**
```bash
python3 bulk_strategy_deployer.py
```

### Process Flow (Per User)

1. **Load User** from database (with API credentials)
2. **Check Wallet Balance** - Query CoinDCX futures wallet directly
   - Must have ≥ ₹10,000 available
   - Available = balance - (cross_order_margin + cross_user_margin)
   - Counts INR + USDT
3. **Login** to platform with user credentials
4. **Check Broker Credentials** - Verify active credentials exist
5. **Check Existing Subscription** - Skip if already subscribed
6. **Subscribe** to strategy with parameters:
   - Capital: ₹10,000
   - Risk Per Trade: 10%
   - Leverage: 10x
   - Max Positions: 1
   - Max Daily Loss: 5%

### Configuration
```python
BACKEND_URL = "http://localhost:3001"  # Use localhost when running on server
STRATEGY_ID = "cmi7ns17e007gp9mp2cj708eu"
DEFAULT_PASSWORD = "Crypto@1234"
REQUIRED_CAPITAL = 10000
RISK_PER_TRADE = 0.1  # 10%
LEVERAGE = 10
```

### Deployment Checklist

Before deploying to real users:
- [ ] Test with 1 user first using `--test-user`
- [ ] Verify wallet balance check works
- [ ] Verify subscription appears in database
- [ ] Verify no duplicate subscriptions
- [ ] Check strategy is active and valid

### Output Example
```
🚀 Starting Bulk Strategy Deployer...
   Strategy ID: cmi7ns17e007gp9mp2cj708eu
   Capital: 10000, Risk: 10.0%, Leverage: 10x

[1/3] Processing User Name (user@example.com)...
   💰 Checking wallet balance...
   💵 Available Futures Balance: 13822.12
   🔐 Logging in...
   🔑 Checking broker credentials...
   ✅ Found existing credentials: abc123...
   🔍 Checking existing subscriptions...
   📝 Subscribing to strategy...
   ✅ Successfully subscribed!
   🎉 Deployment 1/3 complete for user@example.com
```

### Safety Features

1. **Wallet Validation**: Won't deploy if insufficient funds
2. **Duplicate Check**: Won't subscribe if already subscribed
3. **Test Mode**: Single user testing before bulk
4. **Database Query**: Pulls credentials directly from DB (no CSV needed)

---

## 3. Common Issues & Troubleshooting

### Issue: "Invalid credentials" during bulk user creation

**Cause**: Duplicate email entries with different API keys in database

**Solution**:
```sql
-- Find duplicates
SELECT email, COUNT(*)
FROM users
GROUP BY email
HAVING COUNT(*) > 1;

-- Delete duplicates (keep latest)
DELETE FROM users
WHERE id NOT IN (
  SELECT MAX(id) FROM users GROUP BY email
);
```

### Issue: "Connection timeout" during deployment

**Cause**: Wrong BACKEND_URL (using public IP from inside server)

**Solution**: Use `http://localhost:3001` when running on server

### Issue: User subscribed but no trades executing

**Cause**:
1. Strategy not active
2. Invalid broker credentials
3. Insufficient wallet balance

**Solution**:
```sql
-- Check subscription status
SELECT ss.*, s.name, s."isActive"
FROM strategy_subscriptions ss
JOIN strategies s ON ss."strategyId" = s.id
WHERE ss."userId" = 'user_id';

-- Check broker credentials
SELECT * FROM broker_credentials
WHERE "userId" = 'user_id' AND "isActive" = true;
```

### Issue: Validation marking valid credentials as invalid

**Cause**: Temporary CoinDCX API issues or rate limiting

**Solution**:
- Add retry logic to validation
- Increase timeout values
- Test credentials manually before bulk import

---

## 4. Best Practices

### Before Bulk User Creation
1. Validate CSV format
2. Test with 2-3 users first
3. Check for duplicate emails manually
4. Verify admin credentials work

### Before Bulk Deployment
1. **ALWAYS** test with 1 user first using `--test-user`
2. Verify strategy ID is correct
3. Check strategy is active and accepting subscribers
4. Confirm deployment parameters (capital, risk, leverage)
5. **Never** deploy without explicit approval for each user batch

### After Operations
1. Review generated reports
2. Verify database entries
3. Test login for created users
4. Monitor first few trades for deployed strategies
5. Keep reports for audit trail

---

## 5. Database Queries Reference

### Check user creation
```sql
SELECT email, "createdAt", role
FROM users
WHERE "createdAt" > NOW() - INTERVAL '1 hour'
ORDER BY "createdAt" DESC;
```

### Check subscriptions
```sql
SELECT u.email, ss.capital, ss."isActive", ss."createdAt"
FROM strategy_subscriptions ss
JOIN users u ON ss."userId" = u.id
WHERE ss."strategyId" = 'strategy_id'
ORDER BY ss."createdAt" DESC;
```

### Check broker credentials validity
```sql
SELECT u.email, bc."isActive", bc."createdAt"
FROM broker_credentials bc
JOIN users u ON bc."userId" = u.id
WHERE bc."isActive" = true;
```

### Find users with insufficient funds
```sql
-- Manual check required via CoinDCX API
-- No wallet balances stored in our DB
```

---

## 6. API Endpoints Reference

### User Creation
- `POST /api/admin/users/validate-bulk` - Validate credentials
- `POST /api/admin/users/bulk-create` - Create users

### Strategy Subscription
- `POST /api/user/login` - User login
- `GET /api/broker/credentials` - Get broker credentials
- `POST /api/broker/keys` - Add broker credentials
- `GET /api/strategies/{id}` - Check existing subscription
- `POST /api/strategies/{id}/subscribe` - Subscribe to strategy

### CoinDCX API
- `POST /exchange/v1/users/balances` - Get account balances
- `GET /exchange/v1/derivatives/futures/wallets` - Get futures wallet

---

## 7. Emergency Procedures

### Rollback User Creation
```bash
# Get user IDs from report
cat bulk_import_report_*.json | jq '.created_users[].userId'

# Delete users (BE CAREFUL!)
sudo -u postgres psql -d xcoinalgo -c "DELETE FROM users WHERE id IN ('id1', 'id2');"
```

### Cancel Subscriptions
```sql
-- Deactivate subscription
UPDATE strategy_subscriptions
SET "isActive" = false
WHERE id = 'subscription_id';

-- Or delete completely
DELETE FROM strategy_subscriptions
WHERE id = 'subscription_id';
```

### Verify No Trades Executed
```sql
SELECT COUNT(*)
FROM trades
WHERE "subscriptionId" = 'subscription_id';
```

---

## 8. Contact & Support

For issues or questions:
- Check logs: `pm2 logs xcoinalgo-backend`
- Database access: `sudo -u postgres psql -d xcoinalgo`
- Backend logs: `/home/ubuntu/xcoinalgo/backend/logs/`

---

**Last Updated**: 2025-11-20
**Version**: 1.0
**Maintainer**: xcoinalgo team
