from datetime import date, datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from core.leetcode_scoring import active_days_since, current_streak, leetcode_score
from core.scoring import github_score, merged_prefs, repo_highlights
from schemas import GithubScoreRequest, LeetcodeScoreRequest, ScoreRequest


def iso_days_ago(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")


def repo(name, stars=0, fork=False, pushed_days=10, description="x", language="Python", topics=None):
    return {
        "name": name,
        "stargazers_count": stars,
        "forks_count": 0,
        "fork": fork,
        "pushed_at": iso_days_ago(pushed_days),
        "description": description,
        "language": language,
        "topics": topics or [],
        "html_url": f"https://github.com/u/{name}",
    }


# ---------- GitHub ----------

def test_github_empty_profile_scores_zero():
    score, breakdown, suggestions, meta = github_score({}, [], None)
    assert score == 0
    assert set(breakdown) == {"Repos", "Stars", "Commits", "Consistency"}
    assert suggestions
    assert meta["data_quality"] == "estimated"


def test_github_forks_do_not_count():
    repos = [repo("orig", stars=5), repo("forked", stars=10000, fork=True)]
    _, _, _, meta = github_score({}, repos, None)
    assert meta["original_repos"] == 1
    assert meta["forked_repos"] == 1
    assert meta["total_stars"] == 5


def test_github_strong_profile_scores_high():
    repos = [repo(f"r{i}", stars=20, pushed_days=i, topics=["api"]) for i in range(30)]
    contributions = {"total": 900, "commits": 700, "pull_requests": 20, "issues": 5, "reviews": 3,
                     "active_days": 250, "active_weeks": 50, "total_weeks": 53, "calendar": []}
    score, _, _, meta = github_score({"bio": "builder"}, repos, None, contributions)
    assert score >= 95
    assert meta["data_quality"] == "actual"
    assert "calendar" not in meta["contributions"]


def test_github_score_normalises_custom_weights():
    repos = [repo(f"r{i}", stars=20, pushed_days=1) for i in range(30)]
    default_score, *_ = github_score({}, repos, None)
    doubled_score, *_ = github_score({}, repos, {"repos": 60, "stars": 60, "commits": 50, "consistency": 30})
    assert default_score == doubled_score


def test_merged_prefs_ignores_unknown_and_bad_values():
    prefs = merged_prefs({"repos": "50", "stars": "abc", "evil": 999, "commits": -5}, "github")
    assert prefs["repos"] == 50
    assert prefs["stars"] == 30  # default kept
    assert prefs["commits"] == 0
    assert "evil" not in prefs


def test_highlights_sorted_by_stars_and_skip_forks():
    repos = [repo("a", stars=1), repo("b", stars=50), repo("c", stars=999, fork=True)]
    names = [h["name"] for h in repo_highlights(repos)]
    assert names == ["b", "a"]


# ---------- LeetCode ----------

def ts(d: date) -> int:
    return int(datetime(d.year, d.month, d.day, 12, tzinfo=timezone.utc).timestamp())


def test_current_streak_counts_back_from_today_or_yesterday():
    today = date(2026, 10, 31)
    cal = {ts(today - timedelta(days=i)): 1 for i in range(1, 6)}  # yesterday and 4 days before
    assert current_streak(cal, today) == 5
    cal[ts(today)] = 2
    assert current_streak(cal, today) == 6
    assert current_streak({ts(today - timedelta(days=3)): 1}, today) == 0


def test_active_days_since():
    today = date(2026, 10, 31)
    cal = {ts(today - timedelta(days=i)): 1 for i in (1, 10, 89, 120)}
    assert active_days_since(cal, 90, today) == 3


def test_leetcode_score_and_meta():
    user = {
        "submitStatsGlobal": {"acSubmissionNum": [
            {"difficulty": "All", "count": 460}, {"difficulty": "Easy", "count": 150},
            {"difficulty": "Medium", "count": 250}, {"difficulty": "Hard", "count": 60},
        ]},
        "profile": {"ranking": 5000},
        "streak": 60,
        "submission_calendar": {},
        "contest": {"rating": 2100.4, "attendedContestsCount": 30, "topPercentage": 3.2},
    }
    score, breakdown, _, meta = leetcode_score(user, None)
    assert score == 100
    assert breakdown["Hard"] == 25
    assert meta["contest_rating"] == 2100
    assert meta["total"] == 460


def test_leetcode_missing_fields_do_not_crash():
    score, _, suggestions, meta = leetcode_score({}, None)
    assert 0 <= score <= 10
    assert meta["current_streak"] == 0
    assert suggestions


# ---------- Username cleaning ----------

@pytest.mark.parametrize("raw,expected", [
    ("octocat", "octocat"),
    ("  @octocat ", "octocat"),
    ("https://github.com/octocat", "octocat"),
    ("github.com/octocat/hello-world", "octocat"),
])
def test_github_username_cleaning(raw, expected):
    assert GithubScoreRequest(github_username=raw).github_username == expected


@pytest.mark.parametrize("raw,expected", [
    ("lee215", "lee215"),
    ("https://leetcode.com/u/lee215/", "lee215"),
    ("leetcode.com/lee215", "lee215"),
])
def test_leetcode_username_cleaning(raw, expected):
    assert LeetcodeScoreRequest(leetcode_username=raw).leetcode_username == expected


@pytest.mark.parametrize("bad", ["../etc", "a b", "-leading", "x" * 40])
def test_invalid_github_usernames_rejected(bad):
    with pytest.raises(ValidationError):
        GithubScoreRequest(github_username=bad)


def test_full_score_usernames_optional():
    req = ScoreRequest()
    assert req.github_username == "" and req.leetcode_username == ""


def test_weight_templates_sum_to_100():
    from core.weight_templates import WEIGHT_TEMPLATES
    for name, template in WEIGHT_TEMPLATES.items():
        for section, weights in template.items():
            assert sum(weights.values()) == 100, (name, section)
