# EC2 Deployment Guide - Complete Setup

## Your EC2 Details
- **Public IP:** `13.53.120.232` (Elastic IP - Static)
- **SSH Command:** `ssh -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem ubuntu@13.53.120.232`
- **Instance Type:** t3.small (2 vCPU, 2GB RAM)

## Architecture
```
Browser → Port 80 (Nginx) → Port 3000 (Next.js Frontend)
                          → Port 3001 (Express Backend)
                          → Port 8003 (Python Strategy Executor)
```

---

## Step 1: Initial Server Setup

SSH to your EC2:
```bash
ssh -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem ubuntu@13.53.120.232
```

Update system:
```bash
sudo apt update
sudo apt upgrade -y
```

---

## Step 2: Install Node.js

```bash
# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version
npm --version
```

---

## Step 3: Install Python & uv

```bash
# Install Python 3.11+
sudo apt install -y python3 python3-pip

# Install uv (fast Python package manager)
curl -LsSf https://astral.sh/uv/install.sh | sh
source $HOME/.cargo/env

# Verify
python3 --version
uv --version
```

---

## Step 4: Install Nginx

```bash
sudo apt install -y nginx

# Check status
sudo systemctl status nginx
```

---

## Step 5: Clone Your Repository

```bash
# Navigate to home directory
cd ~

# Clone your repo (replace with your actual repo URL)
git clone https://github.com/YOUR_USERNAME/coindcx-trading-platform.git
cd coindcx-trading-platform
```

---

## Step 6: Setup Backend

```bash
cd ~/coindcx-trading-platform/backend

# Install dependencies
npm install

# Setup database
npx prisma generate
npx prisma migrate deploy

# Create .env file
cat > .env << 'EOF'
DATABASE_URL="file:./prisma/prod.db"
JWT_SECRET="your-super-secret-jwt-key-change-this"
SESSION_SECRET="your-super-secret-session-key-change-this"
STRATEGY_EXECUTOR_URL="http://localhost:8003"
FRONTEND_URL="http://13.53.120.232"
ENCRYPTION_KEY="your-32-character-encryption-key"
COINDCX_API_KEY="your-coindcx-api-key"
COINDCX_API_SECRET="your-coindcx-api-secret"
NODE_ENV="production"
EOF

# Edit and add your actual secrets
nano .env
```

---

## Step 7: Setup Frontend

```bash
cd ~/coindcx-trading-platform/frontend

# Install dependencies
npm install

# Create .env file
cat > .env << 'EOF'
NEXT_PUBLIC_BACKEND_URL="http://13.53.120.232/api"
NODE_ENV="production"
EOF

# Build for production
npm run build
```

---

## Step 8: Setup Python Strategy Executor

```bash
cd ~/coindcx-trading-platform/strategy-runner/python

# Create virtual environment with uv
uv venv
source .venv/bin/activate

# Install dependencies
uv pip install -r requirements.txt

# Test it works
python strategy_executor.py
# Press Ctrl+C to stop
```

---

## Step 9: Configure Nginx

```bash
# Copy nginx config to EC2 (do this from your local machine)
scp -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem \
  ~/Developer/coindcx_client/coindcx-trading-platform/nginx.conf \
  ubuntu@13.53.120.232:~/nginx.conf

# Back on EC2, configure nginx
sudo mv ~/nginx.conf /etc/nginx/sites-available/coindcx
sudo ln -s /etc/nginx/sites-available/coindcx /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default  # Remove default config

# Test nginx config
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx
```

---

## Step 10: Install PM2 (Process Manager)

```bash
sudo npm install -g pm2

cd ~/coindcx-trading-platform
```

Create PM2 ecosystem file:
```bash
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'backend',
      cwd: './backend',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'frontend',
      cwd: './frontend',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'strategy-executor',
      cwd: './strategy-runner/python',
      script: 'python',
      args: 'strategy_executor.py',
      interpreter: '/home/ubuntu/coindcx-trading-platform/strategy-runner/python/.venv/bin/python'
    }
  ]
}
EOF
```

---

## Step 11: Start All Services

```bash
# Start everything
pm2 start ecosystem.config.js

# Check status
pm2 status

# View logs
pm2 logs

# Save PM2 config
pm2 save

# Setup auto-start on reboot
pm2 startup
# Copy and run the command it outputs
```

---

## Step 12: Test Your Website

Open browser and visit:
- **Frontend:** `http://13.53.120.232`
- **Backend API:** `http://13.53.120.232/api/health`

If everything works, configure your GoDaddy domain!

---

## Step 13: GoDaddy DNS Configuration

1. Go to GoDaddy DNS Management
2. Add A Record:
   - **Type:** A
   - **Name:** @
   - **Value:** `13.53.120.232`
   - **TTL:** 600

3. Add www subdomain (optional):
   - **Type:** A
   - **Name:** www
   - **Value:** `13.53.120.232`
   - **TTL:** 600

4. Wait 5-15 minutes for DNS propagation

---

## Useful PM2 Commands

```bash
# View all processes
pm2 status

# View logs
pm2 logs

# Restart all
pm2 restart all

# Restart specific service
pm2 restart backend

# Stop all
pm2 stop all

# Delete all processes
pm2 delete all

# Monitor
pm2 monit
```

---

## Add HTTPS/SSL (Optional - After Domain Works)

```bash
# Install certbot
sudo apt install -y certbot python3-certbot-nginx

# Get SSL certificate (replace with your domain)
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal is configured automatically
sudo certbot renew --dry-run
```

---

## Troubleshooting

### Services not starting?
```bash
pm2 logs backend
pm2 logs frontend
pm2 logs strategy-executor
```

### Port already in use?
```bash
sudo lsof -i :3000
sudo lsof -i :3001
sudo lsof -i :8003
```

### Nginx not working?
```bash
sudo nginx -t
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log
```

### Need to rebuild?
```bash
# Backend
cd ~/coindcx-trading-platform/backend
npm install
pm2 restart backend

# Frontend
cd ~/coindcx-trading-platform/frontend
npm install
npm run build
pm2 restart frontend
```

---

## Cost Estimate

- **EC2 t3.small:** ~$15/month
- **Elastic IP:** Free (while instance running)
- **Data Transfer:** ~$1-3/month
- **Total:** ~$16-18/month

---

## Next Steps

1. ✅ SSH to EC2
2. ✅ Install Node.js, Python, uv, Nginx
3. ✅ Clone repository
4. ✅ Setup backend, frontend, Python executor
5. ✅ Configure Nginx
6. ✅ Start services with PM2
7. ✅ Test website works
8. ✅ Configure GoDaddy DNS
9. ⏳ Add SSL certificate (optional)

---

**Your website will be live at:** `http://yourdomain.com` 🚀
