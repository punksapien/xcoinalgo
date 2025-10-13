# CoinDCX Client Implementation Guide

## ✅ CRITICAL: Matching Python Implementation

Our TypeScript implementation **MUST** match the quant team's Python implementation exactly.

### Python Implementation Reference

```python
def _make_request(self, method: str, endpoint: str, payload: Optional[Dict[str, Any]] = None) -> Any:
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

    # KEY: Always send body, even for "GET" endpoints
    response = requests.request(method.upper(), url, data=json_body, headers=headers)
    response.raise_for_status()
    return response.json()
```

### Key Implementation Details

1. **All authenticated endpoints use POST with JSON body**
   - Even endpoints labeled "GET" in docs use POST
   - Body always includes `timestamp` in milliseconds
   - Signature is HMAC-SHA256 of the JSON body

2. **JSON Serialization**
   - Must use compact format: `separators=(',', ':')`
   - No spaces after `:` or `,`
   - Example: `{"timestamp":1234567890}` ✅
   - NOT: `{"timestamp": 1234567890}` ❌

3. **Authentication Headers**
   ```typescript
   {
     'Content-Type': 'application/json',
     'X-AUTH-APIKEY': apiKey,  // Decrypted from database
     'X-AUTH-SIGNATURE': signature  // HMAC-SHA256 of body
   }
   ```

4. **Futures Wallet Balance**
   ```python
   def get_wallet_details(self) -> List[Dict[str, Any]]:
       return self._make_request('GET', '/exchange/v1/derivatives/futures/wallets')
   ```

   Response format:
   ```json
   [
     {
       "id": "...",
       "currency_short_name": "USDT",
       "balance": "6.1693226",  // STRING, not number!
       "locked_balance": "0.0",
       "cross_order_margin": "0.0",
       "cross_user_margin": "0.68534648"
     }
   ]
   ```

5. **Available Balance Calculation**
   ```typescript
   const available = balance - (locked_balance + cross_order_margin + cross_user_margin)
   ```

## 🔧 Current Implementation Status

### ✅ Fixed Issues
1. Single backend architecture (removed duplicate PM2 configs)
2. Proper POST method with body for all authenticated endpoints
3. Correct JSON serialization matching Python
4. Available balance calculation logic

### ⏳ Pending User Action
- **API Key Permissions**: User must enable "Futures Trading" on CoinDCX API key
- 404 errors indicate missing permissions or no futures wallet

## 📋 Checklist for Future Endpoints

When implementing any CoinDCX endpoint:

- [ ] Use POST method (even if docs say GET)
- [ ] Include `timestamp` in payload
- [ ] Compact JSON serialization (no spaces)
- [ ] HMAC-SHA256 signature of JSON body
- [ ] Headers: `Content-Type`, `X-AUTH-APIKEY`, `X-AUTH-SIGNATURE`
- [ ] Handle string values from API (convert to Number where needed)
- [ ] Match Python implementation exactly

## 🐛 Common Issues

1. **401 Unauthorized**: Invalid API credentials or signature mismatch
2. **404 Not Found**: API key missing futures permissions OR no futures wallet
3. **Balance showing $0**: Check if values are strings, convert to Number

## 🔑 API Key Requirements

For the platform to work, the CoinDCX API key MUST have:
- ✅ Futures Trading permission enabled
- ✅ Valid and active status
- ✅ Futures wallet created on CoinDCX

Without these, you'll get 404 errors even with correct implementation.

