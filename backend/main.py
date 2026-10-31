import os
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware

try:
    from auth import get_optional_user, require_admin, require_user
    from core.default_preferences import DEFAULT_PREFS
    from core.leetcode_scoring import leetcode_score
    from core.scoring import github_score
    from core.weight_templates import WEIGHT_TEMPLATES
    from db import get_supabase_client, insert_resume_analysis, insert_score_history, list_saved_profiles, list_scores
    from fetchers.github_fetcher import fetch_github_repos, fetch_github_user
    from fetchers.leetcode_fetcher import fetch_leetcode_user
    from rate_limit import enforce_rate_limit
    from resume_service import MAX_FILE_SIZE_BYTES, analyze_resume_text, extract_text_from_pdf
    from schemas import GithubScoreRequest, LeetcodeScoreRequest, LinkedinInput, LinkedinScoreRequest, SaveProfileRequest, ScoreRequest
except ModuleNotFoundError:
    from backend.auth import get_optional_user, require_admin, require_user
    from backend.core.default_preferences import DEFAULT_PREFS
    from backend.core.leetcode_scoring import leetcode_score
    from backend.core.scoring import github_score
    from backend.core.weight_templates import WEIGHT_TEMPLATES
    from backend.db import get_supabase_client, insert_resume_analysis, insert_score_history, list_saved_profiles, list_scores
    from backend.fetchers.github_fetcher import fetch_github_repos, fetch_github_user
    from backend.fetchers.leetcode_fetcher import fetch_leetcode_user
    from backend.rate_limit import enforce_rate_limit
    from backend.resume_service import MAX_FILE_SIZE_BYTES, analyze_resume_text, extract_text_from_pdf
    from backend.schemas import (
        GithubScoreRequest,
        LeetcodeScoreRequest,
        LinkedinInput,
        LinkedinScoreRequest,
        SaveProfileRequest,
        ScoreRequest,
    )

env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

app = FastAPI(title="Career Profile Score API", version="2.0.0")
supabase = get_supabase_client()

cors_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
extra_origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "").split(",") if origin.strip()]
if extra_origins:
    cors_origins.extend(extra_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def normalize_weights(raw_weights: Dict[str, Any]) -> Dict[str, float]:
    default_weights = {"github": 0.4, "leetcode": 0.3, "linkedin": 0.3}
    if not raw_weights:
        return default_weights
    total = float(sum(max(float(raw_weights.get(k, 0)), 0) for k in default_weights.keys()))
    if total <= 0:
        return default_weights
    return {k: max(float(raw_weights.get(k, 0)), 0) / total for k in default_weights.keys()}


def safe_linkedin_score(linkedin: LinkedinInput, prefs: Dict[str, Any]) -> float:
    lp = prefs.get("linkedin", DEFAULT_PREFS["linkedin"])
    score = 0.0
    score += lp["headline"] if linkedin.has_headline else 0
    score += lp["about"] if linkedin.has_about else 0
    score += lp["projects"] if linkedin.has_projects else 0
    score += lp["photo"] if linkedin.has_photo else 0
    score += lp["experience"] if linkedin.has_experience else 0
    posting_map = {"0 per week": 0.25, "1 per week": 0.5, "2-3 per week": 0.75, "4+ per week": 1}
    score += posting_map.get(linkedin.posting, 0.25) * lp["posting"]
    return min(score, 100)


def current_user_dep(authorization: Optional[str] = Header(default=None)):
    return require_user(supabase, authorization)


def optional_user_dep(authorization: Optional[str] = Header(default=None)):
    return get_optional_user(supabase, authorization)


def admin_user_dep(
    authorization: Optional[str] = Header(default=None), x_admin_secret: Optional[str] = Header(default=None)
):
    return require_admin(supabase, authorization, x_admin_secret)


@app.get("/health")
def health():
    return {"status": "ok", "supabase": bool(supabase)}


@app.get("/templates/{name}")
def get_template(name: str):
    if name not in WEIGHT_TEMPLATES:
        raise HTTPException(status_code=404, detail="Template not found")
    return WEIGHT_TEMPLATES[name]


@app.post("/score/github")
def score_github(payload: GithubScoreRequest, request: Request):
    enforce_rate_limit(request)
    user, err = fetch_github_user(payload.github_username)
    if err:
        raise HTTPException(status_code=400, detail=err)
    repos, err2 = fetch_github_repos(payload.github_username)
    if err2:
        raise HTTPException(status_code=400, detail=err2)
    prefs = (payload.preferences or {}).get("github", DEFAULT_PREFS["github"])
    score, breakdown, suggestions = github_score(user, repos, prefs)
    highlights = [
        {
            "name": r.get("name"),
            "stars": r.get("stargazers_count", 0),
            "forks": r.get("forks_count", 0),
            "language": r.get("language"),
            "updated_at": r.get("updated_at"),
            "description": r.get("description", ""),
            "url": r.get("html_url", ""),
        }
        for r in repos[:5]
    ]
    return {
        "username": payload.github_username,
        "score": max(0, min(int(score), 100)),
        "breakdown": breakdown,
        "suggestions": suggestions,
        "highlights": highlights,
    }


@app.post("/score/leetcode")
def score_leetcode(payload: LeetcodeScoreRequest, request: Request):
    enforce_rate_limit(request)
    user, err = fetch_leetcode_user(payload.leetcode_username)
    if err:
        raise HTTPException(status_code=400, detail=err)
    prefs = (payload.preferences or {}).get("leetcode", DEFAULT_PREFS["leetcode"])
    score, breakdown, suggestions, meta = leetcode_score(user, prefs)
    return {
        "username": payload.leetcode_username,
        "score": max(0, min(int(score), 100)),
        "breakdown": breakdown,
        "suggestions": suggestions,
        "meta": meta,
    }


@app.post("/score/linkedin")
def score_linkedin(payload: LinkedinScoreRequest, request: Request):
    enforce_rate_limit(request)
    prefs = payload.preferences or DEFAULT_PREFS
    score = safe_linkedin_score(LinkedinInput(**payload.model_dump()), prefs)
    return {"score": max(0, min(round(score, 2), 100))}


@app.post("/score")
def score_profile(payload: ScoreRequest, request: Request, auth_user=Depends(optional_user_dep)):
    enforce_rate_limit(request)
    prefs = payload.preferences or DEFAULT_PREFS
    github_score_value = leetcode_score_value = 0.0
    github_break: Dict[str, Any] = {}
    leetcode_break: Dict[str, Any] = {}
    github_suggestions = []
    leetcode_suggestions = []
    leetcode_meta = {}
    github_highlights = []

    if payload.github_username:
        gh_user, err = fetch_github_user(payload.github_username)
        if not err:
            repos, err2 = fetch_github_repos(payload.github_username)
            if not err2:
                github_score_value, github_break, github_suggestions = github_score(
                    gh_user, repos, prefs.get("github", DEFAULT_PREFS["github"])
                )
                github_highlights = [
                    {
                        "name": r.get("name"),
                        "stars": r.get("stargazers_count", 0),
                        "forks": r.get("forks_count", 0),
                        "language": r.get("language"),
                        "updated_at": r.get("updated_at"),
                    }
                    for r in repos[:5]
                ]

    if payload.leetcode_username:
        lc_user, err = fetch_leetcode_user(payload.leetcode_username)
        if not err:
            leetcode_score_value, leetcode_break, leetcode_suggestions, leetcode_meta = leetcode_score(
                lc_user, prefs.get("leetcode", DEFAULT_PREFS["leetcode"])
            )

    linkedin_score_value = safe_linkedin_score(payload.linkedin, prefs)
    weights = normalize_weights(prefs.get("platform_weights", {}))
    overall = round(
        github_score_value * weights["github"]
        + leetcode_score_value * weights["leetcode"]
        + linkedin_score_value * weights["linkedin"],
        2,
    )
    overall = max(0, min(overall, 100))

    # Only persist history for authenticated users; never trust a user_id from the request body
    if auth_user:
        try:
            insert_score_history(
                supabase,
                auth_user["id"],
                overall,
                github_score_value,
                leetcode_score_value,
                linkedin_score_value,
            )
        except Exception as e:
            print(f"Error saving score history: {e}")

    suggestions = [f"(GitHub) {x}" for x in github_suggestions] + [f"(LeetCode) {x}" for x in leetcode_suggestions]
    if linkedin_score_value < 70:
        suggestions.append("(LinkedIn) Improve profile completeness")

    return {
        "scores": {
            "overall": overall,
            "github": round(github_score_value, 2),
            "leetcode": round(leetcode_score_value, 2),
            "linkedin": round(linkedin_score_value, 2),
        },
        "breakdown": {"github": {**github_break, "highlights": github_highlights}, "leetcode": leetcode_break},
        "leetcode_meta": leetcode_meta,
        "suggestions": suggestions[:12],
    }


@app.post("/profiles/save")
def save_profile(payload: SaveProfileRequest, request: Request, auth_user=Depends(current_user_dep)):
    enforce_rate_limit(request)
    if auth_user["id"] != payload.user_id:
        raise HTTPException(status_code=403, detail="Cannot write another user's data")
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    name = payload.profile_name or f"{payload.profile_type}_{payload.user_id[:8]}"
    try:
        result = (
            supabase.table("saved_profiles")
            .insert(
                {
                    "user_id": payload.user_id,
                    "profile_type": payload.profile_type,
                    "profile_name": name,
                    "profile_data": payload.profile_data,
                }
            )
            .execute()
        )
        return {"success": True, "data": (result.data or [None])[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save profile: {e}")


@app.get("/profiles/history")
def profile_history(profile_type: Optional[str] = None, limit: int = 100, auth_user=Depends(current_user_dep)):
    return {"data": list_saved_profiles(supabase, auth_user["id"], profile_type, limit)}


@app.get("/scores/history")
def scores_history(limit: int = 100, auth_user=Depends(current_user_dep)):
    return {"data": list_scores(supabase, auth_user["id"], limit)}


@app.get("/me/subscription")
def my_subscription(auth_user=Depends(current_user_dep)):
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    try:
        result = (
            supabase.table("subscriptions")
            .select("*")
            .eq("user_id", auth_user["id"])
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]
    except Exception:
        pass
    return {"plan": "free", "status": "active", "features": {"resume_ai": True, "advanced_analytics": False, "admin": False}}


@app.get("/me/features/{feature_key}")
def has_feature(feature_key: str, auth_user=Depends(current_user_dep)):
    sub = my_subscription(auth_user)
    features = sub.get("features", {}) if isinstance(sub, dict) else {}
    return {"feature": feature_key, "enabled": bool(features.get(feature_key, False))}


@app.post("/ai/resume-review")
async def resume_review(
    request: Request,
    file: UploadFile = File(...),
    auth_user=Depends(optional_user_dep),
):
    enforce_rate_limit(request)
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    body = await file.read()
    if len(body) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="PDF exceeds 5MB limit")
    text = extract_text_from_pdf(file_obj=BytesIO(body))
    if not text or len(text.strip()) < 50:
        raise HTTPException(status_code=400, detail="Could not extract meaningful text from PDF")
    analysis = analyze_resume_text(text)
    if auth_user:
        try:
            insert_resume_analysis(supabase, auth_user["id"], file.filename, analysis)
        except Exception as e:
            print(f"Error saving resume analysis: {e}")
    return analysis


@app.get("/admin/metrics")
def admin_metrics(admin_user=Depends(admin_user_dep)):
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    try:
        score_rows = supabase.table("scores").select("id, created_at", count="exact").limit(1000).execute()
    except Exception:
        score_rows = type("Obj", (), {"count": 0, "data": []})()
    try:
        profile_rows = supabase.table("saved_profiles").select("id, profile_type", count="exact").limit(1000).execute()
    except Exception:
        profile_rows = type("Obj", (), {"count": 0, "data": []})()
    return {
        "admin": admin_user.get("id"),
        "scores_total": score_rows.count or len(score_rows.data or []),
        "profiles_total": profile_rows.count or len(profile_rows.data or []),
        "profiles_by_type": {
            "github": len([x for x in (profile_rows.data or []) if x.get("profile_type") == "github"]),
            "leetcode": len([x for x in (profile_rows.data or []) if x.get("profile_type") == "leetcode"]),
            "linkedin": len([x for x in (profile_rows.data or []) if x.get("profile_type") == "linkedin"]),
            "fullscore": len([x for x in (profile_rows.data or []) if x.get("profile_type") == "fullscore"]),
        },
    }
