# Backend Deployment Guide (For Friend's AWS Server)

## Overview

This guide helps deploy the XcoinAlgo backend and strategy executor on a fresh AWS EC2 instance **without sharing AWS credentials**.

**What needs to run:**
1. **Backend** (Node.js/Express) - REST API on port 3001
2. **Strategy Executor** (Python) - Background service for running trading strategies

---

## Prerequisites (What Your Friend Needs)

### AWS EC2 Instance
- **OS**: Ubuntu 22.04 LTS (recommended)
- **Instance Type**: t2.small or larger (t2.micro too small for builds)
- **Region**: Any (eu-north-1 currently used)
- **Storage**: 20GB minimum
- **Security Group**:
  - Port 22 (SSH) - From your friend's IP
  - Port 3001 (Backend API) - From 0.0.0.0/0 (or from Vercel IPs only)
  - Port 80/443 (Optional) - If using Nginx reverse proxy

### Required Software on Server
- Node.js 20.x
- Python 3.10+
- PM2 (process manager)
- PostgreSQL or SQLite (database)
- Nginx (optional, for reverse proxy)

---

## Deployment Methods

### Method 1: Automated Script (Easiest)

**You create the script, friend runs it**

#### Step 1: Create Deployment Package

On your local machine:

```bash
cd /Users/macintosh/Developer/coindcx_client/coindcx-trading-platform

# Create deployment package
./create_deployment_package.sh
# This will create: xcoinalgo-backend-v1.0.0.tar.gz
```

#### Step 2: Friend Uploads and Runs

Send your friend the `.tar.gz` file and this script:

**`deploy.sh`** (Friend runs this on his server):
```bash
#!/bin/bash

# XcoinAlgo Backend Deployment Script
# Run as: sudo ./deploy.sh

set -e  # Exit on error

echo "🚀 XcoinAlgo Backend Deployment Starting..."

# 1. Install dependencies
echo "📦 Installing system dependencies..."
apt update
apt install -y curl git build-essential python3 python3-pip nginx

# 2. Install Node.js 20
echo "📦 Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 3. Install PM2
echo "📦 Installing PM2..."
npm install -g pm2

# 4. Create application directory
echo "📁 Setting up application directory..."
mkdir -p /home/ubuntu/xcoinalgo
cd /home/ubuntu/xcoinalgo

# 5. Extract deployment package
echo "📦 Extracting application files..."
tar -xzf ~/xcoinalgo-backend-v*.tar.gz

# 6. Setup Backend
echo "🔧 Setting up backend..."
cd backend
npm install --production

# Create .env file
cat > .env <<EOF
PORT=3001
NODE_ENV=production
DATABASE_URL=file:./prisma/dev.db
JWT_SECRET=$(openssl rand -base64 32)
COINDCX_API_KEY=your_api_key_here
COINDCX_API_SECRET=your_api_secret_here
EOF

# Run database migrations
npx prisma generate
npx prisma migrate deploy

# Build backend
npm run build

# 7. Setup Strategy Executor
echo "🔧 Setting up strategy executor..."
cd ../strategy-executor
pip3 install -r requirements.txt

# 8. Start services with PM2
echo "🚀 Starting services..."
cd /home/ubuntu/xcoinalgo

# Start backend
pm2 start backend/dist/index.js --name backend --node-args="--max-old-space-size=512"

# Start strategy executor
pm2 start strategy-executor/main.py --name strategy-executor --interpreter python3

# Save PM2 configuration
pm2 save
pm2 startup

echo "✅ Deployment complete!"
echo ""
echo "Services running:"
pm2 status
echo ""
echo "🌐 Backend API: http://$(curl -s ifconfig.me):3001"
echo ""
echo "📝 Next steps:"
echo "1. Update frontend NEXT_PUBLIC_BACKEND_URL to point to this server"
echo "2. Configure Nginx reverse proxy (optional)"
echo "3. Set up SSL certificate (optional)"
```

---

### Method 2: GitHub Actions CI/CD (Best for Ongoing Updates)

**Set up automatic deployments when you push to GitHub**

#### Step 1: Friend Creates Deploy User on His Server

```bash
# On friend's server
sudo adduser deploy
sudo usermod -aG sudo deploy
sudo mkdir -p /home/deploy/.ssh
sudo chown deploy:deploy /home/deploy/.ssh
sudo chmod 700 /home/deploy/.ssh
```

#### Step 2: Friend Generates Deploy SSH Key

```bash
# On friend's server
sudo su - deploy
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/github_deploy
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# Show private key (copy this)
cat ~/.ssh/github_deploy
```

#### Step 3: You Set Up GitHub Actions

Add the private key as GitHub Secret:
1. Go to: https://github.com/punksapien/xcoinalgo/settings/secrets/actions
2. Add secret: `DEPLOY_SSH_KEY` = (paste private key)
3. Add secret: `DEPLOY_HOST` = (friend's server IP)
4. Add secret: `DEPLOY_USER` = `deploy`

Create `.github/workflows/deploy-backend.yml`:

```yaml
name: Deploy Backend

on:
  push:
    branches: [main]
    paths:
      - 'backend/**'
      - 'strategy-executor/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Deploy to Server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            cd /home/ubuntu/xcoinalgo
            git pull origin main

            # Update backend
            cd backend
            npm install
            npm run build
            pm2 restart backend

            # Update strategy executor
            cd ../strategy-executor
            pip3 install -r requirements.txt
            pm2 restart strategy-executor

            pm2 save
```

Now every push to `main` auto-deploys!

---

### Method 3: Docker (Cleanest)

**Create Docker images, friend just runs containers**

#### Step 1: You Create Dockerfiles

Already exists in your repo! Just need docker-compose:

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=file:/app/prisma/dev.db
    volumes:
      - backend-data:/app/prisma
    restart: unless-stopped

  strategy-executor:
    build: ./strategy-executor
    environment:
      - BACKEND_URL=http://backend:3001
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  backend-data:
```

#### Step 2: Friend Runs Docker

```bash
# On friend's server
sudo apt install docker.io docker-compose
sudo systemctl enable docker

# Clone repo (or you send him docker-compose file)
git clone https://github.com/punksapien/xcoinalgo.git
cd xcoinalgo

# Start services
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose ps
docker-compose logs -f
```

---

## Security Configuration (Friend Needs to Do)

### 1. Firewall Setup
```bash
# Allow only necessary ports
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 3001/tcp  # Backend API
sudo ufw enable
```

### 2. Environment Variables (Sensitive!)
Friend needs to set these in `/home/ubuntu/xcoinalgo/backend/.env`:

```bash
PORT=3001
NODE_ENV=production
DATABASE_URL=file:./prisma/dev.db

# Generate secure JWT secret
JWT_SECRET=$(openssl rand -base64 32)

# CoinDCX API credentials (friend gets these from CoinDCX)
COINDCX_API_KEY=xxx
COINDCX_API_SECRET=xxx

# Email (optional)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=xxx@gmail.com
EMAIL_PASSWORD=xxx
```

### 3. Nginx Reverse Proxy (Optional but Recommended)

```nginx
# /etc/nginx/sites-available/xcoinalgo-backend
server {
    listen 80;
    server_name api.yourdomain.com;  # Or use IP

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable:
```bash
sudo ln -s /etc/nginx/sites-available/xcoinalgo-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Monitoring & Maintenance

### Check Services Status
```bash
pm2 status
pm2 logs backend --lines 50
pm2 logs strategy-executor --lines 50
```

### Update Application
```bash
cd /home/ubuntu/xcoinalgo
git pull origin main
cd backend && npm install && npm run build && pm2 restart backend
cd ../strategy-executor && pip3 install -r requirements.txt && pm2 restart strategy-executor
```

### Backup Database
```bash
# Backup
cp /home/ubuntu/xcoinalgo/backend/prisma/dev.db ~/backup-$(date +%Y%m%d).db

# Restore
cp ~/backup-20241006.db /home/ubuntu/xcoinalgo/backend/prisma/dev.db
pm2 restart backend
```

---

## Troubleshooting

### Services Won't Start
```bash
# Check logs
pm2 logs backend --lines 100
pm2 logs strategy-executor --lines 100

# Check Node.js version
node --version  # Should be 20.x

# Check Python version
python3 --version  # Should be 3.10+

# Restart services
pm2 restart all
```

### Out of Memory
```bash
# Check memory
free -h

# If low memory, increase swap
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Backend Not Accessible
```bash
# Check if port 3001 is listening
sudo netstat -tulpn | grep 3001

# Check firewall
sudo ufw status

# Check Nginx (if using)
sudo nginx -t
sudo systemctl status nginx
```

---

## What You Need to Provide Friend

### Minimum:
1. **This deployment guide** (this file)
2. **Deployment package** (tar.gz) or GitHub repo access
3. **Environment variable values**:
   - CoinDCX API credentials
   - Any other secrets

### Optional:
1. **Deploy script** (automated deployment)
2. **Docker compose file** (if using Docker)
3. **Monitoring dashboard credentials**

---

## Communication Checklist

**Before friend starts:**
- [ ] Friend has EC2 instance running Ubuntu 22.04
- [ ] Friend has SSH access to server
- [ ] Friend has sudo permissions
- [ ] You've sent deployment package or repo URL
- [ ] You've sent all required secrets/API keys

**After deployment:**
- [ ] Friend shares backend IP/domain
- [ ] You update Vercel frontend to point to new backend
- [ ] You test API connectivity
- [ ] You verify CORS is configured correctly
- [ ] Friend monitors for 24-48 hours

---

## Server Specifications Recommendation

**Minimum:**
- vCPU: 2
- RAM: 2GB
- Storage: 20GB
- Network: 1Gbps

**Recommended:**
- vCPU: 2-4
- RAM: 4GB
- Storage: 40GB
- Network: 1Gbps

**Note**: t2.micro (1GB RAM) is too small - builds will fail!

---

## Cost Estimate

If friend is providing AWS:
- t2.small: ~$17/month
- t3.small: ~$15/month
- t3.medium: ~$30/month (recommended for production)

Friend saves you $15-30/month by hosting backend! 🎉
