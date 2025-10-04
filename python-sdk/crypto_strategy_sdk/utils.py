"""
Utilities Module

Common utility functions and classes for the SDK.
"""

import logging
import sys
from typing import Any, Dict, Optional
from datetime import datetime
import json
import os


class Logger:
    """Enhanced logging utility for strategies."""

    def __init__(self, name: str, level: int = logging.INFO):
        """
        Initialize logger.

        Args:
            name: Logger name
            level: Logging level
        """
        self.logger = logging.getLogger(name)
        self.logger.setLevel(level)

        # Avoid duplicate handlers
        if not self.logger.handlers:
            # Console handler
            console_handler = logging.StreamHandler(sys.stdout)
            console_handler.setLevel(level)

            # Formatter
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            console_handler.setFormatter(formatter)

            self.logger.addHandler(console_handler)

    def info(self, message: str, **kwargs) -> None:
        """Log info message."""
        if kwargs:
            message += f" | Data: {json.dumps(kwargs, default=str)}"
        self.logger.info(message)

    def warning(self, message: str, **kwargs) -> None:
        """Log warning message."""
        if kwargs:
            message += f" | Data: {json.dumps(kwargs, default=str)}"
        self.logger.warning(message)

    def error(self, message: str, **kwargs) -> None:
        """Log error message."""
        if kwargs:
            message += f" | Data: {json.dumps(kwargs, default=str)}"
        self.logger.error(message)

    def debug(self, message: str, **kwargs) -> None:
        """Log debug message."""
        if kwargs:
            message += f" | Data: {json.dumps(kwargs, default=str)}"
        self.logger.debug(message)

    def critical(self, message: str, **kwargs) -> None:
        """Log critical message."""
        if kwargs:
            message += f" | Data: {json.dumps(kwargs, default=str)}"
        self.logger.critical(message)


class PerformanceTracker:
    """Track strategy performance metrics."""

    def __init__(self):
        """Initialize performance tracker."""
        self.trades = []
        self.equity_curve = []
        self.start_time = datetime.now()
        self.initial_balance = 0.0

    def add_trade(self, trade_data: Dict[str, Any]) -> None:
        """
        Add a completed trade to tracking.

        Args:
            trade_data: Dictionary with trade information
        """
        required_fields = ['entry_price', 'exit_price', 'quantity', 'side', 'pnl']
        for field in required_fields:
            if field not in trade_data:
                raise ValueError(f"Trade data missing required field: {field}")

        trade_data['timestamp'] = trade_data.get('timestamp', datetime.now())
        self.trades.append(trade_data)

    def add_equity_point(self, equity: float, timestamp: Optional[datetime] = None) -> None:
        """
        Add equity curve data point.

        Args:
            equity: Current equity value
            timestamp: Timestamp for the data point
        """
        if timestamp is None:
            timestamp = datetime.now()

        self.equity_curve.append({
            'timestamp': timestamp,
            'equity': equity
        })

    def get_performance_metrics(self) -> Dict[str, Any]:
        """
        Calculate comprehensive performance metrics.

        Returns:
            Dictionary with performance statistics
        """
        if not self.trades:
            return {
                'total_trades': 0,
                'win_rate': 0.0,
                'total_pnl': 0.0,
                'max_drawdown': 0.0,
                'sharpe_ratio': 0.0,
                'profit_factor': 0.0
            }

        # Basic metrics
        total_trades = len(self.trades)
        winning_trades = len([t for t in self.trades if t['pnl'] > 0])
        losing_trades = total_trades - winning_trades

        win_rate = (winning_trades / total_trades) * 100 if total_trades > 0 else 0

        # P&L metrics
        total_pnl = sum(t['pnl'] for t in self.trades)
        gross_profit = sum(t['pnl'] for t in self.trades if t['pnl'] > 0)
        gross_loss = abs(sum(t['pnl'] for t in self.trades if t['pnl'] < 0))

        # Average trade metrics
        avg_trade = total_pnl / total_trades if total_trades > 0 else 0
        avg_win = gross_profit / winning_trades if winning_trades > 0 else 0
        avg_loss = gross_loss / losing_trades if losing_trades > 0 else 0

        # Profit factor
        profit_factor = gross_profit / gross_loss if gross_loss > 0 else float('inf')

        # Drawdown calculation
        max_drawdown = self._calculate_max_drawdown()

        # Sharpe ratio (simplified)
        sharpe_ratio = self._calculate_sharpe_ratio()

        # Consecutive wins/losses
        max_consecutive_wins = self._calculate_max_consecutive(True)
        max_consecutive_losses = self._calculate_max_consecutive(False)

        return {
            'total_trades': total_trades,
            'winning_trades': winning_trades,
            'losing_trades': losing_trades,
            'win_rate': win_rate,
            'total_pnl': total_pnl,
            'gross_profit': gross_profit,
            'gross_loss': gross_loss,
            'avg_trade': avg_trade,
            'avg_win': avg_win,
            'avg_loss': avg_loss,
            'profit_factor': profit_factor,
            'max_drawdown': max_drawdown,
            'sharpe_ratio': sharpe_ratio,
            'max_consecutive_wins': max_consecutive_wins,
            'max_consecutive_losses': max_consecutive_losses,
            'duration': (datetime.now() - self.start_time).total_seconds() / 3600  # hours
        }

    def _calculate_max_drawdown(self) -> float:
        """Calculate maximum drawdown from equity curve."""
        if len(self.equity_curve) < 2:
            return 0.0

        peak = self.equity_curve[0]['equity']
        max_dd = 0.0

        for point in self.equity_curve:
            equity = point['equity']
            if equity > peak:
                peak = equity

            drawdown = (peak - equity) / peak if peak > 0 else 0
            max_dd = max(max_dd, drawdown)

        return max_dd * 100  # Return as percentage

    def _calculate_sharpe_ratio(self) -> float:
        """Calculate simplified Sharpe ratio."""
        if len(self.trades) < 2:
            return 0.0

        returns = [t['pnl'] for t in self.trades]
        avg_return = sum(returns) / len(returns)

        # Calculate standard deviation
        variance = sum((r - avg_return) ** 2 for r in returns) / len(returns)
        std_dev = variance ** 0.5

        if std_dev == 0:
            return 0.0

        # Simplified Sharpe (assuming risk-free rate = 0)
        return avg_return / std_dev

    def _calculate_max_consecutive(self, wins: bool) -> int:
        """Calculate maximum consecutive wins or losses."""
        if not self.trades:
            return 0

        max_consecutive = 0
        current_consecutive = 0

        for trade in self.trades:
            is_win = trade['pnl'] > 0

            if (wins and is_win) or (not wins and not is_win):
                current_consecutive += 1
                max_consecutive = max(max_consecutive, current_consecutive)
            else:
                current_consecutive = 0

        return max_consecutive

    def export_trades_to_csv(self, filename: str) -> None:
        """Export trade data to CSV file."""
        import csv

        if not self.trades:
            return

        with open(filename, 'w', newline='') as csvfile:
            fieldnames = list(self.trades[0].keys())
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)

            writer.writeheader()
            for trade in self.trades:
                writer.writerow(trade)

    def reset(self) -> None:
        """Reset all tracking data."""
        self.trades = []
        self.equity_curve = []
        self.start_time = datetime.now()


def load_config_from_env() -> Dict[str, Any]:
    """
    Load configuration from environment variables.

    Returns:
        Dictionary with configuration values
    """
    config = {}

    # API credentials
    config['api_key'] = os.getenv('COINDCX_API_KEY', '')
    config['api_secret'] = os.getenv('COINDCX_API_SECRET', '')

    # Strategy parameters
    config['leverage'] = int(os.getenv('LEVERAGE', '10'))
    config['risk_per_trade'] = float(os.getenv('RISK_PER_TRADE', '0.005'))
    config['margin_currency'] = os.getenv('MARGIN_CURRENCY', 'USDT')
    config['pair'] = os.getenv('TRADING_PAIR', 'B-BTC_USDT')

    # Environment
    config['environment'] = os.getenv('ENVIRONMENT', 'development')
    config['deployment_id'] = os.getenv('DEPLOYMENT_ID', '')

    return config


def format_currency(amount: float, currency: str = 'USD') -> str:
    """
    Format currency amount for display.

    Args:
        amount: Amount to format
        currency: Currency symbol

    Returns:
        Formatted currency string
    """
    if currency == 'USD' or currency == 'USDT':
        return f"${amount:,.2f}"
    else:
        return f"{amount:,.6f} {currency}"


def calculate_percentage_change(old_value: float, new_value: float) -> float:
    """
    Calculate percentage change between two values.

    Args:
        old_value: Original value
        new_value: New value

    Returns:
        Percentage change
    """
    if old_value == 0:
        return 0.0

    return ((new_value - old_value) / abs(old_value)) * 100


def round_to_tick_size(price: float, tick_size: float) -> float:
    """
    Round price to valid tick size.

    Args:
        price: Price to round
        tick_size: Minimum price increment

    Returns:
        Rounded price
    """
    if tick_size <= 0:
        return price

    return round(price / tick_size) * tick_size


def validate_trading_pair(pair: str) -> bool:
    """
    Validate trading pair format.

    Args:
        pair: Trading pair string

    Returns:
        True if valid format
    """
    # Expected format: B-BTC_USDT, I-ETH_USDT, etc.
    if not pair or len(pair) < 5:
        return False

    parts = pair.split('-')
    if len(parts) != 2:
        return False

    # Check if second part contains underscore
    if '_' not in parts[1]:
        return False

    return True


class ConfigValidator:
    """Validate strategy configuration parameters."""

    @staticmethod
    def validate_leverage(leverage: int) -> bool:
        """Validate leverage parameter."""
        return 1 <= leverage <= 100

    @staticmethod
    def validate_risk_per_trade(risk: float) -> bool:
        """Validate risk per trade parameter."""
        return 0 < risk <= 0.5  # Max 50% risk per trade

    @staticmethod
    def validate_pair(pair: str) -> bool:
        """Validate trading pair."""
        return validate_trading_pair(pair)

    @staticmethod
    def validate_timeframe(timeframe: str) -> bool:
        """Validate timeframe parameter."""
        valid_timeframes = ["1", "5", "15", "30", "60", "240", "1440"]
        return timeframe in valid_timeframes

    @staticmethod
    def validate_all(config: Dict[str, Any]) -> Dict[str, str]:
        """
        Validate all configuration parameters.

        Args:
            config: Configuration dictionary

        Returns:
            Dictionary with validation errors (empty if all valid)
        """
        errors = {}

        if 'leverage' in config and not ConfigValidator.validate_leverage(config['leverage']):
            errors['leverage'] = "Leverage must be between 1 and 100"

        if 'risk_per_trade' in config and not ConfigValidator.validate_risk_per_trade(config['risk_per_trade']):
            errors['risk_per_trade'] = "Risk per trade must be between 0 and 0.5"

        if 'pair' in config and not ConfigValidator.validate_pair(config['pair']):
            errors['pair'] = "Invalid trading pair format"

        if 'resolution' in config and not ConfigValidator.validate_timeframe(config['resolution']):
            errors['resolution'] = "Invalid timeframe resolution"

        return errors