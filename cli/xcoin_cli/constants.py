"""
Constants for xcoin-cli
Production and development URLs
"""

# Production URLs
PRODUCTION_API_URL = "https://xcoinalgo.com"
PRODUCTION_FRONTEND_URL = "https://xcoinalgo.com"

# Local development URLs (fallback)
LOCAL_API_URL = "http://localhost:3001"
LOCAL_FRONTEND_URL = "http://localhost:3000"

# API endpoints
API_ENDPOINTS = {
    "login": "/api/auth/me",
    "strategies": "/api/strategies",
    "marketplace": "/api/marketplace",
    "upload": "/api/strategy-upload/cli-upload",
    "deploy": "/api/strategies/{id}/deploy",
    "status": "/api/strategies/{id}/status",
    "logs": "/api/strategies/{id}/logs",
}
