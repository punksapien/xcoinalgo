"""
Crypto Strategy SDK

A standardized framework for developing, testing, and deploying
cryptocurrency trading strategies for algorithmic trading.

Author: Crypto Strategy Team
Version: 1.0.0
"""

from .base_strategy import BaseStrategy, SignalType, PositionType
from .strategy_config import StrategyConfig
from .indicators import TechnicalIndicators
from .risk_management import RiskManager
from .client import CoinDCXClient as CryptoClient
from .backtesting import BacktestEngine
from .utils import Logger

__version__ = "1.0.0"
__author__ = "Crypto Strategy Team"

__all__ = [
    "BaseStrategy",
    "SignalType",
    "PositionType",
    "StrategyConfig",
    "TechnicalIndicators",
    "RiskManager",
    "CryptoClient",
    "BacktestEngine",
    "Logger"
]