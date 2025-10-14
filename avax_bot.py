"""
AVAX Dual-Mode Strategy (Trend + Mean Reversion)
Multi-Tenant Compatible Version

This strategy combines trend-following and mean-reversion signals using:
- SuperTrend for trend direction
- Bollinger Bands for volatility regime detection
- EMAs for trend confirmation
- RSI for overbought/oversold conditions

Author: Quant Team
Version: 1.0.0
"""

import os
import sys
import requests
import hmac
import hashlib
import json
import csv
import logging
import time
import warnings
import pandas as pd
import pandas_ta as ta
import numpy as np
from decimal import Decimal, ROUND_DOWN
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone, timedelta

warnings.filterwarnings("ignore")


# ==============================================================================
# STRATEGY CONFIGURATION
# ==============================================================================
STRATEGY_CONFIG = {
    # Strategy metadata
    "name": "AVAX Dual Mode Strategy",
    "code": "AVAX_DUALMODE_V1",
    "author": "Quant Team",
    "description": "Dual-mode strategy combining trend-following and mean-reversion signals",
    "strategyType": "livetrader",

    # Trading pair and resolution
    "pair": "B-AVAX_USDT",
    "margin_currency": "USDT",
    "resolution": "5",

    # Backtest configuration
    "initial_capital": 1000,
    "leverage": 15,
    "risk_per_trade": 0.02,
    "commission_rate": 0.0005,
    "backtest_start_date": "2024-01-01",

    # SuperTrend indicator parameters
    "st_period": 10,
    "st_multiplier": 3.64,

    # EMA parameters
    "ema_fast_len": 9,
    "ema_slow_len": 21,

    # Bollinger Bands parameters
    "bb_len": 20,
    "bb_std": 2.0,

    # Volatility regime detection
    "zscore_thresh": 1.5,
    "bbw_zscore_len": 20,

    # RSI parameters
    "rsi_len": 14,
    "rsi_oversold": 30,
    "rsi_overbought": 70,

    # ATR and volume parameters
    "atr_len": 14,
    "vol_ma_len": 20,

    # Exit parameters for trend trades
    "hold_trend": 24,
    "sl_atr_trend": 2.0,
    "tp_atr_trend": 4.0,

    # Exit parameters for reversion trades
    "hold_reversion": 12,
    "sl_atr_reversion": 1.5,
    "tp_atr_reversion": 2.5,
}


# ==============================================================================
# SECTION 1: API CLIENT
# ==============================================================================
class CoinDCXClient:
    """CoinDCX Exchange API Client"""

    def __init__(self, key: str, secret: str):
        self.api_key = key
        self.api_secret = secret.encode('utf-8')
        self.base_url = "https://api.coindcx.com"
        self.public_base_url = "https://public.coindcx.com"

    def _sign(self, data: str) -> str:
        return hmac.new(self.api_secret, data.encode(), hashlib.sha256).hexdigest()

    def _make_public_request(self, method: str, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Any:
        url = self.public_base_url + endpoint
        try:
            response = requests.request(method.upper(), url, params=params, timeout=10)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as err:
            logging.error(f"HTTP Error: {err.response.status_code} - {err.response.text}")
            raise
        except requests.exceptions.RequestException as e:
            logging.error(f"Request Exception: {e}")
            raise

    def _make_request(self, method: str, endpoint: str, data: Optional[Dict[str, Any]] = None) -> Any:
        url = self.base_url + endpoint
        if data is None:
            data = {}

        data['timestamp'] = int(time.time() * 1000)

        try:
            if method.upper() == 'GET':
                query_string = '&'.join([f"{key}={data[key]}" for key in sorted(data)])
                signature = self._sign(query_string)
                headers = {'X-AUTH-APIKEY': self.api_key, 'X-AUTH-SIGNATURE': signature}
                response = requests.request(method.upper(), url, params=data, headers=headers, timeout=10)
            else:  # POST
                json_body = json.dumps(data, separators=(',', ':'))
                signature = self._sign(json_body)
                headers = {'Content-Type': 'application/json', 'X-AUTH-APIKEY': self.api_key, 'X-AUTH-SIGNATURE': signature}
                response = requests.request(method.upper(), url, data=json_body, headers=headers, timeout=10)

            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as err:
            logging.error(f"HTTP Error for {method} {url}: {err.response.status_code} - {err.response.text}")
            raise
        except requests.exceptions.RequestException as e:
            logging.error(f"Request Exception: {e}")
            raise

    def get_instrument_details(self, pair: str, margin_currency: str) -> Dict[str, Any]:
        endpoint = "/exchange/v1/derivatives/futures/data/instrument"
        params = {"pair": pair, "margin_currency_short_name": margin_currency}
        return self._make_request('GET', endpoint, params)

    def get_instrument_candlesticks(self, pair: str, from_ts: int, to_ts: int, resolution: str) -> Dict[str, Any]:
        endpoint = "/market_data/candlesticks"
        params = {"pair": pair, "from": from_ts, "to": to_ts, "resolution": resolution, "pcode": "f"}
        return self._make_public_request('GET', endpoint, params=params)

    def get_wallet_details(self) -> List[Dict[str, Any]]:
        return self._make_request('GET', '/exchange/v1/derivatives/futures/wallets')

    def create_order(self, pair: str, side: str, order_type: str, total_quantity: float, leverage: int, **kwargs) -> List[Dict[str, Any]]:
        order_details = {"side": side, "pair": pair, "order_type": order_type, "total_quantity": total_quantity, "leverage": leverage}
        allowed_keys = ["price", "stop_price", "client_order_id", "margin_currency_short_name"]
        order_details.update({k: v for k, v in kwargs.items() if k in allowed_keys})
        payload = {"order": order_details}
        return self._make_request('POST', '/exchange/v1/derivatives/futures/orders/create', payload)

    def list_positions(self, margin_currency_short_name: List[str] = ["USDT"]) -> List[Dict[str, Any]]:
        payload = {"page": 1, "size": 100, "margin_currency_short_name": margin_currency_short_name}
        return self._make_request('POST', '/exchange/v1/derivatives/futures/positions', payload)

    def exit_position(self, position_id: str) -> Dict[str, Any]:
        return self._make_request('POST', '/exchange/v1/derivatives/futures/positions/exit', {"id": position_id})


# ==============================================================================
# SECTION 2: STRATEGY LOGIC
# ==============================================================================
def generate_signals_from_strategy(df: pd.DataFrame, params: dict) -> pd.DataFrame:
    """
    Generate trading signals from OHLCV data using dual-mode strategy.

    Args:
        df: DataFrame with columns [timestamp, open, high, low, close, volume]
        params: Strategy parameters (indicators, thresholds, etc.)

    Returns:
        DataFrame with additional signal columns
    """
    try:
        # Load all strategy parameters
        st_period, st_multiplier = int(params['st_period']), float(params['st_multiplier'])
        ema_fast_len, ema_slow_len = int(params['ema_fast_len']), int(params['ema_slow_len'])
        bb_len, bb_std = int(params['bb_len']), float(params['bb_std'])
        zscore_thresh = float(params['zscore_thresh'])
        rsi_oversold, rsi_overbought = int(params['rsi_oversold']), int(params['rsi_overbought'])
    except (ValueError, TypeError, KeyError) as e:
        logging.error(f"Invalid or missing parameter in strategy settings: {e}")
        return pd.DataFrame()

    df_copy = df.copy()

    try:
        # Calculate Bollinger Bands and discover column names
        df_copy.ta.bbands(length=bb_len, std=bb_std, append=True)
        bb_upper_col = next((col for col in df_copy.columns if col.startswith(f'BBU_{bb_len}')), None)
        bb_lower_col = next((col for col in df_copy.columns if col.startswith(f'BBL_{bb_len}')), None)
        if not bb_upper_col or not bb_lower_col:
            raise KeyError("Could not find Bollinger Bands columns after calculation.")

        # Calculate SuperTrend and discover its direction column name
        df_copy.ta.supertrend(period=st_period, multiplier=st_multiplier, append=True)
        supertrend_dir_col = next((col for col in df_copy.columns if col.startswith('SUPERTd')), None)
        if not supertrend_dir_col:
            raise KeyError("Could not find SuperTrend direction column after calculation.")

        # Calculate other indicators
        df_copy['ema_fast'] = ta.ema(df_copy['close'], length=ema_fast_len)
        df_copy['ema_slow'] = ta.ema(df_copy['close'], length=ema_slow_len)
        df_copy['rsi'] = ta.rsi(df_copy['close'], length=params['rsi_len'])
        df_copy['atr'] = ta.atr(df_copy['high'], df_copy['low'], df_copy['close'], length=params['atr_len'])
        df_copy['volume_ma'] = df_copy['volume'].rolling(params['vol_ma_len']).mean()

        df_copy['bb_width'] = df_copy[bb_upper_col] - df_copy[bb_lower_col]
        df_copy['bbw_zscore'] = ta.zscore(df_copy['bb_width'], length=params['bbw_zscore_len'])

        df_copy['trend_up'] = (df_copy[supertrend_dir_col] == 1)

    except Exception as e:
        logging.error(f"Error calculating indicators: {e}", exc_info=True)
        return pd.DataFrame()

    # Volatility regime detection
    is_trending = df_copy['bbw_zscore'] > zscore_thresh
    is_ranging = df_copy['bbw_zscore'] < -zscore_thresh

    # Trend-following signals
    long_macro_trend = df_copy['close'] > df_copy['ema_slow']
    long_pullback = (df_copy['low'] < df_copy['ema_fast']) & (df_copy['close'] > df_copy['ema_fast'])
    vol_confirm = df_copy['volume'] > df_copy['volume_ma']
    short_macro_trend = df_copy['close'] < df_copy['ema_slow']
    short_pullback = (df_copy['high'] > df_copy['ema_fast']) & (df_copy['close'] < df_copy['ema_fast'])

    # Mean reversion signals
    long_at_extreme = df_copy['close'] < df_copy[bb_lower_col]
    long_reversal = (df_copy['rsi'] > rsi_oversold) & (df_copy['rsi'].shift(1) <= rsi_oversold)
    short_at_extreme = df_copy['close'] > df_copy[bb_upper_col]
    short_reversal = (df_copy['rsi'] < rsi_overbought) & (df_copy['rsi'].shift(1) >= rsi_overbought)

    # Combined signals
    df_copy['long_trend_signal'] = is_trending & long_macro_trend & df_copy['trend_up'] & long_pullback & vol_confirm
    df_copy['short_trend_signal'] = is_trending & short_macro_trend & ~df_copy['trend_up'] & short_pullback & vol_confirm
    df_copy['long_reversion_signal'] = is_ranging & long_at_extreme & long_reversal
    df_copy['short_reversion_signal'] = is_ranging & short_at_extreme & short_reversal

    df_copy['long_signal'] = df_copy['long_trend_signal'] | df_copy['long_reversion_signal']
    df_copy['short_signal'] = df_copy['short_trend_signal'] | df_copy['short_reversion_signal']

    for col in ['long_signal', 'short_signal']:
        df_copy[col] = df_copy[col].fillna(False).astype(bool)

    df_copy.dropna(inplace=True)
    return df_copy


# ==============================================================================
# SECTION 3: LOGGING UTILITIES
# ==============================================================================
class CsvHandler(logging.FileHandler):
    """Custom logging handler that writes to CSV format"""

    def __init__(self, filename, mode='a', encoding=None, delay=False):
        os.makedirs(os.path.dirname(filename), exist_ok=True)
        super().__init__(filename, mode, encoding, delay)
        if os.path.getsize(filename) == 0:
            self._write_header()

    def _write_header(self):
        with open(self.baseFilename, 'w', newline='') as f:
            csv.writer(f).writerow(['timestamp', 'level', 'message', 'function', 'line'])

    def emit(self, record):
        try:
            with open(self.baseFilename, 'a', newline='') as f:
                csv.writer(f).writerow([
                    datetime.fromtimestamp(record.created).strftime('%Y-%m-%d %H:%M:%S'),
                    record.levelname, record.getMessage(), record.funcName, record.lineno
                ])
        except Exception:
            self.handleError(record)


def setup_logging():
    """Setup logging configuration"""
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)
    if logger.hasHandlers():
        logger.handlers.clear()

    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')

    # Console handler
    ch = logging.StreamHandler(sys.stdout)
    ch.setFormatter(formatter)
    logger.addHandler(ch)

    # File handler
    fh = logging.FileHandler('trading_bot.log', mode='a')
    fh.setFormatter(formatter)
    logger.addHandler(fh)

    # CSV handler for errors
    csv_h = CsvHandler('logs/error_log.csv')
    csv_h.setLevel(logging.ERROR)
    logger.addHandler(csv_h)


# ==============================================================================
# SECTION 4: LIVE TRADER
# ==============================================================================
class LiveTrader:
    """
    Live trading bot for executing strategy in real-time.

    This class handles:
    - Fetching market data (once per candle)
    - Checking for signals
    - Managing positions for MULTIPLE subscribers (multi-tenant)
    - Placing orders via exchange API for each subscriber

    Multi-Tenant Design:
    - Backend passes a list of subscribers
    - Each subscriber has their own API keys, capital, and risk parameters
    - LiveTrader loops through subscribers and places orders for each
    """

    def __init__(self, settings: Dict[str, Any], subscribers: List[Dict[str, Any]]):
        """
        Initialize LiveTrader with settings and subscribers.

        Args:
            settings: Dict containing strategy configuration:
                - pair: Trading pair (e.g., 'B-AVAX_USDT')
                - margin_currency: Margin currency (e.g., 'USDT')
                - resolution: Candle resolution (e.g., '5' for 5min)
                - strategy_id: Unique strategy identifier
                - ... indicator parameters (st_period, ema_fast_len, etc.)

            subscribers: List[Dict] where each subscriber has:
                - user_id: Unique user identifier
                - api_key: User's exchange API key
                - api_secret: User's exchange API secret
                - capital: User's trading capital
                - leverage: User's leverage setting
                - risk_per_trade: User's risk per trade (e.g., 0.02 for 2%)
        """
        self.settings = settings
        self.subscribers = subscribers

        # Fetch instrument details (shared across all subscribers)
        try:
            logging.info(f"Fetching instrument details for {self.settings['pair']}...")
            # Use first subscriber's credentials for public/shared data
            temp_client = CoinDCXClient(
                key=subscribers[0]['api_key'],
                secret=subscribers[0]['api_secret']
            )
            instrument_data = temp_client.get_instrument_details(
                pair=self.settings['pair'],
                margin_currency=self.settings['margin_currency']
            )
            self.instrument_details = instrument_data['instrument']
            self.qty_increment = Decimal(self.instrument_details['quantity_increment'])
            logging.info(f"Successfully fetched details for {self.settings['pair']}.")
        except Exception as e:
            logging.error(f"Could not fetch instrument details. Error: {e}", exc_info=True)
            # Continue without instrument details - we'll handle this per subscriber
            self.instrument_details = None
            self.qty_increment = Decimal('0.001')  # Default fallback


    def get_latest_data(self) -> pd.DataFrame:
        """
        Fetch latest market data from exchange.
        Uses public endpoint (no authentication needed).

        Returns:
            DataFrame with OHLCV data for signal generation
        """
        res_map = {"1": 60, "5": 300, "15": 900, "60": 3600}
        res_sec = res_map.get(self.settings['resolution'], 300)
        to_ts = int(datetime.now(timezone.utc).timestamp()) - res_sec
        from_ts = to_ts - (300 * res_sec)

        try:
            # Use first subscriber's client for public data fetch
            temp_client = CoinDCXClient(
                key=self.subscribers[0]['api_key'],
                secret=self.subscribers[0]['api_secret']
            )
            data = temp_client.get_instrument_candlesticks(
                self.settings['pair'],
                from_ts,
                to_ts,
                self.settings['resolution']
            )
            df = pd.DataFrame(data['data'])
            df['timestamp'] = pd.to_datetime(df['time'], unit='ms', utc=True)
            df = df[['timestamp', 'open', 'high', 'low', 'close', 'volume']]
            for col in df.columns[1:]:
                df[col] = pd.to_numeric(df[col], errors='coerce')
            return df.sort_values('timestamp').reset_index(drop=True)
        except Exception as e:
            logging.error(f"Error fetching candlestick data: {e}", exc_info=True)
            return pd.DataFrame()


    def check_for_new_signal(self, df: pd.DataFrame):
        """
        Check for new trading signals and place orders for ALL subscribers.

        This is the MULTI-TENANT entry point called by the backend.
        It:
        1. Generates signals from market data
        2. Determines if there's a trading signal
        3. Loops through all subscribers and places orders for each

        Args:
            df: DataFrame with OHLCV data (no signals yet - we'll generate them)
        """
        if df.empty or len(df) < 200:
            logging.warning(f"Insufficient data ({len(df)} candles). Skipping signal check.")
            return

        # Generate signals using strategy logic
        logging.info("Generating signals from market data...")
        df_signals = generate_signals_from_strategy(df, self.settings)

        if df_signals.empty:
            logging.warning("Signal generation failed. Skipping.")
            return

        # Check latest candle for signals
        candle = df_signals.iloc[-1]
        signal, trade_type = None, None

        if candle['long_signal']:
            signal = 'buy'
            trade_type = 'trend' if candle['long_trend_signal'] else 'reversion'
        elif candle['short_signal']:
            signal = 'sell'
            trade_type = 'trend' if candle['short_trend_signal'] else 'reversion'

        if not signal:
            logging.info("No trading signal detected. Skipping.")
            return

        # Signal detected! Place orders for all subscribers
        logging.info(
            f"🎯 {signal.upper()} ({trade_type}) signal detected at {candle['close']:.4f}"
        )
        logging.info(f"Processing orders for {len(self.subscribers)} subscribers...")

        successful_orders = 0
        failed_orders = 0

        for subscriber in self.subscribers:
            try:
                user_id = subscriber.get('user_id', 'unknown')
                logging.info(f"\n{'='*60}")
                logging.info(f"Processing subscriber: {user_id}")

                # Create API client for THIS subscriber
                client = CoinDCXClient(
                    key=subscriber['api_key'],
                    secret=subscriber['api_secret']
                )

                # Get THIS subscriber's wallet balance
                wallet = next(
                    (w for w in client.get_wallet_details()
                     if w['currency_short_name'] == self.settings['margin_currency']),
                    None
                )
                if not wallet:
                    raise Exception(f"Wallet not found for {user_id}")

                # Calculate position size based on THIS subscriber's capital and risk
                balance = float(wallet['balance'])
                capital = subscriber.get('capital', balance)  # Use specified capital or wallet balance
                risk_per_trade = subscriber.get('risk_per_trade', 0.02)
                leverage = subscriber.get('leverage', 10)

                risk_amount = capital * risk_per_trade
                notional_value = risk_amount * leverage
                quantity = notional_value / candle['close']
                adj_qty = (Decimal(str(quantity)) // self.qty_increment) * self.qty_increment

                if adj_qty <= 0:
                    logging.warning(f"Calculated quantity is zero for {user_id}. Skipping.")
                    failed_orders += 1
                    continue

                # Place order for THIS subscriber
                logging.info(
                    f"Placing {signal.upper()} order for {user_id}: "
                    f"{adj_qty} units @ {leverage}x leverage"
                )

                client.create_order(
                    pair=self.settings['pair'],
                    side=signal,
                    order_type="market_order",
                    total_quantity=float(adj_qty),
                    leverage=leverage,
                    margin_currency_short_name=self.settings['margin_currency']
                )

                logging.info(f"✅ Order placed successfully for {user_id}")
                successful_orders += 1

            except Exception as e:
                logging.error(f"❌ Failed to place order for {user_id}: {e}", exc_info=True)
                failed_orders += 1

        # Summary
        logging.info(f"\n{'='*60}")
        logging.info(
            f"Signal processing complete: "
            f"{successful_orders} successful, {failed_orders} failed"
        )
        logging.info(f"{'='*60}\n")

    def run(self):
        """
        Main trading loop for standalone execution (NOT USED in multi-tenant mode).

        Note: The platform backend calls check_for_new_signal() directly.
        This method is kept for backward compatibility and local testing only.
        """
        logging.warning(
            "LiveTrader.run() is not supported in multi-tenant mode. "
            "This class should be invoked via the backend executor."
        )
        raise NotImplementedError(
            "Multi-tenant LiveTrader does not support run() method. "
            "Use backend's live_trader_executor.py instead."
        )


# ==============================================================================
# SECTION 5: BACKTESTER
# ==============================================================================
class Backtester:
    """
    Backtesting engine for historical strategy validation.

    This class simulates strategy execution on historical data to evaluate
    performance metrics before live deployment.
    """

    def __init__(self, settings: dict):
        """
        Initialize Backtester with settings.

        Args:
            settings: Dict containing strategy parameters and backtest config
        """
        self.settings = settings
        self.client = CoinDCXClient(key="dummy", secret="dummy")
        self.capital = settings['initial_capital']
        self.trades = []
        self.position = {}

    def _fetch_historical_data(self) -> pd.DataFrame:
        """Fetch historical OHLCV data for backtesting"""
        end_dt = datetime.now(timezone.utc)
        start_dt = datetime.strptime(
            self.settings['backtest_start_date'],
            '%Y-%m-%d'
        ).replace(tzinfo=timezone.utc)
        end_ts, start_ts = int(end_dt.timestamp()), int(start_dt.timestamp())

        logging.info(
            f"Fetching data from {start_dt.strftime('%Y-%m-%d')} "
            f"to {end_dt.strftime('%Y-%m-%d')}"
        )

        all_candles = []
        chunk_end_ts = end_ts

        while chunk_end_ts > start_ts:
            chunk_start_ts = chunk_end_ts - (1000 * int(self.settings['resolution']) * 60)
            if chunk_start_ts < start_ts:
                chunk_start_ts = start_ts

            try:
                logging.info(
                    f" > Fetching chunk from "
                    f"{datetime.fromtimestamp(chunk_start_ts, tz=timezone.utc).strftime('%Y-%m-%d %H:%M')}"
                )
                data = self.client.get_instrument_candlesticks(
                    self.settings['pair'],
                    chunk_start_ts,
                    chunk_end_ts,
                    self.settings['resolution']
                )['data']

                if not data:
                    break

                all_candles.extend(data)
                chunk_end_ts = data[0]['time'] // 1000 - 1
                time.sleep(0.5)
            except Exception as e:
                logging.error(f"Error fetching data chunk: {e}")
                break

        if not all_candles:
            return pd.DataFrame()

        df = pd.DataFrame(all_candles)
        df.drop_duplicates(subset=['time'], inplace=True)
        df['timestamp'] = pd.to_datetime(df['time'], unit='ms', utc=True)
        df = df[['timestamp', 'open', 'high', 'low', 'close', 'volume']]
        for col in df.columns[1:]:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        return df.sort_values('timestamp').reset_index(drop=True)

    def run(self) -> List[Dict[str, Any]]:
        """
        Run backtest and return trade history.

        Returns:
            List of trade dictionaries with entry/exit details
        """
        historical_df = self._fetch_historical_data()
        if historical_df.empty:
            logging.error("No historical data. Aborting backtest.")
            return []

        df_signals = generate_signals_from_strategy(historical_df, self.settings)

        for i, row in df_signals.iterrows():
            # Check if we're in a position
            if self.position:
                trade_type = self.position['trade_type']

                # Get parameters based on trade type
                if trade_type == 'trend':
                    hold = self.settings['hold_trend']
                    sl_atr = self.settings['sl_atr_trend']
                    tp_atr = self.settings['tp_atr_trend']
                else:
                    hold = self.settings['hold_reversion']
                    sl_atr = self.settings['sl_atr_reversion']
                    tp_atr = self.settings['tp_atr_reversion']

                # Calculate SL/TP levels
                sl = (self.position['entry_price'] - sl_atr * row['atr']
                      if self.position['side'] == 'buy'
                      else self.position['entry_price'] + sl_atr * row['atr'])
                tp = (self.position['entry_price'] + tp_atr * row['atr']
                      if self.position['side'] == 'buy'
                      else self.position['entry_price'] - tp_atr * row['atr'])

                # Check exit conditions
                exit_reason, exit_price = None, 0
                if (i - self.position['entry_index']) >= hold:
                    exit_reason, exit_price = "Time limit", row['close']
                elif self.position['side'] == 'buy':
                    if row['low'] <= sl:
                        exit_reason, exit_price = "Stop Loss", sl
                    elif row['high'] >= tp:
                        exit_reason, exit_price = "Take Profit", tp
                    elif row['short_signal']:
                        exit_reason, exit_price = "Opposite signal", row['close']
                elif self.position['side'] == 'sell':
                    if row['high'] >= sl:
                        exit_reason, exit_price = "Stop Loss", sl
                    elif row['low'] <= tp:
                        exit_reason, exit_price = "Take Profit", tp
                    elif row['long_signal']:
                        exit_reason, exit_price = "Opposite signal", row['close']

                if exit_reason:
                    # Calculate PnL
                    pnl = ((exit_price - self.position['entry_price']) * self.position['size']
                           if self.position['side'] == 'buy'
                           else (self.position['entry_price'] - exit_price) * self.position['size'])
                    commission = ((self.position['entry_price'] * self.position['size'] +
                                   exit_price * self.position['size']) *
                                  self.settings['commission_rate'])
                    net_pnl = pnl - commission
                    self.capital += net_pnl

                    # Record trade
                    self.trades.append({
                        'entry_time': self.position['entry_time'],
                        'exit_time': row['timestamp'],
                        'side': self.position['side'],
                        'size': self.position['size'],
                        'entry_price': self.position['entry_price'],
                        'exit_price': exit_price,
                        'pnl': net_pnl,
                        'exit_reason': exit_reason,
                        'capital_after_trade': self.capital,
                        'trade_type': trade_type
                    })
                    self.position = {}

                    if self.capital <= 0:
                        logging.warning("Capital wiped out.")
                        break

            # Check for new entry signals
            if not self.position:
                signal, trade_type = None, None
                if row['long_signal']:
                    signal = 'buy'
                    trade_type = 'trend' if row['long_trend_signal'] else 'reversion'
                elif row['short_signal']:
                    signal = 'sell'
                    trade_type = 'trend' if row['short_trend_signal'] else 'reversion'

                if signal:
                    risk_amount = self.capital * self.settings['risk_per_trade']
                    notional = risk_amount * self.settings['leverage']
                    size = notional / row['close']

                    self.position = {
                        'side': signal,
                        'trade_type': trade_type,
                        'entry_price': row['close'],
                        'size': size,
                        'entry_time': row['timestamp'],
                        'entry_index': i
                    }

        return self.trades


def calculate_metrics(trades_df: pd.DataFrame, initial_capital: float) -> Dict[str, Any]:
    """
    Calculate performance metrics from backtest results.

    Args:
        trades_df: DataFrame with trade history
        initial_capital: Starting capital

    Returns:
        Dict with performance metrics
    """
    if trades_df.empty:
        return {"Total Trades": 0}

    final_capital = trades_df['capital_after_trade'].iloc[-1]
    total_return_pct = ((final_capital - initial_capital) / initial_capital) * 100
    wins = trades_df[trades_df['pnl'] > 0]
    gross_profit = wins['pnl'].sum()
    gross_loss = abs(trades_df[trades_df['pnl'] <= 0]['pnl'].sum())
    capital_series = pd.concat([pd.Series([initial_capital]), trades_df['capital_after_trade']])
    peak = capital_series.expanding().max()
    drawdown = (capital_series - peak) / peak

    return {
        "Total Trades": len(trades_df),
        "Win Rate (%)": round((len(wins) / len(trades_df)) * 100, 2) if len(trades_df) > 0 else 0,
        "Total Return (%)": round(total_return_pct, 2),
        "Profit Factor": round(gross_profit / gross_loss, 2) if gross_loss > 0 else float('inf'),
        "Max Drawdown (%)": round(abs(drawdown.min() * 100), 2),
    }
