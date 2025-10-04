"""
CoinDCX Client Module

Wrapper around the original CoinDCX API client with enhanced features
and standardized interface for the SDK.
"""

import os
import sys
import requests
import hmac
import hashlib
import json
import time
import logging
import pandas as pd
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from decimal import Decimal, ROUND_DOWN


class CoinDCXClient:
    """
    Enhanced CoinDCX API client for the strategy SDK.

    This wraps the original client from cdcx_50_v1.py and adds
    additional functionality for strategy execution.
    """

    def __init__(self, api_key: str, api_secret: str, environment: str = "production"):
        """
        Initialize CoinDCX client.

        Args:
            api_key: CoinDCX API key
            api_secret: CoinDCX API secret
            environment: Environment (development, staging, production)
        """
        self.api_key = api_key
        self.api_secret = api_secret.encode('utf-8')
        self.environment = environment

        # API endpoints
        if environment == "production":
            self.base_url = "https://api.coindcx.com"
            self.public_base_url = "https://public.coindcx.com"
        else:
            # Use sandbox URLs if available
            self.base_url = "https://api.coindcx.com"  # No sandbox available
            self.public_base_url = "https://public.coindcx.com"

        self.logger = logging.getLogger(f"CoinDCXClient-{environment}")

        # Rate limiting
        self.last_request_time = 0
        self.min_request_interval = 0.1  # 100ms between requests

        # Cache for instrument details
        self._instrument_cache = {}

    def _sign(self, data: str) -> str:
        """Create HMAC signature for API requests."""
        return hmac.new(self.api_secret, data.encode(), hashlib.sha256).hexdigest()

    def _rate_limit(self) -> None:
        """Apply rate limiting to API requests."""
        current_time = time.time()
        time_since_last = current_time - self.last_request_time

        if time_since_last < self.min_request_interval:
            time.sleep(self.min_request_interval - time_since_last)

        self.last_request_time = time.time()

    def _make_public_request(self, method: str, endpoint: str,
                           params: Optional[Dict[str, Any]] = None) -> Any:
        """Make public API request."""
        self._rate_limit()

        url = self.public_base_url + endpoint
        try:
            response = requests.request(method.upper(), url, params=params, timeout=30)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as err:
            self.logger.error(f"HTTP Error: {err.response.status_code} - {err.response.text}")
            raise
        except requests.exceptions.RequestException as e:
            self.logger.error(f"Request Exception: {e}")
            raise

    def _make_authenticated_request(self, method: str, endpoint: str,
                                  payload: Optional[Dict[str, Any]] = None) -> Any:
        """Make authenticated API request."""
        self._rate_limit()

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
            response = requests.request(method.upper(), url, data=json_body,
                                      headers=headers, timeout=30)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as err:
            self.logger.error(f"HTTP Error for {method} {url}: {err.response.status_code} - {err.response.text}")
            raise
        except requests.exceptions.RequestException as e:
            self.logger.error(f"Request Exception: {e}")
            raise

    # Market Data Methods
    def get_candlestick_data(self, pair: str, from_ts: int, to_ts: int,
                           resolution: str = "5") -> pd.DataFrame:
        """
        Get candlestick data for a trading pair.

        Args:
            pair: Trading pair (e.g., "B-BTC_USDT")
            from_ts: Start timestamp
            to_ts: End timestamp
            resolution: Timeframe resolution

        Returns:
            DataFrame with OHLCV data
        """
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

        try:
            data = self._make_public_request('GET', endpoint, params=params)

            if 'data' not in data or not data['data']:
                return pd.DataFrame()

            df = pd.DataFrame(data['data'])
            df['timestamp'] = pd.to_datetime(df['time'], unit='ms', utc=True)
            df.drop(columns=['time'], inplace=True)
            df = df[['timestamp', 'open', 'high', 'low', 'close', 'volume']]

            # Convert to numeric
            for col in ['open', 'high', 'low', 'close', 'volume']:
                df[col] = pd.to_numeric(df[col], errors='coerce')

            df.sort_values('timestamp', inplace=True)
            df.reset_index(drop=True, inplace=True)

            return df

        except Exception as e:
            self.logger.error(f"Error fetching candlestick data: {e}")
            return pd.DataFrame()

    def get_orderbook(self, pair: str, depth: int = 20) -> Dict[str, Any]:
        """Get orderbook for a trading pair."""
        if depth not in [10, 20, 50]:
            depth = 20

        endpoint = f"/market_data/v3/orderbook/{pair}-futures/{depth}"
        return self._make_public_request('GET', endpoint)

    def get_ticker(self, pair: str) -> Dict[str, Any]:
        """Get ticker data for a trading pair."""
        endpoint = f"/api/v1/derivatives/futures/data/stats"
        params = {"pair": pair}
        return self._make_authenticated_request('GET', endpoint + f"?pair={pair}")

    # Account Methods
    def get_account_balance(self) -> List[Dict[str, Any]]:
        """Get futures wallet balance."""
        endpoint = '/exchange/v1/derivatives/futures/wallets'
        return self._make_authenticated_request('GET', endpoint)

    def get_positions(self, margin_currency: List[str] = ["USDT"]) -> List[Dict[str, Any]]:
        """Get open positions."""
        endpoint = '/exchange/v1/derivatives/futures/positions'
        payload = {
            "page": 1,
            "size": 100,
            "margin_currency_short_name": margin_currency
        }
        return self._make_authenticated_request('POST', endpoint, payload)

    def get_open_orders(self, margin_currency: List[str] = ["USDT"]) -> List[Dict[str, Any]]:
        """Get open orders."""
        endpoint = '/exchange/v1/derivatives/futures/orders'
        payload = {
            "status": "open",
            "side": "buy,sell",
            "page": 1,
            "size": 100,
            "margin_currency_short_name": margin_currency
        }
        return self._make_authenticated_request('POST', endpoint, payload)

    # Trading Methods
    def place_order(self, pair: str, side: str, order_type: str,
                   quantity: float, leverage: int, **kwargs) -> Dict[str, Any]:
        """
        Place a futures order.

        Args:
            pair: Trading pair
            side: 'buy' or 'sell'
            order_type: 'market_order' or 'limit_order'
            quantity: Order quantity
            leverage: Leverage multiplier
            **kwargs: Additional order parameters

        Returns:
            Order response
        """
        order_details = {
            "side": side,
            "pair": pair,
            "order_type": order_type,
            "total_quantity": quantity,
            "leverage": leverage
        }

        # Add optional parameters
        allowed_keys = ["price", "stop_price", "time_in_force",
                       "margin_currency_short_name", "client_order_id",
                       "take_profit_price", "stop_loss_price"]

        for key in allowed_keys:
            if key in kwargs:
                order_details[key] = kwargs[key]

        # Set default margin currency if not specified
        if "margin_currency_short_name" not in order_details:
            order_details["margin_currency_short_name"] = "USDT"

        # Remove price for market orders
        if order_type == "market_order":
            order_details.pop("price", None)
            order_details.pop("time_in_force", None)

        payload = {"order": order_details}
        endpoint = '/exchange/v1/derivatives/futures/orders/create'

        return self._make_authenticated_request('POST', endpoint, payload)

    def cancel_order(self, order_id: str) -> Dict[str, Any]:
        """Cancel an open order."""
        endpoint = '/exchange/v1/derivatives/futures/orders/cancel'
        payload = {"id": order_id}
        return self._make_authenticated_request('POST', endpoint, payload)

    def close_position(self, position_id: str) -> Dict[str, Any]:
        """Close a position."""
        endpoint = '/exchange/v1/derivatives/futures/positions/exit'
        payload = {"id": position_id}
        return self._make_authenticated_request('POST', endpoint, payload)

    # Instrument Methods
    def get_instrument_details(self, pair: str,
                             margin_currency: str = "USDT") -> Dict[str, Any]:
        """Get instrument details with caching."""
        cache_key = f"{pair}_{margin_currency}"

        if cache_key in self._instrument_cache:
            return self._instrument_cache[cache_key]

        endpoint = "/exchange/v1/derivatives/futures/data/instrument"
        payload = {"pair": pair, "margin_currency_short_name": margin_currency}

        try:
            result = self._make_authenticated_request('POST', endpoint, payload)
            self._instrument_cache[cache_key] = result
            return result
        except Exception as e:
            self.logger.error(f"Error fetching instrument details: {e}")
            raise

    def validate_order_parameters(self, pair: str, quantity: float,
                                price: Optional[float] = None,
                                margin_currency: str = "USDT") -> bool:
        """
        Validate order parameters against instrument constraints.

        Args:
            pair: Trading pair
            quantity: Order quantity
            price: Order price (for limit orders)
            margin_currency: Margin currency

        Returns:
            True if parameters are valid
        """
        try:
            instrument_data = self.get_instrument_details(pair, margin_currency)
            instrument = instrument_data['instrument']

            # Validate quantity
            min_qty = Decimal(str(instrument["min_quantity"]))
            max_qty = Decimal(str(instrument["max_quantity"]))
            qty_increment = Decimal(str(instrument["quantity_increment"]))

            quantity_dec = Decimal(str(quantity))

            if not (min_qty <= quantity_dec <= max_qty):
                self.logger.error(f"Quantity {quantity_dec} out of range [{min_qty}, {max_qty}]")
                return False

            # Check quantity increment
            adjusted_qty = quantity_dec.quantize(qty_increment, rounding=ROUND_DOWN)
            if adjusted_qty != quantity_dec:
                self.logger.error(f"Invalid quantity increment. Should be: {adjusted_qty}")
                return False

            # Validate price if provided
            if price is not None:
                min_price = Decimal(str(instrument["min_price"]))
                max_price = Decimal(str(instrument["max_price"]))
                price_increment = Decimal(str(instrument["price_increment"]))

                price_dec = Decimal(str(price))

                if not (min_price <= price_dec <= max_price):
                    self.logger.error(f"Price {price_dec} out of range [{min_price}, {max_price}]")
                    return False

                # Check price increment
                adjusted_price = price_dec.quantize(price_increment, rounding=ROUND_DOWN)
                if adjusted_price != price_dec:
                    self.logger.error(f"Invalid price increment. Should be: {adjusted_price}")
                    return False

            return True

        except Exception as e:
            self.logger.error(f"Error validating order parameters: {e}")
            return False

    # Utility Methods
    def get_server_time(self) -> int:
        """Get server timestamp."""
        return int(time.time() * 1000)

    def is_market_open(self, pair: str) -> bool:
        """
        Check if market is open for trading.

        Note: Crypto markets are typically 24/7, but this can be useful
        for maintenance windows or specific pair restrictions.
        """
        try:
            ticker = self.get_ticker(pair)
            return ticker is not None and 'last_price' in ticker
        except:
            return False

    def get_trading_fees(self, pair: str) -> Dict[str, float]:
        """
        Get trading fees for a pair.

        Returns estimated fees based on CoinDCX fee structure.
        """
        # Standard CoinDCX futures fees (approximate)
        return {
            'maker_fee': 0.0005,  # 0.05%
            'taker_fee': 0.0007,  # 0.07%
            'pair': pair
        }

    def health_check(self) -> bool:
        """Check if API connection is healthy."""
        try:
            balance = self.get_account_balance()
            return isinstance(balance, list)
        except:
            return False

    def __str__(self) -> str:
        """String representation of the client."""
        return f"CoinDCXClient(environment={self.environment}, api_key={self.api_key[:8]}...)"

    def __repr__(self) -> str:
        """Detailed string representation."""
        return f"CoinDCXClient(environment='{self.environment}', connected={self.health_check()})"