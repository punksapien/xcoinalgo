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
# have to use numpy==1.26.4 pandas==2.2.2 and pandas_ta in order to use pandas_ta must have python 3.12 in the virtual env
# ==============================================================================
# SECTION 1: API CLIENT (The Communicator 📞)
# ==============================================================================
import requests
import hmac
import hashlib
import json
import time
from decimal import Decimal, ROUND_DOWN
from typing import List, Dict, Any, Optional

class CoinDCXClient:
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
            response = requests.request(method.upper(), url, params=params)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as err:
            print(f"HTTP Error: {err.response.status_code} - {err.response.text}")
            raise
        except requests.exceptions.RequestException as e:
            print(f"Request Exception: {e}")
            raise

    def _make_request(self, method: str, endpoint: str, payload: Optional[Dict[str, Any]] = None) -> Any:
          url = self.base_url + endpoint

          if payload is None:
              payload = {}

          payload['timestamp'] = int(time.time() * 1000)
          json_body = json.dumps(payload, separators=(',', ':'))
          signature = self._sign(json_body)

          headers = {
              'Content-Type': 'application/json',
              'X-AUTH-APIKEY': self.api_key,
              'X-AUTH-SIGNATURE': signature
          }

          try:
              response = requests.request(method.upper(), url, data=json_body, headers=headers)
              response.raise_for_status()
              return response.json()

          except requests.exceptions.HTTPError as err:
              print(f"HTTP Error for {method} {url} with payload {json_body}: {err.response.status_code} - {err.response.text}")
              raise
          except requests.exceptions.RequestException as e:
              print(f"Request Exception: {e}")
              raise


    def get_active_instruments(self, margin_currency_short_name: str = "USDT") -> List[str]:
        # Note: The doc shows a peculiar query param format.
        url = f"{self.base_url}/exchange/v1/derivatives/futures/data/active_instruments?margin_currency_short_name[]={margin_currency_short_name}"
        response = requests.get(url)
        response.raise_for_status()
        return response.json()

    def get_instrument_details(self, pair: str, margin_currency_short_name: str = "USDT") -> Dict[str, Any]:
        endpoint = "/exchange/v1/derivatives/futures/data/instrument"
        params = {"pair": pair, "margin_currency_short_name": margin_currency_short_name}
        return self._make_request('GET', endpoint, params)


    def get_instrument_trade_history(self, pair: str) -> List[Dict[str, Any]]:
        endpoint = "/exchange/v1/derivatives/futures/data/trades"
        return self._make_request('GET', endpoint, {"pair": pair})

    def get_instrument_orderbook(self, pair: str, depth: int = 50) -> Dict[str, Any]:
        if depth not in [10, 20, 50]:
            raise ValueError("Depth must be one of 10, 20, or 50.")
        endpoint = f"/market_data/v3/orderbook/{pair}-futures/{depth}"
        return self._make_public_request('GET', endpoint)

    def get_instrument_candlesticks(self, pair: str, from_ts: int, to_ts: int, resolution: str) -> Dict[str, Any]:
        valid_resolutions = ["1", "5", "15", "30", "60", "1D", "1W", "1M"]
        if resolution not in valid_resolutions:
            raise ValueError(f"Resolution must be one of {valid_resolutions}")
        endpoint = "/market_data/candlesticks"
        params = {
            "pair": pair,
            "from": from_ts,
            "to": to_ts,
            "resolution": resolution,
            "pcode": "f"
        }
        return self._make_public_request('GET', endpoint, params=params)


    def get_cross_margin_details(self) -> Dict[str, Any]:
        return self._make_request('POST', '/exchange/v1/derivatives/futures/positions/cross_margin_details')

    def wallet_transfer(self, transfer_type: str, amount: float, currency_short_name: str) -> Dict[str, Any]:
        if transfer_type not in ["deposit", "withdraw"]:
            raise ValueError("transfer_type must be 'deposit' or 'withdraw'")
        payload = {
            "transfer_type": transfer_type,
            "amount": amount,
            "currency_short_name": currency_short_name
        }
        return self._make_request('POST', '/exchange/v1/derivatives/futures/wallets/transfer', payload)

    def get_wallet_details(self) -> List[Dict[str, Any]]:
        return self._make_request('GET', '/exchange/v1/derivatives/futures/wallets')

    def get_wallet_transactions(self, page: int = 1, size: int = 50) -> List[Dict[str, Any]]:
        return self._make_request('GET', f'/exchange/v1/derivatives/futures/wallets/transactions?page={page}&size={size}')

    def get_currency_conversion(self) -> List[Dict[str, Any]]:
        return self._make_request('GET', '/api/v1/derivatives/futures/data/conversions')

    def get_transactions(self, stage: str = "all", page: int = 2, size: int = 100, margin_currency_short_name: list = ["USDT"]) -> List[Dict[str, Any]]:
        payload = {"stage": stage, "page": page, "size": size, "margin_currency_short_name": margin_currency_short_name}
        return self._make_request('POST', '/exchange/v1/derivatives/futures/positions/transactions', payload)

    def get_trades(self, from_date: str, to_date: str, page: int = 1, size: int = 50, pair: str = None, order_id: Optional[str] = None, margin_currency_short_name : list = ["USDT"]) -> List[Dict[str, Any]]:
        payload = {
            "pair": pair,
            "from_date": from_date,
            "to_date": to_date,
            "page": page,
            "size": size,
            "margin_currency_short_name" : margin_currency_short_name
        }
        if order_id:
            payload['order_id'] = order_id
        return self._make_request('POST', '/exchange/v1/derivatives/futures/trades', payload)

    def get_pair_stats(self, pair: str) -> Dict[str, Any]:
        return self._make_request('GET', f'/api/v1/derivatives/futures/data/stats?pair={pair}')

    def get_rt_prices(self) -> Dict[str, Any]:
        return self._make_public_request('GET', f'/market_data/v3/current_prices/futures/rt')

    def get_rt_prices_for_pair(self, pair: str) -> Dict[str, Any]:
        data = self.get_rt_prices()
        pair_data = data['prices'][pair]

        return {
            "ts": data.get("ts"),
            "vs": data.get("vs"),
            **pair_data
        }

    def _validate_order_params(self, pair: str, quantity: float, price: Optional[float], margin_currency: str):
          try:
              instrument = self.get_instrument_details(pair, margin_currency)['instrument']
          except Exception as e:
              raise ValueError(f"Could not fetch instrument details for {pair} to validate order. Error: {e}")

          min_quantity = Decimal(str(instrument["min_quantity"]))
          max_quantity = Decimal(str(instrument["max_quantity"]))
          quantity_increment = Decimal(str(instrument["quantity_increment"]))
          min_notional = Decimal(str(instrument.get("min_notional", "0")))

          quantity_dec = Decimal(str(quantity))

          if not (min_quantity <= quantity_dec <= max_quantity):
              raise ValueError(f"Quantity {quantity_dec} is out of range [{min_quantity}, {max_quantity}]")

          adjusted_quantity = quantity_dec.quantize(quantity_increment, rounding=ROUND_DOWN)
          if adjusted_quantity != quantity_dec:
              raise ValueError(
                  f"Quantity {quantity_dec} is invalid. Closest valid = {adjusted_quantity}"
              )

          if price is not None:
              min_price = Decimal(str(instrument["min_price"]))
              max_price = Decimal(str(instrument["max_price"]))
              price_increment = Decimal(str(instrument["price_increment"]))
              price_dec = Decimal(str(price))

              if not (min_price <= price_dec <= max_price):
                  raise ValueError(f"Price {price_dec} is out of range [{min_price}, {max_price}]")

              adjusted_price = price_dec.quantize(price_increment, rounding=ROUND_DOWN)
              if adjusted_price != price_dec:
                  raise ValueError(
                      f"Price {price_dec} is invalid. Closest valid = {adjusted_price}"
                  )

              notional = quantity_dec * price_dec
              if notional < min_notional:
                  raise ValueError(f"Notional value {notional} is below the minimum of {min_notional}")

    def list_orders(self, status: str, side: str, page: int = 1, size: int = 10, margin_currency_short_name: List[str] = ["USDT"]) -> List[Dict[str, Any]]:
        payload = {
            "status": status,
            "side": side,
            "page": page,
            "size": size,
            "margin_currency_short_name": margin_currency_short_name
        }
        return self._make_request('POST', '/exchange/v1/derivatives/futures/orders', payload)

    def create_order(self, pair: str, side: str, order_type: str, total_quantity: float, leverage: int, **kwargs) -> List[Dict[str, Any]]:
        order_details = {
            "side": side,
            "pair": pair,
            "order_type": order_type,
            "total_quantity": total_quantity,
            "leverage": leverage
        }

        allowed_keys = ["price", "stop_price", "notification", "time_in_force", "hidden",
                        "post_only", "margin_currency_short_name", "position_margin_type",
                        "take_profit_price", "stop_loss_price", "client_order_id"]
        for key in allowed_keys:
            if key in kwargs:
                order_details[key] = kwargs[key]

        margin_currency = kwargs.get("margin_currency_short_name", "USDT")
        price_to_validate = kwargs.get("price")
        if order_type == "market_order":
             order_details.pop("price", None)
             order_details.pop("time_in_force", None)
             price_to_validate = None

        self._validate_order_params(pair, total_quantity, price_to_validate, margin_currency)

        payload = {"order": order_details}
        return self._make_request('POST', '/exchange/v1/derivatives/futures/orders/create', payload)

    def cancel_order(self, order_id: str) -> Dict[str, Any]:
        return self._make_request('POST', '/exchange/v1/derivatives/futures/orders/cancel', {"id": order_id})

    def edit_order(self, order_id: str, total_quantity: float, price: float, **kwargs) -> List[Dict[str, Any]]:
        try:
            # We assume USDT as default, edit order doesn't take margin currency
            all_orders = self.list_orders(status="open", side="buy,sell", size=1000, margin_currency_short_name=["USDT", "INR"])
            target_order = next((o for o in all_orders if o['id'] == order_id), None)
            if not target_order:
                raise ValueError(f"Could not find open order with ID {order_id} to determine its pair for validation.")
            pair = target_order['pair']
            margin_currency = target_order.get('margin_currency_short_name', 'USDT')
        except Exception as e:
            raise Exception(f"Failed to fetch original order details for validation. Error: {e}")

        self._validate_order_params(pair, total_quantity, price, margin_currency)

        payload = {
            "id": order_id,
            "total_quantity": total_quantity,
            "price": price
        }
        if 'take_profit_price' in kwargs:
            payload['take_profit_price'] = kwargs['take_profit_price']
        if 'stop_loss_price' in kwargs:
            payload['stop_loss_price'] = kwargs['stop_loss_price']

        return self._make_request('POST', '/exchange/v1/derivatives/futures/orders/edit', payload)



    def list_positions(self, page: int = 1, size: int = 10, margin_currency_short_name: List[str] = ["USDT"]) -> List[Dict[str, Any]]:
        payload = {
            "page": page,
            "size": size,
            "margin_currency_short_name": margin_currency_short_name
        }
        return self._make_request('POST', '/exchange/v1/derivatives/futures/positions', payload)

    def get_positions_by_filter(self, pairs: Optional[List[str]] = None, position_ids: Optional[List[str]] = None, **kwargs) -> List[Dict[str, Any]]:
        if not (pairs or position_ids):
            raise ValueError("Either 'pairs' or 'position_ids' must be provided.")
        if pairs and position_ids:
            raise ValueError("Provide either 'pairs' or 'position_ids', not both.")

        payload = {"page": kwargs.get('page', 1), "size": kwargs.get('size', 10)}
        if pairs:
            payload["pairs"] = ",".join(pairs)
        if position_ids:
            payload["position_ids"] = ",".join(position_ids)
        if 'margin_currency_short_name' in kwargs:
             payload['margin_currency_short_name'] = kwargs['margin_currency_short_name']

        return self._make_request('POST', '/exchange/v1/derivatives/futures/positions', payload)

    def update_position_leverage(self, leverage: int, pair: Optional[str] = None, position_id: Optional[str] = None) -> Dict[str, Any]:
        if not (pair or position_id):
            raise ValueError("Either 'pair' or 'position_id' must be provided.")

        payload = {"leverage": leverage}
        if pair:
            payload['pair'] = pair
        if position_id:
            payload['id'] = position_id

        return self._make_request('POST', '/exchange/v1/derivatives/futures/positions/update_leverage', payload)

    def add_margin(self, position_id: str, amount: float) -> Dict[str, Any]:
        payload = {"id": position_id, "amount": amount}
        return self._make_request('POST', '/exchange/v1/derivatives/futures/positions/add_margin', payload)

    def remove_margin(self, position_id: str, amount: float) -> Dict[str, Any]:
        payload = {"id": position_id, "amount": amount}
        return self._make_request('POST', '/exchange/v1/derivatives/futures/positions/remove_margin', payload)

    def cancel_all_open_orders(self, margin_currency_short_name: Optional[List[str]] = None) -> Dict[str, Any]:
        payload = {}
        if margin_currency_short_name:
            payload['margin_currency_short_name'] = margin_currency_short_name
        return self._make_request('POST', '/exchange/v1/derivatives/futures/positions/cancel_all_open_orders', payload)

    def cancel_all_open_orders_for_position(self, position_id: str) -> Dict[str, Any]:
        return self._make_request('POST', '/exchange/v1/derivatives/futures/positions/cancel_all_open_orders_for_position', {"id": position_id})

    def exit_position(self, position_id: str) -> Dict[str, Any]:
        return self._make_request('POST', '/exchange/v1/derivatives/futures/positions/exit', {"id": position_id})

    def create_tpsl_orders(self, position_id: str, take_profit: Optional[Dict] = None, stop_loss: Optional[Dict] = None) -> Dict[str, Any]:
        if not (take_profit or stop_loss):
            raise ValueError("Either 'take_profit' or 'stop_loss' must be provided.")

        payload = {"id": position_id}
        if take_profit:
            payload['take_profit'] = take_profit
        if stop_loss:
            payload['stop_loss'] = stop_loss

        return self._make_request('POST', '/exchange/v1/derivatives/futures/positions/create_tpsl', payload)

    def change_position_margin_type(self, pair: str, margin_type: str) -> List[Dict[str, Any]]:
        if margin_type not in ["isolated", "crossed"]:
            raise ValueError("margin_type must be 'isolated' or 'crossed'")
        payload = {"pair": pair, "margin_type": margin_type}
        return self._make_request('POST', '/exchange/v1/derivatives/futures/positions/margin_type', payload)

# ==============================================================================
# SECTION 2: STRATEGY LOGIC (The Brain 🧠) - FINAL VERSION
# ==============================================================================
def generate_signals_from_strategy(df: pd.DataFrame, params: dict) -> pd.DataFrame: #-> rename to generate_signals
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
        # --- Indicator Calculations with Robust Column Discovery ---

        # Calculate Bollinger Bands and discover column names
        df_copy.ta.bbands(length=bb_len, std=bb_std, append=True)
        bb_upper_col = next((col for col in df_copy.columns if col.startswith(f'BBU_{bb_len}')), None)
        bb_lower_col = next((col for col in df_copy.columns if col.startswith(f'BBL_{bb_len}')), None)
        if not bb_upper_col or not bb_lower_col:
            raise KeyError("Could not find Bollinger Bands columns after calculation.")

        # Calculate SuperTrend and discover its direction column name
        df_copy.ta.supertrend(period=st_period, multiplier=st_multiplier, append=True)
        # DEFINITIVE FIX: Search for the column starting with 'SUPERTd' regardless of numbers
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

    # --- Signal Generation (unchanged) ---
    is_trending = df_copy['bbw_zscore'] > zscore_thresh
    is_ranging = df_copy['bbw_zscore'] < -zscore_thresh

    long_macro_trend = df_copy['close'] > df_copy['ema_slow']
    long_pullback = (df_copy['low'] < df_copy['ema_fast']) & (df_copy['close'] > df_copy['ema_fast'])
    vol_confirm = df_copy['volume'] > df_copy['volume_ma']
    short_macro_trend = df_copy['close'] < df_copy['ema_slow']
    short_pullback = (df_copy['high'] > df_copy['ema_fast']) & (df_copy['close'] < df_copy['ema_fast'])

    long_at_extreme = df_copy['close'] < df_copy[bb_lower_col]
    long_reversal = (df_copy['rsi'] > rsi_oversold) & (df_copy['rsi'].shift(1) <= rsi_oversold)
    short_at_extreme = df_copy['close'] > df_copy[bb_upper_col]
    short_reversal = (df_copy['rsi'] < rsi_overbought) & (df_copy['rsi'].shift(1) >= rsi_overbought)

    df_copy['long_trend_signal'] = is_trending & long_macro_trend & df_copy['trend_up'] & long_pullback & vol_confirm
    df_copy['short_trend_signal'] = is_trending & short_macro_trend & ~df_copy['trend_up'] & short_pullback & vol_confirm
    df_copy['long_reversion_signal'] = is_ranging & long_at_extreme & long_reversal
    df_copy['short_reversion_signal'] = is_ranging & short_at_extreme & short_reversal

    # df_copy['long_signal'] = df_copy['long_trend_signal'] | df_copy['long_reversion_signal']
    # df_copy['short_signal'] = df_copy['short_trend_signal'] | df_copy['short_reversion_signal']
    df_copy['long_signal'] = True
    df_copy['short_signal'] = False

    for col in ['long_signal', 'short_signal']:
        df_copy[col] = df_copy[col].fillna(False).astype(bool)

    # df_copy.dropna(inplace=True)
    return df_copy
# ==============================================================================
# (Logging, LiveTrader, Backtester, Metrics sections are unchanged)
# ==============================================================================
class CsvHandler(logging.FileHandler):
    def __init__(self, filename, mode='a', encoding=None, delay=False):
        super().__init__(filename, mode, encoding, delay)
        if os.path.getsize(filename) == 0:
            self._write_header()

    def _write_header(self):
        if self.stream is None: self.stream = self._open()
        csv_writer = csv.writer(self.stream)
        csv_writer.writerow(['timestamp', 'level', 'message', 'function', 'line'])
        self.flush()

    def emit(self, record):
        try:
            if self.stream is None: self.stream = self._open()
            csv_writer = csv.writer(self.stream)
            log_entry = [
                datetime.fromtimestamp(record.created).strftime('%Y-%m-%d %H:%M:%S'),
                record.levelname, record.getMessage(), record.funcName, record.lineno
            ]
            csv_writer.writerow(log_entry)
            self.flush()
        except Exception:
            self.handleError(record)
    @staticmethod
    def setup_logging():
        logger = logging.getLogger()
        logger.setLevel(logging.INFO)

        if logger.hasHandlers():
            logger.handlers.clear()

        log_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(log_formatter)
        logger.addHandler(console_handler)

        file_handler = logging.FileHandler('trading_bot.log', mode='a')
        file_handler.setFormatter(log_formatter)
        logger.addHandler(file_handler)

        csv_error_handler = CsvHandler('error_log.csv')
        csv_error_handler.setLevel(logging.ERROR)
        logger.addHandler(csv_error_handler)

class Trader:
    def generate_signals(df: pd.DataFrame, params: dict) -> pd.DataFrame: #-> rename to generate_signals
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
            # --- Indicator Calculations with Robust Column Discovery ---

            # Calculate Bollinger Bands and discover column names
            df_copy.ta.bbands(length=bb_len, std=bb_std, append=True)
            bb_upper_col = next((col for col in df_copy.columns if col.startswith(f'BBU_{bb_len}')), None)
            bb_lower_col = next((col for col in df_copy.columns if col.startswith(f'BBL_{bb_len}')), None)
            if not bb_upper_col or not bb_lower_col:
                raise KeyError("Could not find Bollinger Bands columns after calculation.")

            # Calculate SuperTrend and discover its direction column name
            df_copy.ta.supertrend(period=st_period, multiplier=st_multiplier, append=True)
            # DEFINITIVE FIX: Search for the column starting with 'SUPERTd' regardless of numbers
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

        # --- Signal Generation (unchanged) ---
        is_trending = df_copy['bbw_zscore'] > zscore_thresh
        is_ranging = df_copy['bbw_zscore'] < -zscore_thresh

        long_macro_trend = df_copy['close'] > df_copy['ema_slow']
        long_pullback = (df_copy['low'] < df_copy['ema_fast']) & (df_copy['close'] > df_copy['ema_fast'])
        vol_confirm = df_copy['volume'] > df_copy['volume_ma']
        short_macro_trend = df_copy['close'] < df_copy['ema_slow']
        short_pullback = (df_copy['high'] > df_copy['ema_fast']) & (df_copy['close'] < df_copy['ema_fast'])

        long_at_extreme = df_copy['close'] < df_copy[bb_lower_col]
        long_reversal = (df_copy['rsi'] > rsi_oversold) & (df_copy['rsi'].shift(1) <= rsi_oversold)
        short_at_extreme = df_copy['close'] > df_copy[bb_upper_col]
        short_reversal = (df_copy['rsi'] < rsi_overbought) & (df_copy['rsi'].shift(1) >= rsi_overbought)

        df_copy['long_trend_signal'] = is_trending & long_macro_trend & df_copy['trend_up'] & long_pullback & vol_confirm
        df_copy['short_trend_signal'] = is_trending & short_macro_trend & ~df_copy['trend_up'] & short_pullback & vol_confirm
        df_copy['long_reversion_signal'] = is_ranging & long_at_extreme & long_reversal
        df_copy['short_reversion_signal'] = is_ranging & short_at_extreme & short_reversal

        # df_copy['long_signal'] = df_copy['long_trend_signal'] | df_copy['long_reversion_signal']
        # df_copy['short_signal'] = df_copy['short_trend_signal'] | df_copy['short_reversion_signal']
        df_copy['long_signal'] = True
        df_copy['short_signal'] = False

        for col in ['long_signal', 'short_signal']:
            df_copy[col] = df_copy[col].fillna(False).astype(bool)

        # df_copy.dropna(inplace=True)
        return df_copy

class LiveTrader(Trader):
    def __init__(self, settings: Dict[str, Any]):
        self.settings = settings
        self.client = CoinDCXClient(key=settings["api_key"], secret=settings["api_secret"])
        self.in_position = False
        self.position_details = {}
        self._state_file_path = self._get_state_file_path()
        self._load_state()

        try:
            logging.info("Fetching instrument details...")
            instrument_data = self.client.get_instrument_details(
                pair=self.settings['pair'],
                margin_currency=self.settings['margin_currency']
            )
            self.instrument_details = instrument_data['instrument']
            self.qty_increment = Decimal(self.instrument_details['quantity_increment'])
            logging.info(f"Successfully fetched details for {self.settings['pair']}.")
        except Exception as e:
            logging.critical(f"FATAL: Could not fetch instrument details. Error: {e}", exc_info=True)
            sys.exit(1)

    def _get_state_file_path(self):
        state_dir = "./state/"
        os.makedirs(state_dir, exist_ok=True)
        return os.path.join(state_dir, f"state_{self.settings['strategy_id']}.json")

    def _load_state(self):
        if not os.path.exists(self._state_file_path):
            logging.info("No state file found. Initializing fresh state.")
            self._reset_state()
            return
        try:
            with open(self._state_file_path, 'r') as f:
                state = json.load(f)
                self.in_position = state.get('in_position', False)
                self.position_details = state
                logging.info(f"Loaded state: In Position = {self.in_position}")
        except Exception as e:
            logging.error(f"Error loading state file: {e}. Resetting state.")
            self._reset_state()

    def _save_state(self):
        try:
            with open(self._state_file_path, 'w') as f:
                json.dump(self.position_details, f, indent=4)
            logging.debug(f"Saved state: {self.position_details}")
        except IOError as e:
            logging.error(f"Error saving state to file: {e}")

    def _reset_state(self):
        self.in_position = False
        self.position_details = {'in_position': False}
        self._save_state()

    def get_latest_data(self) -> pd.DataFrame:
        res_map = {"1": 60, "5": 300, "15": 900, "60": 3600}
        res_sec = res_map.get(self.settings['resolution'], 300)
        to_ts = int(datetime.now(timezone.utc).timestamp()) - res_sec
        from_ts = to_ts - (300 * res_sec)
        try:
            data = self.client.get_instrument_candlesticks(self.settings['pair'], from_ts, to_ts, self.settings['resolution'])
            df = pd.DataFrame(data['data'])
            df['timestamp'] = pd.to_datetime(df['time'], unit='ms', utc=True)
            df = df[['timestamp', 'open', 'high', 'low', 'close', 'volume']]
            for col in df.columns[1:]: df[col] = pd.to_numeric(df[col], errors='coerce')
            return df.sort_values('timestamp').reset_index(drop=True)
        except Exception as e:
            logging.error(f"Error fetching candlestick data: {e}", exc_info=True)
            return pd.DataFrame()

    def check_and_manage_position(self, df: pd.DataFrame):
        if not self.in_position or df.empty: return

        candle = df.iloc[-1]
        pos_type = self.position_details.get('type')
        trade_type = self.position_details.get('trade_type')
        entry_price = self.position_details.get('entry_price', 0)

        self.position_details['candles_held'] = self.position_details.get('candles_held', 0) + 1
        self._save_state()

        if trade_type == 'trend':
            hold, sl_atr, tp_atr = self.settings['hold_trend'], self.settings['sl_atr_trend'], self.settings['tp_atr_trend']
        else: # reversion
            hold, sl_atr, tp_atr = self.settings['hold_reversion'], self.settings['sl_atr_reversion'], self.settings['tp_atr_reversion']

        sl = entry_price - sl_atr * candle['atr'] if pos_type == 'buy' else entry_price + sl_atr * candle['atr']
        tp = entry_price + tp_atr * candle['atr'] if pos_type == 'buy' else entry_price - tp_atr * candle['atr']

        logging.info(f"Monitoring {pos_type.upper()} ({trade_type}) pos. Entry: {entry_price:.4f}, SL: {sl:.4f}, TP: {tp:.4f}, Held: {self.position_details['candles_held']}")

        exit_reason = None
        if self.position_details['candles_held'] >= hold: exit_reason = "Time limit"
        elif pos_type == 'buy':
            if candle['low'] <= sl: exit_reason = "Stop Loss"
            elif candle['high'] >= tp: exit_reason = "Take Profit"
            elif candle['short_signal']: exit_reason = "Opposite signal"
        elif pos_type == 'sell':
            if candle['high'] >= sl: exit_reason = "Stop Loss"
            elif candle['low'] <= tp: exit_reason = "Take Profit"
            elif candle['long_signal']: exit_reason = "Opposite signal"

        if exit_reason:
            logging.warning(f"Exit condition met: {exit_reason}. Closing position...")
            try:
                positions = self.client.list_positions([self.settings['margin_currency']])
                active_pos = next((p for p in positions if p['pair'] == self.settings['pair']), None)
                if active_pos:
                    self.client.exit_position(position_id=active_pos['id'])
                    logging.info(f"Position {active_pos['id']} closed on exchange.")
                else:
                    logging.warning("No position on exchange, but state was active.")
                self._reset_state()
            except Exception as e:
                logging.error(f"Failed to close position. Manual intervention required. Error: {e}", exc_info=True)

    def check_for_new_signal(self, df: pd.DataFrame):
        if self.in_position or df.empty: return

        candle = df.iloc[-1]
        signal, trade_type = None, None
        if candle['long_signal']:
            signal = 'buy'
            trade_type = 'trend' if candle['long_trend_signal'] else 'reversion'
        elif candle['short_signal']:
            signal = 'sell'
            trade_type = 'trend' if candle['short_trend_signal'] else 'reversion'

        if signal:
            logging.info(f"New {signal.upper()} ({trade_type}) signal at {candle['close']:.4f}")
            try:
                wallet = next((w for w in self.client.get_wallet_details() if w['currency_short_name'] == self.settings['margin_currency']), None)
                print("wallet: ", wallet)
                if not wallet: raise Exception("Wallet not found.")

                balance = float(wallet['balance'])
                risk_amount = balance * self.settings['risk_per_trade']
                notional_value = risk_amount * self.settings['leverage']
                quantity = notional_value / (candle['close'] * 93)
                adj_qty = (Decimal(str(quantity)) // self.qty_increment) * self.qty_increment

                if adj_qty <= 0:
                    logging.warning("Calculated quantity is zero. Skipping trade.")
                    return

                logging.info(f"Placing {signal.upper()} market order for {adj_qty} units...")
                response = self.client.create_order(
                    pair=self.settings['pair'], side=signal, order_type="market_order",
                    total_quantity=float(adj_qty), leverage=self.settings['leverage'],
                    margin_currency_short_name=self.settings['margin_currency'],
                    notification="email_notification"
                )

                print(response)


                self.in_position = True
                self.position_details = {
                    'in_position': True, 'type': signal, 'trade_type': trade_type,
                    'entry_price': candle['close'], 'entry_time': candle['timestamp'].isoformat(),
                    'candles_held': 0, 'quantity': float(adj_qty)
                }
                self._save_state()
            except Exception as e:
                logging.error(f"Failed to create order. Error: {e}", exc_info=True)

    def run(self):
        logging.info(f"Starting Live Trading Bot for {self.settings['pair']}...")
        while True:
            try:
                # positions = self.client.list_positions([self.settings['margin_currency']])
                # active_pos = next((p for p in positions if p['pair'] == self.settings['pair']), None)

                positions = self.client.list_positions(margin_currency_short_name=[self.settings['margin_currency']])
                active_pos = next((p for p in positions if p['pair'] == self.settings['pair'] and p['active_pos'] != 0.0), None)

                if active_pos and not self.in_position:
                    logging.warning("Position on exchange but not in state. Syncing...")
                    self.in_position = True
                    self.position_details.update({
                        'in_position': True,
                        'type': 'buy' if active_pos['active_pos'] > 0 else 'sell'
                    })
                    self._save_state()
                elif not active_pos and self.in_position:
                    logging.info("Position closed manually or externally. Resetting state.")
                    self._reset_state()

                logging.info(f"\n" + "="*50 + f"\nCycle Start - In Position: {self.in_position}")
                df = self.get_latest_data()
                print(df.tail())
                if df.empty or len(df) < 200:
                    logging.warning(f"Insufficient data ({len(df)} candles). Waiting...")
                    time.sleep(30)
                    continue

                df_signals = generate_signals_from_strategy(df, self.settings)
                print(df_signals.tail())
                if self.in_position: self.check_and_manage_position(df_signals)
                else: self.check_for_new_signal(df_signals)

                now = datetime.now()
                res_min = int(self.settings['resolution'])
                wait_sec = (res_min * 60) - (now.minute % res_min * 60 + now.second) + 2
                logging.info(f"Cycle complete. Waiting for {wait_sec:.0f} seconds...")
                time.sleep(wait_sec)
            except KeyboardInterrupt:
                logging.info("Exit signal received. Shutting down."); break
            except Exception as e:
                logging.critical(f"Main loop error: {e}", exc_info=True); time.sleep(60)

class Backtester(Trader):
    def __init__(self, settings: dict):
        self.settings = settings
        self.client = CoinDCXClient(key="dummy", secret="dummy")
        self.capital = settings['initial_capital']
        self.trades = []
        self.position = {}

    def fetch_coindcx_data(pair: str, start_date: str, end_date: str = None, resolution: str = '5') -> pd.DataFrame:
      URL = "https://public.coindcx.com/market_data/candlesticks"
      API_LIMIT = 30000

      try:
          start_ts = int(datetime.strptime(start_date, '%Y-%m-%d').replace(tzinfo=timezone.utc).timestamp())

          if end_date:
              end_dt = datetime.strptime(end_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
              end_ts = int(end_dt.timestamp())
          else:
              end_ts = int(datetime.now(timezone.utc).timestamp())

          resolution_seconds = int(resolution) * 60
          max_duration_per_call = API_LIMIT * resolution_seconds

          print(f"Fetching data for {pair} from {start_date} to {end_date or 'now'}")

          all_candles = []
          current_end_ts = end_ts

          while current_end_ts > start_ts:
              chunk_start_ts = max(start_ts, current_end_ts - max_duration_per_call)

              from_dt_str = datetime.fromtimestamp(chunk_start_ts, tz=timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
              to_dt_str = datetime.fromtimestamp(current_end_ts, tz=timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
              print(f"  > Fetching chunk: {from_dt_str} -> {to_dt_str}")

              query_params = {
                  "pair": pair,
                  "from": chunk_start_ts,
                  "to": current_end_ts,
                  "resolution": resolution,
                  "pcode": "f"
              }

              response = requests.get(URL, params=query_params)

              if response.status_code != 200:
                  print(f"Error fetching data: Status {response.status_code} - {response.text}")
                  break

              data = response.json().get('data', [])

              if not data:
                  print("  > No more data returned from API in this range. Stopping.")
                  break

              all_candles.extend(data)
              current_end_ts = chunk_start_ts
              time.sleep(0.5)

          if not all_candles:
              print("No data was fetched.")
              return pd.DataFrame()

          df = pd.DataFrame(all_candles)
          df.drop_duplicates(subset=['time'], inplace=True)
          df['timestamp'] = pd.to_datetime(df['time'], unit='ms', utc=True)
          df.drop(columns=['time'], inplace=True)
          df = df[['timestamp', 'open', 'high', 'low', 'close', 'volume']]
          for col in ['open', 'high', 'low', 'close', 'volume']:
              df[col] = pd.to_numeric(df[col], errors='coerce')

          df.sort_values('timestamp', inplace=True)
          df.reset_index(drop=True, inplace=True)
          print("\nFetching complete.")
          return df

      except Exception as e:
          print(f"An unexpected error occurred: {e}")
          return pd.DataFrame()

    def compute_position_size(capital, entry_price, leverage, risk_per_trade = 0.05):
      if entry_price == 0:
          return 0, 0

      margin = capital * risk_per_trade
      size = (margin * leverage) / entry_price

      return size, margin
    def execute_trades(
      df,
      initial_capital=100,
      leverage=15,
      commission_rate=0.0005,
      gst_rate=0.18,
      sl_rate=0.3,
      tp_rate=0.6
  ):
      print("Executing trades...")

      capital = initial_capital
      required_capital = initial_capital
      position = None
      entry_price = entry_time = None
      size = 0
      trades = []

      sl_price = 0
      tp_price = 0

      for i in range(1, len(df)):
          row = df.iloc[i]

          if position:
              exit_price, reason = None, None

              if position == "long":
                  if row["low"] <= sl_price:
                      exit_price, reason = sl_price, "Stop Loss"
                  elif row["high"] >= tp_price:
                      exit_price, reason = tp_price, "Take Profit"
                  elif row["final_signal"] == -1:
                      exit_price, reason = row["close"], "Opposite Signal"

              elif position == "short":
                  if row["high"] >= sl_price:
                      exit_price, reason = sl_price, "Stop Loss"
                  elif row["low"] <= tp_price:
                      exit_price, reason = tp_price, "Take Profit"
                  elif row["final_signal"] == 1:
                      exit_price, reason = row["close"], "Opposite Signal"

              if exit_price:
                  gross_pnl = (exit_price - entry_price) * size * (1 if position == "long" else -1)
                  commission = (entry_price * size + exit_price * size) * commission_rate * (1 + gst_rate)
                  net_pnl = gross_pnl - commission
                  capital += net_pnl

                  trades.append({
                      "entry_time": entry_time,
                      "exit_time": row["timestamp"],
                      "position": position,
                      "entry_price": entry_price,
                      "exit_price": exit_price,
                      "size": size,
                      "exit_reason": reason,
                      "gross_pnl": gross_pnl,
                      "commission": commission,
                      "net_pnl": net_pnl,
                      "capital_after_trade": capital
                  })

                  position = None

          if position is None and capital > 0:
              entry_type = None
              if row["final_signal"] == 1:
                  entry_type = "long"
              elif row["final_signal"] == -1:
                  entry_type = "short"
              else:
                  continue

              entry_price = row["close"]

              size,margin_req = compute_position_size(required_capital, entry_price, leverage)

              if capital < margin_req:
                  continue

              if entry_type == "long":
                  sl_price = entry_price * (1 - sl_rate)
                  tp_price = entry_price * (1 + tp_rate)
              else:
                  sl_price = entry_price * (1 + sl_rate)
                  tp_price = entry_price * (1 - tp_rate)

              position = entry_type
              entry_time = row["timestamp"]

      return pd.DataFrame(trades)
    def evaluate_backtest_metrics(trades_df, initial_capital=100):
      if trades_df.empty:
          return {"error": "No trades were executed to evaluate."}

      returns = trades_df['net_pnl']
      total_trades = len(returns)
      wins = returns[returns > 0]
      losses = returns[returns < 0]

      win_rate = len(wins) / total_trades if total_trades > 0 else 0
      avg_win = wins.mean() if not wins.empty else 0
      avg_loss = losses.mean() if not losses.empty else 0
      expectancy = (win_rate * avg_win) + ((1 - win_rate) * abs(avg_loss))
      profit_factor = wins.sum() / abs(losses.sum()) if losses.sum() != 0 else np.inf
      net_pnl = returns.sum()

      cumulative_capital = initial_capital + returns.cumsum()
      running_max_capital = cumulative_capital.cummax()
      drawdown = running_max_capital - cumulative_capital
      max_drawdown_value = drawdown.max()
      max_drawdown_pct = (max_drawdown_value / running_max_capital[drawdown.idxmax()]) * 100 if running_max_capital[drawdown.idxmax()] != 0 else 0

      metrics = {
          'Total Trades': total_trades,
          'Win Rate (%)': f"{win_rate * 100:.2f}%",
          'Profit Factor': f"{profit_factor:.2f}",
          'Expectancy per Trade': f"${expectancy:.2f}",
          'Net PnL': f"${net_pnl:.2f}",
          'Total Return (%)': f"{(net_pnl / initial_capital) * 100:.2f}%",
          'Max Drawdown ($)': f"${max_drawdown_value:.2f}",
          'Max Drawdown (%)': f"{max_drawdown_pct:.2f}%"
      }
      return metrics
# ==============================================================================
# SECTION 6: SCRIPT ENTRY POINT (The Ignition 🚀)
# ==============================================================================
if __name__ == '__main__':
    MODE = "live"
    setup_logging()

    API_KEY = "773938f665c86c07522a10beb13718f94672d4c37e3fb685"
    API_SECRET = "1ce9cbfa2469671e730ac9f135de6d452481af6d207052511aeb229cdbf41b5d"

    SETTINGS = {
        "api_key": API_KEY, "api_secret": API_SECRET, "strategy_id": "AVAX_DUALMODE_V1",
        "pair": "B-AVAX_USDT", "margin_currency": "INR", "leverage": 15, "resolution": "1", "risk_per_trade": 0.02,
        "atr_len": 12, "bb_len": 27, "bb_std": 2.9, "bbw_zscore_len": 16, "ema_fast_len": 10, "ema_slow_len": 65,
        "hold_reversion": 12, "hold_trend": 31, "rsi_len": 19, "rsi_overbought": 63, "rsi_oversold": 23,
        "sl_atr_reversion": 1.54, "sl_atr_trend": 2.52, "st_multiplier": 3.64, "st_period": 10,
        "tp_atr_reversion": 1.07, "tp_atr_trend": 5.34, "vol_ma_len": 24, "zscore_thresh": 1.45,
        "initial_capital": 1000.0, "commission_rate": 0.0005, "backtest_start_date": "2024-10-14",
    }

    if MODE == "live":
        if not all([SETTINGS["api_key"], SETTINGS["api_secret"]]):
            logging.critical("API Key and Secret are not set. Exiting.")
            sys.exit(1)
        bot = LiveTrader(settings=SETTINGS)
        bot.run()
    elif MODE == "backtest":
        backtester = Backtester(settings=SETTINGS)
        trades = backtester.run()
        if trades:
            trades_df = pd.DataFrame(trades)
            metrics = calculate_metrics(trades_df, SETTINGS["initial_capital"])
            print("\n--- ✅ Backtest Complete ✅ ---")
            print(json.dumps(metrics, indent=4))
            trades_df.to_csv("backtest_results_avax.csv", index=False)
            print("\nTrade log saved to backtest_results_avax.csv")
        else:
            print("\n--- 🤷 No trades were executed during the backtest. ---")
