"""
XcoinAlgo Strategy SDK - Base Strategy Class

This module provides the abstract base class that all trading strategies must inherit from.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
import pandas as pd


class BaseStrategy(ABC):
    """
    Abstract base class for all trading strategies.

    All strategies must inherit from this class and implement the `on_data` method.
    The platform will call `on_data` with market data at each candle close, and your
    strategy should return a signal indicating whether to BUY, SELL, or HOLD.

    Example:
        ```python
        from xcoinalgo import BaseStrategy

        class MyStrategy(BaseStrategy):
            def __init__(self):
                super().__init__()
                self.name = "My SMA Crossover"
                self.version = "1.0.0"

            def on_data(self, data: pd.DataFrame) -> dict:
                # Calculate indicators
                data['SMA_20'] = data['close'].rolling(20).mean()
                data['SMA_50'] = data['close'].rolling(50).mean()

                # Generate signal
                if data['SMA_20'].iloc[-1] > data['SMA_50'].iloc[-1]:
                    return {
                        "action": "BUY",
                        "entryPrice": data['close'].iloc[-1],
                        "stopLoss": data['close'].iloc[-1] * 0.98,
                        "takeProfit": data['close'].iloc[-1] * 1.04
                    }

                return {"action": "HOLD"}
        ```
    """

    def __init__(self):
        """Initialize the strategy."""
        self.name: str = "BaseStrategy"
        self.version: str = "1.0.0"
        self.description: Optional[str] = None
        self.author: Optional[str] = None

    @abstractmethod
    def on_data(self, data: pd.DataFrame) -> Dict[str, Any]:
        """
        Called when new candle data arrives at candle close.

        This is the main method you need to implement. It receives historical market data
        and should return a trading signal.

        Args:
            data (pd.DataFrame): Historical OHLCV data with columns:
                - timestamp: Unix timestamp
                - open: Opening price
                - high: Highest price
                - low: Lowest price
                - close: Closing price
                - volume: Trading volume

                The DataFrame is sorted by timestamp in ascending order, with the most
                recent candle at the end (index -1).

        Returns:
            dict: A dictionary containing the trading signal with the following keys:

                Required:
                    - action (str): One of "BUY", "SELL", or "HOLD"

                Optional:
                    - entryPrice (float): Suggested entry price (defaults to current close)
                    - stopLoss (float): Stop loss price
                    - takeProfit (float): Take profit price
                    - confidence (float): Confidence level 0.0-1.0
                    - metadata (dict): Additional information for logging

                Example returns:
                    {"action": "HOLD"}

                    {
                        "action": "BUY",
                        "entryPrice": 45000.0,
                        "stopLoss": 44100.0,
                        "takeProfit": 46800.0,
                        "confidence": 0.85
                    }

        Raises:
            NotImplementedError: If the method is not overridden in a subclass.
        """
        raise NotImplementedError("Subclasses must implement on_data()")

    def on_start(self) -> None:
        """
        Called once when the strategy starts.

        Use this method to initialize any state, load models, or perform setup tasks.
        This is called before the first on_data() call.
        """
        pass

    def on_stop(self) -> None:
        """
        Called once when the strategy stops.

        Use this method to clean up resources, save state, or perform teardown tasks.
        This is called after the last on_data() call.
        """
        pass

    def on_trade(self, trade: Dict[str, Any]) -> None:
        """
        Called after a trade is executed (optional callback).

        Args:
            trade (dict): Information about the executed trade:
                - action: "BUY" or "SELL"
                - symbol: Trading pair
                - quantity: Amount traded
                - price: Execution price
                - timestamp: Execution time
        """
        pass

    def __repr__(self) -> str:
        """String representation of the strategy."""
        return f"{self.__class__.__name__}(name='{self.name}', version='{self.version}')"
