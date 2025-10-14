"""
SOL Hybrid Strategy - Multi-Tenant LiveTrader
Combines EMA alignment, ADX, Stochastic RSI for trend detection
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
from datetime import datetime, timezone

warnings.filterwarnings("ignore")


# ==============================================================================
# SECTION 1: CoinDCX API CLIENT
# ==============================================================================

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
            logging.error(f"HTTP Error: {err.response.status_code} - {err.response.text}")
            raise
        except requests.exceptions.RequestException as e:
            logging.error(f"Request Exception: {e}")
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
            logging.error(f"HTTP Error for {method} {url}: {err.response.status_code} - {err.response.text}")
            raise
        except requests.exceptions.RequestException as e:
            logging.error(f"Request Exception: {e}")
            raise

    def get_instrument_details(self, pair: str, margin_currency_short_name: str = "USDT") -> Dict[str, Any]:
        endpoint = "/exchange/v1/derivatives/futures/data/instrument"
        params = {"pair": pair, "margin_currency_short_name": margin_currency_short_name}
        return self._make_request('GET', endpoint, params)

    def get_instrument_candlesticks(self, pair: str, from_ts: int, to_ts: int, resolution: str) -> Dict[str, Any]:
        valid_resolutions = ["1", "5", "15", "30", "60", "1D", "1W", "1M"]
        if resolution not in valid_resolutions:
            raise ValueError(f"Resolution must be one of {valid_resolutions}")
        endpoint = "/market_data/candlesticks"
        params = {"pair": pair, "from": from_ts, "to": to_ts, "resolution": resolution, "pcode": "f"}
        return self._make_public_request('GET', endpoint, params=params)

    def get_wallet_details(self) -> List[Dict[str, Any]]:
        return self._make_request('GET', '/exchange/v1/derivatives/futures/wallets')

    def create_order(self, pair: str, side: str, order_type: str, total_quantity: float, leverage: int, **kwargs) -> List[Dict[str, Any]]:
        order_details = {
            "side": side, "pair": pair, "order_type": order_type,
            "total_quantity": total_quantity, "leverage": leverage
        }
        allowed_keys = [
            "price", "stop_price", "notification", "time_in_force", "hidden",
            "post_only", "margin_currency_short_name", "position_margin_type",
            "take_profit_price", "stop_loss_price", "client_order_id", "group_id"
        ]
        order_details.update({k: v for k, v in kwargs.items() if k in allowed_keys})

        if order_type == "market_order":
            order_details.pop("price", None)
            order_details.pop("time_in_force", None)

        payload = {"order": order_details}
        return self._make_request('POST', '/exchange/v1/derivatives/futures/orders/create', payload)

    def list_positions(self, page: int = 1, size: int = 10, margin_currency_short_name: List[str] = ["USDT"]) -> List[Dict[str, Any]]:
        payload = {"page": page, "size": size, "margin_currency_short_name": margin_currency_short_name}
        return self._make_request('POST', '/exchange/v1/derivatives/futures/positions', payload)

    def exit_position(self, position_id: str) -> Dict[str, Any]:
        return self._make_request('POST', '/exchange/v1/derivatives/futures/positions/exit', {"id": position_id})


# ==============================================================================
# SECTION 2: STRATEGY SIGNAL GENERATION
# ==============================================================================

def generate_signals_from_strategy(df: pd.DataFrame, params: dict) -> pd.DataFrame:
    """Calculate indicators and generate trading signals"""
    try:
        stoch_oversold = float(params.get('stoch_oversold', 9.0))
        stoch_overbought = float(params.get('stoch_overbought', 80.0))
        weighted_sum_threshold = float(params.get('weighted_sum_threshold', 2.0))
        adx_length = int(params.get('adx_length', 12))
        adx_min = float(params.get('adx_min', 22.4))
        atr_period = int(params.get('atr_period', 14))
    except (ValueError, TypeError) as e:
        logging.error(f"Invalid parameter type in strategy settings: {e}")
        return df

    df_copy = df.copy()
    try:
        df_copy['ema20'] = ta.ema(df_copy["close"], length=20)
        df_copy['ema50'] = ta.ema(df_copy["close"], length=50)
        df_copy['ema100'] = ta.ema(df_copy["close"], length=100)
        df_copy['ema200'] = ta.ema(df_copy["close"], length=200)
        df_copy['adx'] = ta.adx(df_copy["high"], df_copy["low"], df_copy["close"], length=adx_length)[f"ADX_{adx_length}"]
        df_copy['atr'] = ta.atr(df_copy['high'], df_copy['low'], df_copy['close'], length=atr_period)
        df_copy['stoch_k'] = ta.stochrsi(df_copy["close"], length=14, k=3, d=3)['STOCHRSIk_14_14_3_3']

        temp_df = df_copy.copy()
        temp_df['timestamp'] = pd.to_datetime(temp_df['timestamp'])
        temp_df.set_index('timestamp', inplace=True)
        df_copy['high_1H'] = temp_df['high'].rolling(window='1H').max().shift().values

    except Exception as e:
        logging.error(f"Error calculating indicators: {e}", exc_info=True)
        return df

    weights = {"ema_alignment": 1.0, "stoch": 1.0, "price_position": 1.0, "adx": 1.0}

    ema_up = (df_copy["ema20"] > df_copy["ema50"]) & (df_copy["ema50"] > df_copy["ema100"]) & (df_copy["ema100"] > df_copy["ema200"])
    price_above = (df_copy["close"] > df_copy["ema20"])
    stoch_entry_long = df_copy['stoch_k'] < stoch_oversold
    adx_trending = df_copy["adx"] > adx_min
    df_copy["long_score"] = (ema_up.astype(int) * weights["ema_alignment"] + price_above.astype(int) * weights["price_position"] + stoch_entry_long.astype(int) * weights["stoch"] + adx_trending.astype(int) * weights["adx"])

    ema_down = (df_copy["ema20"] < df_copy["ema50"]) & (df_copy["ema50"] < df_copy["ema100"]) & (df_copy["ema100"] < df_copy["ema200"])
    price_below = df_copy["close"] < df_copy["ema20"]
    stoch_entry_short = df_copy['stoch_k'] > stoch_overbought
    df_copy["short_score"] = (ema_down.astype(int) * weights["ema_alignment"] + price_below.astype(int) * weights["price_position"] + stoch_entry_short.astype(int) * weights["stoch"] + adx_trending.astype(int) * weights["adx"])

    df_copy["long_signal"] = (df_copy["long_score"].shift(1) >= weighted_sum_threshold)
    df_copy["short_signal"] = (df_copy["short_score"].shift(1) >= weighted_sum_threshold)
    df_copy.loc[df_copy["long_signal"] & df_copy["short_signal"], ["long_signal", "short_signal"]] = False, False

    df_copy.dropna(inplace=True)
    return df_copy


# ==============================================================================
# SECTION 3: LOGGING SETUP
# ==============================================================================

class CsvHandler(logging.FileHandler):
    def __init__(self, filename, mode='a', encoding=None, delay=False):
        super().__init__(filename, mode, encoding, delay)
        if os.path.getsize(filename) == 0:
            self._write_header()

    def _write_header(self):
        if self.stream is None:
            self.stream = self._open()
        csv_writer = csv.writer(self.stream)
        csv_writer.writerow(['timestamp', 'level', 'message', 'function', 'line'])
        self.flush()

    def emit(self, record):
        try:
            if self.stream is None:
                self.stream = self._open()
            csv_writer = csv.writer(self.stream)
            log_entry = [
                datetime.fromtimestamp(record.created).strftime('%Y-%m-%d %H:%M:%S'),
                record.levelname, record.getMessage(), record.funcName, record.lineno
            ]
            csv_writer.writerow(log_entry)
            self.flush()
        except Exception:
            self.handleError(record)


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


# ==============================================================================
# SECTION 4: MULTI-TENANT LIVE TRADER
# ==============================================================================

class LiveTrader:
    """
    Multi-Tenant LiveTrader for SOL Hybrid Strategy

    Supports both standalone and platform modes
    """

    def __init__(self, settings: Dict[str, Any], subscribers: Optional[List[Dict[str, Any]]] = None):
        """
        Initialize LiveTrader

        Args:
            settings: Strategy settings
            subscribers: List of subscribers (platform mode) or None (standalone)
        """
        self.settings = settings
        self.platform_mode = subscribers is not None

        # Setup subscribers
        if self.platform_mode:
            self.subscribers = subscribers
            logging.info(f"🌐 Platform mode: {len(subscribers)} subscribers")
        else:
            # Standalone mode
            self.subscribers = [{
                'user_id': 'standalone',
                'api_key': settings['api_key'],
                'api_secret': settings['api_secret'],
                'capital': settings.get('capital', 100000),
                'risk_per_trade': settings['risk_per_trade'],
                'leverage': settings['leverage']
            }]
            logging.info("💻 Standalone mode: single user")

        # Create CoinDCX clients for each subscriber
        self.clients = {}
        for sub in self.subscribers:
            self.clients[sub['user_id']] = CoinDCXClient(
                key=sub['api_key'],
                secret=sub['api_secret']
            )

        # Fetch instrument details
        first_client = list(self.clients.values())[0]
        try:
            logging.info(f"Fetching instrument details for {self.settings['pair']}...")
            self.instrument_details = first_client.get_instrument_details(
                pair=self.settings['pair'],
                margin_currency_short_name=self.settings.get('margin_currency', 'INR')
            )['instrument']
            self.qty_increment = Decimal(self.instrument_details['quantity_increment'])
            logging.info(f"Quantity precision: {self.qty_increment}")
        except Exception as e:
            logging.critical(f"FATAL: Could not fetch instrument details. Error: {e}", exc_info=True)
            sys.exit(1)

    def get_latest_data(self) -> pd.DataFrame:
        """Fetch latest candlestick data"""
        resolution_map = {"1": 60, "5": 300, "15": 900, "30": 1800, "60": 3600}
        resolution_seconds = resolution_map.get(self.settings['resolution'], 300)

        to_ts = int(datetime.now(timezone.utc).timestamp()) - resolution_seconds
        from_ts = to_ts - (200 * resolution_seconds)

        try:
            first_client = list(self.clients.values())[0]
            data = first_client.get_instrument_candlesticks(
                pair=self.settings['pair'],
                from_ts=from_ts,
                to_ts=to_ts,
                resolution=self.settings['resolution']
            )

            df = pd.DataFrame(data['data'])
            df['timestamp'] = pd.to_datetime(df['time'], unit='ms', utc=True)
            df.drop(columns=['time'], inplace=True)
            df = df[['timestamp', 'open', 'high', 'low', 'close', 'volume']]

            for col in ['open', 'high', 'low', 'close', 'volume']:
                df[col] = pd.to_numeric(df[col], errors='coerce')

            df.sort_values('timestamp', inplace=True)
            df.reset_index(drop=True, inplace=True)

            logging.info(f"✅ Fetched {len(df)} candles")
            return df
        except Exception as e:
            logging.error(f"Error fetching candlestick data: {e}", exc_info=True)
            return pd.DataFrame()

    def place_order_for_subscriber(
        self,
        subscriber: Dict[str, Any],
        signal: str,
        entry_price: float,
        sl: float,
        tp: float
    ):
        """Place order for a single subscriber"""
        user_id = subscriber['user_id']
        client = self.clients[user_id]

        try:
            # Get wallet balance
            target_wallet = next(
                (w for w in client.get_wallet_details()
                 if w['currency_short_name'] == self.settings.get('margin_currency', 'INR')),
                None
            )

            if not target_wallet:
                logging.error(f"User {user_id}: {self.settings.get('margin_currency', 'INR')} wallet not found")
                return

            available_balance = float(target_wallet['balance'])
            logging.info(f"User {user_id}: Available balance: {available_balance:.2f}")

            # Calculate position size
            risk_amount = available_balance * subscriber['risk_per_trade']
            notional_value = risk_amount * subscriber['leverage']

            # For INR wallet, convert to base currency
            conversion_rate = self.settings.get('margin_currency_coversion_rate', 1.0)
            quantity = notional_value / (entry_price * conversion_rate)

            adjusted_quantity = (Decimal(str(quantity)) // self.qty_increment) * self.qty_increment

            if adjusted_quantity <= 0:
                logging.warning(f"User {user_id}: Calculated quantity is zero, skipping")
                return

            logging.info(f"User {user_id}: Placing {signal.upper()} order for {adjusted_quantity} @ {entry_price:.2f}")

            order_response = client.create_order(
                pair=self.settings['pair'],
                side="buy" if signal == 'long' else "sell",
                order_type="market_order",
                total_quantity=float(adjusted_quantity),
                leverage=subscriber['leverage'],
                client_order_id=f"{user_id}_{int(time.time())}",
                margin_currency_short_name=self.settings.get('margin_currency', 'INR'),
                notification="email_notification"
            )

            logging.info(f"User {user_id}: ✅ Order placed successfully: {order_response}")

        except Exception as e:
            logging.error(f"User {user_id}: ❌ Failed to place order. Error: {e}", exc_info=True)

    def check_for_new_signal(self, df: pd.DataFrame):
        """Check for signals and place orders for ALL subscribers"""
        if df.empty:
            return

        latest_candle = df.iloc[-1]
        signal = 'long' if latest_candle.get('long_signal', False) else 'short' if latest_candle.get('short_signal', False) else None

        if not signal:
            logging.info("📊 No signal generated (HOLD)")
            return

        logging.info(f"🎯 {signal.upper()} signal detected @ {latest_candle['close']:.2f}")

        # Calculate SL/TP
        entry_price = latest_candle['close']

        if signal == 'long':
            sl = latest_candle['ema200'] - self.settings['sl_mult_long'] * latest_candle['atr']
            tp = latest_candle['ema100'] + self.settings['tp_mult_long'] * latest_candle['atr']
        else:
            sl = latest_candle['high_1H'] + self.settings['sl_mult_short'] * latest_candle['atr']
            tp = latest_candle['ema100'] - self.settings['tp_mult_short'] * latest_candle['atr']

        # Validate trade
        check_look_back = self.settings.get('check_look_back', 0.01)
        valid_trade = (
            (signal == 'long' and sl < entry_price * (1 - check_look_back) and tp > entry_price * (1 + check_look_back)) or
            (signal == 'short' and sl > entry_price * (1 + check_look_back) and tp < entry_price * (1 - check_look_back))
        )

        if not valid_trade:
            logging.warning(f"⚠️ Signal rejected by safety check. SL: {sl:.2f}, TP: {tp:.2f}, Entry: {entry_price:.2f}")
            return

        # Place orders for ALL subscribers
        logging.info(f"📤 Placing orders for {len(self.subscribers)} subscriber(s)...")
        for subscriber in self.subscribers:
            self.place_order_for_subscriber(subscriber, signal, entry_price, sl, tp)

    def backtest(self, historical_data: pd.DataFrame, config: Dict[str, Any]) -> Dict[str, Any]:
        """Backtest strategy (required for xcoin CLI compatibility)"""
        logging.info("Running backtest...")

        # Generate signals
        df_with_signals = generate_signals_from_strategy(historical_data.copy(), self.settings)

        # For now, return empty results (implement full backtesting later)
        return {
            'trades': [],
            'metrics': {
                'total_trades': 0,
                'winning_trades': 0,
                'losing_trades': 0,
                'win_rate': 0,
                'total_pnl': 0,
                'total_pnl_pct': 0,
                'max_drawdown': 0,
                'max_drawdown_pct': 0,
                'sharpe_ratio': 0,
                'profit_factor': 0
            },
            'equity_curve': []
        }

    def run(self):
        """Main execution loop (for standalone mode)"""
        logging.info(f"🚀 Starting SOL Hybrid Strategy on {self.settings['pair']} @ {self.settings['resolution']}m")

        while True:
            try:
                logging.info("\n" + "="*80)
                logging.info(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Running cycle...")

                # Fetch data
                df = self.get_latest_data()
                if df.empty or len(df) < 200:
                    logging.warning(f"Insufficient data ({len(df)} candles), skipping")
                    time.sleep(30)
                    continue

                # Generate signals
                df_with_signals = generate_signals_from_strategy(df, self.settings)

                # Check for new signals
                self.check_for_new_signal(df_with_signals)

                # Sleep until next candle
                now = datetime.now()
                res_min = int(self.settings['resolution'])
                seconds_to_wait = (res_min * 60) - (now.minute % res_min * 60 + now.second) + 2
                logging.info(f"⏳ Waiting {seconds_to_wait}s until next candle...")
                time.sleep(seconds_to_wait)

            except Exception as e:
                logging.critical(f"💥 Unexpected error: {e}", exc_info=True)
                logging.info("🔄 Restarting in 60 seconds...")
                time.sleep(60)
            except KeyboardInterrupt:
                logging.info("👋 Exiting...")
                break


# ==============================================================================
# SECTION 5: ENTRY POINT
# ==============================================================================

if __name__ == '__main__':
    setup_logging()

    # Check if running in platform mode (receives input via stdin)
    if not sys.stdin.isatty():
        # Platform mode
        try:
            input_data = json.loads(sys.stdin.read())

            bot = LiveTrader(
                settings=input_data['settings'],
                subscribers=input_data.get('subscribers')
            )

            # Run once
            df = bot.get_latest_data()
            bot.check_for_new_signal(df)

            print(json.dumps({'success': True, 'message': 'Execution complete'}))
        except Exception as e:
            logging.error(f"Platform execution failed: {e}", exc_info=True)
            print(json.dumps({'success': False, 'error': str(e)}))
            sys.exit(1)
    else:
        # Standalone mode
        SETTINGS = {
            "api_key": os.getenv("COINDCX_API_KEY"),
            "api_secret": os.getenv("COINDCX_API_SECRET"),

            # Trade Configuration
            "pair": "B-SOL_USDT",
            "margin_currency": "INR",
            "leverage": 15,
            "resolution": "5",
            "risk_per_trade": 0.05,
            "check_look_back": 0.0025,
            "margin_currency_coversion_rate": 93.0,

            # Indicator Settings
            "stoch_oversold": 9.0,
            "stoch_overbought": 80.0,
            "weighted_sum_threshold": 2.0,
            "adx_length": 12,
            "adx_min": 22.4,
            "atr_period": 14,

            # SL/TP Multipliers
            "sl_mult_long": 1.03,
            "sl_mult_short": 3.06,
            "tp_mult_long": 2.35,
            "tp_mult_short": 6.0,

            # Exit Conditions
            "long_tp_stoch": 75.0,
            "short_tp_stoch": 36.0,
        }

        if not SETTINGS.get('api_key') or not SETTINGS.get('api_secret'):
            logging.error("Set COINDCX_API_KEY and COINDCX_API_SECRET environment variables")
            sys.exit(1)

        bot = LiveTrader(settings=SETTINGS)
        bot.run()

