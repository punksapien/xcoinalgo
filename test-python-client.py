#!/usr/bin/env python3
import requests
import hmac
import hashlib
import json
import time

class CoinDCXClient:
    def __init__(self, key: str, secret: str):
        self.api_key = key
        self.api_secret = secret.encode('utf-8')
        self.base_url = "https://api.coindcx.com"

    def _sign(self, data: str) -> str:
        return hmac.new(self.api_secret, data.encode(), hashlib.sha256).hexdigest()

    def _make_request(self, method: str, endpoint: str, payload = None):
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

    def get_wallet_details(self):
        return self._make_request('GET', '/exchange/v1/derivatives/futures/wallets')

# Test with the provided credentials
api_key = "773938f665c86c07522a10beb13718f94672d4c37e3fb685"
api_secret = "1ce9cbfa2469671e730ac9f135de6d452481af6d207052511aeb229cdbf41b5d"

print("Testing Python implementation with provided credentials...")
print(f"API Key: {api_key[:20]}...")
print(f"API Secret: {api_secret[:20]}...")
print()

client = CoinDCXClient(api_key, api_secret)

try:
    wallets = client.get_wallet_details()
    print("✅ SUCCESS!")
    print(f"Response type: {type(wallets)}")
    print(f"Number of wallets: {len(wallets)}")
    print()
    print("Full response:")
    print(json.dumps(wallets, indent=2))
    
    # Find USDT wallet
    usdt = next((w for w in wallets if w.get('currency_short_name') == 'USDT'), None)
    if usdt:
        print("\n💰 USDT Wallet:")
        print(json.dumps(usdt, indent=2))
        
        balance = float(usdt.get('balance', 0))
        locked = float(usdt.get('locked_balance', 0))
        cross_order = float(usdt.get('cross_order_margin', 0))
        cross_user = float(usdt.get('cross_user_margin', 0))
        available = balance - (locked + cross_order + cross_user)
        
        print(f"\nCalculation:")
        print(f"  balance: {balance}")
        print(f"  locked: {locked}")
        print(f"  cross_order: {cross_order}")
        print(f"  cross_user: {cross_user}")
        print(f"  available: {available}")
        
except Exception as e:
    print(f"❌ FAILED: {e}")

