"""
{{strategy_name}}

{{description}}

author: {{author_name}} <{{author_email}}>
created: {{creation_date}}
version: 1.0.0

IMPORTANT: If you implement custom backtest(), it MUST return data in the exact format
specified in the backtest_schema. The frontend depends on these exact field names and types.
Run 'xcoin validate' to check your backtest output before deploying.
"""

import pandas as pd
import numpy as np
from typing import Dict, Any, List, Literal, TypedDict

# ============================================
# REQUIRED TYPES FOR BACKTEST RESULTS
# These match what the frontend expects
# ============================================

class Trade(TypedDict):
    """Single trade - displayed in trade history table"""
    entry_time: int  # Timestamp in milliseconds
    exit_time: int   # Timestamp in milliseconds
    side: Literal['LONG', 'SHORT']
    entry_price: float
    exit_price: float
    quantity: float
    pnl: float  # Net P&L after commission
    pnl_pct: float  # Percentage return
    reason: Literal['stop_loss', 'take_profit', 'signal', 'manual']


class BacktestMetrics(TypedDict):
    """Performance metrics - displayed in strategy cards"""
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float  # Percentage 0-100
    total_pnl: float
    total_pnl_pct: float
    max_drawdown: float
    max_drawdown_pct: float
    sharpe_ratio: float
    profit_factor: float


class EquityCurvePoint(TypedDict):
    """Single point in equity curve"""
    timestamp: int  # Milliseconds
    equity: float


class BacktestResult(TypedDict):
    """Complete backtest result - YOUR backtest() MUST return this format"""
    trades: List[Trade]
    metrics: BacktestMetrics
    equity_curve: List[EquityCurvePoint]


class BaseStrategy:
    """
    base class for all strategies

    this has backtesting built in - quant team will add their code here
    """

    def __init__(self):
        self.name = "{{strategy_name}}"
        self.version = "1.0.0"

    def generate_signal(self, candles: List[Dict], settings: Dict[str, Any]) -> Dict[str, Any]:
        """
        main function that backend calls to get trading signals

        args:
            candles: list of OHLCV dicts like:
                {'timestamp': 1633024800000, 'open': 45000.0, 'high': 45100.0,
                 'low': 44900.0, 'close': 45050.0, 'volume': 1000.0}

            settings: dict with strategy params and state

        returns:
            dict with signal info:
                {'signal': 'LONG'|'SHORT'|'HOLD'|'EXIT_LONG'|'EXIT_SHORT',
                 'price': float,
                 'stopLoss': float (optional),
                 'takeProfit': float (optional),
                 'metadata': dict}
        """
        raise NotImplementedError("implement this in your strategy class")

    def backtest(self, historical_data: pd.DataFrame, config: Dict[str, Any]) -> BacktestResult:
        """
        OPTIONAL: Implement custom backtest logic

        If you implement this, the backend will call it instead of the default backtester.

        CRITICAL: Your return value MUST match the BacktestResult type exactly.
        The frontend depends on these exact field names and types.

        Args:
            historical_data: pandas DataFrame with columns:
                ['timestamp', 'open', 'high', 'low', 'close', 'volume']
                timestamp is in milliseconds (e.g., 1633024800000)

            config: dict with backtest params:
                {
                    'initial_capital': 10000,    # Starting capital
                    'risk_per_trade': 0.01,      # Risk per trade (1%)
                    'leverage': 10,              # Leverage multiplier
                    'commission': 0.001          # Commission rate (0.1%)
                }

        Returns:
            BacktestResult dict with EXACTLY these fields:
            {
                'trades': [Trade, ...],           # List of Trade dicts
                'metrics': BacktestMetrics,       # Metrics dict
                'equity_curve': [EquityCurvePoint, ...]  # Equity curve points
            }

            See the TypedDict definitions above for exact field requirements.

            VALIDATION:
            - All timestamps must be in milliseconds
            - win_rate must be 0-100 (percentage)
            - total_trades = winning_trades + losing_trades
            - All prices/quantities must be positive
            - exit_time must be after entry_time
            - Run 'xcoin validate' before deploying to check format

        Note: If you don't implement this (or raise NotImplementedError),
              the backend will use the default backtester.
        """
        raise NotImplementedError("Implement custom backtest or remove this method to use default backtester")


class {{strategy_class_name}}(BaseStrategy):
    """
    {{strategy_name}} implementation

    TODO: describe your strategy here
    """

    def __init__(self):
        super().__init__()

    def generate_signal(self, candles: List[Dict], settings: Dict[str, Any]) -> Dict[str, Any]:
        """generate trading signal based on candles"""

        try:
            # get params from settings
            lookback = int(settings.get('lookback_period', 100))
            fast_period = int(settings.get('sma_fast_period', 10))
            slow_period = int(settings.get('sma_slow_period', 30))

            # convert candles to dataframe for easier calc
            df = pd.DataFrame(candles)

            # check if we have enough data
            if len(df) < lookback:
                # not enough data yet, just hold
                return {
                    'signal': 'HOLD',
                    'price': float(df.iloc[-1]['close']) if len(df) > 0 else 0,
                    'metadata': {'reason': 'not enough data'}
                }

            # convert timestamp to datetime
            df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')

            # convert prices to numbers
            df['close'] = pd.to_numeric(df['close'])

            # calculate indicators (simple moving averages)
            df['sma_fast'] = df['close'].rolling(window=fast_period).mean()
            df['sma_slow'] = df['close'].rolling(window=slow_period).mean()

            # get latest candle
            latest = df.iloc[-1]
            price = float(latest['close'])

            # get previous state (to track if we're in a position)
            prev_state = settings.get('previous_state', {})
            in_position = prev_state.get('in_position', False)

            # TODO: implement your strategy logic here!
            # example: simple sma crossover
            if not in_position:
                # check for entry signal
                if latest['sma_fast'] > latest['sma_slow']:
                    # fast SMA crossed above slow SMA - bullish signal
                    return {
                        'signal': 'LONG',
                        'price': price,
                        'stopLoss': price * 0.98,  # 2% stop loss
                        'takeProfit': price * 1.05,  # 5% take profit
                        'metadata': {
                            'in_position': True,
                            'entry_price': price,
                            'reason': 'sma crossover bullish'
                        }
                    }
            else:
                # we're in a position, check for exit
                # todo: add exit logic here
                pass

            # no signal, just hold
            return {
                'signal': 'HOLD',
                'price': price,
                'metadata': {
                    'in_position': in_position,
                    'reason': 'no signal'
                }
            }

        except Exception as e:
            # something went wrong, return hold signal with error
            return {
                'signal': 'HOLD',
                'price': 0,
                'metadata': {
                    'error': str(e),
                    'error_type': type(e).__name__
                }
            }


# create strategy instance (backend needs this)
strategy = {{strategy_class_name}}()


def generate_signals(candles: List[Dict], settings: Dict[str, Any]) -> Dict[str, Any]:
    """
    main entry point for backend

    backend calls this function to get trading signals
    """
    return strategy.generate_signal(candles, settings)
