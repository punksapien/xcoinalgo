# CoinDCX Trading Platform

A comprehensive Docker-based trading platform for automated strategy execution with CoinDCX integration.

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Docker Network                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Frontend  │  │   Backend   │  │ Strategy    │         │
│  │   Next.js   │  │   Node.js   │  │ Runner      │         │
│  │   :3000     │  │   :3001     │  │ :8002       │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│         │                │                 │               │
│         └────────────────┼─────────────────┘               │
│                          │                                 │
│  ┌─────────────┐        │        ┌─────────────────────┐   │
│  │   Redis     │        │        │  Strategy Container │   │
│  │   :6379     │        │        │  (Dynamic Python)   │   │
│  └─────────────┘        │        └─────────────────────┘   │
│                         │                                  │
│                         ▼                                  │
│                 Docker Socket                              │
│                 (Strategy Management)                      │
└─────────────────────────────────────────────────────────────┘
```

## 📋 Project Structure

```
coindcx-trading-platform/
├── backend/                    # Node.js/Express backend
│   ├── src/
│   │   ├── routes/            # API endpoints
│   │   ├── services/          # Business logic
│   │   │   ├── dockerProcessManager.ts  # Docker-based strategy management
│   │   │   └── processManager.ts        # Legacy PM2 management
│   │   ├── middleware/        # Express middleware
│   │   ├── config/           # Configuration files
│   │   └── utils/            # Utility functions
│   ├── prisma/               # Database schema & migrations
│   ├── Dockerfile            # Backend container config
│   └── package.json
├── frontend/                   # Next.js frontend
│   ├── src/
│   │   ├── app/              # Next.js app router
│   │   ├── components/       # React components
│   │   └── lib/              # Frontend utilities
│   ├── Dockerfile            # Frontend container config
│   └── package.json
├── strategy-runner/            # Docker strategy execution service
│   ├── src/
│   │   ├── strategyManager.ts # Core strategy management
│   │   ├── index.ts          # Service entry point
│   │   └── utils/            # Service utilities
│   ├── Dockerfile            # Strategy runner container
│   └── package.json
├── strategy-templates/         # Python strategy framework
│   ├── base_strategy.py      # Base strategy class
│   ├── coindcx_client.py     # CoinDCX API client
│   ├── Dockerfile.strategy   # Strategy container template
│   ├── requirements.txt      # Python dependencies
│   └── example_config.json   # Strategy configuration example
├── docker-compose.yml          # Multi-service orchestration
├── .env.example               # Environment configuration template
└── README.md                  # This file
```

## 🚀 Features Implemented

### Core Platform Features
- **User Authentication**: Google OAuth integration with session management
- **Strategy Management**: Upload, validate, and deploy Python trading strategies
- **Bot Deployment**: Deploy strategies as isolated Docker containers
- **Real-time Monitoring**: Strategy performance tracking and health monitoring
- **Position Management**: Track and manage trading positions
- **Order Management**: Execute and monitor trading orders
- **P&L Tracking**: Profit/Loss analysis and reporting

### Docker Infrastructure
- **Containerized Deployment**: All services run in isolated Docker containers
- **Microservice Architecture**: Separate services for frontend, backend, and strategy execution
- **Resource Management**: Configurable CPU and memory limits per strategy
- **Auto-scaling**: Dynamic strategy container management
- **Health Monitoring**: Built-in health checks and automatic recovery

### Strategy Framework
- **Base Strategy Class**: Comprehensive Python framework for strategy development
- **CoinDCX Integration**: Direct API integration for trading operations
- **WebSocket Support**: Real-time market data streaming
- **Risk Management**: Built-in position sizing and risk controls
- **Signal Generation**: Automated trading signal processing

## 🛠️ Technology Stack

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js 5.x
- **Database**: SQLite with Prisma ORM
- **Authentication**: Passport.js with Google OAuth
- **Container Management**: Dockerode
- **Process Management**: Docker (replacing PM2)

### Frontend
- **Framework**: Next.js 14+ (App Router)
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Form Handling**: React Hook Form with Zod validation
- **UI Components**: Custom components with Lucide icons

### Strategy Execution
- **Language**: Python 3.11+
- **API Client**: Custom CoinDCX client
- **Data Processing**: Pandas, NumPy
- **WebSocket**: Real-time market data
- **Containerization**: Docker with resource limits

### Infrastructure
- **Orchestration**: Docker Compose
- **Networking**: Custom bridge network with subnet isolation
- **Storage**: Named volumes for persistent data
- **Monitoring**: Winston logging with health checks
- **Caching**: Redis for session storage and pub/sub

## 📦 Installation & Setup

### Prerequisites
- Docker Desktop
- Node.js 18+
- Python 3.11+
- Git

### Environment Configuration
1. Copy environment template:
   ```bash
   cp .env.example .env
   ```

2. Configure required environment variables:
   ```bash
   # Database
   DATABASE_URL="file:./dev.db"

   # Authentication
   JWT_SECRET=your-jwt-secret-key-change-in-production
   SESSION_SECRET=your-session-secret-key-change-in-production

   # Service URLs
   FRONTEND_URL=http://localhost:3000
   BACKEND_URL=http://localhost:3001
   STRATEGY_RUNNER_URL=http://localhost:8002

   # CoinDCX API (Optional - for default credentials)
   COINDCX_API_KEY=your-coindcx-api-key
   COINDCX_API_SECRET=your-coindcx-api-secret

   # Google OAuth (Optional)
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   ```

### Development Setup

#### Option 1: Docker Compose (Recommended)
```bash
# Start all services
docker-compose up --build

# Start specific service
docker-compose up backend

# View logs
docker-compose logs -f strategy-runner
```

#### Option 2: Local Development
```bash
# Backend
cd backend
npm install
npm run db:generate
npm run db:migrate
npm run dev

# Frontend
cd frontend
npm install
npm run dev

# Strategy Runner
cd strategy-runner
npm install
npm run build
npm run dev
```

### Production Deployment
```bash
# Build and start all services
docker-compose -f docker-compose.yml up -d

# Monitor services
docker-compose ps
docker-compose logs -f
```

## 🔧 API Documentation

### Backend API (Port 3001)

#### Authentication
- `GET /api/auth/google` - Initiate Google OAuth
- `GET /api/auth/google/callback` - OAuth callback
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

#### Bot Management
- `POST /api/bot/deploy` - Deploy a trading bot
- `GET /api/bot/deployments` - List user's bot deployments
- `POST /api/bot/:id/start` - Start a bot
- `POST /api/bot/:id/stop` - Stop a bot
- `DELETE /api/bot/:id` - Delete a bot deployment

#### Position Management
- `GET /api/positions` - Get user positions
- `GET /api/positions/orders` - Get order history
- `GET /api/positions/pnl` - Get P&L summary

#### Broker Integration
- `POST /api/broker/credentials` - Set broker credentials
- `GET /api/broker/credentials` - Get broker credentials
- `GET /api/broker/balance` - Get account balance

### Strategy Runner API (Port 8002)

#### Strategy Management
- `POST /strategies/deploy` - Deploy strategy container
- `GET /strategies/:id/status` - Get strategy status
- `POST /strategies/:id/stop` - Stop strategy container
- `GET /strategies` - List all strategies
- `POST /strategies/validate` - Validate strategy code

#### Monitoring
- `GET /health` - Service health check
- `GET /signals/:id` - Get strategy signals
- `POST /market-data/feed` - Broadcast market data

## 🐍 Strategy Development

### Base Strategy Class
```python
from base_strategy import BaseStrategy
from typing import Dict, Any

class MyStrategy(BaseStrategy):
    def __init__(self):
        super().__init__()
        self.short_ma_period = 10
        self.long_ma_period = 20

    def on_market_data(self, market_data: Dict[str, Any]):
        """Handle incoming market data"""
        # Implement your strategy logic here
        pass

    def on_signal(self, signal: Dict[str, Any]):
        """Handle trading signals"""
        if signal['action'] == 'BUY':
            self.place_order('BUY', signal['quantity'])
        elif signal['action'] == 'SELL':
            self.place_order('SELL', signal['quantity'])

if __name__ == "__main__":
    strategy = MyStrategy()
    strategy.start()
```

### Strategy Configuration
```json
{
  "name": "My Trading Strategy",
  "code": "my_strategy",
  "author": "Your Name",
  "description": "Strategy description",
  "leverage": 10,
  "risk_per_trade": 0.01,
  "pair": "BTCINR",
  "margin_currency": "INR",
  "resolution": "1m",
  "lookback_period": 100,
  "sl_atr_multiplier": 2.0,
  "tp_atr_multiplier": 3.0,
  "max_positions": 1,
  "max_daily_loss": 0.05,
  "custom_params": {
    "short_ma_period": 10,
    "long_ma_period": 20
  }
}
```

## 🔒 Security Features

### Authentication & Authorization
- Google OAuth 2.0 integration
- JWT token-based authentication
- Session-based authorization
- CORS protection with specific origins

### Data Security
- Environment variable configuration
- Encrypted broker credentials storage
- Secure API key management
- Database connection security

### Container Security
- Non-root user execution
- Resource limits enforcement
- Network isolation
- Read-only container filesystems where possible

## 📊 Monitoring & Logging

### Health Checks
- Service-level health endpoints
- Container health monitoring
- Automatic restart on failure
- Resource usage monitoring

### Logging
- Structured logging with Winston
- Centralized log collection
- Error tracking and alerting
- Performance metrics

### Strategy Monitoring
- Real-time P&L tracking
- Trade execution monitoring
- Risk metric calculation
- Performance analytics

## 🚀 Deployment

### Docker Services
```bash
# Build all services
docker-compose build

# Start in production mode
docker-compose up -d

# Scale strategy runners
docker-compose up --scale strategy-runner=3

# Update a service
docker-compose up -d --no-deps backend
```

### Resource Configuration
Default resource limits per strategy container:
- **Memory**: 512MB
- **CPU**: 0.5 cores
- **Network**: Isolated bridge network
- **Storage**: Persistent volumes for data

## 🔧 Configuration

### Environment Variables
See `.env.example` for all available configuration options.

### Docker Compose Override
Create `docker-compose.override.yml` for local customizations:
```yaml
version: '3.8'
services:
  backend:
    environment:
      - DEBUG=true
    volumes:
      - ./backend/src:/app/src
```

## 📈 Performance Optimization

### Backend Optimizations
- Database connection pooling
- Request/response caching
- API rate limiting
- Efficient Docker image layers

### Frontend Optimizations
- Next.js static generation
- Image optimization
- Bundle size optimization
- Performance monitoring

### Strategy Optimizations
- Efficient market data processing
- Optimized container startup time
- Resource-aware scaling
- Memory usage monitoring

## 🐛 Troubleshooting

### Common Issues

#### Docker Connection Issues
```bash
# Check Docker daemon
docker version

# Restart Docker service
sudo systemctl restart docker

# Check container logs
docker-compose logs backend
```

#### Strategy Deployment Failures
```bash
# Check strategy runner logs
docker-compose logs strategy-runner

# Validate strategy code
curl -X POST http://localhost:8002/strategies/validate \
  -H "Content-Type: application/json" \
  -d @strategy-config.json
```

#### Database Issues
```bash
# Reset database
cd backend
npm run db:reset

# Run migrations
npm run db:migrate
```

## 🤝 Contributing

### Development Workflow
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Code Standards
- TypeScript for backend/frontend
- Python 3.11+ for strategies
- ESLint/Prettier for code formatting
- Conventional commits

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🔗 Related Links

- [CoinDCX API Documentation](https://docs.coindcx.com/)
- [Docker Documentation](https://docs.docker.com/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Express.js Documentation](https://expressjs.com/)

## 📞 Support

For support and questions:
- Create an issue in the repository
- Check the troubleshooting section
- Review the API documentation

---

**Last Updated**: September 28, 2025
**Version**: 1.0.0
**Status**: Production Ready ✅