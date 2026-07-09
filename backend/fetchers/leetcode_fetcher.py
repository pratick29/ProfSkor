import requests
from typing import Tuple, Optional, Dict

LEETCODE_GRAPHQL = "https://leetcode.com/graphql"

QUERY = """
query userProfile($username: String!) {
  matchedUser(username: $username) {
    username
    profile {
      ranking
      reputation
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
      dccBadges {
        timestamp
        badge {
          name
          icon
        }
      }
    }
  }
}
"""


def fetch_leetcode_user(username: str, timeout: int = 10) -> Tuple[Optional[Dict], Optional[str]]:
    """
    Fetch LeetCode user profile data.
    
    Returns:
        Tuple of (user_data, error_message)
    """
    payload = {
        "query": QUERY,
        "variables": {"username": username}
    }

    headers = {
        "Content-Type": "application/json",
        "Referer": "https://leetcode.com",
        "User-Agent": "Mozilla/5.0"
    }

    try:
        res = requests.post(
            LEETCODE_GRAPHQL, 
            json=payload, 
            headers=headers,
            timeout=timeout
        )

        if res.status_code != 200:
            return None, f"LeetCode API error: {res.status_code}"

        data = res.json()

        if "errors" in data:
            error_msg = data["errors"][0].get("message", "Unknown error")
            return None, f"LeetCode API error: {error_msg}"

        matched = data.get("data", {}).get("matchedUser")
        if not matched:
            return None, "LeetCode user not found."

        # Add streak from userCalendar if available
        user_calendar = matched.get("userCalendar", {})
        if user_calendar:
            matched["streak"] = user_calendar.get("streak", 0)
        else:
            matched["streak"] = 0

        return matched, None

    except requests.exceptions.Timeout:
        return None, "Request timeout: LeetCode API took too long to respond"
    except requests.exceptions.RequestException as e:
        return None, f"Network error: {str(e)}"
    except Exception as e:
        return None, f"Unexpected error: {str(e)}"
