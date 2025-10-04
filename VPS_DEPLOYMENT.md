# VPS Deployment Guide

This guide walks you through deploying the CoinDCX Trading Platform to a VPS for production testing.

## VPS Requirements

### Recommended Specifications
- **CPU**: 2 vCPUs minimum
- **RAM**: 4GB minimum
- **Storage**: 20GB SSD
- **OS**: Ubuntu 22.04 LTS
- **Network**: Good connectivity to CoinDCX servers (India/Singapore)

### Recommended Providers
- **DigitalOcean**: $24/month for 2 CPU / 4GB RAM
- **Linode**: $24/month for similar specs
- **Vultr**: $24/month for similar specs
- **AWS EC2**: t3.medium instance

## Initial VPS Setup

### 1. Connect to VPS
```bash
ssh root@your-vps-ip
```

### 2. Update System
```bash
apt update && apt upgrade -y
apt install -y curl wget git htop
```

### 3. Install Docker
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Verify installation
docker --version
docker-compose --version
```

### 4. Create Application User
```bash
adduser coindcx
usermod -aG docker coindcx
su - coindcx
```

## Deploy the Platform

### 1. Upload Your Code
```bash
# Option A: Git clone (if using private repo)
git clone https://github.com/your-username/your-private-repo.git
cd coindcx-trading-platform

# Option B: SCP upload from local machine
# From your local machine:
# scp -r /path/to/coindcx-trading-platform coindcx@your-vps-ip:~/
```

### 2. Configure Environment
```bash
# Copy environment template
cp .env.example .env

# Edit environment variables
nano .env
```

### 3. Production Environment Variables
```bash
# Database
DATABASE_URL="file:./prod.db"

# Authentication (generate strong secrets)
JWT_SECRET=your-super-secure-jwt-secret-change-this
SESSION_SECRET=your-super-secure-session-secret-change-this

# Service URLs (use your domain or IP)
FRONTEND_URL=https://your-domain.com
BACKEND_URL=https://your-domain.com/api
STRATEGY_RUNNER_URL=http://strategy-runner:8002

# Google OAuth (production credentials)
GOOGLE_CLIENT_ID=your-production-google-client-id
GOOGLE_CLIENT_SECRET=your-production-google-client-secret

# Node Environment
NODE_ENV=production

# Docker Network
DOCKER_NETWORK=coindcx-network

# Resource Limits
DEFAULT_STRATEGY_MEMORY=512m
DEFAULT_STRATEGY_CPU=0.5
```

## SSL and Security Setup

### 1. Install Nginx
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 2. Configure Nginx
```bash
sudo nano /etc/nginx/sites-available/coindcx
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /api/ {
        proxy_pass http://localhost:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 3. Enable Site and Get SSL
```bash
sudo ln -s /etc/nginx/sites-available/coindcx /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com
```

### 4. Configure Firewall
```bash
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## Deploy Application

### 1. Build and Start Services
```bash
cd ~/coindcx-trading-platform

# Build all services
docker-compose build

# Start in production mode
docker-compose up -d

# Check status
docker-compose ps
docker-compose logs -f
```

### 2. Initialize Database
```bash
# Run database migrations
docker-compose exec backend npm run db:migrate
```

### 3. Verify Deployment
```bash
# Check services are running
curl -k https://your-domain.com/api/health

# Check strategy runner
docker-compose exec backend curl http://strategy-runner:8002/health
```

## Monitoring and Maintenance

### 1. Log Monitoring
```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f backend
docker-compose logs -f strategy-runner

# View system resources
htop
docker stats
```

### 2. Backup Strategy
```bash
# Create backup script
nano ~/backup.sh
```

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/home/coindcx/backups"
mkdir -p $BACKUP_DIR

# Backup database
docker-compose exec backend cp prisma/prod.db /tmp/
docker cp $(docker-compose ps -q backend):/tmp/prod.db $BACKUP_DIR/db_backup_$DATE.db

# Backup strategy data
docker run --rm -v coindcx-trading-platform_strategy-data:/data -v $BACKUP_DIR:/backup alpine tar czf /backup/strategy_data_$DATE.tar.gz -C /data .

# Keep only last 7 days of backups
find $BACKUP_DIR -name "*.db" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
```

```bash
chmod +x ~/backup.sh

# Add to crontab for daily backups
crontab -e
# Add line: 0 2 * * * /home/coindcx/backup.sh
```

### 3. Auto-restart on Reboot
```bash
# Create systemd service
sudo nano /etc/systemd/system/coindcx-platform.service
```

```ini
[Unit]
Description=CoinDCX Trading Platform
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/coindcx/coindcx-trading-platform
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
User=coindcx

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable coindcx-platform
sudo systemctl start coindcx-platform
```

## Security Hardening

### 1. SSH Security
```bash
sudo nano /etc/ssh/sshd_config

# Add these lines:
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
Port 2222  # Change default port
```

### 2. Fail2Ban
```bash
sudo apt install -y fail2ban

sudo nano /etc/fail2ban/jail.local
```

```ini
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3

[sshd]
enabled = true
port = 2222
```

### 3. Docker Security
```bash
# Limit Docker logs
echo '{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}' | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker
```

## Troubleshooting

### Common Issues

#### Port Conflicts
```bash
# Check which ports are in use
sudo netstat -tulpn | grep :3000
sudo netstat -tulpn | grep :3001
```

#### Docker Issues
```bash
# Restart Docker services
docker-compose down
docker-compose up -d

# Clean up Docker resources
docker system prune -a
```

#### SSL Certificate Renewal
```bash
# Test renewal
sudo certbot renew --dry-run

# Force renewal if needed
sudo certbot renew --force-renewal
```

#### Database Issues
```bash
# Reset database (CAUTION: This deletes all data)
docker-compose down
docker volume rm coindcx-trading-platform_strategy-data
docker-compose up -d
docker-compose exec backend npm run db:migrate
```

## Performance Monitoring

### Resource Usage
```bash
# Monitor container resources
docker stats

# Monitor system resources
htop
df -h
free -h
```

### Application Metrics
```bash
# Check strategy runner health
curl https://your-domain.com/api/health

# Check active strategies
docker ps | grep strategy

# Monitor logs for errors
docker-compose logs -f --tail=100 | grep ERROR
```

## Scaling Considerations

### Multiple Strategy Runners
```bash
# Scale strategy runner service
docker-compose up -d --scale strategy-runner=3
```

### Load Balancing
For high-load scenarios, consider:
- Multiple VPS instances
- Load balancer (nginx, HAProxy)
- Redis cluster for session storage
- Database replication

---

**Remember**: Test thoroughly with small amounts before deploying large strategies! 🚀