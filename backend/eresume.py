"""
E-resume API: build a structured resume, publish it at /r/<slug>, prove the linked accounts are
yours, show live evidence from GitHub/LeetCode, and see who viewed it.
"""
import hashlib
import logging
import os
import re
import secrets
import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone
from io import BytesIO
from typing import Any, Dict, List, Literal, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, File, Header, HTTPException, Request, UploadFile
from pydantic import ValidationError

from auth import get_optional_user, require_user
from config import ALLOWED_ORIGINS, SUPABASE_SERVICE_ROLE_KEY
from eresume_models import PublishRequest, ResumeData, ResumeSettings, SaveResumeRequest, ViewStart, ViewUpdate, slug_problem
from fetchers.github_fetcher import fetch_github_contributions, fetch_github_repos, fetch_github_user
from fetchers.leetcode_fetcher import fetch_leetcode_user
from rate_limit import client_key, enforce_rate_limit
from resume_parser import parse_resume_text, resume_from_github
from resume_service import MAX_FILE_SIZE_BYTES, extract_text_from_pdf
from schemas import GITHUB_USERNAME_RE, clean_username

log = logging.getLogger("profskor.eresume")
router = APIRouter(prefix="/eresume", tags=["e-resume"])

# Set by main.py so the whole app shares one client (and tests can swap it).
supabase = None

VIEW_DEDUPE_MINUTES = 30
VIEW_UPDATE_WINDOW_HOURS = 6
VIA_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
BOT_RE = re.compile(
    r"bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|skype|"
    r"curl|wget|python-requests|httpx|headless|lighthouse|pingdom|uptime",
    re.IGNORECASE,
)
# Hash salt for anonymous visitor IDs. Stable across restarts so a day's unique count holds up.
VIEW_SALT = os.getenv("VIEW_HASH_SALT", "").strip() or hashlib.sha256(
    ("profskor-views:" + (SUPABASE_SERVICE_ROLE_KEY or "dev")).encode()
).hexdigest()
OWN_HOSTS = {(urlparse(o).hostname or "").lower() for o in ALLOWED_ORIGINS}


def current_user(authorization: Optional[str] = Header(default=None)):
    return require_user(supabase, authorization)


def optional_user(authorization: Optional[str] = Header(default=None)):
    return get_optional_user(supabase, authorization)


def db():
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")
    return supabase


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def fresh(fetcher):
    """Bypass the TTL cache (verification must see the profile as it is right now)."""
    return getattr(fetcher, "__wrapped__", fetcher)


async def read_pdf_upload(file: UploadFile) -> str:
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    body = await file.read(MAX_FILE_SIZE_BYTES + 1)
    if len(body) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="PDF exceeds 5MB limit")
    try:
        text = extract_text_from_pdf(file_obj=BytesIO(body))
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read this PDF. Try exporting it again.")
    if not text or len(text.strip()) < 50:
        raise HTTPException(
            status_code=400,
            detail="Could not extract text from this PDF. If it's a scanned image, export a text-based PDF instead.",
        )
    return text


# ---------------------------------------------------------------------------- import


@router.post("/import/pdf")
async def import_pdf(request: Request, file: UploadFile = File(...)):
    enforce_rate_limit(request)
    text = await read_pdf_upload(file)
    data, source = parse_resume_text(text)
    return {"data": data.model_dump(), "source": source}


@router.get("/import/github")
def import_github(request: Request, username: str = ""):
    enforce_rate_limit(request)
    try:
        username = clean_username(username, GITHUB_USERNAME_RE, "GitHub", "github.com")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not username:
        raise HTTPException(status_code=400, detail="GitHub username is required")
    user, err = fetch_github_user(username)
    if err:
        raise HTTPException(status_code=400, detail=err)
    repos, err = fetch_github_repos(username)
    if err:
        raise HTTPException(status_code=400, detail=err)
    return {"data": resume_from_github(user, repos).model_dump()}


# ---------------------------------------------------------------------------- owner


def load_own(user_id: str) -> Optional[Dict[str, Any]]:
    result = db().table("resumes").select("*").eq("user_id", user_id).limit(1).execute()
    return (result.data or [None])[0]


def owner_view(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "slug": row.get("slug"),
        "published": bool(row.get("published")),
        "data": row.get("data") or {},
        "settings": ResumeSettings(**(row.get("settings") or {})).model_dump(),
        "verified": row.get("verified") or {},
        "verify_code": row.get("verify_code"),
        "updated_at": row.get("updated_at"),
    }


def reconcile_verified(verified: Dict[str, Any], data: ResumeData, user: Dict[str, Any]) -> Dict[str, Any]:
    """Keep a verification only while the resume still points at the account that was verified."""
    out: Dict[str, Any] = {}
    for platform in ("github", "leetcode"):
        entry = verified.get(platform) or {}
        current = getattr(data.basics, platform)
        if entry.get("username") and current and entry["username"].lower() == current.lower():
            out[platform] = entry
    email = (data.basics.email or "").lower()
    if email and email == (user.get("email") or "").lower() and user.get("email_confirmed"):
        out["email"] = (verified.get("email") if (verified.get("email") or {}).get("value") == email else None) or {
            "value": email,
            "verified_at": now_iso(),
        }
    return out


@router.get("/me")
def get_my_resume(user=Depends(current_user)):
    row = load_own(user["id"])
    return {"resume": owner_view(row) if row else None}


@router.put("/me")
def save_my_resume(payload: SaveResumeRequest, user=Depends(current_user)):
    row = load_own(user["id"])
    record = {
        "user_id": user["id"],
        "data": payload.data.model_dump(),
        "settings": payload.settings.model_dump(),
        "verified": reconcile_verified((row or {}).get("verified") or {}, payload.data, user),
        "updated_at": now_iso(),
    }
    try:
        if row:
            result = db().table("resumes").update(record).eq("id", row["id"]).execute()
        else:
            record["verify_code"] = "profskor-" + secrets.token_hex(3)
            result = db().table("resumes").upsert(record, on_conflict="user_id").execute()
    except Exception:
        log.exception("Failed to save resume")
        raise HTTPException(status_code=500, detail="Could not save your resume")
    return {"resume": owner_view((result.data or [record])[0])}


@router.get("/slug/{slug}")
def check_slug(slug: str, request: Request, user=Depends(optional_user)):
    enforce_rate_limit(request)
    slug = slug.strip().lower()
    problem = slug_problem(slug)
    if problem:
        return {"slug": slug, "available": False, "reason": problem}
    result = db().table("resumes").select("user_id").eq("slug", slug).limit(1).execute()
    owner = (result.data or [{}])[0].get("user_id")
    available = not owner or bool(user and owner == user["id"])
    return {"slug": slug, "available": available, "reason": None if available else "That handle is taken"}


@router.put("/me/publish")
def publish_my_resume(payload: PublishRequest, request: Request, user=Depends(current_user)):
    enforce_rate_limit(request)
    row = load_own(user["id"])
    if not row:
        raise HTTPException(status_code=400, detail="Save your resume before publishing it")
    if payload.published and not ((row.get("data") or {}).get("basics") or {}).get("name"):
        raise HTTPException(status_code=400, detail="Add your name before publishing")
    taken = db().table("resumes").select("user_id").eq("slug", payload.slug).limit(1).execute()
    if taken.data and taken.data[0].get("user_id") != user["id"]:
        raise HTTPException(status_code=409, detail="That handle is taken")
    try:
        result = (
            db().table("resumes")
            .update({"slug": payload.slug, "published": payload.published, "updated_at": now_iso()})
            .eq("id", row["id"])
            .execute()
        )
    except Exception as e:
        if "duplicate" in str(e).lower() or "23505" in str(e):
            raise HTTPException(status_code=409, detail="That handle is taken")
        log.exception("Failed to publish resume")
        raise HTTPException(status_code=500, detail="Could not update publishing settings")
    return {"resume": owner_view((result.data or [{**row, "slug": payload.slug, "published": payload.published}])[0])}


VERIFY_WHERE = {
    "github": "GitHub bio (github.com/settings/profile)",
    "leetcode": "LeetCode profile Summary (leetcode.com/profile)",
}


@router.post("/me/verify/{platform}")
def verify_account(platform: Literal["github", "leetcode"], request: Request, user=Depends(current_user)):
    enforce_rate_limit(request)
    row = load_own(user["id"])
    if not row:
        raise HTTPException(status_code=400, detail="Save your resume first")
    username = (((row.get("data") or {}).get("basics") or {}).get(platform) or "").strip()
    if not username:
        name = "GitHub" if platform == "github" else "LeetCode"
        raise HTTPException(status_code=400, detail=f"Add your {name} username to the resume first")

    if platform == "github":
        profile, err = fresh(fetch_github_user)(username)
        text = (profile or {}).get("bio") or ""
        canonical = (profile or {}).get("login") or username
    else:
        profile, err = fresh(fetch_leetcode_user)(username)
        text = ((profile or {}).get("profile") or {}).get("aboutMe") or ""
        canonical = (profile or {}).get("username") or username
    if err:
        raise HTTPException(status_code=400, detail=err)
    code = row["verify_code"]
    if code.lower() not in text.lower():
        raise HTTPException(
            status_code=400,
            detail=f"Couldn't find {code} in your {VERIFY_WHERE[platform]}. Add it, save, and try again in a minute.",
        )
    verified = {**(row.get("verified") or {}), platform: {"username": canonical, "verified_at": now_iso()}}
    data = {**row["data"], "basics": {**row["data"]["basics"], platform: canonical}}
    result = db().table("resumes").update({"verified": verified, "data": data}).eq("id", row["id"]).execute()
    return {"resume": owner_view((result.data or [{**row, "verified": verified, "data": data}])[0])}


# ---------------------------------------------------------------------------- public


def github_evidence(username: str, projects: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    user, err = fetch_github_user(username)
    if err or not user:
        return None
    repos, _ = fetch_github_repos(username)
    repos = repos or []
    originals = [r for r in repos if not r.get("fork")]
    contributions, _ = fetch_github_contributions(username)
    wanted = {(p.get("repo") or "").lower() for p in projects if p.get("repo")}
    repo_stats = {
        r["full_name"].lower(): {
            "stars": r.get("stargazers_count", 0),
            "forks": r.get("forks_count", 0),
            "language": r.get("language"),
            "pushed_at": r.get("pushed_at"),
            "created_at": r.get("created_at"),
            "url": r.get("html_url"),
            "fork": bool(r.get("fork")),
        }
        for r in repos
        if (r.get("full_name") or "").lower() in wanted
    }
    languages = Counter(r["language"] for r in originals if r.get("language"))
    return {
        "username": user.get("login", username),
        "url": user.get("html_url") or f"https://github.com/{username}",
        "avatar_url": user.get("avatar_url"),
        "member_since": (user.get("created_at") or "")[:4],
        "followers": user.get("followers", 0),
        "repos": len(originals),
        "stars": sum(r.get("stargazers_count", 0) for r in originals),
        "contributions": (contributions or {}).get("total"),
        "active_weeks": (contributions or {}).get("active_weeks"),
        "languages": dict(languages.most_common(12)),
        "repo_stats": repo_stats,
    }


def leetcode_evidence(username: str) -> Optional[Dict[str, Any]]:
    user, err = fetch_leetcode_user(username)
    if err or not user:
        return None
    solved = {
        s.get("difficulty"): s.get("count", 0)
        for s in ((user.get("submitStatsGlobal") or {}).get("acSubmissionNum") or [])
    }
    contest = user.get("contest") or {}
    return {
        "username": user.get("username", username),
        "url": f"https://leetcode.com/u/{user.get('username', username)}/",
        "solved": solved.get("All") or sum(v for k, v in solved.items() if k != "All"),
        "easy": solved.get("Easy", 0),
        "medium": solved.get("Medium", 0),
        "hard": solved.get("Hard", 0),
        "ranking": (user.get("profile") or {}).get("ranking"),
        "streak": user.get("streak", 0),
        "active_days": user.get("total_active_days", 0),
        "contest_rating": round(contest["rating"]) if contest.get("rating") else None,
        "contest_top_percent": contest.get("topPercentage"),
    }


def find_by_slug(slug: str, columns: str = "*") -> Optional[Dict[str, Any]]:
    slug = (slug or "").strip().lower()
    if slug_problem(slug):
        return None
    result = db().table("resumes").select(columns).eq("slug", slug).limit(1).execute()
    return (result.data or [None])[0]


@router.get("/public/{slug}")
def public_resume(slug: str, request: Request, user=Depends(optional_user)):
    enforce_rate_limit(request)
    row = find_by_slug(slug)
    is_owner = bool(row and user and row["user_id"] == user["id"])
    if not row or not (row.get("published") or is_owner):
        raise HTTPException(status_code=404, detail="Resume not found")

    settings = ResumeSettings(**(row.get("settings") or {}))
    data = row.get("data") or {}
    basics = dict(data.get("basics") or {})
    if not settings.show_email:
        basics["email"] = ""
    if not settings.show_phone:
        basics["phone"] = ""
    data = {**data, "basics": basics}

    verified = {
        k: {"username": v.get("username"), "verified_at": v.get("verified_at")}
        for k, v in (row.get("verified") or {}).items()
        if k in ("github", "leetcode") and v.get("username")
    }
    if basics.get("email") and (row.get("verified") or {}).get("email", {}).get("value") == basics["email"].lower():
        verified["email"] = {"verified_at": row["verified"]["email"].get("verified_at")}

    evidence: Dict[str, Any] = {"checked_at": now_iso()}
    try:
        if "github" in verified:
            evidence["github"] = github_evidence(verified["github"]["username"], data.get("projects") or [])
        if "leetcode" in verified:
            evidence["leetcode"] = leetcode_evidence(verified["leetcode"]["username"])
    except Exception:
        log.exception("Failed to load evidence for %s", slug)

    return {
        "slug": row["slug"],
        "published": bool(row.get("published")),
        "is_owner": is_owner,
        "data": data,
        "verified": verified,
        "evidence": evidence,
        "updated_at": row.get("updated_at"),
    }


def clean_via(value: Optional[str]) -> Optional[str]:
    value = re.sub(r"[^a-z0-9-]+", "-", (value or "").strip().lower()).strip("-")[:40]
    return value if value and VIA_RE.match(value) else None


def referrer_domain(value: Optional[str]) -> Optional[str]:
    host = (urlparse(value or "").hostname or "").lower()
    host = host[4:] if host.startswith("www.") else host
    if not host or host in OWN_HOSTS or host in ("localhost", "127.0.0.1"):
        return None
    return host[:100]


@router.post("/public/{slug}/views")
def start_view(slug: str, payload: ViewStart, request: Request, user=Depends(optional_user)):
    enforce_rate_limit(request)
    row = find_by_slug(slug, "id, user_id, published")
    if not row or not row.get("published"):
        raise HTTPException(status_code=404, detail="Resume not found")
    if user and user["id"] == row["user_id"]:
        return {"view_id": None, "counted": False}  # your own visits don't count
    agent = request.headers.get("user-agent", "")
    if not agent or BOT_RE.search(agent):
        return {"view_id": None, "counted": False}

    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    visitor = hashlib.sha256(f"{VIEW_SALT}:{day}:{client_key(request)}:{agent}".encode()).hexdigest()[:32]
    since = (datetime.now(timezone.utc) - timedelta(minutes=VIEW_DEDUPE_MINUTES)).isoformat()
    recent = (
        db().table("resume_views")
        .select("id, duration_ms, sections, clicks")
        .eq("resume_id", row["id"])
        .eq("visitor_hash", visitor)
        .gte("viewed_at", since)
        .limit(1)
        .execute()
    )
    if recent.data:
        # A refresh continues the same view instead of counting a new one
        prev = recent.data[0]
        return {"view_id": prev["id"], "counted": False, "duration_ms": prev.get("duration_ms") or 0,
                "sections": prev.get("sections") or [], "clicks": prev.get("clicks") or []}
    result = (
        db().table("resume_views")
        .insert({
            "resume_id": row["id"],
            "visitor_hash": visitor,
            "via": clean_via(payload.via),
            "referrer": referrer_domain(payload.referrer),
            "viewed_at": now_iso(),
        })
        .execute()
    )
    return {"view_id": (result.data or [{}])[0].get("id"), "counted": True}


@router.post("/public/{slug}/views/{view_id}")
async def update_view(slug: str, view_id: str, request: Request):
    """Engagement for a view. Sent by navigator.sendBeacon, which posts text/plain, so the body is parsed here."""
    enforce_rate_limit(request)
    try:
        uuid.UUID(view_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="View not found")
    body = await request.body()
    if len(body) > 20_000:
        raise HTTPException(status_code=413, detail="Too large")
    try:
        payload = ViewUpdate.model_validate_json(body or b"{}")
    except ValidationError:
        raise HTTPException(status_code=422, detail="Invalid view data")
    row = find_by_slug(slug, "id")
    if not row:
        raise HTTPException(status_code=404, detail="Resume not found")
    since = (datetime.now(timezone.utc) - timedelta(hours=VIEW_UPDATE_WINDOW_HOURS)).isoformat()
    result = (
        db().table("resume_views")
        .update({
            "duration_ms": payload.duration_ms,
            "sections": sorted(set(payload.sections)),
            "clicks": [c.model_dump() for c in payload.clicks],
        })
        .eq("id", view_id)
        .eq("resume_id", row["id"])
        .gte("viewed_at", since)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="View not found")
    return {"ok": True}


@router.get("/me/views")
def my_views(days: int = 30, user=Depends(current_user)):
    days = min(max(days, 1), 365)
    row = load_own(user["id"])
    empty = {"days": days, "total": 0, "unique": 0, "engaged": 0, "avg_duration_ms": 0, "by_day": [],
             "by_link": [], "by_referrer": [], "sections": {}, "clicks": [], "recent": []}
    if not row:
        return empty
    start = datetime.now(timezone.utc) - timedelta(days=days - 1)
    start = start.replace(hour=0, minute=0, second=0, microsecond=0)
    rows = (
        db().table("resume_views")
        .select("*")
        .eq("resume_id", row["id"])
        .gte("viewed_at", start.isoformat())
        .order("viewed_at", desc=True)
        .limit(5000)
        .execute()
    ).data or []

    per_day = Counter((r.get("viewed_at") or "")[:10] for r in rows)
    by_day = [
        {"date": (start + timedelta(days=i)).strftime("%Y-%m-%d"),
         "views": per_day.get((start + timedelta(days=i)).strftime("%Y-%m-%d"), 0)}
        for i in range(days)
    ]
    durations = [r.get("duration_ms") or 0 for r in rows if (r.get("duration_ms") or 0) > 0]

    def grouped(key: str, fallback: str) -> List[Dict[str, Any]]:
        views = Counter(r.get(key) or fallback for r in rows)
        visitors: Dict[str, set] = {}
        for r in rows:
            visitors.setdefault(r.get(key) or fallback, set()).add(r.get("visitor_hash"))
        return [{"name": k, "views": v, "unique": len(visitors[k])} for k, v in views.most_common(20)]

    section_counts = Counter(s for r in rows for s in set(r.get("sections") or []))
    click_counts = Counter(
        ((c or {}).get("kind", "link"), (c or {}).get("target", "")) for r in rows for c in (r.get("clicks") or [])
    )
    return {
        **empty,
        "total": len(rows),
        "unique": len({r.get("visitor_hash") for r in rows}),
        "engaged": sum(1 for r in rows if (r.get("duration_ms") or 0) >= 15_000),
        "avg_duration_ms": round(sum(durations) / len(durations)) if durations else 0,
        "by_day": by_day,
        "by_link": [g for g in grouped("via", "") if g["name"]],
        "by_referrer": grouped("referrer", "Direct or unknown"),
        "sections": {k: round(v / len(rows) * 100) for k, v in section_counts.items()} if rows else {},
        "clicks": [{"kind": k, "target": t, "count": n} for (k, t), n in click_counts.most_common(10)],
        "recent": [
            {"viewed_at": r.get("viewed_at"), "via": r.get("via"), "referrer": r.get("referrer"),
             "duration_ms": r.get("duration_ms") or 0, "sections": r.get("sections") or [],
             "clicks": len(r.get("clicks") or [])}
            for r in rows[:50]
        ],
    }
