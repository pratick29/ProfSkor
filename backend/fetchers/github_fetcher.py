import logging
from typing import Dict, List, Optional, Tuple

import requests

from cache import ttl_cache
from config import GITHUB_API, GITHUB_GRAPHQL, GITHUB_TOKEN, REQUEST_TIMEOUT

log = logging.getLogger(__name__)

CONTRIBUTIONS_QUERY = """
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      totalPullRequestReviewContributions
      contributionCalendar {
        totalContributions
        weeks { contributionDays { contributionCount date } }
      }
    }
  }
}
"""


def _headers() -> Dict[str, str]:
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "ProfSkor-App"}
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    return headers


def _error_for(res: requests.Response, username: str) -> str:
    if res.status_code == 404:
        return f"GitHub user '{username}' not found"
    if res.status_code in (403, 429):
        return "GitHub API rate limit exceeded. Please try again later."
    return f"GitHub API error: {res.status_code}"


@ttl_cache()
def fetch_github_user(username: str) -> Tuple[Optional[Dict], Optional[str]]:
    try:
        res = requests.get(f"{GITHUB_API}/users/{username}", headers=_headers(), timeout=REQUEST_TIMEOUT)
    except requests.exceptions.Timeout:
        return None, "GitHub took too long to respond. Please try again."
    except requests.exceptions.RequestException:
        log.exception("GitHub user request failed")
        return None, "Could not reach GitHub. Please try again."
    if res.status_code != 200:
        return None, _error_for(res, username)
    return res.json(), None


@ttl_cache()
def fetch_github_repos(username: str, max_repos: int = 300) -> Tuple[Optional[List[Dict]], Optional[str]]:
    repos: List[Dict] = []
    page = 1
    try:
        while len(repos) < max_repos:
            res = requests.get(
                f"{GITHUB_API}/users/{username}/repos",
                params={"per_page": 100, "sort": "pushed", "page": page},
                headers=_headers(),
                timeout=REQUEST_TIMEOUT,
            )
            if res.status_code != 200:
                return None, _error_for(res, username)
            batch = res.json()
            repos.extend(batch)
            if len(batch) < 100:
                break
            page += 1
    except requests.exceptions.Timeout:
        return None, "GitHub took too long to respond. Please try again."
    except requests.exceptions.RequestException:
        log.exception("GitHub repos request failed")
        return None, "Could not reach GitHub. Please try again."
    return repos[:max_repos], None


@ttl_cache()
def fetch_github_contributions(username: str) -> Tuple[Optional[Dict], Optional[str]]:
    """
    Real contribution data for the last year via GraphQL. Requires GITHUB_TOKEN;
    without one this returns an error and scoring falls back to estimates.
    """
    if not GITHUB_TOKEN:
        return None, "GITHUB_TOKEN not configured"
    try:
        res = requests.post(
            GITHUB_GRAPHQL,
            json={"query": CONTRIBUTIONS_QUERY, "variables": {"login": username}},
            headers=_headers(),
            timeout=REQUEST_TIMEOUT,
        )
        data = res.json() if res.status_code == 200 else {}
    except (requests.exceptions.RequestException, ValueError):
        log.exception("GitHub contributions request failed")
        return None, "Could not load contributions"
    collection = ((data.get("data") or {}).get("user") or {}).get("contributionsCollection")
    if not collection:
        return None, "Could not load contributions"

    days = [d for w in collection["contributionCalendar"]["weeks"] for d in w["contributionDays"]]
    weeks = collection["contributionCalendar"]["weeks"]
    return {
        "total": collection["contributionCalendar"]["totalContributions"],
        "commits": collection["totalCommitContributions"],
        "pull_requests": collection["totalPullRequestContributions"],
        "issues": collection["totalIssueContributions"],
        "reviews": collection["totalPullRequestReviewContributions"],
        "active_days": sum(1 for d in days if d["contributionCount"] > 0),
        "active_weeks": sum(1 for w in weeks if any(d["contributionCount"] > 0 for d in w["contributionDays"])),
        "total_weeks": len(weeks),
        "calendar": [{"date": d["date"], "count": d["contributionCount"]} for d in days],
    }, None
