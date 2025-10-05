# XCoinAlgo Deployment Guide

Complete guide for accessing AWS EC2, managing GitHub, and deploying the CoinDCX Trading Platform.

---

## Table of Contents
1. [AWS Configuration](#aws-configuration)
2. [GitHub Configuration](#github-configuration)
3. [SSH Access to EC2](#ssh-access-to-ec2)
4. [Deploying Code Changes](#deploying-code-changes)
5. [Managing Services](#managing-services)
6. [DNS & SSL Configuration](#dns--ssl-configuration)
7. [Troubleshooting](#troubleshooting)

---

## AWS Configuration

### EC2 Instance Details
- **Instance ID**: `i-0129c74fc2c0a83f3`
- **Instance Type**: `t3.small` (2 vCPU, 2GB RAM)
- **Region**: `eu-north-1` (Stockholm)
- **Operating System**: Ubuntu 22.04 LTS
- **Key Pair Name**: `coindcx-new-key`
- **Security Group**: `cdcxb-sg` (sg-0fdab810dd2d4fce2)

### Elastic IP (Static IP)
- **Public IP**: `13.53.120.232`
- **Allocation ID**: `eipalloc-00a66db9062e328c2`
- **Purpose**: Static IP that doesn't change when instance restarts

### SSH Key Location
```bash
/Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem
```

### Security Group Rules
Open ports:
- **22** (SSH) - For remote access
- **80** (HTTP) - For web traffic
- **443** (HTTPS) - For secure web traffic

### AWS CLI Commands

#### Check instance status
```bash
aws ec2 describe-instances --instance-ids i-0129c74fc2c0a83f3
```

#### Start instance
```bash
aws ec2 start-instances --instance-ids i-0129c74fc2c0a83f3
```

#### Stop instance
```bash
aws ec2 stop-instances --instance-ids i-0129c74fc2c0a83f3
```

#### Reboot instance
```bash
aws ec2 reboot-instances --instance-ids i-0129c74fc2c0a83f3
```

---

## GitHub Configuration

### Repository
- **URL**: https://github.com/punksapien/xcoinalgo
- **Owner**: punksapien
- **Branch**: main

### SSH Configuration

Your local SSH config (`~/.ssh/config`) contains:

```ssh
Host github.com-punksapien
  HostName github.com
  User git
  IdentityFile ~/.ssh/punksapien_github
  IdentitiesOnly yes
```

### SSH Key Location
```bash
~/.ssh/punksapien_github
```

### Verify GitHub SSH Access
```bash
ssh -T git@github.com-punksapien
# Should output: Hi punksapien! You've successfully authenticated...
```

### Git Configuration for Pushing

When working in the local repository:

```bash
# Navigate to project directory
cd /Users/macintosh/Developer/coindcx_client/coindcx-trading-platform

# Check current remote
git remote -v

# If remote is HTTPS, switch to SSH
git remote set-url origin git@github.com-punksapien:punksapien/xcoinalgo.git

# Verify
git remote -v
```

### Pushing Code to GitHub

```bash
# Add changes
git add .

# Commit with message
git commit -m "Your commit message"

# Push to GitHub using SSH
GIT_SSH_COMMAND="ssh -i ~/.ssh/punksapien_github" git push origin main

# Or if remote is configured for SSH alias
git push origin main
```

---

## SSH Access to EC2

### Basic SSH Command
```bash
ssh -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem ubuntu@13.53.120.232
```

### Create SSH Alias (Optional)

Add to `~/.ssh/config`:

```ssh
Host xcoinalgo-ec2
  HostName 13.53.120.232
  User ubuntu
  IdentityFile /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem
  IdentitiesOnly yes
```

Then SSH using:
```bash
ssh xcoinalgo-ec2
```

### Common SSH Operations

#### Copy files TO EC2
```bash
scp -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem local-file.txt ubuntu@13.53.120.232:~/
```

#### Copy files FROM EC2
```bash
scp -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem ubuntu@13.53.120.232:~/remote-file.txt ./
```

#### Run remote command without SSH session
```bash
ssh -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem ubuntu@13.53.120.232 "pm2 status"
```

---

## Deploying Code Changes

### Project Structure on EC2
```
~/xcoinalgo/
├── backend/           # Express.js backend (port 3001)
├── frontend/          # Next.js frontend (port 3000)
├── strategy-runner/
│   └── python/        # Python strategy executor (port 8003)
└── ecosystem.config.js # PM2 configuration
```

### Deployment Workflow

#### 1. Push code to GitHub (from local machine)
```bash
# Navigate to project
cd /Users/macintosh/Developer/coindcx_client/coindcx-trading-platform

# Stage changes
git add .

# Commit
git commit -m "Description of changes"

# Push to GitHub
GIT_SSH_COMMAND="ssh -i ~/.ssh/punksapien_github" git push origin main
```

#### 2. Pull changes on EC2
```bash
# SSH into EC2
ssh -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem ubuntu@13.53.120.232

# Navigate to project
cd ~/xcoinalgo

# Pull latest changes
git pull origin main
```

#### 3. Restart affected services

**Backend changes:**
```bash
cd ~/xcoinalgo/backend
npm install  # If package.json changed
pm2 restart backend
```

**Frontend changes:**
```bash
cd ~/xcoinalgo/frontend
npm install  # If package.json changed
pm2 restart frontend
```

**Python strategy changes:**
```bash
cd ~/xcoinalgo/strategy-runner/python
source .venv/bin/activate
uv pip install -r requirements.txt  # If dependencies changed
pm2 restart strategy-executor
```

**Database schema changes:**
```bash
cd ~/xcoinalgo/backend
npx prisma migrate deploy  # Apply migrations
npx prisma generate        # Regenerate Prisma client
pm2 restart backend
```

---

## Managing Services

### PM2 Process Manager

All services run via PM2 for auto-restart and process management.

#### View all services
```bash
pm2 status
```

#### View logs
```bash
# All services
pm2 logs

# Specific service
pm2 logs backend
pm2 logs frontend
pm2 logs strategy-executor

# Last 50 lines
pm2 logs backend --lines 50
```

#### Restart services
```bash
# Restart all
pm2 restart all

# Restart specific service
pm2 restart backend
pm2 restart frontend
pm2 restart strategy-executor
```

#### Stop services
```bash
pm2 stop backend
pm2 stop frontend
pm2 stop strategy-executor
```

#### Start services
```bash
pm2 start backend
pm2 start frontend
pm2 start strategy-executor
```

#### Restart all services from ecosystem config
```bash
cd ~/xcoinalgo
pm2 start ecosystem.config.js
```

#### Save PM2 configuration (for auto-start on reboot)
```bash
pm2 save
pm2 startup  # Run the command it outputs
```

### Nginx Web Server

#### Check Nginx status
```bash
sudo systemctl status nginx
```

#### Restart Nginx
```bash
sudo systemctl restart nginx
```

#### Reload Nginx (zero downtime)
```bash
sudo systemctl reload nginx
```

#### Test Nginx configuration
```bash
sudo nginx -t
```

#### View Nginx error logs
```bash
sudo tail -f /var/log/nginx/error.log
```

#### Edit Nginx configuration
```bash
sudo nano /etc/nginx/sites-available/xcoinalgo
```

---

## DNS & SSL Configuration

### Domain Configuration

**Domain**: xcoinalgo.com
**Registrar**: GoDaddy

#### Required DNS Records (in GoDaddy)

1. Go to: GoDaddy → My Products → Domains → xcoinalgo.com → DNS
2. **Remove any "Forwarding" settings**
3. Add these A records:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | 13.53.120.232 | 600 |
| A | www | 13.53.120.232 | 600 |

#### Check DNS propagation
```bash
# From local machine
dig +short xcoinalgo.com A
dig +short www.xcoinalgo.com A

# Should return: 13.53.120.232
```

### SSL Certificate Setup (Let's Encrypt)

#### Install Certbot
```bash
# SSH into EC2
ssh -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem ubuntu@13.53.120.232

# Install Certbot
sudo apt update
sudo apt install certbot python3-certbot-nginx -y
```

#### Update Nginx for domain
```bash
# Edit Nginx config
sudo nano /etc/nginx/sites-available/xcoinalgo

# Change:
# server_name _;
# To:
# server_name xcoinalgo.com www.xcoinalgo.com;

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

#### Obtain SSL certificate
```bash
sudo certbot --nginx -d xcoinalgo.com -d www.xcoinalgo.com
```

Follow the prompts:
- Enter email address
- Agree to terms
- Choose whether to redirect HTTP to HTTPS (choose YES)

#### Verify auto-renewal
```bash
sudo certbot renew --dry-run
```

Certificates auto-renew every 90 days via systemd timer.

---

## Troubleshooting

### Service Not Responding

```bash
# Check PM2 status
pm2 status

# Check service logs
pm2 logs backend --lines 100

# Restart service
pm2 restart backend
```

### Database Issues

```bash
# Check database file
cd ~/xcoinalgo/backend
ls -lh prisma/prod.db

# Regenerate Prisma client
npx prisma generate

# Reset database (CAUTION: deletes all data)
npx prisma migrate reset
```

### Port Already in Use

```bash
# Find process using port 3001
sudo lsof -i :3001

# Kill process
sudo kill -9 <PID>

# Or restart service via PM2
pm2 restart backend
```

### Nginx 502 Bad Gateway

Usually means backend service is down:

```bash
# Check backend status
pm2 status backend

# Check backend logs
pm2 logs backend --lines 50

# Restart backend
pm2 restart backend
```

### Git Issues on EC2

```bash
# If pull fails with conflicts
git stash              # Save local changes
git pull origin main   # Pull from GitHub
git stash pop          # Restore local changes

# Reset to remote state (CAUTION: loses local changes)
git fetch origin
git reset --hard origin/main
```

### Out of Memory

```bash
# Check memory usage
free -h

# Check top processes
htop

# Restart services to free memory
pm2 restart all
```

### Check Service Ports

```bash
# Check what's running on each port
sudo lsof -i :3000  # Frontend
sudo lsof -i :3001  # Backend
sudo lsof -i :8003  # Strategy executor
sudo lsof -i :80    # Nginx
```

---

## Environment Variables

### Backend (.env location)
```
~/xcoinalgo/backend/.env
```

Key variables:
```env
DATABASE_URL="file:./prisma/prod.db"
JWT_SECRET="<generated>"
SESSION_SECRET="<generated>"
STRATEGY_EXECUTOR_URL="http://localhost:8003"
FRONTEND_URL="http://xcoinalgo.com"
GOOGLE_CLIENT_ID="<optional>"
GOOGLE_CLIENT_SECRET="<optional>"
```

### Frontend (.env location)
```
~/xcoinalgo/frontend/.env
```

Key variables:
```env
NEXT_PUBLIC_BACKEND_URL="http://xcoinalgo.com/api"
NODE_ENV="production"
```

### Edit environment variables
```bash
# Backend
nano ~/xcoinalgo/backend/.env

# Frontend
nano ~/xcoinalgo/frontend/.env

# After editing, restart services
pm2 restart backend
pm2 restart frontend
```

---

## Quick Reference Commands

### Daily Operations
```bash
# SSH into server
ssh -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem ubuntu@13.53.120.232

# Check all services
pm2 status

# View logs
pm2 logs

# Pull latest code
cd ~/xcoinalgo && git pull origin main

# Restart all services
pm2 restart all
```

### Push Code from Local
```bash
cd /Users/macintosh/Developer/coindcx_client/coindcx-trading-platform
git add .
git commit -m "Your message"
GIT_SSH_COMMAND="ssh -i ~/.ssh/punksapien_github" git push origin main
```

### Emergency Restart
```bash
# SSH into EC2
ssh -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem ubuntu@13.53.120.232

# Restart everything
pm2 restart all
sudo systemctl restart nginx
```

---

## Cost Monitoring

**Monthly estimate for t3.small**: ~$15/month
**Your budget**: $70 for 2 months

### Check AWS costs
```bash
# Via AWS Console
# Go to: AWS Console → Billing Dashboard → Cost Explorer
```

### Reduce costs if needed
- Stop instance when not in use: `aws ec2 stop-instances --instance-ids i-0129c74fc2c0a83f3`
- Downgrade to t3.micro (1 vCPU, 1GB RAM): ~$8/month
- Release Elastic IP if instance is stopped (charged $0.005/hour when not associated)

---

**Last Updated**: 2025-10-05
**Maintained By**: punksapien
