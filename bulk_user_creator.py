#!/usr/bin/env python3
"""
CoinDCX Bulk User Creator - Validate-First Mode
================================================

This script:
1. Validates ALL credentials with CoinDCX API FIRST
2. Shows you which credentials are invalid
3. Only creates users with VALID credentials
4. Invalid credentials = User NOT created

Usage:
    python3 bulk_user_creator.py

Or with CSV file:
    python3 bulk_user_creator.py users.csv
"""

import requests
import json
import csv
import sys
from datetime import datetime
from typing import List, Dict, Any
import os

# ============================================
# CONFIGURATION
# ============================================

BACKEND_URL = "http://184.72.102.221:3001"
DEFAULT_PASSWORD = "Crypto@1234"

# CHANGE THESE:
ADMIN_EMAIL = "donquixotesoup@gmail.com"  # Your admin email
ADMIN_PASSWORD = "100%Test"  # Your admin password

# ============================================
# HELPER FUNCTIONS
# ============================================

def print_header(text: str):
    """Print formatted header"""
    print("\n" + "="*70)
    print(f"  {text}")
    print("="*70 + "\n")


def print_section(text: str):
    """Print section divider"""
    print("\n" + "-"*70)
    print(text)
    print("-"*70)


# ============================================
# DATA LOADING
# ============================================

def load_users_from_csv(csv_path: str) -> List[Dict[str, Any]]:
    """Load users from CSV file"""
    users = []
    skipped = []

    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)

            for idx, row in enumerate(reader, start=1):
                # Normalize column names (strip spaces)
                row = {k.strip(): v for k, v in row.items()}

                email = row.get('Email ID', row.get('email', '')).strip().lower()
                name = row.get('Name', row.get('name', 'Unknown')).strip()
                api_key = row.get('API KEY', row.get('apiKey', '')).strip()
                secret_key = row.get('SECRET KEY', row.get('apiSecret', '')).strip()
                phone = row.get('WhatsApp No', row.get('phoneNumber', '')).strip()

                # Skip empty emails
                if not email or email == 'nan':
                    skipped.append({"email": "N/A", "reason": "Empty Email", "row": idx})
                    continue

                # Skip empty credentials
                if not api_key or not secret_key or api_key == 'nan' or secret_key == 'nan':
                    skipped.append({"email": email, "reason": "Empty Credentials", "row": idx})
                    continue

                users.append({
                    "name": name,
                    "email": email,
                    "password": DEFAULT_PASSWORD,
                    "role": "REGULAR",
                    "apiKey": api_key,
                    "apiSecret": secret_key,
                    "phoneNumber": phone if phone and phone != 'nan' else ""
                })

        return users, skipped

    except FileNotFoundError:
        print(f"❌ File not found: {csv_path}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error reading CSV: {str(e)}")
        sys.exit(1)


def load_users_from_array() -> List[Dict[str, Any]]:
    """Load users from hardcoded array (edit this section)"""

    # EDIT THIS ARRAY WITH YOUR USERS:
    USERS = [
        {
            "name": "John Doe",
            "email": "john.doe@example.com",
            "password": DEFAULT_PASSWORD,
            "role": "REGULAR",
            "apiKey": "your_coindcx_api_key",
            "apiSecret": "your_coindcx_secret_key",
            "phoneNumber": "+91-1234567890"
        },
        # Add more users here...
    ]

    # Filter out example data
    users = []
    skipped = []

    for idx, user in enumerate(USERS):
        email = user.get('email', '').strip().lower()
        api_key = user.get('apiKey', '').strip()
        secret_key = user.get('apiSecret', '').strip()

        # Skip examples
        if 'example.com' in email or 'your_coindcx' in api_key:
            skipped.append({
                "email": email,
                "reason": "Example data (replace with real data)",
                "row": idx
            })
            continue

        if not email or not api_key or not secret_key:
            skipped.append({
                "email": email or "N/A",
                "reason": "Missing required fields",
                "row": idx
            })
            continue

        users.append(user)

    return users, skipped


# ============================================
# API FUNCTIONS
# ============================================

def login_as_admin() -> str:
    """Login and get JWT token"""
    try:
        resp = requests.post(
            f"{BACKEND_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=10
        )

        if resp.status_code == 200:
            token = resp.json().get('token')
            if not token:
                raise Exception("No token in response")
            return token
        else:
            error = resp.json().get('error', f'HTTP {resp.status_code}')
            raise Exception(f"Login failed: {error}")

    except Exception as e:
        raise Exception(f"Admin login error: {str(e)}")


def validate_credentials_bulk(token: str, users: List[Dict]) -> List[Dict]:
    """
    Validate all credentials with CoinDCX API BEFORE creating users
    Returns validation results for each user
    """
    if not users:
        return []

    print(f"🔍 Validating {len(users)} credentials with CoinDCX API...")
    print("   (This calls CoinDCX API for each user - may take a few seconds per user)")

    # Prepare validation payload
    validation_payload = [
        {
            "email": u["email"],
            "apiKey": u["apiKey"],
            "apiSecret": u["apiSecret"]
        }
        for u in users
    ]

    try:
        resp = requests.post(
            f"{BACKEND_URL}/api/admin/users/validate-bulk",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            },
            json={"users": validation_payload},
            timeout=180  # 3 minutes timeout
        )

        if resp.status_code == 200:
            data = resp.json()
            return data.get('results', [])
        else:
            error = resp.json().get('error', f'HTTP {resp.status_code}')
            raise Exception(f"Validation failed: {error}")

    except requests.exceptions.Timeout:
        raise Exception("Validation timeout - too many users or slow network")
    except Exception as e:
        raise Exception(f"Validation error: {str(e)}")


def create_users_bulk(token: str, users: List[Dict]) -> List[Dict]:
    """Create users (only those with validated credentials)"""
    if not users:
        return []

    print(f"\n✅ Creating {len(users)} users with valid credentials...")

    results = []
    batch_size = 50

    for i in range(0, len(users), batch_size):
        batch = users[i:i+batch_size]

        try:
            resp = requests.post(
                f"{BACKEND_URL}/api/admin/users/bulk-create",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                },
                json={"users": batch},
                timeout=120
            )

            if resp.status_code == 200:
                data = resp.json()
                results.extend(data.get('results', []))
            else:
                # Batch failed
                error = f"HTTP {resp.status_code}"
                for u in batch:
                    results.append({
                        "email": u['email'],
                        "status": "failed",
                        "error": error
                    })

        except Exception as e:
            for u in batch:
                results.append({
                    "email": u['email'],
                    "status": "failed",
                    "error": str(e)
                })

    return results


# ============================================
# REPORTING
# ============================================

def save_report(report_data: List[Dict], prefix: str = "bulk_import"):
    """Save detailed report to JSON file"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{prefix}_report_{timestamp}.json"

    with open(filename, 'w') as f:
        json.dump(report_data, f, indent=2)

    return filename


# ============================================
# MAIN EXECUTION
# ============================================

def main():
    print_header("COINDCX BULK USER CREATOR - VALIDATE FIRST MODE")

    print(f"🌐 Backend URL: {BACKEND_URL}")
    print(f"🔑 Default Password: {DEFAULT_PASSWORD}")
    print(f"👤 Admin: {ADMIN_EMAIL}")

    # Load users
    if len(sys.argv) > 1:
        csv_file = sys.argv[1]
        print(f"\n📂 Loading users from CSV: {csv_file}")
        all_users, locally_skipped = load_users_from_csv(csv_file)
    else:
        print(f"\n📝 Loading users from script array...")
        all_users, locally_skipped = load_users_from_array()

    print(f"\n📋 Loaded: {len(all_users)} users")
    print(f"⊘ Skipped locally: {len(locally_skipped)}")

    if locally_skipped:
        print("\n⚠️  Locally skipped:")
        for skip in locally_skipped[:5]:  # Show first 5
            print(f"   • {skip['email']}: {skip['reason']}")
        if len(locally_skipped) > 5:
            print(f"   ... and {len(locally_skipped) - 5} more")

    if len(all_users) == 0:
        print("\n❌ No valid users to process!")
        sys.exit(1)

    # Login
    print("\n🔐 Logging in as admin...")
    try:
        token = login_as_admin()
        print(f"✅ Logged in successfully")
    except Exception as e:
        print(f"❌ {str(e)}")
        sys.exit(1)

    # STEP 1: VALIDATE ALL CREDENTIALS
    print_section("STEP 1: CREDENTIAL VALIDATION")

    try:
        validations = validate_credentials_bulk(token, all_users)
    except Exception as e:
        print(f"❌ {str(e)}")
        sys.exit(1)

    # Analyze validation results
    valid_users = []
    invalid_creds = []
    duplicate_emails = []

    for i, validation in enumerate(validations):
        user = all_users[i]
        email = validation.get('email')
        email_exists = validation.get('emailExists', False)
        creds_valid = validation.get('credentialsValid')

        if email_exists:
            duplicate_emails.append({
                "email": email,
                "name": user['name'],
                "reason": "Email already exists in database"
            })
        elif creds_valid == False:
            invalid_creds.append({
                "email": email,
                "name": user['name'],
                "reason": "CoinDCX rejected credentials (Invalid API key/secret)"
            })
        elif creds_valid == True:
            valid_users.append(user)
        else:
            # Validation error
            invalid_creds.append({
                "email": email,
                "name": user['name'],
                "reason": "Could not validate credentials (API error)"
            })

    # Print validation summary
    print_header("VALIDATION RESULTS")

    print(f"✅ Valid credentials:    {len(valid_users)}")
    print(f"❌ Invalid credentials:  {len(invalid_creds)}")
    print(f"⚠️  Duplicate emails:     {len(duplicate_emails)}")

    # Show invalid credentials
    if invalid_creds:
        print_section("❌ INVALID CREDENTIALS (WILL NOT BE CREATED)")
        for inv in invalid_creds:
            print(f"   • {inv['email']} ({inv['name']})")
            print(f"     └─ {inv['reason']}")

    # Show duplicates
    if duplicate_emails:
        print_section("⚠️  DUPLICATE EMAILS (ALREADY EXIST)")
        for dup in duplicate_emails:
            print(f"   • {dup['email']} ({dup['name']})")

    # STEP 2: CREATE USERS (ONLY VALID ONES)
    if len(valid_users) == 0:
        print("\n❌ No users with valid credentials to create!")

        # Save report of invalid credentials
        report_data = invalid_creds + duplicate_emails + [
            {"email": s['email'], "name": "N/A", "reason": s['reason']}
            for s in locally_skipped
        ]
        filename = save_report(report_data, "invalid_credentials")
        print(f"\n📄 Report saved to: {filename}")

        sys.exit(0)

    print_section("STEP 2: USER CREATION")
    print(f"🚀 Creating {len(valid_users)} users with valid credentials...")

    try:
        creation_results = create_users_bulk(token, valid_users)
    except Exception as e:
        print(f"❌ {str(e)}")
        sys.exit(1)

    # Final summary
    created_count = sum(1 for r in creation_results if r.get('status') == 'success')
    failed_count = sum(1 for r in creation_results if r.get('status') == 'failed')

    print_header("FINAL SUMMARY")

    print(f"✅ Users created:                  {created_count}")
    print(f"❌ Invalid credentials (skipped):  {len(invalid_creds)}")
    print(f"⚠️  Duplicate emails (skipped):     {len(duplicate_emails)}")
    print(f"⚠️  Creation failures:              {failed_count}")
    print(f"⊘ Locally skipped:                 {len(locally_skipped)}")

    # Detailed breakdown
    if created_count > 0:
        print_section("✅ SUCCESSFULLY CREATED USERS")
        for r in creation_results:
            if r.get('status') == 'success':
                print(f"   • {r['email']} (ID: {r.get('userId', 'N/A')})")

    # Create comprehensive report
    report_data = {
        "timestamp": datetime.now().isoformat(),
        "summary": {
            "total_in_file": len(all_users) + len(locally_skipped),
            "created": created_count,
            "invalid_credentials": len(invalid_creds),
            "duplicates": len(duplicate_emails),
            "creation_failures": failed_count,
            "locally_skipped": len(locally_skipped)
        },
        "created_users": [
            {"email": r['email'], "userId": r.get('userId')}
            for r in creation_results if r.get('status') == 'success'
        ],
        "invalid_credentials": invalid_creds,
        "duplicate_emails": duplicate_emails,
        "creation_failures": [
            {"email": r['email'], "error": r.get('error')}
            for r in creation_results if r.get('status') == 'failed'
        ],
        "locally_skipped": locally_skipped
    }

    filename = save_report(report_data)
    print(f"\n📄 Full report saved to: {filename}")

    print_header("IMPORTANT NOTES")
    print(f"""
1. ✅ {created_count} users created with VALIDATED CoinDCX credentials
2. ❌ {len(invalid_creds)} users NOT created due to invalid credentials
3. 🔑 All created users have password: {DEFAULT_PASSWORD}
4. ⚠️  Users should change password after first login
5. 📄 Check the report file for complete details
    """)

    if invalid_creds:
        print("⚠️  ACTION REQUIRED:")
        print("   Users with invalid credentials were NOT created.")
        print("   Please verify their API keys and re-run the script.")

    print("="*70 + "\n")


if __name__ == '__main__':
    main()
