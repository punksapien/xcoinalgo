# Deployment Checklist - WebSocket P&L Feature

## Overview
This deployment adds real-time unrealized P&L calculation using WebSocket ticker prices, along with UI improvements to the subscriptions page.

## ✅ Pre-Deployment Checklist

### Backend Changes
- [x] Created WebSocket ticker service (`src/services/websocket-ticker.ts`)
- [x] Updated strategy-execution.ts to use WebSocket service
- [x] Reverted unsafe positions.ts changes (using `pnlPercentage` not `pnlPct`)
- [x] Installed socket.io-client dependency
- [x] Created integration test suite (`src/tests/test-websocket-ticker.ts`)
- [x] Build passes with no TypeScript errors
- [x] No schema migrations required ✅

### Frontend Changes
- [x] Updated subscriptions page layout (single column)
- [x] Removed Settings button
- [x] Added realized/unrealized P&L display
- [x] Updated TypeScript interfaces

### Safety Checks
- [x] No breaking changes to existing API responses
- [x] No database schema changes
- [x] All changes are backwards compatible
- [x] Graceful fallback to REST API if WebSocket fails

## 🔍 What Changed

### Backend Files Modified:
1. **src/services/websocket-ticker.ts** (NEW)
   - WebSocket connection to CoinDCX
   - In-memory price cache with 5-second TTL
   - Automatic reconnection
   - Fallback to REST API

2. **src/routes/strategy-execution.ts**
   - Line 575: Now uses `websocketTicker.getPrice()` instead of direct REST calls
   - Returns `realizedPnl` and `unrealizedPnl` in `liveStats`

3. **src/routes/positions.ts**
   - Line 208: REVERTED to use `pnlPercentage` (safe for production)

4. **package.json**
   - Added `socket.io-client` dependency
   - Added `test:websocket` script

### Frontend Files Modified:
1. **frontend/src/app/dashboard/subscriptions/page.tsx**
   - Changed to single-column layout (line 225)
   - Removed Settings button (lines 346-356 removed)
   - Added realized/unrealized P&L display (lines 284-294)

## 🧪 Testing Instructions

### Before Deployment - Local Testing

1. **Test WebSocket Service**
   ```bash
   cd backend
   npm run test:websocket
   ```

   Expected Output:
   - WebSocket connects successfully
   - Cache populates with ticker prices
   - Price fetches work from cache
   - Fallback to REST API works

2. **Test Backend Locally**
   ```bash
   npm run dev
   ```

   Test endpoints:
   - GET `/api/strategies/subscriptions` - should return realizedPnl and unrealizedPnl
   - Verify P&L calculations are accurate

3. **Test Frontend Locally**
   ```bash
   cd ../frontend
   npm run dev
   ```

   Navigate to `/dashboard/subscriptions`:
   - Check layout is single column
   - Verify realized/unrealized P&L is displayed
   - Settings button should not be visible

### After Deployment - Production Testing

1. **Backend Smoke Test**
   ```bash
   ssh your-server
   cd /path/to/backend
   pm2 logs backend --lines 100
   ```

   Look for:
   - "WebSocket connected successfully"
   - "Subscribing to channel: currentPrices@futures@rt"
   - No connection errors

2. **API Test**
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     https://your-api.com/api/strategies/subscriptions
   ```

   Verify response includes:
   ```json
   {
     "liveStats": {
       "totalPnl": 123.45,
       "realizedPnl": 100.00,
       "unrealizedPnl": 23.45,
       "totalTrades": 10,
       "winRate": 60,
       "openPositions": 2,
       "closedTrades": 8
     }
   }
   ```

3. **Frontend Test**
   - Visit https://your-app.com/dashboard/subscriptions
   - Verify P&L displays correctly
   - Check that realized/unrealized breakdown shows (R: / U: format)

## 📦 Deployment Steps

### Step 1: Backend Deployment (via SSH)

```bash
# SSH into production server
ssh your-server

# Navigate to backend directory
cd /path/to/coindcx-trading-platform/backend

# Pull latest changes
git pull origin main

# Install new dependencies
npm install

# Build TypeScript
npm run build

# Restart PM2 process
pm2 restart backend

# Check logs
pm2 logs backend --lines 50
```

**Expected Log Messages:**
- "Server starting on port..."
- "WebSocket connected successfully"
- "Subscribing to channel: currentPrices@futures@rt"
- No error messages

### Step 2: Frontend Deployment (via Vercel)

Frontend will auto-deploy when you push to GitHub:

```bash
# Push to GitHub (from project root)
git push origin main
```

Vercel will automatically:
1. Detect the push
2. Build the frontend
3. Deploy to production

**Monitor Vercel Dashboard:**
- Check build logs for errors
- Verify deployment completes successfully
- Test the live URL

## 🔧 Rollback Plan

If something goes wrong:

### Backend Rollback
```bash
ssh your-server
cd /path/to/backend

# Revert to previous commit
git revert HEAD

# Reinstall dependencies
npm install

# Rebuild
npm run build

# Restart
pm2 restart backend
```

### Frontend Rollback
1. Go to Vercel Dashboard
2. Find previous successful deployment
3. Click "Promote to Production"

## 🚨 Known Risks & Mitigation

### Risk 1: WebSocket Connection Fails
**Mitigation:** Automatic fallback to REST API
**Impact:** Slightly slower price fetches, but functionality intact

### Risk 2: Cache Performance Issues
**Mitigation:** 5-second TTL prevents stale data
**Impact:** None expected, cache is lightweight

### Risk 3: High Open Position Count
**Mitigation:** WebSocket cache makes this O(1) instead of O(n) REST calls
**Impact:** Actually improves performance vs current implementation

## 📊 Performance Expectations

### Before (Current Production)
- Every open position = 1 REST API call to CoinDCX
- 10 open positions = 10 REST calls (~2-3 seconds)
- Rate limit concerns

### After (This Deployment)
- WebSocket maintains real-time price cache
- 10 open positions = 10 cache lookups (~10-50ms total)
- No rate limit concerns
- Fallback to REST API if cache miss

## 🎯 Success Metrics

After deployment, verify:
- [ ] WebSocket stays connected (check PM2 logs)
- [ ] Cache populates with prices (use `test:websocket`)
- [ ] P&L calculations are accurate
- [ ] Page loads faster (<2s for subscriptions page)
- [ ] No increase in error rates
- [ ] Users can see realized/unrealized P&L breakdown

## 📝 Notes

- **No Database Changes:** This deployment does NOT require any schema migrations
- **Backwards Compatible:** Existing API responses remain unchanged in structure
- **Safe Revert:** All changes in positions.ts were reverted to safe versions
- **Production Ready:** All TypeScript builds pass with no errors

## 🔗 Related Documentation

- WebSocket Implementation: `backend/src/services/websocket-ticker.ts`
- Integration Tests: `backend/src/tests/test-websocket-ticker.ts`
- CoinDCX WebSocket Docs: (from your Python code reference)

## ✅ Final Checklist Before Push

- [x] All tests pass
- [x] Build completes without errors
- [x] No schema changes
- [x] Backwards compatible
- [x] Rollback plan documented
- [x] Success metrics defined

## 🚀 Ready to Deploy!

Once you've reviewed this checklist and tested locally, you're ready to deploy:

1. Test locally (both backend and frontend)
2. Push to GitHub: `git push origin main`
3. SSH to server and deploy backend
4. Monitor logs for 5-10 minutes
5. Test live site
6. Celebrate! 🎉
