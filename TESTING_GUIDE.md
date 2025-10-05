# XCoinAlgo Platform - Testing Guide

Complete guide for testing the deployed XCoinAlgo trading platform.

---

## Platform Access

**URLs:**
- Direct IP: http://13.53.120.232
- Domain (once DNS configured): https://xcoinalgo.com

**Test Credentials:**
- Sign up with Google OAuth (no test accounts needed)

---

## Pre-Flight Checks

### 1. Verify All Services Are Running

SSH into EC2:
```bash
ssh -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem ubuntu@13.53.120.232
```

Check PM2 status:
```bash
pm2 status
```

Expected output - all services should show **"online"**:
```
┌────┬──────────────────────┬─────────┬──────────┐
│ id │ name                 │ status  │ uptime   │
├────┼──────────────────────┼─────────┼──────────┤
│ 0  │ backend              │ online  │ 10m      │
│ 1  │ frontend             │ online  │ 10m      │
│ 2  │ strategy-executor    │ online  │ 10m      │
└────┴──────────────────────┴─────────┴──────────┘
```

Check Nginx:
```bash
sudo systemctl status nginx
# Should show: active (running)
```

### 2. Test Service Endpoints

From your local machine:

```bash
# Frontend
curl -I http://13.53.120.232/
# Should return: HTTP/1.1 200 OK

# Backend API
curl http://13.53.120.232/api/
# Should return error page (no root route) but NOT 502

# Strategy Executor Health
curl http://13.53.120.232:8003/health 2>/dev/null || echo "Port not exposed (expected)"
# Note: Port 8003 is internal only, should not be accessible
```

---

## Test Scenarios

### Test 1: User Authentication Flow

#### 1.1 Access Login Page
1. Open browser: http://13.53.120.232/login
2. Verify page loads with "Sign in to your account" heading
3. Check "Continue with Google" button is visible

#### 1.2 Google OAuth Login
**Note**: Google OAuth requires valid credentials configuration. If not configured:
- You'll see an error about missing GOOGLE_CLIENT_ID
- This is expected - OAuth is optional for testing

**Alternative**: Use email/password registration if implemented

#### 1.3 Registration Flow (if available)
1. Click "Sign up" or "Register"
2. Fill in email and password
3. Submit form
4. Verify account created
5. Check redirect to dashboard

**Expected Result**: Successfully logged in and redirected to `/dashboard`

---

### Test 2: Dashboard Access

#### 2.1 Navigate Dashboard
1. After login, verify you're at `/dashboard`
2. Check sidebar navigation shows:
   - Dashboard
   - Strategies
   - Deployments
   - Analytics
   - Settings

#### 2.2 Check Dashboard Widgets
Verify the following sections load:
- Portfolio Overview
- Active Strategies
- Performance Chart
- Recent Trades

**Expected Result**: Dashboard displays without errors

---

### Test 3: Strategy Upload Flow

#### 3.1 Navigate to Upload Page
1. Click "Strategies" in sidebar
2. Click "Upload Strategy" or "New Strategy"
3. Verify you're at `/dashboard/strategies/upload`

#### 3.2 Prepare Test Strategy

Create `test_strategy.py`:
```python
from crypto_strategy_sdk import BaseStrategy, StrategyConfig, SignalType
import pandas as pd

class TestStrategy(BaseStrategy):
    def initialize(self):
        self.sma_period = 20

    def generate_signals(self, df: pd.DataFrame):
        if len(df) < self.sma_period:
            return {'signal': SignalType.HOLD, 'confidence': 0.0}

        df['sma'] = self.indicators.sma(df, self.sma_period)

        if df.iloc[-1]['close'] > df.iloc[-1]['sma']:
            return {'signal': SignalType.LONG, 'confidence': 0.7}
        else:
            return {'signal': SignalType.SHORT, 'confidence': 0.7}
```

#### 3.3 Upload Strategy
1. **Select File**: Click "Choose File" and select `test_strategy.py`
2. **Fill Form**:
   - Name: "Test SMA Strategy"
   - Description: "Testing strategy upload"
3. **Configure JSON**:
```json
{
  "name": "Test SMA Strategy",
  "code": "TEST_SMA_V1",
  "author": "Tester",
  "pair": "BTC_USDT",
  "leverage": 10,
  "risk_per_trade": 0.01,
  "resolution": "5",
  "lookback_period": 100
}
```
4. **Upload**: Click "Upload Strategy"

#### 3.4 Verify Upload
Check for:
- ✅ Success message: "Strategy uploaded successfully"
- ✅ Validation results displayed
- ✅ Redirect to strategy details page
- ✅ Strategy appears in strategies list

**Expected Result**: Strategy uploaded and validated successfully

**Troubleshooting**:
- If upload fails, check backend logs: `pm2 logs backend --lines 50`
- Verify strategy file syntax is correct
- Check file size is reasonable (<1MB)

---

### Test 4: Strategy Deployment

#### 4.1 Navigate to Strategy Details
1. Go to Dashboard → Strategies
2. Click on your uploaded strategy
3. Verify strategy details page shows:
   - Strategy name
   - Code snippet
   - Configuration
   - Deploy button

#### 4.2 Deploy Strategy
1. Click "Deploy Strategy"
2. **Configure Deployment**:
   - Execution Interval: 300 seconds (5 minutes)
   - API Credentials: [Enter test credentials or use paper trading]
3. Click "Deploy"

#### 4.3 Verify Deployment
Check:
- ✅ Deployment status: "Running" or "Active"
- ✅ Strategy appears in active deployments
- ✅ Execution logs start appearing

**Backend Verification**:
```bash
ssh -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem ubuntu@13.53.120.232
pm2 logs strategy-executor --lines 50
```

Look for:
```
[INFO] Strategy deployed: TEST_SMA_V1
[INFO] Execution scheduled: every 300 seconds
```

**Expected Result**: Strategy deployed and executing on schedule

---

### Test 5: Strategy Monitoring

#### 5.1 View Execution Logs
1. Go to strategy details page
2. Check "Execution Logs" section
3. Verify logs show:
   - Timestamp of each execution
   - Signals generated (LONG/SHORT/HOLD)
   - Confidence scores
   - Any errors

#### 5.2 Check Performance Metrics
Verify the following metrics update:
- Total Executions
- Successful/Failed runs
- Average execution time
- Last execution timestamp

#### 5.3 View Strategy Analytics
1. Navigate to Analytics page
2. Filter by your test strategy
3. Check charts display:
   - Equity curve
   - Trade history
   - Win rate
   - Profit/Loss

**Expected Result**: Real-time monitoring data displays correctly

---

### Test 6: Strategy Control

#### 6.1 Pause Strategy
1. Go to strategy details
2. Click "Pause" button
3. Verify status changes to "Paused"
4. Check logs show: "Strategy paused"

#### 6.2 Resume Strategy
1. Click "Resume" button
2. Verify status changes to "Running"
3. Check next execution is scheduled

#### 6.3 Stop Strategy
1. Click "Stop" button
2. Confirm action
3. Verify status changes to "Stopped"
4. Check strategy removed from active deployments

**Expected Result**: All control actions work as expected

---

### Test 7: Error Handling

#### 7.1 Upload Invalid Strategy
Upload a Python file with syntax errors:
```python
from crypto_strategy_sdk import BaseStrategy

class BrokenStrategy(BaseStrategy):
    def initialize(self):
        this will cause syntax error  # Missing quotes
```

**Expected**: Upload rejected with validation error message

#### 7.2 Deploy with Invalid Config
Try deploying with invalid configuration:
```json
{
  "leverage": 1000,  // Too high
  "risk_per_trade": 2.0  // Above 1.0
}
```

**Expected**: Deployment rejected with clear error messages

#### 7.3 Test Rate Limiting
Try uploading 10 strategies rapidly (within 1 minute).

**Expected**: Rate limit message after X uploads

---

### Test 8: Multi-User Scenarios

#### 8.1 Create Second Account
1. Logout from first account
2. Register with different email/Google account
3. Login with second account

#### 8.2 Verify Data Isolation
1. Upload a strategy with second account
2. Verify first account cannot see second account's strategies
3. Verify strategies are user-specific

**Expected Result**: Proper data isolation between users

---

## Performance Testing

### Load Test: Multiple Concurrent Users

Use Apache Bench or similar tool:

```bash
# Test frontend load
ab -n 1000 -c 10 http://13.53.120.232/

# Test API load
ab -n 500 -c 5 http://13.53.120.232/api/strategies
```

**Expected**:
- Response time: < 500ms for most requests
- No 500 errors
- Services remain stable

### Monitor Resource Usage

```bash
# SSH to EC2
ssh -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem ubuntu@13.53.120.232

# Check system resources
htop

# Check disk usage
df -h

# Check memory
free -h
```

**Expected**:
- CPU usage: < 80%
- Memory usage: < 1.5GB (of 2GB available)
- Disk usage: < 50%

---

## Integration Testing

### Test Backend → Strategy Executor Communication

```bash
# From EC2
curl -X POST http://localhost:8003/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "strategy_id": "test-123",
    "strategy_code": "print(\"Hello\")",
    "config": {"name": "Test"}
  }'
```

**Expected**: Strategy executor accepts deployment request

### Test Database Integrity

```bash
# SSH to EC2
cd ~/xcoinalgo/backend

# Check database
npx prisma studio
# Opens web UI to browse database
```

Verify:
- Users table has your test users
- Strategies table has uploaded strategies
- Deployments table tracks active deployments

---

## Security Testing

### 1. Test Authentication Required

```bash
# Try accessing protected routes without auth
curl http://13.53.120.232/api/strategies

# Expected: 401 Unauthorized or redirect to login
```

### 2. Test SQL Injection Protection

Try uploading strategy with name:
```
'; DROP TABLE users; --
```

**Expected**: Input sanitized, no SQL injection

### 3. Test XSS Protection

Try strategy description:
```html
<script>alert('XSS')</script>
```

**Expected**: HTML escaped, script not executed

---

## Logs & Debugging

### Access Logs

```bash
# SSH to EC2
ssh -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem ubuntu@13.53.120.232

# Backend logs
pm2 logs backend

# Frontend logs
pm2 logs frontend

# Strategy executor logs
pm2 logs strategy-executor

# Nginx access logs
sudo tail -f /var/log/nginx/access.log

# Nginx error logs
sudo tail -f /var/log/nginx/error.log
```

### Common Issues and Solutions

| Issue | Check | Solution |
|-------|-------|----------|
| 502 Bad Gateway | Backend status | `pm2 restart backend` |
| Page not loading | Nginx status | `sudo systemctl restart nginx` |
| Strategy not executing | Executor logs | Check executor service, verify API credentials |
| Upload fails | Backend logs | Check file permissions, disk space |
| OAuth fails | Backend .env | Add GOOGLE_CLIENT_ID/SECRET or disable OAuth |

---

## Smoke Test Checklist

Quick test to verify platform is functional:

- [ ] Frontend loads at http://13.53.120.232
- [ ] Login page displays correctly
- [ ] Can create account/login
- [ ] Dashboard displays after login
- [ ] Can navigate to Strategies page
- [ ] Can navigate to Upload page
- [ ] Can upload a test strategy
- [ ] Strategy appears in list
- [ ] Can view strategy details
- [ ] Can deploy strategy
- [ ] Deployment status shows "Running"
- [ ] Logs display execution data
- [ ] Can pause/resume strategy
- [ ] Can stop strategy
- [ ] All PM2 services show "online"
- [ ] No errors in PM2 logs

---

## Regression Testing

After code changes, run these tests:

1. **Authentication Flow**: Ensure login still works
2. **Strategy Upload**: Upload a known-good strategy
3. **Strategy Execution**: Verify strategies still execute
4. **API Endpoints**: Test all major API routes
5. **Database Migrations**: Check schema changes didn't break queries

---

## Automated Testing (Future)

Consider implementing:
- Cypress for E2E frontend testing
- Jest for backend unit tests
- Pytest for strategy executor testing
- GitHub Actions for CI/CD

---

## Reporting Issues

When reporting bugs, include:

1. **What you did**: Step-by-step reproduction
2. **What you expected**: Expected behavior
3. **What happened**: Actual behavior
4. **Logs**: Relevant error messages from PM2 logs
5. **Environment**: Browser, OS, timestamp

Create issues at: https://github.com/punksapien/xcoinalgo/issues

---

## Success Criteria

Platform is considered **production-ready** when:

✅ All test scenarios pass
✅ No critical errors in logs
✅ Response times < 500ms
✅ Services stable for 24+ hours
✅ Data isolation verified
✅ Security tests pass
✅ Load tests handle expected traffic
✅ Error handling works correctly
✅ Monitoring and alerts functional

---

**Last Updated**: 2025-10-05
**Platform Version**: 1.0.0
