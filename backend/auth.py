import os
from typing import Any, Dict, Optional

from fastapi import Header, HTTPException
from supabase import Client


def get_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    if not authorization.startswith("Bearer "):
        return None
    return authorization.split(" ", 1)[1].strip()


def require_user(
    supabase: Optional[Client],
    authorization: Optional[str] = Header(default=None),
    x_user_id: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    token = get_bearer_token(authorization)
    if token and supabase:
        try:
            user_resp = supabase.auth.get_user(token)
            user = getattr(user_resp, "user", None)
            if user:
                return {"id": user.id, "email": user.email, "metadata": user.user_metadata or {}}
        except Exception:
            pass
    # local dev fallback if auth token absent
    if x_user_id:
        return {"id": x_user_id, "email": "", "metadata": {}}
    raise HTTPException(status_code=401, detail="Authentication required")


def require_admin(
    supabase: Optional[Client],
    authorization: Optional[str] = Header(default=None),
    x_admin_secret: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    expected_secret = os.getenv("ADMIN_API_SECRET", "").strip()
    if expected_secret and x_admin_secret == expected_secret:
        return {"id": "admin-secret", "role": "admin"}

    user = require_user(supabase, authorization, None)
    role = (user.get("metadata") or {}).get("user_type")
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
