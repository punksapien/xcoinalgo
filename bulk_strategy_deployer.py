#!/usr/bin/env python3
"""
Bulk Strategy Deployer
======================

This script automates the subscription and deployment of a specific strategy
for the first 3 valid users from a CSV file.

Process:
1. Load users from CSV.
2. For each user:
   a. Login to get JWT token.
   b. Ensure broker credentials (API keys) are added to the platform.
   c. Check CoinDCX futures wallet balance (must be >= 10000 INR).
   d. Subscribe to strategy "cmi7ns17e007gp9mp2cj708eu".
3. Stop after 3 successful deployments.
"""

import requests
import json
import csv
import sys
import time
import hmac
import hashlib
from typing import Dict, Any, List, Optional

# ============================================
# CONFIGURATION
# ============================================

BACKEND_URL = "http://localhost:3001"
STRATEGY_ID = "cmi7ns17e007gp9mp2cj708eu"
DEFAULT_PASSWORD = "Crypto@1234"
REQUIRED_CAPITAL = 10000
RISK_PER_TRADE = 0.1  # 10%
LEVERAGE = 10         # 10x
CSV_FILE = "CRYPTO_BOT.csv"

# ============================================
# COINDCX CLIENT (For direct balance check)
# ============================================

class CoinDCXClient:
    def __init__(self, key: str, secret: str):
        self.api_key = key
        self.api_secret = secret.encode('utf-8')
        self.base_url = "https://api.coindcx.com"

    def _sign(self, data: str) -> str:
        return hmac.new(self.api_secret, data.encode(), hashlib.sha256).hexdigest()

    def _make_request(self, method: str, endpoint: str, payload: Optional[Dict[str, Any]] = None) -> Any:
        url = self.base_url + endpoint

        if payload is None:
            payload = {}

        # CoinDCX requires timestamp in milliseconds
        payload['timestamp'] = int(time.time() * 1000)

        # Compact JSON (no spaces) for signature
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
            # print(f"HTTP Error: {err.response.text}")
            raise
        except Exception as e:
            raise

    def get_futures_wallets(self) -> List[Dict[str, Any]]:
        return self._make_request('POST', '/exchange/v1/users/balances', {})

# ============================================
# PLATFORM API FUNCTIONS
# ============================================

def login(email: str) -> str:
    """Login as user and return JWT token"""
    try:
        resp = requests.post(
            f"{BACKEND_URL}/api/user/login",
            json={"email": email, "password": DEFAULT_PASSWORD},
            timeout=10
        )

        if resp.status_code == 200:
            return resp.json().get('token')
        else:
            print(f"   ❌ Login failed for {email}: {resp.status_code}")
            return None
    except Exception as e:
        print(f"   ❌ Login error for {email}: {e}")
        return None

def get_broker_credentials(token: str) -> List[Dict]:
    """Get user's broker credentials"""
    try:
        resp = requests.get(
            f"{BACKEND_URL}/api/broker/credentials",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        if resp.status_code == 200:
            return resp.json().get('credentials', [])
        return []
    except Exception:
        return []

def add_broker_credentials(token: str, api_key: str, api_secret: str) -> Optional[str]:
    """Add broker credentials and return ID"""
    try:
        resp = requests.post(
            f"{BACKEND_URL}/api/broker/keys",
            headers={"Authorization": f"Bearer {token}"},
            json={"apiKey": api_key, "apiSecret": api_secret},
            timeout=10
        )
        if resp.status_code == 200:
            return resp.json().get('credential', {}).get('id')
        else:
            print(f"   ❌ Failed to add credentials: {resp.text}")
            return None
    except Exception as e:
        print(f"   ❌ Error adding credentials: {e}")
        return None

def check_existing_subscription(token: str) -> bool:
    """Check if user is already subscribed to the strategy"""
    try:
        resp = requests.get(
            f"{BACKEND_URL}/api/strategies/{STRATEGY_ID}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )

        if resp.status_code == 200:
            data = resp.json()
            # Check if user has an active subscription
            subscriptions = data.get('subscriptions', [])
            for sub in subscriptions:
                if sub.get('isActive'):
                    return True
        return False
    except Exception:
        return False


def subscribe_to_strategy(token: str, broker_cred_id: str) -> bool:
    """Subscribe user to strategy"""
    try:
        payload = {
            "capital": REQUIRED_CAPITAL,
            "riskPerTrade": RISK_PER_TRADE,
            "leverage": LEVERAGE,
            "brokerCredentialId": broker_cred_id,
            "maxPositions": 1,
            "maxDailyLoss": 0.05
        }

        resp = requests.post(
            f"{BACKEND_URL}/api/strategies/{STRATEGY_ID}/subscribe",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
            timeout=15
        )

        if resp.status_code == 200:
            print(f"   ✅ Successfully subscribed!")
            return True
        else:
            print(f"   ❌ Subscription failed: {resp.text}")
            return False
    except Exception as e:
        print(f"   ❌ Subscription error: {e}")
        return False

# ============================================
# MAIN LOGIC
# ============================================

def load_users(csv_path: str) -> List[Dict]:
    users = []
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Normalize keys
                row = {k.strip(): v.strip() for k, v in row.items()}

                email = row.get('Email ID', row.get('email', ''))
                api_key = row.get('API KEY', row.get('apiKey', ''))
                secret_key = row.get('SECRET KEY', row.get('apiSecret', ''))

                if email and api_key and secret_key and api_key != 'nan' and secret_key != 'nan' and '*' not in secret_key:
                    users.append({
                        "email": email,
                        "apiKey": api_key,
                        "apiSecret": secret_key,
                        "name": row.get('Name', 'Unknown')
                    })
    except Exception as e:
        print(f"Error loading CSV: {e}")
        sys.exit(1)
    return users

def get_user_from_db(email: str) -> Optional[Dict]:
    """Query database for user credentials"""
    import subprocess

    query = f"""
    SELECT
        u.email,
        u.name,
        bc."apiKey",
        bc."apiSecret"
    FROM users u
    JOIN broker_credentials bc ON bc."userId" = u.id
    WHERE u.email = '{email}' AND bc."isActive" = true
    LIMIT 1;
    """

    try:
        result = subprocess.run(
            ['sudo', '-u', 'postgres', 'psql', '-d', 'xcoinalgo', '-t', '-A', '-F,', '-c', query],
            capture_output=True,
            text=True,
            check=True
        )

        if result.stdout.strip():
            parts = result.stdout.strip().split(',')
            if len(parts) == 4:
                return {
                    "email": parts[0],
                    "name": parts[1],
                    "apiKey": parts[2],
                    "apiSecret": parts[3]
                }
    except Exception as e:
        print(f"   ❌ Database query failed: {e}")

    return None


def main():
    print("🚀 Starting Bulk Strategy Deployer...")
    print(f"   Strategy ID: {STRATEGY_ID}")
    print(f"   Capital: {REQUIRED_CAPITAL}, Risk: {RISK_PER_TRADE*100}%, Leverage: {LEVERAGE}x")

    # Check for test mode (single user)
    if len(sys.argv) > 1 and sys.argv[1] == '--test-user':
        if len(sys.argv) < 3:
            print("❌ Usage: python3 bulk_strategy_deployer.py --test-user <email>")
            sys.exit(1)

        test_email = sys.argv[2].strip().lower()
        print(f"\n🧪 TEST MODE: Single user deployment for {test_email}")

        user = get_user_from_db(test_email)
        if not user:
            print(f"❌ User not found in database or has no active broker credentials")
            sys.exit(1)

        all_users = [user]
        target_deployments = 1
    else:
        all_users = load_users(CSV_FILE)
        print(f"   Loaded {len(all_users)} potentially valid users from CSV.")
        target_deployments = 3

    successful_deployments = 0

    for i, user in enumerate(all_users):
        if successful_deployments >= target_deployments:
            print("\n✨ Target of 3 successful deployments reached. Exiting.")
            break

        print(f"\n[{i+1}/{len(all_users)}] Processing {user['name']} ({user['email']})...")

        # 1. Check Wallet Balance (Directly with API keys first to save time)
        print("   💰 Checking wallet balance...")
        try:
            client = CoinDCXClient(user['apiKey'], user['apiSecret'])
            # Note: Using get_futures_wallets logic but endpoint might differ slightly based on check_arun_wallet.py
            # check_arun_wallet.py uses /exchange/v1/derivatives/futures/wallets which is GET
            # But broker.ts uses /exchange/v1/users/balances (POST) for general balances?
            # Let's stick to what check_arun_wallet.py uses for FUTURES

            # Actually, check_arun_wallet.py uses: GET /exchange/v1/derivatives/futures/wallets
            # Let's override the client method to match check_arun_wallet.py exactly

            # Re-implementing specific request for futures
            url = "https://api.coindcx.com/exchange/v1/derivatives/futures/wallets"
            timestamp = int(time.time() * 1000)
            body = {"timestamp": timestamp}
            json_body = json.dumps(body, separators=(',', ':'))
            signature = hmac.new(user['apiSecret'].encode(), json_body.encode(), hashlib.sha256).hexdigest()

            headers = {
                'Content-Type': 'application/json',
                'X-AUTH-APIKEY': user['apiKey'],
                'X-AUTH-SIGNATURE': signature
            }

            resp = requests.get(url, data=json_body, headers=headers) # GET with body? CoinDCX is weird.
            # check_arun_wallet.py does: requests.request(method.upper(), url, data=json_body, headers=headers)
            # where method is GET. Yes, CoinDCX GET requests often have bodies.

            if resp.status_code != 200:
                print(f"   ❌ Failed to fetch wallet: {resp.status_code} - {resp.text}")
                continue

            wallets = resp.json()

            # Calculate total available
            total_available = 0
            for w in wallets:
                # Logic from strategy-execution.ts
                # Available = balance - (cross_order_margin + cross_user_margin)
                bal = float(w.get('balance', 0))
                cross_order = float(w.get('cross_order_margin', 0))
                cross_user = float(w.get('cross_user_margin', 0))

                available = bal - (cross_order + cross_user)

                if w.get('currency_short_name') in ['INR', 'USDT']:
                    total_available += available

            print(f"   💵 Available Futures Balance: {total_available}")

            if total_available < REQUIRED_CAPITAL:
                print(f"   ⚠️ Insufficient funds ({total_available} < {REQUIRED_CAPITAL}). Skipping.")
                continue

        except Exception as e:
            print(f"   ❌ Error checking wallet: {e}")
            continue

        # 2. Login to Platform
        print("   🔐 Logging in...")
        token = login(user['email'])
        if not token:
            continue

        # 3. Setup Broker Credentials
        print("   🔑 Checking broker credentials...")
        creds = get_broker_credentials(token)
        broker_id = None

        if creds:
            # Check if active
            active_creds = [c for c in creds if c['isActive']]
            if active_creds:
                broker_id = active_creds[0]['id']
                print(f"   ✅ Found existing credentials: {broker_id}")

        if not broker_id:
            print("   ➕ Adding broker credentials...")
            broker_id = add_broker_credentials(token, user['apiKey'], user['apiSecret'])
            if not broker_id:
                continue

        # 4. Check if already subscribed
        print("   🔍 Checking existing subscriptions...")
        if check_existing_subscription(token):
            print(f"   ⚠️  User already subscribed to this strategy. Skipping.")
            continue

        # 5. Subscribe
        print("   📝 Subscribing to strategy...")
        if subscribe_to_strategy(token, broker_id):
            successful_deployments += 1
            print(f"   🎉 Deployment {successful_deployments}/{target_deployments} complete for {user['email']}")
        else:
            print("   ❌ Deployment failed.")

if __name__ == "__main__":
    main()
