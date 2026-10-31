"""
Central configuration, loaded once from the environment (and the repo-root .env for local dev).
"""
import os
from pathlib import Path

from dotenv import load_dotenv

_backend_dir = Path(__file__).resolve().parent
load_dotenv(dotenv_path=_backend_dir.parent / ".env")
load_dotenv(dotenv_path=_backend_dir / ".env")


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


# External APIs
GITHUB_API = "https://api.github.com"
GITHUB_GRAPHQL = "https://api.github.com/graphql"
LEETCODE_GRAPHQL = "https://leetcode.com/graphql"
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "").strip()
REQUEST_TIMEOUT = _int("REQUEST_TIMEOUT", 15)

# Cache for external profile lookups (seconds)
CACHE_TTL_SECONDS = _int("CACHE_TTL_SECONDS", 3600)

# Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

# LLM resume review (optional; falls back to rule-based analysis)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")

# CORS
ALLOWED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"] + [
    origin.strip() for origin in os.getenv("CORS_ORIGINS", "").split(",") if origin.strip()
]

# Rate limiting (requests per minute per client)
RATE_LIMIT = _int("RATE_LIMIT", 60)
# Number of reverse proxies in front of the app (e.g. 1 on Render). 0 = use the socket peer address.
TRUSTED_PROXY_HOPS = _int("TRUSTED_PROXY_HOPS", 0)

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
