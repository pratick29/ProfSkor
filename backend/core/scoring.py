import math
from datetime import datetime, timezone
from typing import Dict, List, Optional

from core.default_preferences import DEFAULT_PREFS

# Values at which each signal earns its full weight
TARGET_ORIGINAL_REPOS = 25
TARGET_STARS = 150
TARGET_CONTRIBUTIONS = 500  # per year
TARGET_ACTIVE_WEEK_RATIO = 0.75
TARGET_REPOS_PUSHED_YEAR = 12
TARGET_REPOS_PUSHED_90D = 5


def days_since(date_str: Optional[str]) -> Optional[int]:
    """GitHub dates look like 2024-01-01T00:00:00Z."""
    if not date_str:
        return None
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None
    return (datetime.now(timezone.utc) - dt).days


def clamp(x, lo=0, hi=100):
    return max(lo, min(hi, x))


def norm(val, target):
    if target <= 0:
        return 0
    return clamp(val / target, 0, 1)


def log_norm(val, target):
    """Diminishing returns: the first stars count more than the hundredth."""
    return clamp(math.log10(val + 1) / math.log10(target + 1), 0, 1)


def merged_prefs(prefs: Optional[Dict], section: str) -> Dict[str, float]:
    base = dict(DEFAULT_PREFS[section])
    for key, value in (prefs or {}).items():
        if key in base:
            try:
                base[key] = max(float(value), 0)
            except (TypeError, ValueError):
                pass
    return base


def repo_highlights(repos: List[Dict], limit: int = 5) -> List[Dict]:
    originals = [r for r in repos if not r.get("fork")]
    best = sorted(originals, key=lambda r: (r.get("stargazers_count", 0), r.get("pushed_at") or ""), reverse=True)
    return [
        {
            "name": r.get("name"),
            "stars": r.get("stargazers_count", 0),
            "forks": r.get("forks_count", 0),
            "language": r.get("language"),
            "updated_at": r.get("pushed_at") or r.get("updated_at"),
            "description": r.get("description") or "",
            "url": r.get("html_url", ""),
        }
        for r in best[:limit]
    ]


def github_score(user: Dict, repos: List[Dict], prefs: Optional[Dict], contributions: Optional[Dict] = None):
    """
    Returns (score 0-100, breakdown, suggestions, meta).

    Uses real contribution data from the GraphQL API when available (needs GITHUB_TOKEN),
    otherwise estimates activity from repository push dates.
    """
    p = merged_prefs(prefs, "github")
    originals = [r for r in repos if not r.get("fork")]
    stars = sum(r.get("stargazers_count", 0) for r in originals)
    forks_received = sum(r.get("forks_count", 0) for r in originals)
    pushed_days = [d for d in (days_since(r.get("pushed_at")) for r in originals) if d is not None]
    pushed_year = sum(1 for d in pushed_days if d <= 365)
    pushed_90d = sum(1 for d in pushed_days if d <= 90)

    if contributions:
        activity_ratio = norm(contributions["total"], TARGET_CONTRIBUTIONS)
        week_ratio = contributions["active_weeks"] / max(contributions["total_weeks"], 1)
        consistency_ratio = norm(week_ratio, TARGET_ACTIVE_WEEK_RATIO)
    else:
        activity_ratio = norm(pushed_year, TARGET_REPOS_PUSHED_YEAR)
        consistency_ratio = norm(pushed_90d, TARGET_REPOS_PUSHED_90D)

    breakdown = {
        "Repos": round(norm(len(originals), TARGET_ORIGINAL_REPOS) * p["repos"], 1),
        "Stars": round(log_norm(stars, TARGET_STARS) * p["stars"], 1),
        "Commits": round(activity_ratio * p["commits"], 1),
        "Consistency": round(consistency_ratio * p["consistency"], 1),
    }
    total_weight = sum(p.values()) or 1
    score = round(clamp(sum(breakdown.values()) / total_weight * 100))

    suggestions: List[str] = []
    if len(originals) < 5:
        suggestions.append(f"You have {len(originals)} original repos. Build 2-3 complete projects that show real-world skills.")
    elif len(originals) < TARGET_ORIGINAL_REPOS:
        suggestions.append("Add a few more original projects to show breadth.")
    if stars < 10:
        suggestions.append("Share your best project (Reddit, X, Hacker News, dev.to) to earn your first stars.")
    elif stars < TARGET_STARS:
        suggestions.append("Polish your top repo with a demo GIF and clear install steps to attract more stars.")
    if contributions:
        if contributions["active_weeks"] < contributions["total_weeks"] * 0.5:
            suggestions.append(
                f"You were active in {contributions['active_weeks']} of the last {contributions['total_weeks']} weeks. Aim for at least one contribution every week."
            )
        if contributions["pull_requests"] == 0:
            suggestions.append("Open a pull request to an open-source project. PRs show you can collaborate.")
    elif pushed_90d < 2:
        suggestions.append("None of your repos were updated in the last 3 months. Recent activity matters to recruiters.")
    undocumented = sum(1 for r in originals if not r.get("description"))
    if originals and undocumented > len(originals) / 2:
        suggestions.append(f"{undocumented} repos have no description. Add a one-line summary to each.")
    if originals and not any(r.get("topics") for r in originals):
        suggestions.append("Add topics (tags) to your repos so they show up in GitHub search.")
    if not user.get("bio"):
        suggestions.append("Add a bio to your GitHub profile that says what you build.")
    languages = {r.get("language") for r in originals if r.get("language")}
    if len(languages) < 2 and len(originals) > 5:
        suggestions.append("All your projects use one language. Try a project in a second stack.")

    lang_counts: Dict[str, int] = {}
    for r in originals:
        if r.get("language"):
            lang_counts[r["language"]] = lang_counts.get(r["language"], 0) + 1
    meta = {
        "original_repos": len(originals),
        "forked_repos": len(repos) - len(originals),
        "total_stars": stars,
        "forks_received": forks_received,
        "followers": user.get("followers", 0),
        "top_languages": sorted(lang_counts, key=lang_counts.get, reverse=True)[:5],
        "repos_pushed_last_90_days": pushed_90d,
        "contributions": {k: v for k, v in contributions.items() if k != "calendar"} if contributions else None,
        "data_quality": "actual" if contributions else "estimated",
    }
    return score, breakdown, suggestions[:8], meta
