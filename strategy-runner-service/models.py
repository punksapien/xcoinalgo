"""
Pydantic models for the Strategy Runner Service API.
"""

from pydantic import BaseModel, Field, validator
from typing import Dict, List, Optional, Any, Union
from datetime import datetime
from enum import Enum


class StrategyStatus(str, Enum):
    """Strategy execution status."""
    PENDING = "pending"
    DEPLOYING = "deploying"
    ACTIVE = "active"
    PAUSED = "paused"
    STOPPED = "stopped"
    FAILED = "failed"
    ERROR = "error"


class SignalType(str, Enum):
    """Trading signal types."""
    LONG = "long"
    SHORT = "short"
    CLOSE_LONG = "close_long"
    CLOSE_SHORT = "close_short"
    HOLD = "hold"


class StrategyConfig(BaseModel):
    """Strategy configuration model."""
    name: str = Field(..., description="Strategy name")
    code: str = Field(..., description="Strategy code identifier")
    author: str = Field(..., description="Strategy author")
    description: Optional[str] = Field(None, description="Strategy description")

    # Trading parameters
    leverage: int = Field(default=1, ge=1, le=100, description="Leverage multiplier")
    risk_per_trade: float = Field(default=0.01, ge=0.001, le=0.1, description="Risk per trade as decimal")
    pair: str = Field(..., description="Trading pair (e.g., B-BTC_USDT)")
    margin_currency: str = Field(default="USDT", description="Margin currency")

    # Technical parameters
    resolution: str = Field(default="5", description="Timeframe in minutes")
    lookback_period: int = Field(default=200, ge=50, le=1000, description="Lookback period for indicators")

    # Risk management
    sl_atr_multiplier: float = Field(default=2.0, ge=0.5, le=10.0, description="Stop loss ATR multiplier")
    tp_atr_multiplier: float = Field(default=2.5, ge=0.5, le=10.0, description="Take profit ATR multiplier")
    max_positions: int = Field(default=1, ge=1, le=10, description="Maximum concurrent positions")
    max_daily_loss: float = Field(default=0.05, ge=0.01, le=0.2, description="Maximum daily loss as decimal")

    # Custom parameters
    custom_params: Optional[Dict[str, Any]] = Field(default={}, description="Strategy-specific parameters")

    @validator('pair')
    def validate_pair(cls, v):
        """Validate trading pair format."""
        if not v.startswith('B-') or '_' not in v:
            raise ValueError('Pair must be in format B-BASE_QUOTE (e.g., B-BTC_USDT)')
        return v


class StrategyDeploymentRequest(BaseModel):
    """Request model for strategy deployment."""
    user_id: str = Field(..., description="User ID deploying the strategy")
    strategy_code: str = Field(..., description="Python strategy code")
    config: StrategyConfig = Field(..., description="Strategy configuration")

    # Deployment options
    auto_start: bool = Field(default=True, description="Auto-start strategy after deployment")
    environment: str = Field(default="production", description="Deployment environment")
    resource_limits: Optional[Dict[str, Any]] = Field(default={}, description="Resource constraints")

    @validator('strategy_code')
    def validate_strategy_code(cls, v):
        """Basic validation of strategy code."""
        if len(v) < 100:
            raise ValueError('Strategy code is too short')
        if 'class' not in v or 'BaseStrategy' not in v:
            raise ValueError('Strategy code must contain a class inheriting from BaseStrategy')
        return v


class MarketData(BaseModel):
    """Market data model."""
    symbol: str = Field(..., description="Trading symbol")
    timestamp: datetime = Field(..., description="Data timestamp")

    # OHLCV data
    open: float = Field(..., description="Open price")
    high: float = Field(..., description="High price")
    low: float = Field(..., description="Low price")
    close: float = Field(..., description="Close price")
    volume: float = Field(..., description="Volume")

    # Additional data
    bid: Optional[float] = Field(None, description="Best bid price")
    ask: Optional[float] = Field(None, description="Best ask price")
    spread: Optional[float] = Field(None, description="Bid-ask spread")

    # Metadata
    exchange: str = Field(default="coindcx", description="Exchange name")
    data_type: str = Field(default="kline", description="Data type")


class StrategySignal(BaseModel):
    """Trading signal model."""
    strategy_id: str = Field(..., description="Strategy instance ID")
    timestamp: datetime = Field(..., description="Signal timestamp")

    # Signal details
    signal_type: SignalType = Field(..., description="Type of trading signal")
    symbol: str = Field(..., description="Trading symbol")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Signal confidence (0-1)")

    # Position details
    side: str = Field(..., description="Position side (buy/sell)")
    quantity: Optional[float] = Field(None, description="Position quantity")
    price: Optional[float] = Field(None, description="Target price")

    # Risk management
    stop_loss: Optional[float] = Field(None, description="Stop loss price")
    take_profit: Optional[float] = Field(None, description="Take profit price")

    # Metadata
    reason: Optional[str] = Field(None, description="Signal reasoning")
    indicators: Optional[Dict[str, float]] = Field(default={}, description="Indicator values")
    custom_data: Optional[Dict[str, Any]] = Field(default={}, description="Custom signal data")


class StrategyMetrics(BaseModel):
    """Strategy performance metrics."""
    # Basic metrics
    total_trades: int = Field(default=0, description="Total number of trades")
    winning_trades: int = Field(default=0, description="Number of winning trades")
    losing_trades: int = Field(default=0, description="Number of losing trades")

    # Performance metrics
    total_pnl: float = Field(default=0.0, description="Total P&L")
    total_pnl_pct: float = Field(default=0.0, description="Total P&L percentage")
    win_rate: float = Field(default=0.0, ge=0.0, le=1.0, description="Win rate (0-1)")

    # Risk metrics
    max_drawdown: float = Field(default=0.0, description="Maximum drawdown")
    max_drawdown_pct: float = Field(default=0.0, description="Maximum drawdown percentage")
    sharpe_ratio: Optional[float] = Field(None, description="Sharpe ratio")

    # Current state
    current_position: str = Field(default="flat", description="Current position")
    unrealized_pnl: float = Field(default=0.0, description="Unrealized P&L")

    # Timestamps
    started_at: Optional[datetime] = Field(None, description="Strategy start time")
    last_signal_at: Optional[datetime] = Field(None, description="Last signal timestamp")
    last_update_at: datetime = Field(default_factory=datetime.utcnow, description="Last metrics update")


class StrategyInfo(BaseModel):
    """Strategy instance information."""
    strategy_id: str = Field(..., description="Strategy instance ID")
    user_id: str = Field(..., description="User ID")
    config: StrategyConfig = Field(..., description="Strategy configuration")
    status: StrategyStatus = Field(..., description="Current status")

    # Runtime info
    deployed_at: datetime = Field(..., description="Deployment timestamp")
    started_at: Optional[datetime] = Field(None, description="Start timestamp")
    stopped_at: Optional[datetime] = Field(None, description="Stop timestamp")

    # Performance
    metrics: Optional[StrategyMetrics] = Field(None, description="Performance metrics")

    # System info
    process_id: Optional[int] = Field(None, description="Process ID")
    memory_usage: Optional[float] = Field(None, description="Memory usage in MB")
    cpu_usage: Optional[float] = Field(None, description="CPU usage percentage")

    # Error info
    last_error: Optional[str] = Field(None, description="Last error message")
    error_count: int = Field(default=0, description="Total error count")


class StrategyResponse(BaseModel):
    """Standard API response model."""
    success: bool = Field(..., description="Request success status")
    message: str = Field(..., description="Response message")

    # Optional fields
    strategy_id: Optional[str] = Field(None, description="Strategy instance ID")
    status: Optional[StrategyStatus] = Field(None, description="Strategy status")
    metrics: Optional[StrategyMetrics] = Field(None, description="Performance metrics")
    data: Optional[Dict[str, Any]] = Field(None, description="Additional response data")

    # Error details
    error_code: Optional[str] = Field(None, description="Error code")
    error_details: Optional[Dict[str, Any]] = Field(None, description="Error details")


class ValidationResult(BaseModel):
    """Strategy validation result."""
    is_valid: bool = Field(..., description="Validation success")
    errors: List[str] = Field(default=[], description="Validation errors")
    warnings: List[str] = Field(default=[], description="Validation warnings")

    # Analysis results
    detected_strategy_class: Optional[str] = Field(None, description="Detected strategy class name")
    required_imports: List[str] = Field(default=[], description="Required imports")
    estimated_memory: Optional[float] = Field(None, description="Estimated memory usage in MB")
    estimated_cpu: Optional[float] = Field(None, description="Estimated CPU usage percentage")


class WebSocketMessage(BaseModel):
    """WebSocket message model."""
    type: str = Field(..., description="Message type")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Message timestamp")
    data: Dict[str, Any] = Field(..., description="Message payload")

    # Optional fields
    strategy_id: Optional[str] = Field(None, description="Related strategy ID")
    user_id: Optional[str] = Field(None, description="Related user ID")
    correlation_id: Optional[str] = Field(None, description="Message correlation ID")