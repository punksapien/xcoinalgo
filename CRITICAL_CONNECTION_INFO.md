# CRITICAL CONNECTION INFO - READ THIS FIRST

## AWS EC2 Connection

### Instance Details
- **Instance ID**: `i-0129c74fc2c0a83f3`
- **Public IP**: `13.53.120.232`
- **Region**: `eu-north-1` (Stockholm)
- **Instance Type**: t2.micro (or t3.micro)
- **OS**: Ubuntu 22.04 LTS
- **Username**: `ubuntu`

### SSH Connection
**SSH Key Location**: `/Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem`

```bash
# Connect to EC2
ssh -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem ubuntu@13.53.120.232

# Copy files to EC2
scp -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem LOCAL_FILE ubuntu@13.53.120.232:~/REMOTE_PATH

# Rsync files to EC2
rsync -avz -e "ssh -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem" LOCAL_DIR/ ubuntu@13.53.120.232:~/REMOTE_DIR/
```

### AWS CLI Commands
```bash
# List EC2 instances
aws ec2 describe-instances --region eu-north-1

# Reboot instance
aws ec2 reboot-instances --instance-ids i-0129c74fc2c0a83f3 --region eu-north-1

# Stop instance
aws ec2 stop-instances --instance-ids i-0129c74fc2c0a83f3 --region eu-north-1

# Start instance
aws ec2 start-instances --instance-ids i-0129c74fc2c0a83f3 --region eu-north-1
```

---

## GitHub SSH Connection

### GitHub Repository
- **URL**: `https://github.com/punksapien/xcoinalgo`
- **Owner**: punksapien
- **SSH Clone URL**: `git@github.com:punksapien/xcoinalgo.git`

### SSH Key for GitHub
**SSH Key Location**: `~/.ssh/punksapien_github`

### Git Commands with SSH
```bash
# Clone repository
GIT_SSH_COMMAND="ssh -i ~/.ssh/punksapien_github" git clone git@github.com:punksapien/xcoinalgo.git

# Add remote (if needed)
git remote add origin git@github.com:punksapien/xcoinalgo.git

# Push to GitHub
GIT_SSH_COMMAND="ssh -i ~/.ssh/punksapien_github" git push origin main

# Pull from GitHub
GIT_SSH_COMMAND="ssh -i ~/.ssh/punksapien_github" git pull origin main

# Push tags
GIT_SSH_COMMAND="ssh -i ~/.ssh/punksapien_github" git push origin v1.0.0
```

### Git Configuration
```bash
# User details (already configured)
git config user.email "donquixotesoup@gmail.com"
git config user.name "punksapien"
```

---

## Local Repository Paths

### Main Project Directory (ONLY Git Repo)
```
/Users/macintosh/Developer/coindcx_client/coindcx-trading-platform/
├── frontend/          # Next.js frontend
├── backend/           # Express backend
├── strategy-executor/ # Python strategy executor
├── python-sdk/        # SDK for quant researchers
└── [documentation files]
```

**✅ IMPORTANT**: Only this directory has Git tracking. Always work from:
```bash
cd /Users/macintosh/Developer/coindcx_client/coindcx-trading-platform
```

**Backup**: Old duplicate directories backed up to `~/Desktop/coindcx_backup_*.tar.gz`

---

## EC2 Application Paths

### Application Location on EC2
```
/home/ubuntu/xcoinalgo/
├── frontend/          # Next.js app on port 3000
├── backend/           # Express API on port 3001
└── strategy-executor/ # Python executor
```

### PM2 Process Management
```bash
# SSH into EC2 first
ssh -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem ubuntu@13.53.120.232

# View all processes
pm2 status

# View logs
pm2 logs
pm2 logs frontend --lines 50
pm2 logs backend --lines 50

# Restart services
pm2 restart frontend
pm2 restart backend
pm2 restart strategy-executor

# Stop/Start
pm2 stop frontend
pm2 start frontend

# Delete and recreate
pm2 delete frontend
pm2 start npm --name frontend -- run dev
pm2 save
```

---

## Domain & DNS

### Domain
- **Domain**: xcoinalgo.com
- **Registrar**: GoDaddy
- **DNS Status**: ✅ Configured correctly

### Current DNS Configuration
```
A Record:     @    → 13.53.120.232
CNAME Record: www  → xcoinalgo.com
```

**Status**: ✅ DNS is clean and working. Domain forwarding has been removed.

---

## Service Ports

### On EC2
- **Port 80**: HTTP (Nginx reverse proxy)
- **Port 443**: HTTPS (SSL enabled)
- **Port 3000**: Frontend (Next.js)
- **Port 3001**: Backend (Express API)
- **Port 22**: SSH

### Security Group
Inbound rules configured:
- Port 22 (SSH) from your IP (49.36.73.67/32)
- Port 80 (HTTP) from 0.0.0.0/0
- Port 443 (HTTPS) from 0.0.0.0/0

---

## Environment Variables

### Frontend (.env.local)
```bash
NEXT_PUBLIC_BACKEND_URL=http://13.53.120.232:3001
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
NEXTAUTH_SECRET=your_nextauth_secret
NEXTAUTH_URL=http://xcoinalgo.com
```

### Backend (.env)
```bash
PORT=3001
DATABASE_URL=your_database_url
JWT_SECRET=your_jwt_secret
```

---

## Quick Reference Commands

### Deploy Frontend Changes
```bash
# On local machine
cd /Users/macintosh/Developer/coindcx_client/coindcx-trading-platform/frontend

# Build (currently has issues, using dev mode)
npm run build

# Upload
rsync -avz -e "ssh -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem" \
  .next/ ubuntu@13.53.120.232:~/xcoinalgo/frontend/.next/

# Restart on EC2
ssh -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem ubuntu@13.53.120.232 \
  "pm2 restart frontend"
```

### Deploy Backend Changes
```bash
# On local machine
cd /Users/macintosh/Developer/coindcx_client/coindcx-trading-platform/backend

# Upload
rsync -avz --exclude node_modules -e "ssh -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem" \
  . ubuntu@13.53.120.232:~/xcoinalgo/backend/

# Restart on EC2
ssh -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem ubuntu@13.53.120.232 \
  "cd ~/xcoinalgo/backend && npm install && pm2 restart backend"
```

### Push SDK Updates to GitHub
```bash
cd /Users/macintosh/Developer/coindcx_client/coindcx-trading-platform

# Stage changes
git add python-sdk/

# Commit
git commit -m "Update SDK version"

# Push with SSH key
GIT_SSH_COMMAND="ssh -i ~/.ssh/punksapien_github" git push origin main
```

---

## SSL Certificate (✅ ACTIVE)

### Certificate Details
- **Status**: ✅ Active and working
- **Domains**: xcoinalgo.com, www.xcoinalgo.com
- **Issuer**: Let's Encrypt
- **Expires**: January 4, 2026
- **Auto-renewal**: Enabled (Certbot runs daily via systemd timer)
- **Certificate Location**: `/etc/letsencrypt/live/xcoinalgo.com/fullchain.pem`
- **Private Key Location**: `/etc/letsencrypt/live/xcoinalgo.com/privkey.pem`

### Certificate Management
```bash
# Check certificate status
ssh -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem ubuntu@13.53.120.232 \
  "sudo certbot certificates"

# Manually renew certificate (auto-renewal is enabled)
ssh -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem ubuntu@13.53.120.232 \
  "sudo certbot renew"

# Test auto-renewal (dry run)
ssh -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem ubuntu@13.53.120.232 \
  "sudo certbot renew --dry-run"
```

### Nginx HTTPS Configuration
Certbot automatically configured Nginx for HTTPS:
- HTTP (port 80) redirects to HTTPS (port 443)
- HTTPS configuration at: `/etc/nginx/sites-enabled/xcoinalgo`
- SSL settings optimized by Certbot

---

## Troubleshooting

### Can't SSH to EC2?
1. Check instance is running: `aws ec2 describe-instances --instance-ids i-0129c74fc2c0a83f3 --region eu-north-1`
2. Check security group allows SSH from your IP
3. Verify key permissions: `chmod 400 /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem`

### Can't push to GitHub?
1. Test SSH key: `ssh -i ~/.ssh/punksapien_github -T git@github.com`
2. Check remote URL: `git remote -v`
3. Use GIT_SSH_COMMAND for all git operations

### Frontend not loading?
1. Check PM2: `ssh ... "pm2 status"`
2. Check logs: `ssh ... "pm2 logs frontend --lines 50"`
3. Check Nginx: `ssh ... "sudo nginx -t && sudo systemctl status nginx"`

### Services crashed after reboot?
```bash
ssh -i /Users/macintosh/Developer/coindcx_client/coindcx-new-key.pem ubuntu@13.53.120.232
pm2 resurrect  # Restore saved processes
# or
pm2 startup    # Configure auto-start
pm2 save       # Save current process list
```

---

## IMPORTANT NOTES

1. **Always use the SSH key** when connecting to EC2 or GitHub
2. **Work from the correct directory**: `/Users/macintosh/Developer/coindcx_client/coindcx-trading-platform/`
3. **Frontend is running in DEV MODE** (not production) due to build issues
4. **SSL is active** - site accessible via HTTPS with auto-renewal enabled
5. **EC2 is t2.micro** - limited resources, builds may freeze (build locally instead)
6. **SSL certificate auto-renews** every 90 days via Certbot systemd timer

---

## Access URLs

- **Website**: https://xcoinalgo.com (✅ HTTPS with SSL)
- **Website (HTTP)**: http://xcoinalgo.com (auto-redirects to HTTPS)
- **Direct IP**: http://13.53.120.232
- **API**: http://13.53.120.232:3001/api
- **GitHub**: https://github.com/punksapien/xcoinalgo
- **SDK Install**: `pip install git+https://github.com/punksapien/xcoinalgo.git#subdirectory=python-sdk`
