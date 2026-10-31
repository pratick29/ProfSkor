from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from supabase import Client, create_client

from config import SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL


def get_supabase_client() -> Optional[Client]:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return None
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def insert_score_history(
    supabase: Optional[Client],
    user_id: str,
    overall: float,
    github_score: float,
    leetcode_score: float,
    linkedin_score: float,
) -> None:
    if not supabase:
        return
    supabase.table("scores").insert(
        {
            "user_id": user_id,
            "overall_score": overall,
            "github_score": github_score,
            "leetcode_score": leetcode_score,
            "linkedin_score": linkedin_score,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    ).execute()


def list_scores(supabase: Optional[Client], user_id: str, limit: int = 100) -> List[Dict[str, Any]]:
    if not supabase:
        return []
    try:
        result = (
            supabase.table("scores")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []
    except Exception:
        return []


def list_saved_profiles(
    supabase: Optional[Client], user_id: str, profile_type: Optional[str] = None, limit: int = 100
) -> List[Dict[str, Any]]:
    if not supabase:
        return []
    try:
        query = (
            supabase.table("saved_profiles")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
        )
        if profile_type:
            query = query.eq("profile_type", profile_type)
        return (query.execute().data or [])
    except Exception:
        return []


def insert_resume_analysis(
    supabase: Optional[Client], user_id: str, filename: str, analysis_data: Dict[str, Any]
) -> None:
    if not supabase:
        return
    supabase.table("resume_reviews").insert(
        {
            "user_id": user_id,
            "filename": filename,
            "analysis_data": analysis_data,
            "score": analysis_data.get("score", 0),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    ).execute()
