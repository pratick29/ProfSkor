from datetime import datetime, timezone, timedelta


def days_since(date_str: str) -> int:
    """GitHub dates are like: 2024-01-01T00:00:00Z"""
    dt = datetime.strptime(date_str, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    return (now - dt).days


def clamp(x, lo=0, hi=100):
    return max(lo, min(hi, x))


def norm(val, target):
    return min(val / target, 1)


def github_score(user: dict, repos: list, prefs: dict):
    """
    Returns:
        score (0-100),
        breakdown dict,
        suggestions list
    """

    suggestions = []

    repo_count = len(repos)
    stars = sum(r.get("stargazers_count", 0) for r in repos)
    forks = sum(r.get("forks_count", 0) for r in repos)
    commits = user.get("public_repos", 0) * 30  # Estimate

    score = 0
    score += norm(repo_count, 50) * prefs["repos"]
    score += norm(stars, 200) * prefs["stars"]
    score += norm(commits, 1500) * prefs["commits"]

    # Check for recent activity (last 3 months)
    three_months_ago = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    recent = sum(
      1 for r in repos
      if r.get("updated_at", "") > three_months_ago
    )
    score += norm(recent, 20) * prefs["consistency"]

    score = round(min(score, 100))

    # Generate suggestions
    if repo_count < 10:
        suggestions.append("Create more repositories to showcase your work")
    elif repo_count < 30:
        suggestions.append("Consider adding more projects to demonstrate breadth")
    
    if stars < 50:
        suggestions.append("Focus on creating projects that solve real problems to attract stars")
    elif stars < 150:
        suggestions.append("Promote your best projects to increase visibility")
    
    if recent < 5:
        suggestions.append("Maintain regular commit activity to show consistency")
    elif recent < 15:
        suggestions.append("Try to have at least 1-2 active repositories")
    
    # Check for README files
    repos_with_readme = sum(1 for r in repos if r.get("has_wiki") or r.get("description"))
    if repos_with_readme < len(repos) * 0.5:
        suggestions.append("Add README files to your repositories for better documentation")
    
    # Check for languages diversity
    languages = set(r.get("language") for r in repos if r.get("language"))
    if len(languages) < 2 and repo_count > 5:
        suggestions.append("Diversify your tech stack by exploring different languages")
    
    # For now, return simple breakdown - can expand later
    breakdown = {
        "Repos": round(norm(repo_count, 50) * prefs["repos"], 1),
        "Stars": round(norm(stars, 200) * prefs["stars"], 1),
        "Commits": round(norm(commits, 1500) * prefs["commits"], 1),
        "Consistency": round(norm(recent, 20) * prefs["consistency"], 1)
    }

    return score, breakdown, suggestions[:8]
