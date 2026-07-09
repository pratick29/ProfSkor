def clamp(x, lo=0, hi=100):
    return max(lo, min(hi, x))


def norm(val, target):
    return min(val / target, 1)


def leetcode_score(user_data: dict, prefs: dict):
    """
    Returns:
        score (0-100),
        breakdown dict,
        suggestions list,
        meta dict
    """

    suggestions = []
    breakdown = {
        "Easy": 0,
        "Medium": 0,
        "Hard": 0,
        "Streak": 0,
        "Consistency": 0
    }

    # -------------------------
    # Extract LeetCode stats
    # -------------------------
    stats = user_data.get("submitStatsGlobal", {}).get("acSubmissionNum", [])
    solved = {item["difficulty"]: item["count"] for item in stats}

    total = solved.get("All", 0)
    easy = solved.get("Easy", 0)
    medium = solved.get("Medium", 0)
    hard = solved.get("Hard", 0)

    ranking = user_data.get("profile", {}).get("ranking", None)

    meta = {
        "total": total,
        "easy": easy,
        "medium": medium,
        "hard": hard,
        "ranking": ranking
    }

    # -------------------------
    # Scoring with user preferences
    # -------------------------
    score = 0

    # Easy problems
    score += norm(easy, 200) * prefs["easy"]
    breakdown["Easy"] = clamp(norm(easy, 200) * prefs["easy"], 0, prefs["easy"])

    # Medium problems
    score += norm(medium, 300) * prefs["medium"]
    breakdown["Medium"] = clamp(norm(medium, 300) * prefs["medium"], 0, prefs["medium"])

    # Hard problems
    score += norm(hard, 100) * prefs["hard"]
    breakdown["Hard"] = clamp(norm(hard, 100) * prefs["hard"], 0, prefs["hard"])

    # Streak
    streak = user_data.get("streak", 0)
    score += norm(streak, 60) * prefs["streak"]
    breakdown["Streak"] = clamp(norm(streak, 60) * prefs["streak"], 0, prefs["streak"])

    # Consistency (based on ranking)
    consistency = 0
    if ranking:
        if ranking <= 10000:
            consistency = 1.0
        elif ranking <= 50000:
            consistency = 0.7
        elif ranking <= 100000:
            consistency = 0.4
        else:
            consistency = 0.2
    else:
        consistency = 0.1

    score += consistency * prefs["consistency"]
    breakdown["Consistency"] = clamp(consistency * prefs["consistency"], 0, prefs["consistency"])

    # -------------------------
    # Suggestions
    # -------------------------
    if easy < 50:
        suggestions.append("Solve more Easy problems to build confidence")
    if medium < 100:
        suggestions.append("Focus on Medium problems for interview prep")
    if hard < 20:
        suggestions.append("Challenge yourself with Hard problems")
    if streak < 20:
        suggestions.append("Maintain a consistent solving streak")
    if not ranking or ranking > 100000:
        suggestions.append("Participate in contests to improve consistency")

    score = round(min(score, 100))
    suggestions = suggestions[:7]

    return score, breakdown, suggestions, meta
