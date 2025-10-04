"""
Risk Management Module

Handles position sizing, risk controls, and trade validation.
"""

from typing import Dict, Any, Optional, List
from enum import Enum
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

from .strategy_config import StrategyConfig


class PositionSizeMethod(Enum):
    """Position sizing methods."""
    FIXED_AMOUNT = "fixed_amount"
    PERCENT_EQUITY = "percent_equity"
    ATR_BASED = "atr_based"
    KELLY_CRITERION = "kelly_criterion"


class RiskManager:
    """Risk management system for trading strategies."""

    def __init__(self, config: StrategyConfig):
        """
        Initialize risk manager with strategy configuration.

        Args:
            config: Strategy configuration
        """
        self.config = config

        # Risk tracking
        self.daily_pnl = 0.0
        self.current_drawdown = 0.0
        self.peak_equity = 0.0
        self.daily_trades = 0
        self.last_trade_date = None

        # Position tracking
        self.open_positions = {}
        self.position_count = 0

        # Performance tracking
        self.trade_history = []
        self.winning_trades = 0
        self.losing_trades = 0

        # Risk limits
        self.max_daily_trades = 10
        self.max_consecutive_losses = 5
        self.consecutive_losses = 0

    def calculate_position_size(self,
                              current_price: float,
                              account_balance: float,
                              atr_value: Optional[float] = None,
                              method: PositionSizeMethod = PositionSizeMethod.PERCENT_EQUITY) -> float:
        """
        Calculate position size based on risk management rules.

        Args:
            current_price: Current market price
            account_balance: Available account balance
            atr_value: Average True Range value (for ATR-based sizing)
            method: Position sizing method

        Returns:
            Position size (quantity to trade)
        """
        if method == PositionSizeMethod.FIXED_AMOUNT:
            # Fixed dollar amount per trade
            fixed_amount = account_balance * self.config.risk_per_trade
            return fixed_amount / current_price

        elif method == PositionSizeMethod.PERCENT_EQUITY:
            # Percentage of equity per trade
            risk_amount = account_balance * self.config.risk_per_trade
            # Apply leverage
            notional_value = risk_amount * self.config.leverage
            return notional_value / current_price

        elif method == PositionSizeMethod.ATR_BASED and atr_value:
            # ATR-based position sizing
            risk_amount = account_balance * self.config.risk_per_trade
            stop_distance = atr_value * self.config.sl_atr_multiplier

            if stop_distance > 0:
                position_size = risk_amount / stop_distance
                return min(position_size, (account_balance * 0.1) / current_price)  # Cap at 10% of balance

        elif method == PositionSizeMethod.KELLY_CRITERION:
            # Kelly Criterion (requires historical win/loss data)
            if len(self.trade_history) < 10:
                # Fall back to percent equity if insufficient data
                return self.calculate_position_size(current_price, account_balance,
                                                  method=PositionSizeMethod.PERCENT_EQUITY)

            kelly_fraction = self._calculate_kelly_fraction()
            kelly_amount = account_balance * min(kelly_fraction, self.config.risk_per_trade * 2)
            return (kelly_amount * self.config.leverage) / current_price

        # Default to percent equity
        return self.calculate_position_size(current_price, account_balance,
                                          method=PositionSizeMethod.PERCENT_EQUITY)

    def can_take_position(self, signal_type, current_position) -> bool:
        """
        Check if a position can be taken based on risk rules.

        Args:
            signal_type: Type of trading signal
            current_position: Current position state

        Returns:
            True if position can be taken, False otherwise
        """
        # Check position limits
        if self.position_count >= self.config.max_positions:
            return False

        # Check daily loss limit
        if self.daily_pnl <= -self.config.max_daily_loss:
            return False

        # Check daily trade limit
        today = datetime.now().date()
        if self.last_trade_date == today and self.daily_trades >= self.max_daily_trades:
            return False

        # Check consecutive losses
        if self.consecutive_losses >= self.max_consecutive_losses:
            return False

        # Check drawdown limit
        max_allowed_drawdown = 0.25  # 25% max drawdown
        if self.current_drawdown >= max_allowed_drawdown:
            return False

        return True

    def validate_trade(self, trade_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate trade parameters before execution.

        Args:
            trade_data: Trade data dictionary

        Returns:
            Validation result with any adjustments
        """
        result = {
            'valid': True,
            'adjusted_data': trade_data.copy(),
            'warnings': [],
            'errors': []
        }

        # Validate required fields
        required_fields = ['symbol', 'side', 'quantity', 'price']
        for field in required_fields:
            if field not in trade_data:
                result['errors'].append(f"Missing required field: {field}")
                result['valid'] = False

        if not result['valid']:
            return result

        # Validate quantity
        quantity = trade_data['quantity']
        if quantity <= 0:
            result['errors'].append("Quantity must be positive")
            result['valid'] = False

        # Validate price
        price = trade_data['price']
        if price <= 0:
            result['errors'].append("Price must be positive")
            result['valid'] = False

        # Check minimum notional value
        notional = quantity * price
        min_notional = 10.0  # Minimum $10 trade
        if notional < min_notional:
            result['warnings'].append(f"Trade notional ${notional:.2f} below minimum ${min_notional}")

        return result

    def calculate_stop_loss(self, entry_price: float, side: str, atr_value: float) -> float:
        """
        Calculate stop loss price based on ATR.

        Args:
            entry_price: Entry price of the position
            side: 'buy' or 'sell'
            atr_value: Average True Range value

        Returns:
            Stop loss price
        """
        stop_distance = atr_value * self.config.sl_atr_multiplier

        if side.lower() == 'buy':
            return entry_price - stop_distance
        else:
            return entry_price + stop_distance

    def calculate_take_profit(self, entry_price: float, side: str, atr_value: float) -> float:
        """
        Calculate take profit price based on ATR.

        Args:
            entry_price: Entry price of the position
            side: 'buy' or 'sell'
            atr_value: Average True Range value

        Returns:
            Take profit price
        """
        tp_distance = atr_value * self.config.tp_atr_multiplier

        if side.lower() == 'buy':
            return entry_price + tp_distance
        else:
            return entry_price - tp_distance

    def update_daily_pnl(self, pnl: float) -> None:
        """
        Update daily P&L tracking.

        Args:
            pnl: Profit/Loss from the trade
        """
        today = datetime.now().date()

        # Reset daily counters if new day
        if self.last_trade_date != today:
            self.daily_pnl = 0.0
            self.daily_trades = 0
            self.last_trade_date = today

        self.daily_pnl += pnl
        self.daily_trades += 1

        # Update consecutive losses
        if pnl < 0:
            self.consecutive_losses += 1
        else:
            self.consecutive_losses = 0

        # Track trade history for Kelly criterion
        self.trade_history.append({
            'date': datetime.now(),
            'pnl': pnl,
            'win': pnl > 0
        })

        # Keep only last 100 trades
        if len(self.trade_history) > 100:
            self.trade_history = self.trade_history[-100:]

        # Update win/loss counts
        if pnl > 0:
            self.winning_trades += 1
        else:
            self.losing_trades += 1

    def update_drawdown(self, current_equity: float) -> None:
        """
        Update drawdown tracking.

        Args:
            current_equity: Current equity value
        """
        if current_equity > self.peak_equity:
            self.peak_equity = current_equity

        if self.peak_equity > 0:
            self.current_drawdown = (self.peak_equity - current_equity) / self.peak_equity
        else:
            self.current_drawdown = 0.0

    def get_risk_metrics(self) -> Dict[str, Any]:
        """
        Get current risk metrics and statistics.

        Returns:
            Dictionary with risk metrics
        """
        total_trades = len(self.trade_history)
        win_rate = (self.winning_trades / max(total_trades, 1)) * 100

        return {
            'daily_pnl': self.daily_pnl,
            'daily_trades': self.daily_trades,
            'current_drawdown': self.current_drawdown * 100,
            'peak_equity': self.peak_equity,
            'consecutive_losses': self.consecutive_losses,
            'total_trades': total_trades,
            'winning_trades': self.winning_trades,
            'losing_trades': self.losing_trades,
            'win_rate': win_rate,
            'position_count': self.position_count,
            'max_positions': self.config.max_positions,
            'risk_per_trade': self.config.risk_per_trade * 100,
            'max_daily_loss': self.config.max_daily_loss * 100
        }

    def _calculate_kelly_fraction(self) -> float:
        """
        Calculate Kelly criterion fraction from historical trades.

        Returns:
            Kelly fraction (0-1)
        """
        if not self.trade_history:
            return self.config.risk_per_trade

        # Calculate average win and loss
        wins = [t['pnl'] for t in self.trade_history if t['pnl'] > 0]
        losses = [abs(t['pnl']) for t in self.trade_history if t['pnl'] < 0]

        if not wins or not losses:
            return self.config.risk_per_trade

        avg_win = np.mean(wins)
        avg_loss = np.mean(losses)
        win_prob = len(wins) / len(self.trade_history)

        if avg_loss == 0:
            return self.config.risk_per_trade

        # Kelly formula: f = (bp - q) / b
        # where b = avg_win/avg_loss, p = win_prob, q = 1-win_prob
        b = avg_win / avg_loss
        kelly_fraction = (b * win_prob - (1 - win_prob)) / b

        # Cap Kelly fraction to prevent over-leveraging
        kelly_fraction = max(0, min(kelly_fraction, 0.25))  # Max 25%

        return kelly_fraction

    def emergency_stop_check(self) -> bool:
        """
        Check if emergency stop conditions are met.

        Returns:
            True if trading should be stopped immediately
        """
        # Daily loss limit exceeded
        if self.daily_pnl <= -self.config.max_daily_loss:
            return True

        # Maximum drawdown exceeded
        if self.current_drawdown >= 0.25:  # 25% max drawdown
            return True

        # Too many consecutive losses
        if self.consecutive_losses >= self.max_consecutive_losses:
            return True

        return False

    def reset_daily_counters(self) -> None:
        """Reset daily counters (useful for testing or new day)."""
        self.daily_pnl = 0.0
        self.daily_trades = 0
        self.last_trade_date = datetime.now().date()

    def reset_all_counters(self) -> None:
        """Reset all risk management counters."""
        self.daily_pnl = 0.0
        self.current_drawdown = 0.0
        self.peak_equity = 0.0
        self.daily_trades = 0
        self.last_trade_date = None
        self.open_positions = {}
        self.position_count = 0
        self.trade_history = []
        self.winning_trades = 0
        self.losing_trades = 0
        self.consecutive_losses = 0