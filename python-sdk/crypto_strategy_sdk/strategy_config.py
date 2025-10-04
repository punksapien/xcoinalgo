"""
Strategy Configuration Module

Handles strategy configuration validation and management.
"""

from dataclasses import dataclass, field
from typing import Dict, Any, Optional, List
import yaml
import json
from pathlib import Path


@dataclass
class StrategyConfig:
    """Configuration class for trading strategies."""

    # Strategy Metadata
    name: str
    code: str
    description: str = ""
    author: str = ""
    version: str = "1.0.0"
    tags: List[str] = field(default_factory=list)

    # Trading Parameters
    leverage: int = 10
    risk_per_trade: float = 0.005
    margin_currency: str = "USDT"
    pair: str = "B-BTC_USDT"

    # Technical Parameters
    resolution: str = "5"  # in minutes
    lookback_period: int = 200

    # Risk Management
    sl_atr_multiplier: float = 2.0
    tp_atr_multiplier: float = 2.5
    max_positions: int = 1
    max_daily_loss: float = 0.05  # 5% of account

    # Advanced Settings
    enable_paper_trading: bool = True
    enable_notifications: bool = True
    custom_indicators: Dict[str, Any] = field(default_factory=dict)

    # Environment Settings
    environment: str = "development"  # development, staging, production

    @classmethod
    def from_yaml(cls, config_path: str) -> 'StrategyConfig':
        """Load configuration from YAML file."""
        config_path = Path(config_path)
        if not config_path.exists():
            raise FileNotFoundError(f"Config file not found: {config_path}")

        with open(config_path, 'r') as file:
            config_data = yaml.safe_load(file)

        return cls(**config_data)

    @classmethod
    def from_json(cls, config_path: str) -> 'StrategyConfig':
        """Load configuration from JSON file."""
        config_path = Path(config_path)
        if not config_path.exists():
            raise FileNotFoundError(f"Config file not found: {config_path}")

        with open(config_path, 'r') as file:
            config_data = json.load(file)

        return cls(**config_data)

    def to_yaml(self, output_path: str) -> None:
        """Save configuration to YAML file."""
        config_dict = self.__dict__.copy()

        with open(output_path, 'w') as file:
            yaml.dump(config_dict, file, default_flow_style=False, indent=2)

    def to_json(self, output_path: str) -> None:
        """Save configuration to JSON file."""
        config_dict = self.__dict__.copy()

        with open(output_path, 'w') as file:
            json.dump(config_dict, file, indent=2)

    def validate(self) -> List[str]:
        """Validate configuration parameters."""
        errors = []

        # Required fields
        if not self.name:
            errors.append("Strategy name is required")
        if not self.code:
            errors.append("Strategy code is required")
        if not self.author:
            errors.append("Strategy author is required")

        # Trading parameters validation
        if self.leverage < 1 or self.leverage > 100:
            errors.append("Leverage must be between 1 and 100")

        if self.risk_per_trade <= 0 or self.risk_per_trade > 1:
            errors.append("Risk per trade must be between 0 and 1")

        if self.sl_atr_multiplier <= 0:
            errors.append("Stop loss ATR multiplier must be positive")

        if self.tp_atr_multiplier <= 0:
            errors.append("Take profit ATR multiplier must be positive")

        if self.max_positions < 1:
            errors.append("Max positions must be at least 1")

        if self.max_daily_loss <= 0 or self.max_daily_loss > 1:
            errors.append("Max daily loss must be between 0 and 1")

        # Technical parameters validation
        if self.resolution not in ["1", "5", "15", "30", "60", "240", "1440"]:
            errors.append("Resolution must be one of: 1, 5, 15, 30, 60, 240, 1440")

        if self.lookback_period < 20:
            errors.append("Lookback period should be at least 20")

        # Environment validation
        if self.environment not in ["development", "staging", "production"]:
            errors.append("Environment must be one of: development, staging, production")

        return errors

    def is_valid(self) -> bool:
        """Check if configuration is valid."""
        return len(self.validate()) == 0

    def get_dict(self) -> Dict[str, Any]:
        """Get configuration as dictionary."""
        return self.__dict__.copy()

    def update(self, **kwargs) -> None:
        """Update configuration parameters."""
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)
            else:
                raise AttributeError(f"Unknown configuration parameter: {key}")


# Default configuration template
DEFAULT_CONFIG = StrategyConfig(
    name="New Strategy",
    code="NEW_STRATEGY_V1",
    description="A new trading strategy",
    author="Your Name",
    version="1.0.0",
    tags=["trend-following", "momentum"],
    leverage=10,
    risk_per_trade=0.005,
    margin_currency="USDT",
    pair="B-BTC_USDT",
    resolution="5",
    lookback_period=200,
    sl_atr_multiplier=2.0,
    tp_atr_multiplier=2.5,
    max_positions=1,
    max_daily_loss=0.05,
    enable_paper_trading=True,
    enable_notifications=True,
    environment="development"
)