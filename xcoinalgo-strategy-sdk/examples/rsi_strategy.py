"""
RSI (Relative Strength Index) Mean Reversion Strategy

A mean reversion strategy that buys when RSI indicates oversold conditions
and sells when RSI indicates overbought conditions.

Strategy Logic:
- Buy when RSI < 30 (oversold)
- Sell when RSI > 70 (overbought)
- Use ATR-based stop loss and take profit
"""

from xcoinalgo import BaseStrategy
import pandas as pd
import numpy as np


class RSIStrategy(BaseStrategy):
    def __init__(self, rsi_period: int = 14, oversold: int = 30, overbought: int = 70):
        super().__init__()
        self.name = "RSI Mean Reversion"
        self.version = "1.0.0"
        self.description = "Mean reversion strategy using RSI indicator"
        self.author = "XcoinAlgo Team"
        self.rsi_period = rsi_period
        self.oversold = oversold
        self.overbought = overbought

    def calculate_rsi(self, prices: pd.Series, period: int = 14) -> pd.Series:
        delta = prices.diff()
        gain = delta.where(delta > 0, 0)
        loss = -delta.where(delta < 0, 0)
        avg_gain = gain.rolling(window=period).mean()
        avg_loss = loss.rolling(window=period).mean()
        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))
        return rsi

    def on_data(self, data: pd.DataFrame) -> dict:
        if len(data) < self.rsi_period + 1:
            return {"action": "HOLD"}

        rsi = self.calculate_rsi(data['close'], self.rsi_period)
        current_rsi = rsi.iloc[-1]

        if pd.isna(current_rsi):
            return {"action": "HOLD"}

        current_price = data['close'].iloc[-1]

        if current_rsi < self.oversold:
            return {
                "action": "BUY",
                "entryPrice": current_price,
                "stopLoss": current_price * 0.98,
                "takeProfit": current_price * 1.04,
                "confidence": (self.oversold - current_rsi) / self.oversold,
                "metadata": {"rsi": current_rsi, "condition": "oversold"}
            }
        elif current_rsi > self.overbought:
            return {
                "action": "SELL",
                "entryPrice": current_price,
                "stopLoss": current_price * 1.02,
                "takeProfit": current_price * 0.96,
                "confidence": (current_rsi - self.overbought) / (100 - self.overbought),
                "metadata": {"rsi": current_rsi, "condition": "overbought"}
            }

        return {"action": "HOLD"}
