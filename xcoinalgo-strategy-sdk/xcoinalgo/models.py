"""
XcoinAlgo Strategy SDK - Data Models

This module provides Pydantic models for type-safe data structures used in strategies.
"""

from pydantic import BaseModel, Field, validator
from typing import Literal, Optional, Dict, Any
from datetime import datetime


class Signal(BaseModel):
    """
    Trading signal returned by a strategy.

    This model validates and type-checks the signal returned from on_data().
    """

    action: Literal["BUY", "SELL", "HOLD"] = Field(
        ...,
        description="Trading action to take"
    )

    entryPrice: Optional[float] = Field(
        None,
        gt=0,
        description="Suggested entry price (uses current market price if not specified)"
    )

    stopLoss: Optional[float] = Field(
        None,
        gt=0,
        description="Stop loss price"
    )

    takeProfit: Optional[float] = Field(
        None,
        gt=0,
        description="Take profit price"
    )

    confidence: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        description="Confidence level of the signal (0.0 to 1.0)"
    )

    metadata: Optional[Dict[str, Any]] = Field(
        None,
        description="Additional metadata for logging and analysis"
    )

    @validator('stopLoss')
    def validate_stop_loss(cls, v, values):
        """Validate stop loss is on the correct side of entry price."""
        if v is not None and 'entryPrice' in values and values['entryPrice'] is not None:
            action = values.get('action')
            entry = values['entryPrice']

            if action == 'BUY' and v >= entry:
                raise ValueError(f"Stop loss ({v}) must be below entry price ({entry}) for BUY signal")
            elif action == 'SELL' and v <= entry:
                raise ValueError(f"Stop loss ({v}) must be above entry price ({entry}) for SELL signal")

        return v

    @validator('takeProfit')
    def validate_take_profit(cls, v, values):
        """Validate take profit is on the correct side of entry price."""
        if v is not None and 'entryPrice' in values and values['entryPrice'] is not None:
            action = values.get('action')
            entry = values['entryPrice']

            if action == 'BUY' and v <= entry:
                raise ValueError(f"Take profit ({v}) must be above entry price ({entry}) for BUY signal")
            elif action == 'SELL' and v >= entry:
                raise ValueError(f"Take profit ({v}) must be below entry price ({entry}) for SELL signal")

        return v

    class Config:
        """Pydantic configuration."""
        extra = 'forbid'  # Don't allow extra fields
        use_enum_values = True


class StrategyConfig(BaseModel):
    """
    Strategy configuration and metadata.

    This defines the execution parameters for a strategy.
    """

    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Strategy name"
    )

    code: str = Field(
        ...,
        min_length=1,
        max_length=50,
        regex=r'^[a-z0-9_]+$',
        description="Unique strategy code (lowercase, alphanumeric, underscores only)"
    )

    version: str = Field(
        ...,
        regex=r'^\d+\.\d+\.\d+$',
        description="Strategy version in semver format (e.g., 1.0.0)"
    )

    description: Optional[str] = Field(
        None,
        max_length=500,
        description="Strategy description"
    )

    author: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Strategy author name"
    )

    symbol: str = Field(
        ...,
        description="Trading pair (e.g., BTCUSDT, ETHUSDT)"
    )

    resolution: str = Field(
        ...,
        regex=r'^\d+$',
        description="Candle resolution in minutes (1, 5, 15, 30, 60, 240, 1440)"
    )

    lookbackPeriod: int = Field(
        100,
        gt=0,
        le=1000,
        description="Number of historical candles to provide"
    )

    tags: Optional[str] = Field(
        None,
        description="Comma-separated tags (e.g., 'momentum,short-term')"
    )

    class Config:
        """Pydantic configuration."""
        extra = 'forbid'


class BacktestResult(BaseModel):
    """
    Results from a strategy backtest.
    """

    totalTrades: int = Field(ge=0, description="Total number of trades")
    winningTrades: int = Field(ge=0, description="Number of winning trades")
    losingTrades: int = Field(ge=0, description="Number of losing trades")
    winRate: float = Field(ge=0, le=1, description="Win rate (0.0 to 1.0)")
    totalPnl: float = Field(description="Total profit/loss")
    maxDrawdown: float = Field(description="Maximum drawdown percentage")
    sharpeRatio: Optional[float] = Field(None, description="Sharpe ratio")
    startDate: datetime = Field(description="Backtest start date")
    endDate: datetime = Field(description="Backtest end date")

    class Config:
        """Pydantic configuration."""
        extra = 'forbid'


class Trade(BaseModel):
    """
    Individual trade record.
    """

    symbol: str = Field(description="Trading pair")
    side: Literal["BUY", "SELL"] = Field(description="Trade side")
    quantity: float = Field(gt=0, description="Trade quantity")
    entryPrice: float = Field(gt=0, description="Entry price")
    exitPrice: Optional[float] = Field(None, gt=0, description="Exit price")
    stopLoss: Optional[float] = Field(None, gt=0, description="Stop loss price")
    takeProfit: Optional[float] = Field(None, gt=0, description="Take profit price")
    entryTime: datetime = Field(description="Entry timestamp")
    exitTime: Optional[datetime] = Field(None, description="Exit timestamp")
    pnl: float = Field(description="Profit/loss")
    status: Literal["OPEN", "CLOSED"] = Field(description="Trade status")

    class Config:
        """Pydantic configuration."""
        extra = 'forbid'
