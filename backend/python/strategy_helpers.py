"""
Strategy Helper Functions

Provides reusable utilities for multi-resolution strategy execution.
"""

import pandas as pd
import logging
from typing import Optional


def resample_ohlcv(
    df: pd.DataFrame,
    from_resolution: str,
    to_resolution: str
) -> pd.DataFrame:
    """
    Resample OHLCV dataframe from lower to higher timeframe.

    Args:
        df: DataFrame with OHLCV columns and datetime index/column
        from_resolution: Source resolution (e.g., "5m", "15m")
        to_resolution: Target resolution (must be >= from_resolution)

    Returns:
        Resampled DataFrame with proper OHLCV aggregation

    Example:
        >>> df_5m = get_latest_data()  # 5-minute candles
        >>> df_15m = resample_ohlcv(df_5m, "5m", "15m")  # Resample to 15-minute

    Raises:
        ValueError: If resolution strings are invalid or incompatible
    """
    # Resolution to pandas frequency mapping
    freq_map = {
        "1m": "1T",
        "5m": "5T",
        "15m": "15T",
        "30m": "30T",
        "1h": "1H",
        "4h": "4H",
        "1d": "1D"
    }

    # Validate resolutions
    if from_resolution not in freq_map:
        raise ValueError(f"Invalid from_resolution: {from_resolution}. Supported: {list(freq_map.keys())}")

    if to_resolution not in freq_map:
        raise ValueError(f"Invalid to_resolution: {to_resolution}. Supported: {list(freq_map.keys())}")

    target_freq = freq_map[to_resolution]

    # Make a copy to avoid modifying original
    df = df.copy()

    # Ensure datetime index
    if 'time' in df.columns and not isinstance(df.index, pd.DatetimeIndex):
        df['time'] = pd.to_datetime(df['time'])
        df = df.set_index('time')
    elif 'timestamp' in df.columns and not isinstance(df.index, pd.DatetimeIndex):
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df = df.set_index('timestamp')

    # Verify we have OHLCV columns
    required_cols = {'open', 'high', 'low', 'close', 'volume'}
    available_cols = set(df.columns)

    if not required_cols.issubset(available_cols):
        raise ValueError(f"Missing required OHLCV columns. Required: {required_cols}, Found: {available_cols}")

    # Resample with proper OHLCV aggregation rules
    agg_rules = {
        'open': 'first',   # First price in the period
        'high': 'max',     # Highest price in the period
        'low': 'min',      # Lowest price in the period
        'close': 'last',   # Last price in the period
        'volume': 'sum'    # Total volume in the period
    }

    # Add any additional columns (indicators, signals, etc.) with last value
    for col in df.columns:
        if col not in agg_rules:
            agg_rules[col] = 'last'

    # Perform resampling
    df_resampled = df.resample(target_freq).agg(agg_rules)

    # Drop incomplete candles (NaN values)
    df_resampled = df_resampled.dropna(subset=['open', 'high', 'low', 'close'])

    # Reset index to make 'time' a column again
    df_resampled = df_resampled.reset_index()

    # Rename index column back to original name
    if 'time' in df.columns or df.index.name == 'time':
        df_resampled = df_resampled.rename(columns={df_resampled.columns[0]: 'time'})
    elif 'timestamp' in df.columns or df.index.name == 'timestamp':
        df_resampled = df_resampled.rename(columns={df_resampled.columns[0]: 'timestamp'})

    logging.info(
        f"Resampled {len(df)} candles ({from_resolution}) → "
        f"{len(df_resampled)} candles ({to_resolution})"
    )

    return df_resampled


def forward_fill_signals(
    df_base: pd.DataFrame,
    df_signal: pd.DataFrame,
    signal_columns: list[str]
) -> pd.DataFrame:
    """
    Forward-fill signal columns from higher timeframe to lower timeframe.

    Args:
        df_base: Base resolution DataFrame (e.g., 5m)
        df_signal: Signal resolution DataFrame with signals (e.g., 15m)
        signal_columns: List of column names to forward-fill

    Returns:
        df_base with forward-filled signal columns

    Example:
        >>> df_5m = get_latest_data()
        >>> df_15m = resample_ohlcv(df_5m, "5m", "15m")
        >>> df_15m['signal'] = generate_signals(df_15m)
        >>> df_5m = forward_fill_signals(df_5m, df_15m, ['signal'])
    """
    df_base = df_base.copy()

    # Ensure both have datetime index
    if 'time' in df_base.columns:
        df_base = df_base.set_index('time')
    if 'time' in df_signal.columns:
        df_signal = df_signal.set_index('time')

    # Forward-fill each signal column
    for col in signal_columns:
        if col in df_signal.columns:
            df_base[col] = df_signal[col].reindex(df_base.index, method='ffill')

    # Reset index
    df_base = df_base.reset_index()

    return df_base
