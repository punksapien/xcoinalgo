# How to Square Off All Positions for a Strategy

## Overview
This guide documents the process of closing (squaring off) all active positions for subscribers of specific strategies.

**Use Case:** When you need to immediately close all open positions for users subscribed to one or more strategies (e.g., stopping a faulty strategy, emergency risk management, etc.)

---

## Key Concepts

### 1. Position vs Subscription
- **Subscription** = User is enrolled in a strategy (bot is running for them)
- **Active Position** = User currently has money at risk (open trade)
- Not all subscriptions have active positions at any given time

### 2. How CoinDCX Stores Positions
The CoinDCX API returns ALL position "slots" for an account, including:
- Active positions (`active_pos != 0`)
- Closed positions (`active_pos == 0`) - empty slots

**Critical Field:** `active_pos`
```python
active_pos > 0  # LONG position
active_pos < 0  # SHORT position
active_pos == 0 # No position (closed/empty slot)
```

### 3. Position Structure
```json
{
  "id": "position-id-here",
  "pair": "B-ETH_USDT",
  "active_pos": -0.038,  // ← KEY FIELD (negative = SHORT)
  "avg_price": 2815.39,
  "margin_currency_short_name": "INR"
}
```

---

## Step-by-Step Process

### Step 1: Identify Strategy IDs
```bash
# Get strategy names and IDs from database
ssh user@server "sudo -u postgres psql -d xcoinalgo -c \"
SELECT id, name
FROM strategies
WHERE id IN ('strategy-id-1', 'strategy-id-2');
\""
```

### Step 2: Get All Subscribers
```bash
# Get unique users subscribed to these strategies
ssh user@server "sudo -u postgres psql -d xcoinalgo -t -A -F '|' -c \"
SELECT DISTINCT
  bc.id as credential_id,
  u.email,
  bc.\\\"apiKey\\\",
  bc.\\\"apiSecret\\\"
FROM strategy_subscriptions ss
JOIN users u ON ss.\\\"userId\\\" = u.id
JOIN broker_credentials bc ON ss.\\\"brokerCredentialId\\\" = bc.id
WHERE ss.\\\"strategyId\\\" IN ('strategy-id-1', 'strategy-id-2', 'strategy-id-3')
AND ss.\\\"isActive\\\" = true;
\" > /tmp/credentials.txt"
```

### Step 3: Check Active Positions (DRY RUN)
```python
import hmac, hashlib, json, time, requests

class CoinDCXClient:
    def __init__(self, key, secret):
        self.api_key = key
        self.api_secret = secret.encode('utf-8')
        self.base_url = "https://api.coindcx.com"

    def _sign(self, data):
        return hmac.new(self.api_secret, data.encode(), hashlib.sha256).hexdigest()

    def _make_request(self, method, endpoint, payload=None):
        url = self.base_url + endpoint
        if payload is None:
            payload = {}
        payload['timestamp'] = int(time.time() * 1000)
        json_body = json.dumps(payload, separators=(',', ':'))
        signature = self._sign(json_body)
        headers = {
            'Content-Type': 'application/json',
            'X-AUTH-APIKEY': self.api_key,
            'X-AUTH-SIGNATURE': signature
        }
        response = requests.request(method.upper(), url, data=json_body, headers=headers, timeout=30)
        response.raise_for_status()
        return response.json()

    def list_positions(self, margin_currency_short_name=["USDT"]):
        payload = {"page": 1, "size": 100, "margin_currency_short_name": margin_currency_short_name}
        return self._make_request('POST', '/exchange/v1/derivatives/futures/positions', payload)

# Load credentials
with open('/tmp/credentials.txt', 'r') as f:
    lines = f.readlines()

print("DRY RUN - Checking active positions (NOT closing)\n")
print(f"Processing {len(lines)} users...\n")

total_active = 0
active_positions = []

for line in lines:
    parts = line.strip().split('|')
    if len(parts) < 4:
        continue
    cred_id, email, api_key, api_secret = parts[0], parts[1], parts[2], parts[3]

    try:
        client = CoinDCXClient(api_key, api_secret)

        # Check both USDT and INR margin accounts
        for margin in [["USDT"], ["INR"]]:
            try:
                positions = client.list_positions(margin_currency_short_name=margin)
                for pos in positions:
                    active_pos = float(pos.get('active_pos', 0))
                    if active_pos != 0:  # ← KEY CHECK
                        pair = pos.get('pair')
                        pos_id = pos.get('id')
                        margin_curr = pos.get('margin_currency_short_name')
                        side = 'LONG' if active_pos > 0 else 'SHORT'

                        print(f"{email}: {pair} {side} qty={abs(active_pos)} ({margin_curr})")
                        print(f"   Position ID: {pos_id}")

                        active_positions.append({
                            'email': email,
                            'pair': pair,
                            'qty': active_pos,
                            'pos_id': pos_id,
                            'api_key': api_key,
                            'api_secret': api_secret
                        })
                        total_active += 1
            except:
                pass

    except Exception as e:
        print(f"{email}: ERROR - {str(e)[:50]}")

print(f"\n{'='*60}")
print(f"ACTIVE POSITIONS TO CLOSE: {total_active}")
print(f"{'='*60}")

# Save for execution
with open('/tmp/active_positions.json', 'w') as f:
    json.dump(active_positions, f, indent=2)
```

### Step 4: Execute Position Closure
```python
import hmac, hashlib, json, time, requests

class CoinDCXClient:
    def __init__(self, key, secret):
        self.api_key = key
        self.api_secret = secret.encode('utf-8')
        self.base_url = "https://api.coindcx.com"

    def _sign(self, data):
        return hmac.new(self.api_secret, data.encode(), hashlib.sha256).hexdigest()

    def _make_request(self, method, endpoint, payload=None):
        url = self.base_url + endpoint
        if payload is None:
            payload = {}
        payload['timestamp'] = int(time.time() * 1000)
        json_body = json.dumps(payload, separators=(',', ':'))
        signature = self._sign(json_body)
        headers = {
            'Content-Type': 'application/json',
            'X-AUTH-APIKEY': self.api_key,
            'X-AUTH-SIGNATURE': signature
        }
        response = requests.request(method.upper(), url, data=json_body, headers=headers, timeout=30)
        response.raise_for_status()
        return response.json()

    def exit_position(self, position_id):
        """Close position immediately at market price"""
        return self._make_request('POST', '/exchange/v1/derivatives/futures/positions/exit', {"id": position_id})

# Load saved positions
with open('/tmp/active_positions.json', 'r') as f:
    positions = json.load(f)

print(f"Closing {len(positions)} positions...\n")
print("="*60)

closed = 0
errors = []

for pos in positions:
    email = pos['email']
    pair = pos['pair']
    qty = pos['qty']
    pos_id = pos['pos_id']
    api_key = pos['api_key']
    api_secret = pos['api_secret']

    print(f"Closing {email}: {pair} qty={abs(qty)}")

    try:
        client = CoinDCXClient(api_key, api_secret)
        result = client.exit_position(pos_id)
        print(f"  ✅ SUCCESS - {result}")
        closed += 1
    except Exception as e:
        err = str(e)[:100]
        print(f"  ❌ FAILED - {err}")
        errors.append(f"{email}: {err}")

    time.sleep(0.5)  # Rate limiting

print("\n" + "="*60)
print(f"SUMMARY: {closed}/{len(positions)} positions closed")
if errors:
    print(f"\nERRORS ({len(errors)}):")
    for e in errors:
        print(f"  - {e}")
print("="*60)
```

---

## Real Example from Nov 21, 2025

### Strategies Closed:
```
cmh7lyx0y0000p91hb96tpbl6 - ETH_Scalper_Manish (29 subscribers)
cmhtf2ysy000wp9dn5f7fielm - BTC_Scalper_Manish (4 subscribers)
cmhtf0b71000qp9dnxqf9dih6 - SOL_Scalper_Manish (8 subscribers)
```

### Results:
- **Total subscriptions:** 41
- **Unique users:** 33 (after deduplication)
- **Active positions found:** 21
- **Successfully closed:** 21/21 (100%)
- **Total exposure closed:** ~4.5 ETH

### Position Breakdown:
```
Most positions: 0.038 ETH SHORT @ ~2815 INR
Largest: 1.762 ETH LONG @ 4380 USDT (arungusainwal@gmail.com)
```

---

## Important Notes

### ⚠️ Before Running
1. **Confirm with client** - This immediately closes ALL positions at market price
2. **Run DRY RUN first** - Always check what positions exist before closing
3. **Save output** - Keep logs of what was closed and why
4. **Check for errors** - Some positions may fail to close (insufficient balance, API errors, etc.)

### 🔑 Key API Endpoint
```
POST /exchange/v1/derivatives/futures/positions/exit
Payload: {"id": "position-id"}
Response: {"message": "success", "status": 200, "data": {...}}
```

### 💡 Common Issues

**Issue 1: Position shows in list but active_pos = 0**
- Solution: These are closed position "slots" - ignore them

**Issue 2: 400 Bad Request on exit**
- Possible causes: Position already closed, invalid position_id
- Solution: Check if position still exists, verify API credentials

**Issue 3: Why fewer active positions than subscriptions?**
- Normal! Not all subscribers have open positions at any time
- Users only have positions when strategy generates entry signals

### 📊 Verification
After closing, verify positions are gone:
```python
# Re-run the DRY RUN script
# Should show: "ACTIVE POSITIONS TO CLOSE: 0"
```

---

## Database Queries Reference

### Get strategy subscribers count:
```sql
SELECT
  ss."strategyId",
  s.name,
  COUNT(*) as subscriber_count
FROM strategy_subscriptions ss
JOIN strategies s ON ss."strategyId" = s.id
WHERE ss."strategyId" IN ('id1', 'id2')
AND ss."isActive" = true
GROUP BY ss."strategyId", s.name;
```

### Check subscription details:
```sql
SELECT
  u.email,
  ss.capital,
  ss."isActive",
  ss."isPaused",
  ss."marginCurrency",
  ss.leverage
FROM strategy_subscriptions ss
JOIN users u ON ss."userId" = u.id
WHERE ss."strategyId" = 'strategy-id-here'
AND ss."isActive" = true;
```

---

## Troubleshooting

### No positions found but users report having positions?
1. Check if looking at correct margin currency (USDT vs INR)
2. Verify API credentials are correct
3. Check if positions are on different exchange account

### Position closure fails repeatedly?
1. Check wallet balance (need funds for fees)
2. Verify position isn't already closing
3. Check CoinDCX API status (may be down)

### Different position count each time?
- Normal! Positions open/close as strategy runs
- Take a "snapshot" by pausing strategy first if needed

---

## Safety Checklist

Before running position closure:

- [ ] Confirmed correct strategy IDs
- [ ] Ran DRY RUN and verified position count
- [ ] Notified affected users (if required)
- [ ] Saved DRY RUN output for records
- [ ] Have user confirmation to proceed
- [ ] Tested with 1-2 positions first (if possible)
- [ ] Ready to handle errors/partial failures

---

**Last Updated:** November 21, 2025
**Tested On:** CoinDCX Futures API v1
**Success Rate:** 21/21 (100%) on Nov 21, 2025
