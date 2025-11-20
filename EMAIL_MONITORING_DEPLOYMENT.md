# Email Monitoring System - Deployment Guide

## Overview
Comprehensive email monitoring and logging system to track verification emails, password resets, and delivery status.

---

## ✅ What's Been Implemented

### 1. Database Schema (`prisma/schema.prisma`)
- ✅ Added `EmailLog` model with fields:
  - userId, email, emailType, resendEmailId
  - status tracking (PENDING, SENT, DELIVERED, BOUNCED, FAILED, OPENED)
  - OTP code storage (for debugging)
  - Timestamps (sentAt, deliveredAt, bouncedAt, openedAt)
  - Metadata (ipAddress, userAgent, retryCount)

### 2. Email Service Updates (`src/services/email.service.ts`)
- ✅ All email functions now log to database:
  - `sendVerificationEmail()` - logs verification emails
  - `sendPasswordResetEmail()` - logs password reset emails
  - `sendWelcomeEmail()` - logs welcome emails
- ✅ Automatic status tracking (PENDING → SENT/FAILED)
- ✅ Error handling with fallback logging

### 3. Auth Route Updates (`src/routes/auth.ts`)
- ✅ Updated all email-sending routes to pass `userId`:
  - `/register` - passes user.id to sendVerificationEmail
  - `/resend-otp` - passes user.id to sendVerificationEmail
  - `/forgot-password` - passes user.id to sendPasswordResetEmail
  - `/verify-otp` - passes user.id to sendWelcomeEmail

### 4. Admin API Endpoints (`src/routes/admin.ts`)
- ✅ `GET /api/admin/email-logs` - View all email logs with filtering
  - Query params: status, emailType, limit, offset, email, userId
- ✅ `GET /api/admin/email-stats` - Email delivery statistics
  - Grouping by status and type
  - Recent failures list
- ✅ `GET /api/admin/unverified-users` - List users with unverified emails
  - Shows last email attempt status
  - Indicates if OTP expired
- ✅ `POST /api/admin/resend-verification` - Manually resend verification email
- ✅ `POST /api/admin/verify-user-manually` - Bypass verification (emergency)

---

## 🚀 Deployment Steps

### Step 1: Run Database Migration
```bash
# SSH into your server
ssh -i /Users/macintosh/Developer/coindcx_client/xcoinalgo-backend-key.pem ubuntu@184.72.102.221

# Navigate to backend directory
cd /home/ubuntu/xcoinalgo/backend

# Run Prisma migration
npx prisma migrate dev --name add_email_monitoring

# Or for production:
npx prisma migrate deploy
```

### Step 2: Generate Prisma Client
```bash
npx prisma generate
```

### Step 3: Rebuild and Restart Backend
```bash
# Build TypeScript
npm run build

# Restart PM2 process
pm2 restart xcoinalgo-backend
pm2 logs xcoinalgo-backend --lines 50
```

### Step 4: Verify Installation
Test the new admin endpoints:
```bash
# Get your admin auth token first
TOKEN="your-admin-jwt-token"

# Test email stats
curl -H "Authorization: Bearer $TOKEN" \
  https://xcoinalgo.com/api/admin/email-stats

# Test unverified users
curl -H "Authorization: Bearer $TOKEN" \
  https://xcoinalgo.com/api/admin/unverified-users
```

---

## 🔧 Fix for vinodrajput2012@gmail.com

The user can be fixed using any of these methods:

### Option 1: User Self-Service (Best)
Tell the user to click "Resend OTP" on the verification page. The email will now work since:
- Domain is verified ✅
- Rate limiting allows 3 attempts per hour ✅
- Logging will track the attempt ✅

### Option 2: Admin Manual Resend
```bash
curl -X POST https://xcoinalgo.com/api/admin/resend-verification \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId": "cmhu5scbb0000p9gyst2gi95y"}'
```

### Option 3: Admin Manual Verification (Skip Email)
```bash
curl -X POST https://xcoinalgo.com/api/admin/verify-user-manually \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId": "cmhu5scbb0000p9gyst2gi95y"}'
```

---

## 📊 Admin UI Components (TO BE BUILT)

### Email Monitoring Dashboard
**Location:** `/admin/email-monitoring`

**Features Needed:**
1. **Stats Cards** (top of page)
   - Total Emails Sent (last 7 days)
   - Delivery Rate %
   - Failed Emails Count
   - Pending Verifications

2. **Email Logs Table**
   - Columns: Timestamp, Email, Type, Status, Resend ID, Actions
   - Filters: Status, Type, Date Range
   - Search by email
   - Click to view full statusMessage

3. **Unverified Users Section**
   - Table showing all unverified users
   - Last email attempt status
   - OTP expiry indicator
   - Actions: "Resend Email" or "Verify Manually" buttons

4. **Quick Actions**
   - Search user by email → View email history
   - Bulk resend to failed deliveries
   - Export failed emails as CSV

---

## 🔌 Resend Webhooks (OPTIONAL - Future Enhancement)

To get real-time delivery status from Resend:

### 1. Create Webhook Endpoint
**File:** `src/routes/webhooks.ts` (new file)

```typescript
import { Router } from 'express';
import prisma from '../utils/database';

const router = Router();

router.post('/resend', async (req, res) => {
  const { type, data } = req.body;

  try {
    const emailLog = await prisma.emailLog.findFirst({
      where: { resendEmailId: data.email_id }
    });

    if (!emailLog) {
      return res.status(404).json({ error: 'Email log not found' });
    }

    const updateData: any = {};

    switch (type) {
      case 'email.delivered':
        updateData.status = 'DELIVERED';
        updateData.deliveredAt = new Date();
        break;
      case 'email.bounced':
        updateData.status = 'BOUNCED';
        updateData.bouncedAt = new Date();
        updateData.statusMessage = data.bounce?.message;
        break;
      case 'email.opened':
        updateData.openedAt = new Date();
        if (emailLog.status === 'SENT') {
          updateData.status = 'OPENED';
        }
        break;
    }

    await prisma.emailLog.update({
      where: { id: emailLog.id },
      data: updateData
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export { router as webhookRoutes };
```

### 2. Register Webhook in Resend Dashboard
1. Go to https://resend.com/webhooks
2. Add webhook URL: `https://xcoinalgo.com/api/webhooks/resend`
3. Select events: `email.delivered`, `email.bounced`, `email.opened`
4. Save and test

---

## 📝 Testing Checklist

After deployment, test these scenarios:

- [ ] New user signup → Check email_logs table has SENT entry
- [ ] User clicks "Resend OTP" → New log entry created
- [ ] Password reset request → email_logs has PASSWORD_RESET entry
- [ ] Admin views /api/admin/email-stats → Returns valid stats
- [ ] Admin views /api/admin/unverified-users → Shows vinodrajput2012@gmail.com
- [ ] Admin manually resends email → User receives new OTP
- [ ] Admin manually verifies user → User can login

---

## 🐛 Troubleshooting

### Migration Fails
```bash
# Check current schema status
npx prisma migrate status

# Reset if needed (WARNING: loses data)
npx prisma migrate reset

# Then re-run migrations
npx prisma migrate deploy
```

### Prisma Client Not Updated
```bash
# Regenerate client
npx prisma generate

# Restart Node process
pm2 restart xcoinalgo-backend
```

### Email Logs Not Appearing
Check backend logs:
```bash
pm2 logs xcoinalgo-backend --lines 100 | grep -i email
```

---

## 📈 Monitoring

### Check Email Delivery Health
```bash
# SSH into server
ssh -i ~/Developer/coindcx_client/xcoinalgo-backend-key.pem ubuntu@184.72.102.221

# Query failed emails (last 24 hours)
sudo -u postgres psql xcoinalgo -c "
  SELECT email, email_type, status_message, sent_at
  FROM email_logs
  WHERE status = 'FAILED'
    AND sent_at > NOW() - INTERVAL '24 hours'
  ORDER BY sent_at DESC;
"

# Count emails by status (last 7 days)
sudo -u postgres psql xcoinalgo -c "
  SELECT status, COUNT(*)
  FROM email_logs
  WHERE sent_at > NOW() - INTERVAL '7 days'
  GROUP BY status;
"
```

---

## 🎯 Next Steps

1. **Immediate:**
   - Deploy migration
   - Test with vinodrajput2012@gmail.com
   - Fix the 24 stuck users

2. **Short-term:**
   - Build admin UI dashboard
   - Add email search functionality
   - Create CSV export feature

3. **Long-term:**
   - Setup Resend webhooks for real-time tracking
   - Add email templates management in admin
   - Implement email throttling/retry logic
   - Add alerts for high failure rates

---

## 🔐 Security Notes

- OTP codes are stored in `email_logs.otpCode` (consider encrypting in production)
- Admin endpoints require ADMIN role (already protected)
- Resend API key is send-only (cannot query emails)
- Email logs contain PII - ensure GDPR compliance

---

## 📞 Support

If you encounter issues:
1. Check PM2 logs: `pm2 logs xcoinalgo-backend`
2. Check Prisma schema: `npx prisma studio`
3. Check database directly: `sudo -u postgres psql xcoinalgo`
4. Check Resend dashboard: https://resend.com/emails

---

**Deployment Date:** To be determined
**Version:** 1.0.0
**Status:** Ready for deployment ✅
