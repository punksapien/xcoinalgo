#!/bin/bash

# XcoinAlgo Backend Deployment Package Creator
# Creates a deployment package that your friend can run on his AWS server

set -e

echo "📦 Creating XcoinAlgo Backend Deployment Package..."

VERSION="1.0.0"
PACKAGE_NAME="xcoinalgo-backend-v${VERSION}.tar.gz"

# Create temporary directory
TEMP_DIR=$(mktemp -d)
DEPLOY_DIR="${TEMP_DIR}/xcoinalgo"

echo "📁 Preparing files..."

# Create deployment directory structure
mkdir -p "${DEPLOY_DIR}"

# Copy backend
echo "  → Copying backend..."
cp -r backend "${DEPLOY_DIR}/"
rm -rf "${DEPLOY_DIR}/backend/node_modules"
rm -rf "${DEPLOY_DIR}/backend/dist"
rm -f "${DEPLOY_DIR}/backend/.env"

# Copy strategy executor
echo "  → Copying strategy executor..."
cp -r strategy-executor "${DEPLOY_DIR}/"
rm -rf "${DEPLOY_DIR}/strategy-executor/__pycache__"
rm -rf "${DEPLOY_DIR}/strategy-executor/.venv"

# Copy deployment script
echo "  → Creating deployment script..."
cat > "${DEPLOY_DIR}/deploy.sh" <<'EOF'
#!/bin/bash

# XcoinAlgo Backend Deployment Script
# Run as: sudo ./deploy.sh

set -e

echo "🚀 XcoinAlgo Backend Deployment Starting..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run as root (sudo ./deploy.sh)"
    exit 1
fi

# 1. Install dependencies
echo "📦 Installing system dependencies..."
apt update
apt install -y curl git build-essential python3 python3-pip nginx

# 2. Install Node.js 20
echo "📦 Installing Node.js 20..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
else
    echo "  ✅ Node.js already installed: $(node --version)"
fi

# 3. Install PM2
echo "📦 Installing PM2..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
else
    echo "  ✅ PM2 already installed"
fi

# 4. Create application directory
echo "📁 Setting up application directory..."
APP_DIR="/home/ubuntu/xcoinalgo"
mkdir -p "$APP_DIR"

# Copy files
echo "📦 Copying application files..."
cp -r backend "$APP_DIR/"
cp -r strategy-executor "$APP_DIR/"

# 5. Setup Backend
echo "🔧 Setting up backend..."
cd "$APP_DIR/backend"

# Install dependencies
npm install --production

# Create .env file if not exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    JWT_SECRET=$(openssl rand -base64 32)
    cat > .env <<ENVEOF
PORT=3001
NODE_ENV=production
DATABASE_URL=file:./prisma/dev.db
JWT_SECRET=${JWT_SECRET}

# TODO: Add your CoinDCX API credentials
COINDCX_API_KEY=your_api_key_here
COINDCX_API_SECRET=your_api_secret_here

# TODO: Add email config (optional)
# EMAIL_HOST=smtp.gmail.com
# EMAIL_PORT=587
# EMAIL_USER=your_email@gmail.com
# EMAIL_PASSWORD=your_password
ENVEOF
    echo "⚠️  IMPORTANT: Edit $APP_DIR/backend/.env and add your API credentials!"
fi

# Run database migrations
echo "📊 Setting up database..."
npx prisma generate
npx prisma migrate deploy

# Build backend
echo "🔨 Building backend..."
npm run build

# 6. Setup Strategy Executor
echo "🔧 Setting up strategy executor..."
cd "$APP_DIR/strategy-executor"
pip3 install -r requirements.txt

# 7. Stop existing services if running
echo "🛑 Stopping existing services (if any)..."
pm2 delete backend 2>/dev/null || true
pm2 delete strategy-executor 2>/dev/null || true

# 8. Start services with PM2
echo "🚀 Starting services..."
cd "$APP_DIR"

# Start backend
pm2 start backend/dist/index.js --name backend --node-args="--max-old-space-size=512"

# Start strategy executor
pm2 start strategy-executor/main.py --name strategy-executor --interpreter python3

# Save PM2 configuration
pm2 save
pm2 startup

# Set ownership
chown -R ubuntu:ubuntu "$APP_DIR"

echo ""
echo "✅ Deployment complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Services Status:"
pm2 status
echo ""
echo "🌐 Backend API: http://$(curl -s ifconfig.me):3001"
echo "📁 Application Directory: $APP_DIR"
echo ""
echo "📝 IMPORTANT Next Steps:"
echo "1. Edit $APP_DIR/backend/.env and add your CoinDCX API credentials"
echo "2. Restart backend: pm2 restart backend"
echo "3. Update frontend NEXT_PUBLIC_BACKEND_URL to point to this server"
echo "4. Configure firewall: sudo ufw allow 3001/tcp"
echo "5. (Optional) Setup Nginx reverse proxy for SSL"
echo ""
echo "📖 View logs:"
echo "  pm2 logs backend"
echo "  pm2 logs strategy-executor"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
EOF

chmod +x "${DEPLOY_DIR}/deploy.sh"

# Create README
cat > "${DEPLOY_DIR}/README.md" <<'EOF'
# XcoinAlgo Backend Deployment Package

## Quick Start

1. Upload this entire folder to your server
2. SSH into your server
3. Run: `sudo ./deploy.sh`
4. Edit `.env` file with your API credentials
5. Restart: `pm2 restart backend`

## Requirements

- Ubuntu 22.04 LTS
- 2GB+ RAM (t2.small or larger)
- 20GB+ storage
- Root/sudo access

## Deployment

```bash
# Upload files
scp -r xcoinalgo ubuntu@your-server-ip:~/

# SSH into server
ssh ubuntu@your-server-ip

# Run deployment
cd ~/xcoinalgo
sudo ./deploy.sh

# After deployment, configure your API keys
sudo nano /home/ubuntu/xcoinalgo/backend/.env

# Restart backend
pm2 restart backend
```

## What Gets Installed

- Node.js 20.x
- PM2 (process manager)
- Python 3 + pip
- Backend dependencies
- Strategy executor dependencies

## Services

After deployment, two services run via PM2:

1. **backend** - REST API on port 3001
2. **strategy-executor** - Background Python service

## Monitoring

```bash
# Check status
pm2 status

# View logs
pm2 logs backend
pm2 logs strategy-executor

# Restart services
pm2 restart backend
pm2 restart strategy-executor
```

## Troubleshooting

If services fail to start:
```bash
pm2 logs backend --lines 100
pm2 logs strategy-executor --lines 100
```

Common issues:
- Missing API credentials in .env
- Insufficient memory (need 2GB+)
- Port 3001 already in use

## Security

After deployment:
1. Configure firewall: `sudo ufw allow 3001/tcp`
2. Update .env with real API credentials
3. Consider setting up Nginx + SSL
4. Restrict backend port to Vercel IPs only (optional)

## Support

For issues, contact the repository owner.
EOF

# Create tarball
echo "📦 Creating deployment package..."
cd "${TEMP_DIR}"
tar -czf "${PACKAGE_NAME}" xcoinalgo/

# Move to current directory
mv "${PACKAGE_NAME}" "${OLDPWD}/"

# Cleanup
rm -rf "${TEMP_DIR}"

echo ""
echo "✅ Deployment package created: ${PACKAGE_NAME}"
echo ""
echo "📤 Next steps:"
echo "1. Send ${PACKAGE_NAME} to your friend"
echo "2. Friend uploads to his AWS server"
echo "3. Friend runs: tar -xzf ${PACKAGE_NAME} && cd xcoinalgo && sudo ./deploy.sh"
echo "4. Friend configures .env with API credentials"
echo "5. You update Vercel frontend with new backend URL"
echo ""
echo "📖 Full instructions in BACKEND_DEPLOYMENT_FOR_FRIEND.md"
