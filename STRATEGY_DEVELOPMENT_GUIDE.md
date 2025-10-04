# Strategy Development Architecture Guide

This guide explains the complete multi-repository architecture for strategy development on the CoinDCX trading platform, designed to separate quant research work from the main platform codebase.

## Architecture Overview

The strategy development system is built around **code separation** and **service isolation**:

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│                     │    │                     │    │                     │
│   Main Platform     │    │  Strategy Runner    │    │   Python SDK        │
│   (Web App)         │◄──►│     Service         │◄──►│  (Researcher Tool)  │
│                     │    │   (Microservice)    │    │                     │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
│                                                                            │
│ • User management          • Strategy execution      • Strategy framework  │
│ • Broker integration       • Process isolation       • Technical indicators│
│ • Portfolio tracking       • Resource monitoring     • Backtesting engine  │
│ • Web interface            • Signal collection       • Risk management     │
│                            • Docker containers       • Configuration mgmt  │
└────────────────────────────────────────────────────────────────────────────┘
```

## For Quant Researchers

### Quick Start

1. **Install the SDK**: Researchers only need the Python SDK
```bash
pip install coindcx-strategy-sdk
```

2. **Create a Strategy**: Inherit from `BaseStrategy`
```python
from coindcx_sdk import BaseStrategy, StrategyConfig

class MyStrategy(BaseStrategy):
    def initialize(self):
        self.sma_fast = 10
        self.sma_slow = 20

    def generate_signals(self, df):
        # Your strategy logic here
        pass
```

3. **Test Locally**: Use the built-in backtesting engine
```python
from coindcx_sdk import BacktestEngine
backtest = BacktestEngine(strategy)
results = backtest.run_backtest(data)
```

4. **Deploy**: Submit your strategy through the platform web interface

### What Researchers DON'T Need

- ❌ Access to main platform source code
- ❌ Frontend/backend development knowledge
- ❌ Database management
- ❌ Infrastructure setup
- ❌ Broker API integration details
- ❌ User authentication systems

### What Researchers DO Get

- ✅ Complete Python SDK with 20+ technical indicators
- ✅ Standardized strategy framework
- ✅ Comprehensive backtesting engine
- ✅ Risk management tools
- ✅ Performance analytics
- ✅ Configuration management
- ✅ Isolated execution environment

## Repository Structure

### 1. `coindcx-strategy-sdk` (Public Python Package)
**Purpose**: What researchers use to develop strategies

```
coindcx-strategy-sdk/
├── coindcx_sdk/
│   ├── __init__.py
│   ├── base_strategy.py      # Abstract strategy class
│   ├── indicators.py         # Technical indicators
│   ├── risk_management.py    # Risk management tools
│   ├── backtesting.py        # Backtesting engine
│   ├── strategy_config.py    # Configuration management
│   └── utils.py              # Helper utilities
├── examples/
│   ├── simple_sma_strategy.py
│   ├── mean_reversion.py
│   └── momentum_strategy.py
├── docs/
├── tests/
├── setup.py
├── requirements.txt
└── README.md
```

**Installation**: `pip install coindcx-strategy-sdk`

### 2. `strategy-runner-service` (Private Microservice)
**Purpose**: Executes strategies in isolated environments

```
strategy-runner-service/
├── main.py                   # FastAPI application
├── strategy_manager.py       # Strategy lifecycle management
├── models.py                 # Pydantic models
├── requirements.txt
├── Dockerfile               # Container configuration
├── docker-compose.yml       # Service orchestration
└── README.md
```

**Deployment**: Docker containers with resource limits

### 3. `coindcx-trading-platform` (Private Main Platform)
**Purpose**: Web interface and broker integration

```
coindcx-trading-platform/
├── frontend/                 # React/Next.js web app
├── backend/                  # Node.js/Express API
│   ├── src/routes/strategies.ts    # Strategy deployment API
│   └── src/services/strategy-service.ts  # Communication layer
└── ...
```

**Access**: Only platform developers

## Strategy Development Workflow

### Phase 1: Development (Researcher)
```bash
# 1. Install SDK
pip install coindcx-strategy-sdk

# 2. Create strategy file
cat > my_strategy.py << EOF
from coindcx_sdk import BaseStrategy, StrategyConfig

class MyStrategy(BaseStrategy):
    def initialize(self):
        # Strategy parameters
        pass

    def generate_signals(self, df):
        # Strategy logic
        return {'signal': 'LONG', 'confidence': 0.8}
EOF

# 3. Create configuration
cat > config.yaml << EOF
name: "My Strategy"
code: "MY_STRAT_V1"
author: "Researcher Name"
pair: "B-BTC_USDT"
leverage: 10
risk_per_trade: 0.01
EOF

# 4. Backtest
python -c "
from coindcx_sdk import BacktestEngine, StrategyConfig
from my_strategy import MyStrategy
import pandas as pd

config = StrategyConfig.from_yaml('config.yaml')
strategy = MyStrategy(config)
data = pd.read_csv('historical_data.csv')
backtest = BacktestEngine(strategy)
results = backtest.run_backtest(data)
print(f'Total Return: {results[\"summary\"][\"total_return_pct\"]:.2f}%')
"
```

### Phase 2: Deployment (Platform)
1. **Web Interface**: Researcher uploads strategy code and config
2. **Validation**: Platform validates strategy against SDK standards
3. **Deployment**: Strategy Runner Service creates isolated container
4. **Execution**: Strategy runs in sandboxed environment
5. **Monitoring**: Real-time performance tracking and metrics

### Phase 3: Management (Platform + Researcher)
- **Real-time Monitoring**: Performance metrics and resource usage
- **Signal Tracking**: Strategy decisions and reasoning
- **Risk Controls**: Automatic position limits and loss protection
- **Updates**: Deploy new versions without platform access

## Security & Isolation

### Process Isolation
- Each strategy runs in a separate Docker container
- Resource limits (CPU, memory) enforced
- Network isolation from main platform
- No access to sensitive data or APIs

### Code Separation
- Researchers only see SDK code
- Platform code remains private
- Strategy code is validated before execution
- No direct database or broker access from strategies

### Communication
- Strategies communicate only through defined API
- Market data fed through secure channels
- Signals collected through message queues
- No direct strategy-to-strategy communication

## API Reference

### Strategy Deployment API (`/api/deployments`)

#### Deploy Strategy
```http
POST /api/deployments/deploy
Content-Type: application/json

{
  "name": "My Strategy",
  "code": "MY_STRAT_V1",
  "strategyCode": "# Python strategy code here",
  "config": {
    "name": "My Strategy",
    "code": "MY_STRAT_V1",
    "author": "Researcher",
    "pair": "B-BTC_USDT",
    "leverage": 10,
    "risk_per_trade": 0.01
  }
}
```

#### Get Strategy Status
```http
GET /api/deployments/{id}/status
```

#### Stop Strategy
```http
POST /api/deployments/{id}/stop
```

### Strategy Runner Service API (Internal)

#### Health Check
```http
GET /health
```

#### Deploy Strategy
```http
POST /strategies/deploy
```

#### Market Data Feed
```http
POST /market-data/feed
```

## Development Environment Setup

### For Platform Developers

```bash
# 1. Clone main platform
git clone https://github.com/coindcx/coindcx-trading-platform.git
cd coindcx-trading-platform

# 2. Start services
docker-compose up -d

# 3. Start strategy runner service
cd strategy-runner-service
docker-compose up -d
```

### For Quant Researchers

```bash
# 1. Install SDK only
pip install coindcx-strategy-sdk

# 2. Use examples and documentation
python -c "from coindcx_sdk import BaseStrategy; help(BaseStrategy)"
```

## Migration from Monolithic to Microservice

### Before (Monolithic)
- Researchers needed full platform access
- Strategy code mixed with platform code
- No isolation between strategies
- Difficult to manage resources
- Security concerns with code access

### After (Microservice)
- ✅ Researchers work with SDK only
- ✅ Clear separation of concerns
- ✅ Isolated strategy execution
- ✅ Resource monitoring and limits
- ✅ Secure code separation
- ✅ Scalable architecture

## Benefits

### For Researchers
- **Focus**: Only write strategy logic, not infrastructure
- **Standards**: Consistent framework and tools
- **Speed**: Faster development with built-in indicators
- **Safety**: Comprehensive risk management
- **Testing**: Robust backtesting capabilities

### For Platform
- **Security**: Researchers can't access sensitive code
- **Scalability**: Independent scaling of strategy execution
- **Maintenance**: Easier to update platform without affecting strategies
- **Monitoring**: Better visibility into strategy performance
- **Resource Control**: Prevent runaway strategies

### For Organization
- **Separation of Concerns**: Clear boundaries between teams
- **Code Quality**: Standardized strategy development
- **Risk Management**: Centralized controls and monitoring
- **Innovation**: Researchers can focus on alpha generation
- **Deployment**: Faster time-to-market for new strategies

## Getting Started

### Researchers
1. Install the SDK: `pip install coindcx-strategy-sdk`
2. Read the documentation: [SDK Documentation](./python-sdk/README.md)
3. Try the examples: [Example Strategies](./python-sdk/examples/)
4. Join the community: [Discord Channel](https://discord.gg/coindcx)

### Platform Developers
1. Review the architecture: [Architecture Guide](./ARCHITECTURE_IMPROVEMENT_PLAN.md)
2. Set up development environment: [Development Setup](#development-environment-setup)
3. Deploy services: [Deployment Guide](./strategy-runner-service/README.md)

## Support

- **SDK Issues**: [GitHub Issues](https://github.com/coindcx/coindcx-sdk/issues)
- **Platform Issues**: Internal issue tracking
- **Documentation**: [Strategy Development Docs](https://docs.coindcx.com/strategies)
- **Community**: [Discord](https://discord.gg/coindcx)

---

This architecture ensures that quant researchers can focus entirely on strategy development while maintaining security, scalability, and maintainability for the overall platform.