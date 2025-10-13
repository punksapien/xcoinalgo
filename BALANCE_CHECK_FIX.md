# Balance Check Fix - Futures Trading

**Date:** 2025-10-13
**Issue:** "Insufficient balance" error when subscribing to futures strategies

## Problem Summary

### Issue 1: Margin Required showing "N/A"
- The `marginRequired` field was never calculated during deployment
- Database stores it as `null`
- **Status:** Known limitation (needs margin calculation feature)

### Issue 2: Incorrect Balance Check ⭐ FIXED
**Root Cause:**
- Futures strategies (B-AVAX_USDT) require **USDT margin**
- Subscribe modal was checking **INR spot balance** instead
- Users with USDT but no INR got false "insufficient balance" errors

**Example:**
```
User's CoinDCX Account:
- Spot INR: ₹0
- Futures USDT: $500  ✅ Has balance!

Old behavior: ❌ "Insufficient balance" (checked INR)
New behavior: ✅ Shows $500 USDT available
```

## Solution

### Backend Changes

**1. New Endpoint: `/api/broker/futures-balance`**
```typescript
GET /api/broker/futures-balance
Authorization: Bearer <token>

Response:
{
  "totalAvailable": 500,      // USDT balance
  "usdtAvailable": 500,
  "inrAvailable": 0,
  "wallets": [
    {
      "currency": "USDT",
      "available": 500,
      "locked": 0,
      "total": 500
    }
  ],
  "currency": "USDT"
}
```

**2. Correct Balance Validation**
The subscribe endpoint already validates futures balance correctly:
```typescript
// backend/src/routes/strategy-execution.ts:141
const wallets = await CoinDCXClient.getFuturesWallets(...);
const margin = 'USDT';
const w = wallets.find(w => w.margin_currency_short_name === margin);
const available = w ? Number(w.available_balance || 0) : 0;

if (available < capital) {
  return res.status(400).json({
    error: `Insufficient ${margin} futures wallet balance.
            Required: ${capital}, Available: ${available}`
  });
}
```

### Frontend Changes

**1. New API Method**
```typescript
// frontend/src/lib/api/strategy-execution-api.ts
static async getFuturesBalance(token: string): Promise<{
  totalAvailable: number;
  usdtAvailable: number;
  inrAvailable: number;
  wallets: { currency: string; available: number }[];
  currency: string;
}>
```

**2. Updated Subscribe Modal**
```typescript
// Now fetches futures balance for all strategies
const balanceData = await StrategyExecutionAPI.getFuturesBalance(token);
setAvailableBalance(balanceData.totalAvailable);

// Falls back to spot if futures unavailable
```

**3. Correct Display**
```
Before: ❌ "Available Balance: ₹0.00"
After:  ✅ "Available Futures Balance (USDT): $500.00"
```

## How to Test

### 1. Check Your CoinDCX Futures Balance
```bash
# Login to https://coindcx.com
# Go to: Futures Trading > Wallet
# Check USDT balance (not spot INR!)
```

### 2. Verify the Fix
1. Open XcoinAlgo
2. Click "Deploy Bot Now" on AVAX strategy
3. Should now show: **"Available Futures Balance (USDT): $X.XX"**
4. If you have USDT, no more false "insufficient balance" errors!

### 3. If Still Getting Error
**Possible reasons:**
1. You actually don't have USDT in futures wallet
   - Solution: Transfer USDT to futures wallet on CoinDCX
2. API credentials not working
   - Solution: Re-add broker credentials in settings

## Files Changed

1. `backend/src/routes/broker.ts`
   - Added `/futures-balance` endpoint
   - Returns futures wallet balances

2. `frontend/src/lib/api/strategy-execution-api.ts`
   - Added `getFuturesBalance()` method

3. `frontend/src/components/strategy/subscribe-modal.tsx`
   - Updated to fetch futures balance
   - Correct currency display (USDT vs INR)

## Technical Details

### Why Two Balance Endpoints?

**`/api/broker/balance`** (Spot)
- For spot trading
- Returns INR balance
- Used by spot strategies

**`/api/broker/futures-balance`** (Futures) ⭐ NEW
- For margin/futures trading
- Returns USDT/INR futures balance
- Used by B- pair strategies (B-AVAX_USDT, B-BTC_USDT, etc.)

### Margin Currency Logic
```typescript
// Strategy determines margin currency
const symbol = 'B-AVAX_USDT';  // B- prefix = futures
const marginCurrency = 'USDT';  // Default for futures

// Balance check uses correct wallet
if (symbol.startsWith('B-')) {
  // Check futures USDT wallet ✅
  const futuresBalance = await getFuturesBalance();
} else {
  // Check spot INR wallet
  const spotBalance = await getUserBalance();
}
```

## Next Steps

1. **Margin Required Calculation** (Future Enhancement)
   - Calculate based on: leverage × position size × price
   - Display realistic margin requirements
   - Update during strategy deployment

2. **Multi-Currency Support**
   - Allow INR margin for some futures
   - Show both USDT and INR balances
   - Let user choose margin currency

3. **Better Error Messages**
   - "Transfer USDT to futures wallet" instructions
   - Direct link to CoinDCX deposit page
   - Show exact shortfall amount

