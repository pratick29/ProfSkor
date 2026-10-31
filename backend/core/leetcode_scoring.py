from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from core.scoring import clamp, merged_prefs, norm

TARGET_EASY = 150
TARGET_MEDIUM = 250
TARGET_HARD = 60
TARGET_MAX_STREAK = 60
TARGET_ACTIVE_DAYS_90D = 40


def _active_dates(calendar: Dict[int, int]) -> set:
    return {datetime.fromtimestamp(ts, tz=timezone.utc).date() for ts, count in calendar.items() if count > 0}


def current_streak(calendar: Dict[int, int], today=None) -> int:
    """Consecutive active days ending today or yesterday (UTC)."""
    dates = _active_dates(calendar)
    day = today or datetime.now(timezone.utc).date()
    if day not in dates:
        day -= timedelta(days=1)
    streak = 0
    while day in dates:
        streak += 1
        day -= timedelta(days=1)
    return streak


def active_days_since(calendar: Dict[int, int], days: int, today=None) -> int:
    cutoff = (today or datetime.now(timezone.utc).date()) - timedelta(days=days)
    return sum(1 for d in _active_dates(calendar) if d > cutoff)


def contest_ratio(contest: Optional[Dict]) -> float:
    if not contest or not contest.get("attendedContestsCount"):
        return 0.0
    top = contest.get("topPercentage") or 100
    if top <= 10:
        return 1.0
    if top <= 25:
        return 0.75
    if top <= 50:
        return 0.5
    return 0.25


def leetcode_score(user_data: Dict, prefs: Optional[Dict]):
    """Returns (score 0-100, breakdown, suggestions, meta)."""
    p = merged_prefs(prefs, "leetcode")
    stats = (user_data.get("submitStatsGlobal") or {}).get("acSubmissionNum") or []
    solved = {item["difficulty"]: item["count"] for item in stats}
    easy, medium, hard = solved.get("Easy", 0), solved.get("Medium", 0), solved.get("Hard", 0)
    total = solved.get("All", easy + medium + hard)
    ranking = (user_data.get("profile") or {}).get("ranking")
    calendar = user_data.get("submission_calendar") or {}
    contest = user_data.get("contest")
    max_streak = user_data.get("streak", 0) or 0
    streak_now = current_streak(calendar)
    active_90d = active_days_since(calendar, 90)

    if calendar:
        consistency = 0.7 * norm(active_90d, TARGET_ACTIVE_DAYS_90D) + 0.3 * contest_ratio(contest)
    elif ranking:
        consistency = 1.0 if ranking <= 10000 else 0.7 if ranking <= 50000 else 0.4 if ranking <= 100000 else 0.2
    else:
        consistency = 0.1

    breakdown = {
        "Easy": round(norm(easy, TARGET_EASY) * p["easy"], 1),
        "Medium": round(norm(medium, TARGET_MEDIUM) * p["medium"], 1),
        "Hard": round(norm(hard, TARGET_HARD) * p["hard"], 1),
        "Streak": round(norm(max_streak, TARGET_MAX_STREAK) * p["streak"], 1),
        "Consistency": round(clamp(consistency, 0, 1) * p["consistency"], 1),
    }
    total_weight = sum(p.values()) or 1
    score = round(clamp(sum(breakdown.values()) / total_weight * 100))

    suggestions: List[str] = []
    if easy < 50:
        suggestions.append(f"You've solved {easy} Easy problems. Get to 50 to lock in the fundamentals.")
    if medium < 100:
        suggestions.append(f"Mediums are what interviews ask most. You have {medium}; aim for 100+.")
    if hard < 20:
        suggestions.append("Solve a few Hard problems each month to show depth.")
    if calendar and active_90d < 20:
        suggestions.append(f"You were active on {active_90d} of the last 90 days. Short daily practice beats occasional long sessions.")
    if not contest or not contest.get("attendedContestsCount"):
        suggestions.append("Take part in weekly contests to get a contest rating.")

    meta = {
        "total": total,
        "easy": easy,
        "medium": medium,
        "hard": hard,
        "ranking": ranking,
        "current_streak": streak_now,
        "max_streak": max_streak,
        "total_active_days": user_data.get("total_active_days", 0),
        "active_days_last_90": active_90d,
        "contest_rating": round(contest["rating"]) if contest and contest.get("rating") else None,
        "contest_top_percentage": contest.get("topPercentage") if contest else None,
    }
    return score, breakdown, suggestions[:7], meta
