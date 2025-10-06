# Vercel Deployment Guide for XcoinAlgo Frontend

## Overview

Deploy the Next.js frontend to Vercel while keeping backend and strategy executor on EC2.

**Benefits:**
- ✅ No more build issues - Vercel handles Next.js perfectly
- ✅ Auto-deployments from GitHub
- ✅ Free SSL and CDN
- ✅ Preview deployments for PRs
- ✅ Production optimizations automatic
- ✅ Free tier (likely sufficient for your usage)

---

## Architecture After Vercel Deployment

```
┌─────────────────┐
│  Vercel         │
│  ├─ Frontend    │  ← Next.js (port 80/443)
│  └─ CDN/Edge    │
└────────┬────────┘
         │ API calls
         ↓
┌─────────────────┐
│  EC2            │
│  ├─ Backend     │  ← Express (port 3001)
│  ├─ Executor    │  ← Python strategies
│  └─ Database    │
└─────────────────┘
```

---

## Step 1: Prepare Environment Variables

### Gather These From Your Current Setup:

1. **Get Google OAuth credentials**:
   ```bash
   cat frontend/.env.local | grep GOOGLE
   ```

2. **Get NextAuth secret**:
   ```bash
   cat frontend/.env.local | grep NEXTAUTH_SECRET
   ```

3. **Backend URL** (use one of these):
   - Option A: Direct IP: `http://13.53.120.232:3001`
   - Option B: Create subdomain: `https://api.xcoinalgo.com` (recommended)

---

## Step 2: Set Up Vercel Project

### 2.1 Sign Up / Log In
1. Go to https://vercel.com
2. Sign in with GitHub account (punksapien)

### 2.2 Import Repository
1. Click "Add New..." → "Project"
2. Import repository: `punksapien/xcoinalgo`
3. Configure project:
   - **Framework Preset**: Next.js
   - **Root Directory**: `frontend`  ← IMPORTANT: monorepo setup
   - **Build Command**: `npm run build` (auto-detected)
   - **Output Directory**: `.next` (auto-detected)
   - **Install Command**: `npm install` (auto-detected)

### 2.3 Add Environment Variables

In Vercel project settings → Environment Variables, add:

```bash
# Backend API URL
NEXT_PUBLIC_BACKEND_URL=http://13.53.120.232:3001
# Or if you set up api subdomain:
# NEXT_PUBLIC_BACKEND_URL=https://api.xcoinalgo.com

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# NextAuth
NEXTAUTH_SECRET=your_nextauth_secret_here
NEXTAUTH_URL=https://your-vercel-url.vercel.app
# Update this after first deployment with actual Vercel URL
```

**Where to find your values:**
```bash
# On local machine
cat /Users/macintosh/Developer/coindcx_client/coindcx-trading-platform/frontend/.env.local
```

### 2.4 Deploy
Click "Deploy" - Vercel will:
1. Clone your GitHub repo
2. Build the frontend from `frontend/` directory
3. Deploy to Vercel's global CDN
4. Provide you with a URL (e.g., `xcoinalgo.vercel.app`)

---

## Step 3: Update EC2 Backend

### 3.1 Enable CORS for Vercel Domain

SSH into EC2 and update backend to allow Vercel domain:

```bash
ssh -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem ubuntu@13.53.120.232

# Edit backend CORS config
cd ~/xcoinalgo/backend
nano src/index.ts  # or wherever CORS is configured
```

Add Vercel domain to allowed origins:
```javascript
const cors = require('cors');

app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://your-vercel-url.vercel.app',  // Add this
    'https://xcoinalgo.com'                  // If using custom domain
  ],
  credentials: true
}));
```

Restart backend:
```bash
pm2 restart backend
pm2 save
```

### 3.2 Stop Frontend on EC2

Since Vercel is now serving frontend:
```bash
pm2 delete frontend
pm2 save
```

---

## Step 4: Update NextAuth URL

After first deployment, Vercel gives you a URL. Update environment variable:

1. Go to Vercel dashboard → Your project → Settings → Environment Variables
2. Edit `NEXTAUTH_URL` to your Vercel URL: `https://your-vercel-url.vercel.app`
3. Redeploy (Vercel will auto-redeploy on env var change)

---

## Step 5: Custom Domain (Optional)

### Option A: Use xcoinalgo.com for Frontend

1. **In Vercel**:
   - Go to Project Settings → Domains
   - Add domain: `xcoinalgo.com`
   - Vercel will show you DNS records to add

2. **In GoDaddy**:
   - Remove current A record pointing to EC2
   - Add Vercel's DNS records (usually A and CNAME records)

3. **Update backend subdomain** (keep backend on EC2):
   - In GoDaddy, add: `api.xcoinalgo.com` → `13.53.120.232`
   - Update frontend env var: `NEXT_PUBLIC_BACKEND_URL=https://api.xcoinalgo.com`
   - Set up SSL for api subdomain on EC2

### Option B: Use Subdomain for Frontend

- Frontend: `app.xcoinalgo.com` → Vercel
- Backend: `api.xcoinalgo.com` → EC2
- Main domain: Keep current setup or redirect to app subdomain

---

## Step 6: Test Deployment

### 6.1 Test Frontend
1. Visit your Vercel URL
2. Check login works (Google OAuth)
3. Verify dashboard loads
4. Check API calls work (use browser devtools → Network tab)

### 6.2 Test API Communication
```bash
# Check if backend receives requests from Vercel
ssh -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem ubuntu@13.53.120.232
pm2 logs backend --lines 50
```

### 6.3 Common Issues

**Issue**: API calls fail with CORS error
- **Fix**: Make sure Vercel domain is in backend CORS whitelist

**Issue**: Google OAuth redirect error
- **Fix**: Update Google OAuth console to include Vercel URL as authorized redirect URI:
  - Go to Google Cloud Console → APIs & Services → Credentials
  - Edit OAuth 2.0 Client
  - Add to Authorized redirect URIs: `https://your-vercel-url.vercel.app/api/auth/callback/google`

**Issue**: Environment variables not loading
- **Fix**: Ensure env vars are set in Vercel dashboard (they're separate from local .env.local)

---

## Step 7: Set Up Auto-Deployments

### Already Automatic!
Vercel automatically deploys when you push to GitHub:

```bash
cd /Users/macintosh/Developer/coindcx_client/coindcx-trading-platform

# Make changes to frontend
# Commit and push
git add frontend/
git commit -m "Update frontend"
GIT_SSH_COMMAND="ssh -i ~/.ssh/punksapien_github" git push origin main

# Vercel automatically deploys within 1-2 minutes!
```

### Preview Deployments
- Every PR gets its own preview URL
- Perfect for testing before merging

---

## Architecture Comparison

### Before (All on EC2):
```
EC2 (13.53.120.232)
├─ Frontend (dev mode, manual deploys)
├─ Backend
└─ Strategy Executor
```

### After (Hybrid):
```
Vercel
└─ Frontend (production, auto-deploys, global CDN)

EC2 (13.53.120.232)
├─ Backend
└─ Strategy Executor
```

---

## Cost Comparison

### EC2 Only:
- EC2 t2.micro: ~$10/month
- Total: **~$10/month**

### Vercel + EC2:
- Vercel: $0/month (free tier)
  - 100 GB bandwidth/month
  - Unlimited deployments
  - SSL included
- EC2 t2.micro: ~$10/month
- Total: **~$10/month** (same cost, better performance!)

---

## Rollback Plan

If anything goes wrong:

### Quick Rollback:
```bash
# SSH into EC2
ssh -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem ubuntu@13.53.120.232

# Restart frontend on EC2
cd ~/xcoinalgo/frontend
pm2 start npm --name frontend -- run dev
pm2 save

# Point domain back to EC2 in GoDaddy DNS
# (Change A record back to 13.53.120.232)
```

### Full Restore from Backup:
```bash
# Restore from backup created earlier
cd /Users/macintosh/Developer/coindcx_client
tar -xzf ~/Desktop/coindcx_backup_*.tar.gz
```

---

## Summary Checklist

Before deploying:
- [ ] Gather all environment variables from frontend/.env.local
- [ ] Have Google OAuth credentials ready
- [ ] Know your backend URL (EC2 IP or subdomain)

During deployment:
- [ ] Create Vercel account with GitHub
- [ ] Import repository with root directory = `frontend`
- [ ] Add all environment variables
- [ ] Deploy and get Vercel URL
- [ ] Update CORS in EC2 backend
- [ ] Stop frontend PM2 process on EC2
- [ ] Update NEXTAUTH_URL with Vercel URL

After deployment:
- [ ] Test frontend loads
- [ ] Test login works
- [ ] Test API calls work
- [ ] Check PM2 logs on EC2
- [ ] (Optional) Set up custom domain
- [ ] (Optional) Update Google OAuth redirect URIs

---

## Support

If you need help:
- Vercel Docs: https://vercel.com/docs
- Vercel Support: https://vercel.com/support
- Check Vercel deployment logs in dashboard

---

## Next Steps

After successful Vercel deployment:
1. Monitor first few days for any issues
2. Set up custom domain if desired
3. Configure preview environments for testing
4. Consider upgrading EC2 instance for better backend performance
