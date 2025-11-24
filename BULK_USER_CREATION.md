# Bulk User Creation Guide

## Overview

Safe bulk user creation using your existing admin API endpoint.

## What Happens During Bulk Creation?

### ✅ For Every User:
1. **User Account Created** - Always happens (even if credentials are invalid)
2. **Email Auto-Verified** - No OTP needed, users can login immediately
3. **Password Set** - Default: `Crypto@1234`

### 🔑 For CoinDCX Credentials:
The backend tests credentials by calling CoinDCX API:

- **✅ Valid Credentials**: Stored in database, user can trade immediately
- **❌ Invalid Credentials**: User account still created, but credentials NOT stored
  - User can add valid credentials manually in the app later
  - They won't be able to trade until credentials are added

### 📊 What You Get:
- Detailed report showing:
  - ✅ Successfully created users
  - ❌ Failed users (duplicate email, etc.)
  - 🔑 Credentials stored count
  - ⚠️ Invalid credentials count

## Quick Start

### 1. Edit the Script

```python
# Set your admin credentials
ADMIN_EMAIL = "your-admin@example.com"
ADMIN_PASSWORD = "your-admin-password"

# Add users
USERS_TO_CREATE = [
    {
        "name": "John Doe",
        "email": "john.doe@example.com",
        "password": "Crypto@1234",  # Can customize per user
        "role": "REGULAR",  # REGULAR, QUANT, CLIENT, or ADMIN
        "apiKey": "actual_coindcx_api_key",
        "apiSecret": "actual_coindcx_secret_key",
    },
    # Add more users...
]
```

### 2. Run the Script

```bash
cd /Users/macintosh/Developer/coindcx_client/coindcx-trading-platform
python3 bulk_user_creator.py
```

### 3. Or Run in Google Colab

```python
!pip install requests
!python bulk_user_creator.py
```

## Example Output

```
======================================================================
  BULK USER CREATION - COINDCX TRADING PLATFORM
======================================================================

🌐 Backend URL: http://184.72.102.221:3001
🔑 Default Password: Crypto@1234
📋 Users to create: 5

🔍 Testing backend connectivity...
✅ Backend is reachable

🔐 Logging in as admin...
✅ Logged in as: admin@example.com

🚀 Creating 5 users...
   This may take a few seconds per user (credential validation)...

======================================================================
  RESULTS SUMMARY
======================================================================

📊 Total users processed: 5
✅ Successfully created: 5
❌ Failed: 0
🔑 Credentials stored: 3
⚠️  Invalid credentials: 2
⊘ Credentials skipped: 0

----------------------------------------------------------------------
✅ SUCCESSFUL USERS
----------------------------------------------------------------------

📧 john.doe@example.com
   └─ User ID: cm123abc
   └─ 🔑 Broker credentials: ✅ STORED (valid)

📧 jane.smith@example.com
   └─ User ID: cm456def
   └─ ⚠️  Broker credentials: ❌ INVALID (user needs to add manually)

----------------------------------------------------------------------
📄 RESULTS SAVED
----------------------------------------------------------------------
Full results saved to: bulk_users_results_20251120_143022.json

======================================================================
  IMPORTANT NOTES
======================================================================

1. ✅ All users are AUTO-VERIFIED (no email verification needed)
2. 🔑 Default password: Crypto@1234
3. ⚠️  Users with invalid credentials need to add them manually in the app
4. 📧 Consider notifying users about their accounts
5. 🔒 Security: Inform users to change their password after first login

⚠️  USERS WITH INVALID CREDENTIALS:
----------------------------------------------------------------------
   These users were created but need to add broker credentials manually:
   • jane.smith@example.com

======================================================================
✅ Bulk user creation complete!
======================================================================
```

## Understanding Results

### User Created Successfully + Valid Credentials
```
📧 john.doe@example.com
   └─ User ID: cm123abc
   └─ 🔑 Broker credentials: ✅ STORED (valid)
```
- ✅ User can login immediately
- ✅ Can start trading right away

### User Created Successfully + Invalid Credentials
```
📧 jane.smith@example.com
   └─ User ID: cm456def
   └─ ⚠️  Broker credentials: ❌ INVALID (user needs to add manually)
```
- ✅ User can login immediately
- ❌ Cannot trade yet - needs to add valid credentials in app
- 👉 User goes to Broker Settings → Add CoinDCX credentials

### User Creation Failed
```
📧 duplicate@example.com
   └─ Error: User with this email already exists
```
- User was NOT created (email already exists, or other error)

## Configuration Options

### User Fields

```python
{
    "name": "John Doe",              # Required
    "email": "john@example.com",     # Required, must be unique
    "password": "Crypto@1234",       # Required
    "role": "REGULAR",               # Optional: REGULAR, QUANT, CLIENT, ADMIN
    "apiKey": "api_key",             # Optional: CoinDCX API key
    "apiSecret": "secret_key",       # Optional: CoinDCX secret
    "phoneNumber": "+91-1234567890"  # Optional: Phone number
}
```

### Roles Explained

- **REGULAR**: Normal user, can subscribe to strategies
- **QUANT**: Can create and manage strategies
- **CLIENT**: Special client role (if you use it)
- **ADMIN**: Admin access to admin panel

## CSV Import Support

Want to import from CSV? Add this to the script:

```python
import csv

# Read CSV file
with open('users.csv', 'r') as f:
    reader = csv.DictReader(f)
    USERS_TO_CREATE = [
        {
            "name": row['name'],
            "email": row['email'],
            "password": row.get('password', DEFAULT_PASSWORD),
            "role": row.get('role', 'REGULAR'),
            "apiKey": row['apiKey'],
            "apiSecret": row['apiSecret'],
        }
        for row in reader
    ]

# Then run main()
main()
```

**CSV Format** (`users.csv`):
```csv
name,email,password,role,apiKey,apiSecret
John Doe,john@example.com,Crypto@1234,REGULAR,key1,secret1
Jane Smith,jane@example.com,Crypto@1234,QUANT,key2,secret2
```

## Limitations

- **Max 100 users per batch** - Backend limit to prevent timeouts
- **Rate limiting** - If you create many users, the script may slow down
- **Sequential processing** - Users are created one by one (takes ~2-3 seconds per user with credential validation)

For more than 100 users, split into multiple batches:

```python
# Batch 1
USERS_TO_CREATE = users_list[0:100]
# Run script

# Batch 2
USERS_TO_CREATE = users_list[100:200]
# Run script again
```

## Troubleshooting

### Error: "Admin login failed"
- Check `ADMIN_EMAIL` and `ADMIN_PASSWORD` are correct
- Ensure your admin account has ADMIN role
- Verify backend is running

### Error: "Cannot reach backend"
- Check `BACKEND_URL` is correct
- Ensure backend is running and accessible
- Check firewall/network settings

### Error: "User with this email already exists"
- This is expected for duplicates
- User is skipped automatically
- Check your input data for duplicates

### Invalid credentials during bulk creation
- User account IS created
- Credentials are NOT stored
- User can add valid credentials manually later
- No harm done - this is by design!

## Security Best Practices

1. **Admin Credentials**: Keep ADMIN_EMAIL and ADMIN_PASSWORD secure
2. **Delete After Use**: Remove the script or clear credentials after bulk import
3. **User Notification**: Email users their credentials securely
4. **Password Change**: Inform users to change password after first login
5. **API Keys**: Never commit CSV files with API keys to git

## What to Tell Your Users

After bulk creation, send users an email like:

```
Subject: Your CoinDCX Trading Platform Account

Hi [Name],

Your account has been created:

Email: [email]
Password: Crypto@1234
Login: https://your-platform.com

Important:
1. Please change your password after first login
2. Your CoinDCX credentials have been [stored/not stored]
   [If not stored: Please add your CoinDCX API keys in Settings → Broker]

Happy Trading!
```

## Advanced: Programmatic Usage

Use the script as a library:

```python
from bulk_user_creator import login_as_admin, bulk_create_users

# Login
token = login_as_admin()

# Create users
users = [
    {"name": "User 1", "email": "user1@example.com", "password": "Pass123"},
    {"name": "User 2", "email": "user2@example.com", "password": "Pass456"},
]

result = bulk_create_users(token, users)
print(result['summary'])
```

## Support

If you encounter issues:

1. Check the log file for detailed error messages
2. Verify admin credentials are correct
3. Test with a single user first
4. Check backend logs for API errors
5. Verify CoinDCX API is accessible

## Backend Endpoint Used

`POST /api/admin/users/bulk-create`

**Required**: Admin authentication (JWT token)

**Request Format**:
```json
{
  "users": [
    {
      "name": "John Doe",
      "email": "john@example.com",
      "password": "password123",
      "role": "REGULAR",
      "apiKey": "optional_api_key",
      "apiSecret": "optional_secret"
    }
  ]
}
```

**Response Format**:
```json
{
  "success": true,
  "summary": {
    "total": 5,
    "successful": 5,
    "failed": 0,
    "credentialsStored": 3,
    "credentialsInvalid": 2,
    "credentialsSkipped": 0
  },
  "results": [...]
}
```
