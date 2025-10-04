"""
Technical Indicators Module

Comprehensive library of technical indicators for strategy development.
Based on the indicators from the original cdcx_50_v1.py file.
"""

import pandas as pd
import numpy as np
from typing import Tuple, Union, Optional


class TechnicalIndicators:
    """Collection of technical indicators for trading strategies."""

    @staticmethod
    def sma(df: pd.DataFrame, period: int, column: str = 'close') -> pd.Series:
        """
        Simple Moving Average

        Args:
            df: DataFrame with price data
            period: Number of periods for SMA
            column: Column name to calculate SMA on

        Returns:
            Series with SMA values
        """
        return df[column].rolling(window=period).mean()

    @staticmethod
    def ema(df: pd.DataFrame, period: int, column: str = 'close') -> pd.Series:
        """
        Exponential Moving Average

        Args:
            df: DataFrame with price data
            period: Number of periods for EMA
            column: Column name to calculate EMA on

        Returns:
            Series with EMA values
        """
        return df[column].ewm(span=period, adjust=False).mean()

    @staticmethod
    def bollinger_bands(df: pd.DataFrame, period: int = 20, std_dev: float = 2.0,
                       column: str = 'close') -> Tuple[pd.Series, pd.Series, pd.Series]:
        """
        Bollinger Bands

        Args:
            df: DataFrame with price data
            period: Number of periods for calculation
            std_dev: Standard deviation multiplier
            column: Column name to calculate on

        Returns:
            Tuple of (lower_band, middle_band, upper_band)
        """
        rolling_mean = df[column].rolling(window=period).mean()
        rolling_std = df[column].rolling(window=period).std()

        upper_band = rolling_mean + (std_dev * rolling_std)
        lower_band = rolling_mean - (std_dev * rolling_std)

        return lower_band, rolling_mean, upper_band

    @staticmethod
    def macd(df: pd.DataFrame, fast_period: int = 12, slow_period: int = 26,
             signal_period: int = 9, column: str = 'close') -> Tuple[pd.Series, pd.Series, pd.Series]:
        """
        MACD (Moving Average Convergence Divergence)

        Args:
            df: DataFrame with price data
            fast_period: Fast EMA period
            slow_period: Slow EMA period
            signal_period: Signal line EMA period
            column: Column name to calculate on

        Returns:
            Tuple of (macd_line, signal_line, histogram)
        """
        fast_ema = TechnicalIndicators.ema(df, fast_period, column)
        slow_ema = TechnicalIndicators.ema(df, slow_period, column)

        macd_line = fast_ema - slow_ema
        signal_line = macd_line.ewm(span=signal_period, adjust=False).mean()
        histogram = macd_line - signal_line

        return macd_line, signal_line, histogram

    @staticmethod
    def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
        """
        Average True Range

        Args:
            df: DataFrame with OHLC data
            period: Number of periods for ATR calculation

        Returns:
            Series with ATR values
        """
        high_low = df['high'] - df['low']
        high_close_prev = (df['high'] - df['close'].shift()).abs()
        low_close_prev = (df['low'] - df['close'].shift()).abs()

        true_range = pd.concat([high_low, high_close_prev, low_close_prev], axis=1).max(axis=1)
        atr = true_range.rolling(window=period).mean()

        return atr

    @staticmethod
    def rsi(df: pd.DataFrame, period: int = 14, column: str = 'close') -> pd.Series:
        """
        Relative Strength Index

        Args:
            df: DataFrame with price data
            period: Number of periods for RSI calculation
            column: Column name to calculate on

        Returns:
            Series with RSI values
        """
        delta = df[column].diff()
        gain = delta.clip(lower=0)
        loss = -delta.clip(upper=0)

        avg_gain = gain.rolling(window=period).mean()
        avg_loss = loss.rolling(window=period).mean().replace(0, np.nan)

        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))
        rsi = rsi.replace([np.inf, -np.inf], 0).fillna(0)

        return rsi

    @staticmethod
    def mfi(df: pd.DataFrame, period: int = 14) -> pd.Series:
        """
        Money Flow Index

        Args:
            df: DataFrame with OHLCV data
            period: Number of periods for MFI calculation

        Returns:
            Series with MFI values
        """
        typical_price = (df['high'] + df['low'] + df['close']) / 3
        money_flow = typical_price * df['volume']
        diff = typical_price.diff()

        positive_flow = money_flow.where(diff > 0, 0)
        negative_flow = money_flow.where(diff < 0, 0)

        positive_sum = positive_flow.rolling(window=period).sum()
        negative_sum = negative_flow.rolling(window=period).sum().replace(0, np.nan)

        money_flow_ratio = positive_sum / negative_sum
        mfi = 100 - (100 / (1 + money_flow_ratio))
        mfi = mfi.replace([np.inf, -np.inf], 0).fillna(0)

        return mfi

    @staticmethod
    def supertrend(df: pd.DataFrame, period: int = 10, multiplier: float = 3.0) -> Tuple[pd.Series, pd.Series]:
        """
        Supertrend Indicator

        Args:
            df: DataFrame with OHLC data
            period: ATR period
            multiplier: ATR multiplier

        Returns:
            Tuple of (supertrend_values, trend_direction)
        """
        df_temp = df.copy()
        atr_values = TechnicalIndicators.atr(df_temp, period)
        df_temp['atr'] = atr_values

        hl2 = (df_temp['high'] + df_temp['low']) / 2

        df_temp['upper_band'] = hl2 + (multiplier * df_temp['atr'])
        df_temp['lower_band'] = hl2 - (multiplier * df_temp['atr'])

        supertrend_values = pd.Series(index=df.index, dtype=float)
        trend_direction = pd.Series([True] * len(df), index=df.index)

        for i in range(period, len(df)):
            if df_temp['close'].iloc[i] > df_temp['upper_band'].iloc[i - 1]:
                trend_direction.iloc[i] = True
            elif df_temp['close'].iloc[i] < df_temp['lower_band'].iloc[i - 1]:
                trend_direction.iloc[i] = False
            else:
                trend_direction.iloc[i] = trend_direction.iloc[i - 1]

            if trend_direction.iloc[i]:
                supertrend_values.iloc[i] = max(df_temp['lower_band'].iloc[i],
                                              supertrend_values.iloc[i - 1] if i > period else df_temp['lower_band'].iloc[i])
            else:
                supertrend_values.iloc[i] = min(df_temp['upper_band'].iloc[i],
                                              supertrend_values.iloc[i - 1] if i > period else df_temp['upper_band'].iloc[i])

        return supertrend_values, trend_direction

    @staticmethod
    def stochastic(df: pd.DataFrame, k_period: int = 14, d_period: int = 3) -> Tuple[pd.Series, pd.Series]:
        """
        Stochastic Oscillator

        Args:
            df: DataFrame with OHLC data
            k_period: %K period
            d_period: %D period

        Returns:
            Tuple of (%K, %D)
        """
        lowest_low = df['low'].rolling(window=k_period).min()
        highest_high = df['high'].rolling(window=k_period).max()

        k_percent = 100 * ((df['close'] - lowest_low) / (highest_high - lowest_low))
        d_percent = k_percent.rolling(window=d_period).mean()

        return k_percent, d_percent

    @staticmethod
    def williams_r(df: pd.DataFrame, period: int = 14) -> pd.Series:
        """
        Williams %R

        Args:
            df: DataFrame with OHLC data
            period: Number of periods

        Returns:
            Series with Williams %R values
        """
        highest_high = df['high'].rolling(window=period).max()
        lowest_low = df['low'].rolling(window=period).min()

        williams_r = -100 * ((highest_high - df['close']) / (highest_high - lowest_low))

        return williams_r

    @staticmethod
    def cci(df: pd.DataFrame, period: int = 20) -> pd.Series:
        """
        Commodity Channel Index

        Args:
            df: DataFrame with OHLC data
            period: Number of periods

        Returns:
            Series with CCI values
        """
        typical_price = (df['high'] + df['low'] + df['close']) / 3
        sma_tp = typical_price.rolling(window=period).mean()
        mean_deviation = typical_price.rolling(window=period).apply(
            lambda x: np.mean(np.abs(x - x.mean()))
        )

        cci = (typical_price - sma_tp) / (0.015 * mean_deviation)

        return cci

    @staticmethod
    def zigzag(df: pd.DataFrame, threshold_pct: float = 5.0) -> pd.Series:
        """
        ZigZag Indicator

        Args:
            df: DataFrame with price data
            threshold_pct: Threshold percentage for zigzag

        Returns:
            Series with zigzag values
        """
        prices = df['close'].copy()
        zigzag = pd.Series(index=df.index, dtype=float)

        last_peak = prices.iloc[0]
        last_trough = prices.iloc[0]
        trend = 1  # 1 for uptrend, -1 for downtrend

        for i in range(1, len(prices)):
            current_price = prices.iloc[i]

            if trend == 1:  # Uptrend
                if current_price > last_peak:
                    last_peak = current_price
                elif (last_peak - current_price) / last_peak * 100 >= threshold_pct:
                    zigzag.iloc[i] = last_peak
                    trend = -1
                    last_trough = current_price
            else:  # Downtrend
                if current_price < last_trough:
                    last_trough = current_price
                elif (current_price - last_trough) / last_trough * 100 >= threshold_pct:
                    zigzag.iloc[i] = last_trough
                    trend = 1
                    last_peak = current_price

        return zigzag.fillna(method='forward')

    @staticmethod
    def zscore(series: pd.Series, window: int = 20) -> pd.Series:
        """
        Z-Score (standardized score)

        Args:
            series: Series to calculate z-score on
            window: Rolling window size

        Returns:
            Series with z-score values
        """
        rolling_mean = series.rolling(window=window).mean()
        rolling_std = series.rolling(window=window).std()

        zscore = (series - rolling_mean) / rolling_std.replace(0, 1e-6)

        return zscore

    @staticmethod
    def vwap(df: pd.DataFrame) -> pd.Series:
        """
        Volume Weighted Average Price

        Args:
            df: DataFrame with OHLCV data

        Returns:
            Series with VWAP values
        """
        typical_price = (df['high'] + df['low'] + df['close']) / 3
        volume_price = typical_price * df['volume']

        vwap = volume_price.cumsum() / df['volume'].cumsum()

        return vwap

    @staticmethod
    def obv(df: pd.DataFrame) -> pd.Series:
        """
        On Balance Volume

        Args:
            df: DataFrame with price and volume data

        Returns:
            Series with OBV values
        """
        price_change = df['close'].diff()
        volume_direction = np.where(price_change > 0, df['volume'],
                                  np.where(price_change < 0, -df['volume'], 0))

        obv = pd.Series(volume_direction, index=df.index).cumsum()

        return obv

    def calculate_all_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Calculate all common indicators for a DataFrame.

        Args:
            df: DataFrame with OHLCV data

        Returns:
            DataFrame with all indicators added
        """
        result_df = df.copy()

        # Moving averages
        result_df['sma_20'] = self.sma(df, 20)
        result_df['sma_50'] = self.sma(df, 50)
        result_df['ema_12'] = self.ema(df, 12)
        result_df['ema_26'] = self.ema(df, 26)

        # Bollinger Bands
        bb_lower, bb_middle, bb_upper = self.bollinger_bands(df)
        result_df['bb_lower'] = bb_lower
        result_df['bb_middle'] = bb_middle
        result_df['bb_upper'] = bb_upper
        result_df['bb_width'] = bb_upper - bb_lower

        # MACD
        macd_line, signal_line, histogram = self.macd(df)
        result_df['macd'] = macd_line
        result_df['macd_signal'] = signal_line
        result_df['macd_histogram'] = histogram

        # Oscillators
        result_df['rsi'] = self.rsi(df)
        result_df['mfi'] = self.mfi(df)

        # Trend indicators
        result_df['atr'] = self.atr(df)
        supertrend_values, trend_direction = self.supertrend(df)
        result_df['supertrend'] = supertrend_values
        result_df['trend_up'] = trend_direction

        # Stochastic
        stoch_k, stoch_d = self.stochastic(df)
        result_df['stoch_k'] = stoch_k
        result_df['stoch_d'] = stoch_d

        # Volume indicators
        result_df['vwap'] = self.vwap(df)
        result_df['obv'] = self.obv(df)

        # Z-score for Bollinger Band width (volatility measure)
        result_df['bb_zscore'] = self.zscore(result_df['bb_width'], 20)

        return result_df