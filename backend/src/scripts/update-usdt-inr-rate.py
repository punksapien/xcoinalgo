#!/usr/bin/env python3
"""
Cron Script: Update USDT/INR Conversion Rate

This script fetches the current USDT/INR conversion rate from CoinDCX
and stores it in the SystemConfig table.

Run frequency: Every 4 months (or manually when needed)

Usage:
    python3 src/scripts/update-usdt-inr-rate.py

Requirements:
    pip install requests psycopg2-binary
"""

import hmac
import hashlib
import json
import time
import os
import sys
import random
import requests
import psycopg2
from urllib.parse import urlparse

COINDCX_API_URL = "https://api.coindcx.com/api/v1/derivatives/futures/data/conversions"


def get_database_url():
    """Get database URL from environment or .env file"""
    db_url = os.environ.get("DATABASE_URL")
    if db_url:
        return db_url

    # Try to read from .env file
    env_path = os.path.join(os.path.dirname(__file__), "../../.env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.startswith("DATABASE_URL="):
                    return line.strip().split("=", 1)[1].strip('"')

    raise Exception("DATABASE_URL not found")


def fetch_conversion_rate(api_key: str, api_secret: str) -> float | None:
    """Fetch USDT/INR conversion rate from CoinDCX API"""
    timestamp = int(round(time.time() * 1000))
    body = {"timestamp": timestamp}
    json_body = json.dumps(body, separators=(",", ":"))

    signature = hmac.new(
        api_secret.encode("utf-8"),
        json_body.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()

    headers = {
        "Content-Type": "application/json",
        "X-AUTH-APIKEY": api_key,
        "X-AUTH-SIGNATURE": signature
    }

    try:
        response = requests.get(COINDCX_API_URL, data=json_body, headers=headers)
        response.raise_for_status()

        data = response.json()
        for item in data:
            if item.get("symbol") == "USDTINR":
                rate = item.get("conversion_price")
                last_updated = item.get("last_updated_at")
                print(f"Fetched USDT/INR rate: {rate}")
                print(f"Last updated at: {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(last_updated / 1000))}")
                return float(rate)

        print("USDTINR not found in response")
        return None

    except Exception as e:
        print(f"Failed to fetch conversion rate: {e}")
        return None


def main():
    print("=" * 60)
    print("USDT/INR Rate Update Script")
    print("=" * 60)
    print(f"Started at: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    try:
        # Get database connection
        db_url = get_database_url()
        parsed = urlparse(db_url)

        conn = psycopg2.connect(
            host=parsed.hostname,
            port=parsed.port or 5432,
            user=parsed.username,
            password=parsed.password,
            database=parsed.path[1:]  # Remove leading /
        )
        cursor = conn.cursor()

        # Pick a random active broker credential
        cursor.execute('''
            SELECT "apiKey", "apiSecret"
            FROM broker_credentials
            WHERE "isActive" = true
            ORDER BY RANDOM()
            LIMIT 1
        ''')
        row = cursor.fetchone()

        if not row:
            print("No active broker credentials found in database")
            sys.exit(1)

        api_key, api_secret = row
        print(f"Using a randomly selected credential")

        # Fetch the conversion rate
        rate = fetch_conversion_rate(api_key, api_secret)

        if rate is None:
            print("Failed to fetch conversion rate")
            sys.exit(1)

        # Store in database
        cursor.execute('''
            INSERT INTO system_config (key, value, "updatedAt")
            VALUES ('USDT_INR_RATE', %s, NOW())
            ON CONFLICT (key) DO UPDATE
            SET value = %s, "updatedAt" = NOW()
        ''', (str(rate), str(rate)))

        conn.commit()

        print()
        print(f"✅ Successfully updated USDT_INR_RATE to {rate}")
        print("Stored in system_config table")
        print()
        print("Next update recommended in 4 months")
        print("=" * 60)

        cursor.close()
        conn.close()

    except Exception as e:
        print(f"Script failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
