import hmac
import hashlib
import json
import time
import requests
from typing import Dict, Any, Optional, List

class CoinDCXClient:
    def __init__(self, key: str, secret: str):
        self.api_key = key
        self.api_secret = secret.encode('utf-8')
        self.base_url = "https://api.coindcx.com"
        self.public_base_url = "https://public.coindcx.com"

    def _sign(self, data: str) -> str:
        return hmac.new(self.api_secret, data.encode(), hashlib.sha256).hexdigest()

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

    def get_wallet_details(self) -> List[Dict[str, Any]]:
        return self._make_request('GET', '/exchange/v1/derivatives/futures/wallets')

# Arun's API keys from database
api_key = "74b5714f918c07b1c4d112b306e75ae86d6d4ecb27171e71"
secret_key = "9dbe0bad6b7314157e1af9363557c9f54aa3655b3fcf78a883f2c534e6c97cc7"

print("🔄 Fetching Arun's wallet details from CoinDCX (from database)...")
print(f"API Key: {api_key[:20]}...")

client = CoinDCXClient(api_key, secret_key)

try:
    wallet_details = client.get_wallet_details()
    print("\n✅ Wallet Details:")
    print(json.dumps(wallet_details, indent=2))

    # Calculate totals
    print("\n📊 Summary:")
    total_inr = 0
    total_usdt = 0

    for wallet in wallet_details:
        currency = wallet.get('currency_short_name', 'N/A')
        available = float(wallet.get('balance', 0))
        locked = float(wallet.get('locked_balance', 0))
        total = available + locked

        if currency == 'INR':
            total_inr = total
        elif currency == 'USDT':
            total_usdt = total

        symbol = '₹' if currency == 'INR' else '$'
        print(f"  {currency}: Available={symbol}{available:.2f}, Locked={symbol}{locked:.2f}, Total={symbol}{total:.2f}")

    print(f"\n💰 Total INR Futures Wallet: ₹{total_inr:.2f}")
    print(f"💰 Total USDT Futures Wallet: ${total_usdt:.2f}")

except Exception as e:
    print(f"\n❌ Error fetching wallet: {e}")
