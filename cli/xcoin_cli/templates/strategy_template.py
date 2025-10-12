"""
{{strategy_name}}

{{description}}

author: {{author_name}} <{{author_email}}>
created: {{creation_date}}
version: 1.0.0
"""

import pandas as pd
import numpy as np
from typing import Dict, Any, List


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

    # todo: quant team will add backtest methods here later
    # def backtest(self, data):
    #     pass


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
