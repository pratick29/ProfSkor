"""API tests with the external fetchers mocked out, so they run offline."""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import main
import rate_limit
from cache import ttl_cache
from resume_service import analyze_resume_rules

GH_USER = {"login": "octocat", "name": "Octo", "bio": "hi", "followers": 3, "avatar_url": "a"}
GH_REPOS = [
    {"name": "proj", "stargazers_count": 12, "forks_count": 1, "fork": False,
     "pushed_at": "2026-10-01T00:00:00Z", "description": "d", "language": "Python", "topics": ["x"]},
]
LC_USER = {
    "username": "coder",
    "submitStatsGlobal": {"acSubmissionNum": [{"difficulty": "Easy", "count": 40}, {"difficulty": "Medium", "count": 20}]},
    "profile": {"ranking": 200000},
    "streak": 4,
    "submission_calendar": {},
    "contest": None,
}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(main, "fetch_github_user", lambda u: (GH_USER, None) if u == "octocat" else (None, f"GitHub user '{u}' not found"))
    monkeypatch.setattr(main, "fetch_github_repos", lambda u: (GH_REPOS, None))
    monkeypatch.setattr(main, "fetch_github_contributions", lambda u: (None, "no token"))
    monkeypatch.setattr(main, "fetch_leetcode_user", lambda u: (LC_USER, None))
    monkeypatch.setattr(main, "supabase", None)
    rate_limit.hits.clear()
    return TestClient(main.app)


def test_github_endpoint(client):
    res = client.post("/score/github", json={"github_username": "https://github.com/octocat"})
    assert res.status_code == 200
    body = res.json()
    assert body["username"] == "octocat"
    assert 0 <= body["score"] <= 100
    assert body["highlights"][0]["name"] == "proj"
    assert body["meta"]["data_quality"] == "estimated"


def test_github_not_found_is_400(client):
    res = client.post("/score/github", json={"github_username": "nobody"})
    assert res.status_code == 400
    assert "not found" in res.json()["detail"]


def test_leetcode_endpoint(client):
    res = client.post("/score/leetcode", json={"leetcode_username": "coder"})
    assert res.status_code == 200
    assert res.json()["meta"]["easy"] == 40


def test_linkedin_endpoint(client):
    full = {"has_headline": True, "has_about": True, "has_projects": True, "has_photo": True,
            "has_experience": True, "posting": "4+ per week"}
    assert client.post("/score/linkedin", json=full).json()["score"] == 100
    empty = {k: False for k in full} | {"posting": "0 per week"}
    body = client.post("/score/linkedin", json=empty).json()
    assert body["score"] == 0
    assert len(body["suggestions"]) == 6


def test_full_score_reports_partial_failures(client):
    res = client.post("/score", json={"github_username": "nobody", "leetcode_username": "coder"})
    assert res.status_code == 200
    body = res.json()
    assert body["scores"]["github"] == 0
    assert body["scores"]["leetcode"] > 0
    assert any("GitHub" in w for w in body["warnings"])


def test_full_score_ignores_body_user_id(client, monkeypatch):
    saved = []
    monkeypatch.setattr(main, "insert_score_history", lambda *a: saved.append(a))
    client.post("/score", json={"user_id": "victim", "github_username": "octocat"})
    assert saved == []  # guests are never persisted, whatever user_id they send


def test_rate_limit(client, monkeypatch):
    monkeypatch.setattr(rate_limit, "RATE_LIMIT", 2)
    codes = [client.post("/score/leetcode", json={"leetcode_username": "coder"}).status_code for _ in range(3)]
    assert codes == [200, 200, 429]


def test_client_key_uses_trusted_proxy_hop(monkeypatch):
    req = SimpleNamespace(headers={"x-forwarded-for": "6.6.6.6, 1.2.3.4"}, client=SimpleNamespace(host="10.0.0.1"))
    monkeypatch.setattr(rate_limit, "TRUSTED_PROXY_HOPS", 0)
    assert rate_limit.client_key(req) == "10.0.0.1"
    monkeypatch.setattr(rate_limit, "TRUSTED_PROXY_HOPS", 1)
    assert rate_limit.client_key(req) == "1.2.3.4"  # spoofed left-most entry ignored


def test_resume_rejects_non_pdf(client):
    res = client.post("/ai/resume-review", files={"file": ("cv.txt", b"hello", "text/plain")})
    assert res.status_code == 400


def test_cache_only_keeps_successes():
    calls = []

    @ttl_cache(60)
    def fetch(x):
        calls.append(x)
        return (None, "err") if x == "bad" else ({"x": x}, None)

    fetch("ok"); fetch("ok"); fetch("bad"); fetch("bad")
    assert calls == ["ok", "bad", "bad"]


RESUME = """Jane Doe
jane@example.com  +1 555 123 4567  github.com/jane  linkedin.com/in/jane
Experience
Software Engineer Intern, Acme. Built a FastAPI service used by 2,000 users; reduced latency by 40%.
Led migration to Docker and AWS, cut deploy time by 3x. Implemented caching. Designed APIs. Shipped features.
Projects
ProfSkor: developed a React and Python app. Optimized SQL queries.
Education
B.Tech Computer Science, Some University
Skills
Python, JavaScript, React, SQL, Docker, AWS, Git, Linux
""" + "More detail about the work and impact. " * 40


def test_resume_rules_good_resume():
    result = analyze_resume_rules(RESUME)
    assert result["score"] >= 90
    assert result["has_github"] and result["has_linkedin"]
    assert result["source"] == "rules"


def test_resume_rules_job_description_keywords():
    result = analyze_resume_rules(RESUME, "We need Kubernetes and TypeScript experience plus Python")
    assert "kubernetes" in result["missing_keywords"]
    assert "python" not in result["missing_keywords"]


def test_resume_rules_weak_resume():
    result = analyze_resume_rules("hello world " * 30)
    assert result["score"] < 20
    assert "Missing email address" in result["weaknesses"]
