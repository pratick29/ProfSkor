import os
import secrets
from typing import Any, Dict, Optional

from fastapi import Header, HTTPException
from supabase import Client


def get_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    if not authorization.startswith("Bearer "):
        return None
    return authorization.split(" ", 1)[1].strip()


def get_optional_user(
    supabase: Optional[Client],
    authorization: Optional[str] = Header(default=None),
) -> Optional[Dict[str, Any]]:
    """Return the user for a valid Supabase access token, or None (guest)."""
    token = get_bearer_token(authorization)
    if not token or not supabase:
        return None
    try:
        user_resp = supabase.auth.get_user(token)
        user = getattr(user_resp, "user", None)
    except Exception:
        return None
    if not user:
        return None
    # app_metadata is only writable with the service role key; user_metadata is user-editable
    return {
        "id": user.id,
        "email": user.email,
        "metadata": user.user_metadata or {},
        "app_metadata": user.app_metadata or {},
        "email_confirmed": bool(getattr(user, "email_confirmed_at", None)),
    }


def require_user(
    supabase: Optional[Client],
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    user = get_optional_user(supabase, authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


def require_admin(
    supabase: Optional[Client],
    authorization: Optional[str] = Header(default=None),
    x_admin_secret: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    expected_secret = os.getenv("ADMIN_API_SECRET", "").strip()
    if expected_secret and x_admin_secret and secrets.compare_digest(x_admin_secret, expected_secret):
        return {"id": "admin-secret", "role": "admin"}

    user = require_user(supabase, authorization)
    if (user.get("app_metadata") or {}).get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
