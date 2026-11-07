import json
import logging
from typing import Dict, Optional, Tuple

import requests

from cache import ttl_cache
from config import LEETCODE_GRAPHQL, REQUEST_TIMEOUT

log = logging.getLogger(__name__)

QUERY = """
query userProfile($username: String!) {
  matchedUser(username: $username) {
    username
    profile {
      ranking
      reputation
      aboutMe
    }
    submitStatsGlobal {
      acSubmissionNum {
        difficulty
        count
      }
    }
    userCalendar {
      activeYears
      streak
      totalActiveDays
      submissionCalendar
    }
  }
  userContestRanking(username: $username) {
    rating
    attendedContestsCount
    topPercentage
  }
}
"""


@ttl_cache()
def fetch_leetcode_user(username: str) -> Tuple[Optional[Dict], Optional[str]]:
    headers = {
        "Content-Type": "application/json",
        "Referer": "https://leetcode.com",
        "User-Agent": "Mozilla/5.0",
    }
    try:
        res = requests.post(
            LEETCODE_GRAPHQL,
            json={"query": QUERY, "variables": {"username": username}},
            headers=headers,
            timeout=REQUEST_TIMEOUT,
        )
    except requests.exceptions.Timeout:
        return None, "LeetCode took too long to respond. Please try again."
    except requests.exceptions.RequestException:
        log.exception("LeetCode request failed")
        return None, "Could not reach LeetCode. Please try again."

    if res.status_code != 200:
        return None, f"LeetCode API error: {res.status_code}"
    try:
        data = res.json()
    except ValueError:
        return None, "LeetCode returned an unexpected response"

    matched = (data.get("data") or {}).get("matchedUser")
    if not matched:
        return None, f"LeetCode user '{username}' not found"

    calendar = matched.get("userCalendar") or {}
    matched["streak"] = calendar.get("streak", 0)
    matched["total_active_days"] = calendar.get("totalActiveDays", 0)
    try:
        raw = json.loads(calendar.get("submissionCalendar") or "{}")
        # {unix_timestamp_str: submission_count}
        matched["submission_calendar"] = {int(ts): int(count) for ts, count in raw.items()}
    except (TypeError, ValueError):
        matched["submission_calendar"] = {}
    matched["contest"] = (data.get("data") or {}).get("userContestRanking")
    return matched, None
