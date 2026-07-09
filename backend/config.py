"""
Configuration and environment variable management
"""
import os
from dotenv import load_dotenv

load_dotenv()

# API Configuration
GITHUB_API_BASE = "https://api.github.com"
LEETCODE_GRAPHQL = "https://leetcode.com/graphql"

# Timeouts (in seconds)
GITHUB_TIMEOUT = int(os.getenv("GITHUB_TIMEOUT", "10"))
LEETCODE_TIMEOUT = int(os.getenv("LEETCODE_TIMEOUT", "10"))
REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "30"))

# Supabase Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

# CORS Configuration
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

# Add custom origins from environment
CUSTOM_ORIGINS = os.getenv("CORS_ORIGINS", "").split(",")
ALLOWED_ORIGINS.extend([origin.strip() for origin in CUSTOM_ORIGINS if origin.strip()])

# Rate Limiting (requests per minute)
RATE_LIMIT = int(os.getenv("RATE_LIMIT", "60"))

# Logging
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
DEBUG = os.getenv("DEBUG", "false").lower() == "true"