import logging
import uuid
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import eresume
from auth import get_optional_user, require_admin, require_user
from config import ALLOWED_ORIGINS, GITHUB_TOKEN, LOG_LEVEL, OPENAI_API_KEY
from core.default_preferences import DEFAULT_PREFS
from core.leetcode_scoring import leetcode_score
from core.scoring import github_score, merged_prefs, repo_highlights
from core.weight_templates import WEIGHT_TEMPLATES
from db import get_supabase_client, insert_resume_analysis, insert_score_history, list_saved_profiles, list_scores
from fetchers.github_fetcher import fetch_github_contributions, fetch_github_repos, fetch_github_user
from fetchers.leetcode_fetcher import fetch_leetcode_user
from rate_limit import enforce_rate_limit
from resume_service import analyze_resume_text
from schemas import GithubScoreRequest, LeetcodeScoreRequest, LinkedinInput, LinkedinScoreRequest, SaveProfileRequest, ScoreRequest

logging.basicConfig(level=LOG_LEVEL, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("profskor")

app = FastAPI(title="ProfSkor API", version="3.0.0")
supabase = get_supabase_client()
eresume.supabase = supabase
app.include_router(eresume.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    """One readable message (e.g. "projects.0.repo_url: 'x' is not a valid link") instead of a list."""
    errors = exc.errors()
    first = errors[0] if errors else {}
    where = ".".join(str(p) for p in first.get("loc", ()) if p not in ("body", "query", "path"))
    message = str(first.get("msg", "Invalid request")).removeprefix("Value error, ")
    return JSONResponse(status_code=422, content={"detail": f"{where}: {message}" if where else message, "errors": jsonable_errors(errors)})


def jsonable_errors(errors):
    return [{"loc": list(e.get("loc", ())), "msg": str(e.get("msg", ""))} for e in errors]


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception):
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Something went wrong. Please try again."})


def normalize_weights(raw_weights: Dict[str, Any]) -> Dict[str, float]:
    default_weights = {"github": 0.4, "leetcode": 0.3, "linkedin": 0.3}
    if not raw_weights:
        return default_weights
    total = float(sum(max(float(raw_weights.get(k, 0)), 0) for k in default_weights.keys()))
    if total <= 0:
        return default_weights
    return {k: max(float(raw_weights.get(k, 0)), 0) / total for k in default_weights.keys()}


def safe_linkedin_score(linkedin: LinkedinInput, prefs: Dict[str, Any]) -> float:
    lp = merged_prefs(prefs.get("linkedin"), "linkedin")
    posting_map = {"0 per week": 0.0, "1 per week": 0.5, "2-3 per week": 0.85, "4+ per week": 1.0}
    earned = (
        (lp["headline"] if linkedin.has_headline else 0)
        + (lp["about"] if linkedin.has_about else 0)
        + (lp["projects"] if linkedin.has_projects else 0)
        + (lp["photo"] if linkedin.has_photo else 0)
        + (lp["experience"] if linkedin.has_experience else 0)
        + posting_map.get(linkedin.posting, 0) * lp["posting"]
    )
    return min(earned / (sum(lp.values()) or 1) * 100, 100)


def linkedin_suggestions(linkedin: LinkedinInput) -> List[str]:
    tips = []
    if not linkedin.has_headline:
        tips.append("Write a headline that names your role and stack, e.g. 'Backend Engineer | Python, AWS'.")
    if not linkedin.has_about:
        tips.append("Add an About section: who you are, what you build, and what you're looking for.")
    if not linkedin.has_projects:
        tips.append("Add your best projects to the Featured section with links.")
    if not linkedin.has_photo:
        tips.append("Add a clear profile photo. Profiles with photos get far more views.")
    if not linkedin.has_experience:
        tips.append("List internships, freelance work, or open-source contributions under Experience.")
    if linkedin.posting == "0 per week":
        tips.append("Post about what you're learning or building at least once a week.")
    return tips


def score_github_user(username: str, prefs: Optional[Dict]) -> Dict[str, Any]:
    user, err = fetch_github_user(username)
    if err:
        raise HTTPException(status_code=400, detail=err)
    repos, err = fetch_github_repos(username)
    if err:
        raise HTTPException(status_code=400, detail=err)
    contributions, _ = fetch_github_contributions(username)
    score, breakdown, suggestions, meta = github_score(user, repos, prefs, contributions)
    return {
        "username": user.get("login", username),
        "name": user.get("name"),
        "avatar_url": user.get("avatar_url"),
        "score": score,
        "breakdown": breakdown,
        "suggestions": suggestions,
        "highlights": repo_highlights(repos),
        "meta": meta,
        "calendar": (contributions or {}).get("calendar", []),
    }


def score_leetcode_user(username: str, prefs: Optional[Dict]) -> Dict[str, Any]:
    user, err = fetch_leetcode_user(username)
    if err:
        raise HTTPException(status_code=400, detail=err)
    score, breakdown, suggestions, meta = leetcode_score(user, prefs)
    return {"username": user.get("username", username), "score": score, "breakdown": breakdown, "suggestions": suggestions, "meta": meta}


def current_user_dep(authorization: Optional[str] = Header(default=None)):
    return require_user(supabase, authorization)


def optional_user_dep(authorization: Optional[str] = Header(default=None)):
    return get_optional_user(supabase, authorization)


def admin_user_dep(
    authorization: Optional[str] = Header(default=None), x_admin_secret: Optional[str] = Header(default=None)
):
    return require_admin(supabase, authorization, x_admin_secret)


@app.get("/")
def root():
    return {"name": "ProfSkor API", "docs": "/docs", "health": "/health"}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "supabase": bool(supabase),
        "github_token": bool(GITHUB_TOKEN),
        "ai_resume_review": bool(OPENAI_API_KEY),
    }


@app.get("/templates/{name}")
def get_template(name: str):
    if name not in WEIGHT_TEMPLATES:
        raise HTTPException(status_code=404, detail="Template not found")
    return WEIGHT_TEMPLATES[name]


@app.post("/score/github")
def score_github(payload: GithubScoreRequest, request: Request):
    enforce_rate_limit(request)
    return score_github_user(payload.github_username, (payload.preferences or {}).get("github"))


@app.post("/score/leetcode")
def score_leetcode(payload: LeetcodeScoreRequest, request: Request):
    enforce_rate_limit(request)
    return score_leetcode_user(payload.leetcode_username, (payload.preferences or {}).get("leetcode"))


@app.post("/score/linkedin")
def score_linkedin(payload: LinkedinScoreRequest, request: Request):
    enforce_rate_limit(request)
    linkedin = LinkedinInput(**payload.model_dump(exclude={"preferences"}))
    score = safe_linkedin_score(linkedin, payload.preferences or DEFAULT_PREFS)
    return {"score": round(score, 2), "suggestions": linkedin_suggestions(linkedin)}


@app.post("/score")
def score_profile(payload: ScoreRequest, request: Request, auth_user=Depends(optional_user_dep)):
    enforce_rate_limit(request)
    prefs = payload.preferences or DEFAULT_PREFS
    warnings: List[str] = []
    github: Dict[str, Any] = {}
    leetcode: Dict[str, Any] = {}

    if payload.github_username:
        try:
            github = score_github_user(payload.github_username, prefs.get("github"))
        except HTTPException as e:
            warnings.append(f"GitHub: {e.detail}")
    if payload.leetcode_username:
        try:
            leetcode = score_leetcode_user(payload.leetcode_username, prefs.get("leetcode"))
        except HTTPException as e:
            warnings.append(f"LeetCode: {e.detail}")

    github_score_value = float(github.get("score", 0))
    leetcode_score_value = float(leetcode.get("score", 0))
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
        except Exception:
            log.exception("Error saving score history")

    suggestions = (
        [f"(GitHub) {x}" for x in github.get("suggestions", [])]
        + [f"(LeetCode) {x}" for x in leetcode.get("suggestions", [])]
        + [f"(LinkedIn) {x}" for x in linkedin_suggestions(payload.linkedin)]
    )

    return {
        "scores": {
            "overall": overall,
            "github": round(github_score_value, 2),
            "leetcode": round(leetcode_score_value, 2),
            "linkedin": round(linkedin_score_value, 2),
        },
        "weights": weights,
        "breakdown": {
            "github": {**github.get("breakdown", {}), "highlights": github.get("highlights", [])},
            "leetcode": leetcode.get("breakdown", {}),
        },
        "github_meta": github.get("meta", {}),
        "leetcode_meta": leetcode.get("meta", {}),
        "suggestions": suggestions[:15],
        "warnings": warnings,
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
    except Exception:
        log.exception("Failed to save profile")
        raise HTTPException(status_code=500, detail="Failed to save profile")


@app.get("/profiles/history")
def profile_history(profile_type: Optional[str] = None, limit: int = 100, auth_user=Depends(current_user_dep)):
    return {"data": list_saved_profiles(supabase, auth_user["id"], profile_type, min(max(limit, 1), 500))}


@app.get("/profiles/shared/{profile_id}")
def shared_profile(profile_id: str, request: Request):
    """Anyone with a saved profile's link (its unguessable UUID) can view it."""
    enforce_rate_limit(request)
    try:
        uuid.UUID(profile_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Profile not found")
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    try:
        result = (
            supabase.table("saved_profiles")
            .select("id, profile_type, profile_name, profile_data, created_at")
            .eq("id", profile_id)
            .limit(1)
            .execute()
        )
    except Exception:
        log.exception("Failed to load shared profile")
        raise HTTPException(status_code=500, detail="Could not load profile")
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return result.data[0]


@app.delete("/profiles/{profile_id}")
def delete_profile(profile_id: str, request: Request, auth_user=Depends(current_user_dep)):
    enforce_rate_limit(request)
    try:
        uuid.UUID(profile_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Profile not found")
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    try:
        result = (
            supabase.table("saved_profiles")
            .delete()
            .eq("id", profile_id)
            .eq("user_id", auth_user["id"])  # owners can only delete their own
            .execute()
        )
    except Exception:
        log.exception("Failed to delete profile")
        raise HTTPException(status_code=500, detail="Could not delete profile")
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"success": True}


@app.get("/scores/history")
def scores_history(limit: int = 100, auth_user=Depends(current_user_dep)):
    return {"data": list_scores(supabase, auth_user["id"], min(max(limit, 1), 500))}


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
        log.exception("Failed to load subscription")
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
    job_description: str = Form(default="", max_length=10000),
    auth_user=Depends(optional_user_dep),
):
    enforce_rate_limit(request)
    text = await eresume.read_pdf_upload(file)
    analysis = analyze_resume_text(text, job_description)
    if auth_user:
        try:
            insert_resume_analysis(supabase, auth_user["id"], file.filename, analysis)
        except Exception:
            log.exception("Error saving resume analysis")
    return analysis


@app.get("/admin/metrics")
def admin_metrics(admin_user=Depends(admin_user_dep)):
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")

    def count(table: str, **filters) -> int:
        try:
            query = supabase.table(table).select("id", count="exact").limit(1)
            for column, value in filters.items():
                query = query.eq(column, value)
            return query.execute().count or 0
        except Exception:
            log.exception("Failed to count %s", table)
            return 0

    return {
        "admin": admin_user.get("id"),
        "scores_total": count("scores"),
        "profiles_total": count("saved_profiles"),
        "resume_reviews_total": count("resume_reviews"),
        "profiles_by_type": {
            t: count("saved_profiles", profile_type=t) for t in ["github", "leetcode", "linkedin", "fullscore"]
        },
    }
