"""E-resume API tests against an in-memory stand-in for Supabase, with GitHub/LeetCode mocked."""
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import eresume
import main
import rate_limit
import resume_parser
from eresume_models import ResumeData, clean_url
from resume_parser import parse_resume_rules, resume_from_github


class FakeTable:
    """Just enough of the supabase-py query builder: select/insert/update/upsert + eq/gte/order/limit."""

    def __init__(self, rows):
        self.rows, self.filters, self.op, self.payload, self.max = rows, [], "select", None, None

    def select(self, *a, **k):
        return self

    def insert(self, row):
        self.op, self.payload = "insert", row
        return self

    def upsert(self, row, on_conflict=None):
        self.op, self.payload = "upsert", (row, on_conflict)
        return self

    def update(self, values):
        self.op, self.payload = "update", values
        return self

    def eq(self, col, val):
        self.filters.append(lambda r: r.get(col) == val)
        return self

    def gte(self, col, val):
        self.filters.append(lambda r: (r.get(col) or "") >= val)
        return self

    def order(self, col, desc=False):
        self.sort = (col, desc)
        return self

    def limit(self, n):
        self.max = n
        return self

    def _match(self):
        return [r for r in self.rows if all(f(r) for f in self.filters)]

    def execute(self):
        if self.op == "insert":
            row = {"id": str(uuid.uuid4()), "duration_ms": 0, "sections": [], "clicks": [], **self.payload}
            self.rows.append(row)
            return SimpleNamespace(data=[row])
        if self.op == "upsert":
            row, key = self.payload
            existing = [r for r in self.rows if r.get(key) == row.get(key)]
            if existing:
                existing[0].update(row)
                return SimpleNamespace(data=[existing[0]])
            row = {"id": str(uuid.uuid4()), "slug": None, "published": False, **row}
            self.rows.append(row)
            return SimpleNamespace(data=[row])
        if self.op == "update":
            matched = self._match()
            if "slug" in self.payload and any(
                r.get("slug") == self.payload["slug"] and r not in matched for r in self.rows
            ):
                raise Exception('duplicate key value violates unique constraint "resumes_slug_key"')
            for r in matched:
                r.update(self.payload)
            return SimpleNamespace(data=matched)
        data = self._match()
        if getattr(self, "sort", None):
            col, desc = self.sort
            data = sorted(data, key=lambda r: r.get(col) or "", reverse=desc)
        return SimpleNamespace(data=data[: self.max] if self.max else data)


class FakeDB:
    def __init__(self):
        self.tables = {"resumes": [], "resume_views": []}

    def table(self, name):
        return FakeTable(self.tables[name])


GH_USER = {"login": "octocat", "name": "The Octocat", "bio": "I build things", "html_url": "https://github.com/octocat",
           "followers": 10, "created_at": "2011-01-25T18:44:36Z", "location": "SF", "blog": "octo.dev"}
GH_REPOS = [
    {"name": "hello", "full_name": "octocat/hello", "stargazers_count": 42, "forks_count": 3, "fork": False,
     "language": "Python", "topics": ["api"], "html_url": "https://github.com/octocat/hello",
     "homepage": "https://hello.dev", "description": "Says hello", "pushed_at": "2026-10-01T00:00:00Z"},
    {"name": "forked", "full_name": "octocat/forked", "stargazers_count": 999, "fork": True, "language": "Go"},
]
LC_USER = {"username": "octo", "profile": {"ranking": 1234, "aboutMe": ""}, "streak": 5, "total_active_days": 90,
           "submitStatsGlobal": {"acSubmissionNum": [{"difficulty": "All", "count": 300}, {"difficulty": "Easy", "count": 100},
                                                     {"difficulty": "Medium", "count": 150}, {"difficulty": "Hard", "count": 50}]},
           "contest": {"rating": 1812.4, "topPercentage": 9.5}}


def fake_user(supabase, authorization):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    uid = authorization.split(" ", 1)[1]
    return {"id": uid, "email": f"{uid}@example.com", "email_confirmed": True}


def fake_optional_user(supabase, authorization):
    try:
        return fake_user(supabase, authorization)
    except HTTPException:
        return None


@pytest.fixture
def env(monkeypatch):
    fake = FakeDB()
    state = {"bio": "I build things", "about": ""}
    monkeypatch.setattr(eresume, "supabase", fake)
    monkeypatch.setattr(eresume, "require_user", fake_user)
    monkeypatch.setattr(eresume, "get_optional_user", fake_optional_user)
    monkeypatch.setattr(eresume, "fetch_github_user", lambda u: ({**GH_USER, "bio": state["bio"]}, None) if u.lower() == "octocat" else (None, "not found"))
    monkeypatch.setattr(eresume, "fetch_github_repos", lambda u: (GH_REPOS, None))
    monkeypatch.setattr(eresume, "fetch_github_contributions", lambda u: ({"total": 512, "active_weeks": 40}, None))
    monkeypatch.setattr(eresume, "fetch_leetcode_user", lambda u: ({**LC_USER, "profile": {"ranking": 1234, "aboutMe": state["about"]}}, None))
    monkeypatch.setattr(resume_parser, "OPENAI_API_KEY", "")
    rate_limit.hits.clear()
    return SimpleNamespace(client=TestClient(main.app), db=fake, state=state)


def auth(uid="alice"):
    return {"Authorization": f"Bearer {uid}"}


RESUME = {
    "basics": {"name": "Alice Dev", "headline": "Backend Engineer", "email": "alice@example.com",
               "phone": "+1 555 000 1111", "github": "https://github.com/octocat", "website": "alice.dev"},
    "skills": ["Python", "python", "SQL"],
    "projects": [{"name": "hello", "repo": "octocat/hello", "repo_url": "github.com/octocat/hello", "tech": ["Python"]}],
    "experience": [{"role": "Engineer", "company": "Acme", "bullets": ["Built APIs"]}],
}


def save(env, data=RESUME, settings=None, uid="alice"):
    return env.client.put("/eresume/me", json={"data": data, "settings": settings or {}}, headers=auth(uid))


def publish(env, slug="alice", published=True, uid="alice"):
    return env.client.put("/eresume/me/publish", json={"slug": slug, "published": published}, headers=auth(uid))


def test_models_clean_links_and_usernames():
    data = ResumeData(**RESUME)
    assert data.basics.github == "octocat"
    assert data.basics.website == "https://alice.dev"
    assert data.projects[0].repo_url == "https://github.com/octocat/hello"
    assert data.skills == ["Python", "SQL"]  # case-insensitive dedupe
    for bad in ["javascript:alert(1)", "data:text/html,x", "https://exa mple.com", "ftp://x.com", "not a link"]:
        with pytest.raises(ValueError):
            clean_url(bad)


def test_save_requires_auth_and_validates(env):
    assert env.client.put("/eresume/me", json={"data": RESUME}).status_code == 401
    res = env.client.put("/eresume/me", json={"data": {"basics": {"website": "javascript:alert(1)"}}}, headers=auth())
    assert res.status_code == 422
    assert "basics.website" in res.json()["detail"]  # one readable message, not a list


def test_save_and_load(env):
    res = save(env)
    assert res.status_code == 200
    resume = res.json()["resume"]
    assert resume["verify_code"].startswith("profskor-")
    assert resume["verified"]["email"]["value"] == "alice@example.com"  # matches the confirmed account email
    loaded = env.client.get("/eresume/me", headers=auth()).json()["resume"]
    assert loaded["data"]["basics"]["name"] == "Alice Dev"
    assert loaded["verify_code"] == resume["verify_code"]  # stable across saves
    save(env)
    assert len(env.db.tables["resumes"]) == 1


def test_email_verified_only_for_account_email(env):
    data = {**RESUME, "basics": {**RESUME["basics"], "email": "alice@example.com"}}
    assert "email" in save(env, data).json()["resume"]["verified"]
    data = {**RESUME, "basics": {**RESUME["basics"], "email": "someone@else.com"}}
    assert "email" not in save(env, data).json()["resume"]["verified"]


def test_publish_rules(env):
    assert publish(env).status_code == 400  # nothing saved yet
    save(env, {"basics": {"name": ""}})
    assert publish(env).status_code == 400  # needs a name
    save(env)
    assert publish(env, slug="admin").status_code == 422
    assert publish(env, slug="-bad").status_code == 422
    assert publish(env, slug="Alice").json()["resume"]["slug"] == "alice"  # lowercased
    save(env, uid="bob")
    assert publish(env, slug="alice", uid="bob").status_code == 409
    assert env.client.get("/eresume/slug/alice", headers=auth("bob")).json()["available"] is False
    assert env.client.get("/eresume/slug/alice", headers=auth("alice")).json()["available"] is True
    assert env.client.get("/eresume/slug/bob-dev").json()["available"] is True


def test_public_page_hides_private_contact_and_drafts(env):
    save(env, settings={"show_email": False, "show_phone": False})
    publish(env, published=False)
    assert env.client.get("/eresume/public/alice").status_code == 404
    owner = env.client.get("/eresume/public/alice", headers=auth())
    assert owner.status_code == 200 and owner.json()["is_owner"] and not owner.json()["published"]
    publish(env)
    body = env.client.get("/eresume/public/alice").json()
    assert body["data"]["basics"]["name"] == "Alice Dev"
    assert body["data"]["basics"]["email"] == "" and body["data"]["basics"]["phone"] == ""
    assert "verify_code" not in str(body)
    assert body["verified"] == {}  # GitHub not verified yet, so no evidence
    assert "github" not in body["evidence"]


def test_github_verification_and_evidence(env):
    code = save(env).json()["resume"]["verify_code"]
    publish(env)
    res = env.client.post("/eresume/me/verify/github", headers=auth())
    assert res.status_code == 400 and code in res.json()["detail"]
    env.state["bio"] = f"Building things. {code}"
    res = env.client.post("/eresume/me/verify/github", headers=auth())
    assert res.status_code == 200
    assert res.json()["resume"]["verified"]["github"]["username"] == "octocat"

    body = env.client.get("/eresume/public/alice").json()
    gh = body["evidence"]["github"]
    assert body["verified"]["github"]["username"] == "octocat"
    assert gh["repos"] == 1 and gh["stars"] == 42  # forks excluded
    assert gh["contributions"] == 512
    assert gh["repo_stats"]["octocat/hello"]["stars"] == 42

    # pointing the resume at a different account drops the verification
    other = {**RESUME, "basics": {**RESUME["basics"], "github": "someoneelse"}}
    assert "github" not in save(env, other).json()["resume"]["verified"]


def test_leetcode_verification(env):
    data = {**RESUME, "basics": {**RESUME["basics"], "leetcode": "https://leetcode.com/u/octo/"}}
    code = save(env, data).json()["resume"]["verify_code"]
    publish(env)
    assert env.client.post("/eresume/me/verify/leetcode", headers=auth()).status_code == 400
    env.state["about"] = f"hi {code}"
    assert env.client.post("/eresume/me/verify/leetcode", headers=auth()).status_code == 200
    lc = env.client.get("/eresume/public/alice").json()["evidence"]["leetcode"]
    assert lc["solved"] == 300 and lc["hard"] == 50 and lc["contest_rating"] == 1812
    assert env.client.post("/eresume/me/verify/twitter", headers=auth()).status_code == 422


def test_view_tracking(env):
    save(env)
    publish(env)
    browser = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/130"}
    first = env.client.post("/eresume/public/alice/views", json={"via": "Acme Corp", "referrer": "https://www.linkedin.com/feed"}, headers=browser).json()
    assert first["counted"] and first["view_id"]
    again = env.client.post("/eresume/public/alice/views", json={}, headers=browser).json()
    assert again["view_id"] == first["view_id"] and not again["counted"]  # refresh isn't a new view
    assert env.client.post("/eresume/public/alice/views", json={}, headers={"User-Agent": "Googlebot/2.1"}).json()["view_id"] is None
    assert env.client.post("/eresume/public/alice/views", json={}, headers={**browser, **auth()}).json()["view_id"] is None

    beacon = '{"duration_ms": 42000, "sections": ["projects", "skills", "projects"], "clicks": [{"target": "https://github.com/octocat/hello", "kind": "repo"}]}'
    res = env.client.post(f"/eresume/public/alice/views/{first['view_id']}", content=beacon, headers={"Content-Type": "text/plain"})
    assert res.status_code == 200
    assert env.client.post(f"/eresume/public/alice/views/{uuid.uuid4()}", content=beacon).status_code == 404
    assert env.client.post(f"/eresume/public/alice/views/{first['view_id']}", content="nope").status_code == 422

    stats = env.client.get("/eresume/me/views?days=7", headers=auth()).json()
    assert stats["total"] == 1 and stats["unique"] == 1 and stats["engaged"] == 1
    assert stats["by_link"][0]["name"] == "acme-corp"
    assert stats["by_referrer"][0]["name"] == "linkedin.com"
    assert stats["sections"] == {"projects": 100, "skills": 100}
    assert stats["clicks"][0]["kind"] == "repo"
    assert len(stats["by_day"]) == 7 and stats["by_day"][-1]["views"] == 1


def test_views_not_started_for_unpublished(env):
    save(env)
    publish(env, published=False)
    assert env.client.post("/eresume/public/alice/views", json={}, headers={"User-Agent": "Mozilla/5.0"}).status_code == 404


def test_import_github(env):
    res = env.client.get("/eresume/import/github", params={"username": "https://github.com/octocat"})
    assert res.status_code == 200
    data = res.json()["data"]
    assert [p["name"] for p in data["projects"]] == ["hello"]  # forks skipped
    assert data["projects"][0]["repo"] == "octocat/hello"
    assert data["projects"][0]["demo_url"] == "https://hello.dev"
    assert data["basics"]["github"] == "octocat" and data["basics"]["website"] == "https://octo.dev"
    assert env.client.get("/eresume/import/github", params={"username": "../etc"}).status_code == 400


def test_import_pdf(env, monkeypatch):
    monkeypatch.setattr(eresume, "extract_text_from_pdf", lambda file_obj: SAMPLE)
    res = env.client.post("/eresume/import/pdf", files={"file": ("cv.pdf", b"%PDF-1.4", "application/pdf")})
    assert res.status_code == 200
    body = res.json()
    assert body["source"] == "rules"
    assert body["data"]["basics"]["name"] == "Priya Sharma"
    assert env.client.post("/eresume/import/pdf", files={"file": ("cv.txt", b"x", "text/plain")}).status_code == 400


SAMPLE = """PRIYA SHARMA
Full Stack Developer
priya.sharma@gmail.com | +91 98765 43210 | Bengaluru, India
github.com/priyasharma | linkedin.com/in/priya-sharma | priya.dev
SUMMARY
Full stack developer with 2 years of experience building web apps in React and Python.
EXPERIENCE
Software Engineer Intern, Razorpay Jan 2024 - Jun 2024
• Built a payments reconciliation dashboard in React used by 40 finance analysts.
• Reduced report generation time by 60% by moving queries to PostgreSQL materialized views.
Backend Developer | Freelance | Remote 2022 - 2023
- Developed REST APIs with FastAPI and Docker for 3 small business clients, handling
over 10k requests per day.
PROJECTS
ProfSkor - Developer profile scoring app
• Scores GitHub and LeetCode profiles with live API data; React, FastAPI, Supabase.
• github.com/priyasharma/profskor
ChatNow: Real-time chat app built with Node and Socket.io
EDUCATION
B.Tech in Computer Science, RV College of Engineering 2020 - 2024
CGPA 8.7/10
SKILLS
Languages: Python, JavaScript, TypeScript, SQL
Frameworks: React, FastAPI, Node.js, Express
ACHIEVEMENTS
• Winner, Smart India Hackathon 2023
"""


def test_rule_parser_structures_a_resume():
    data = parse_resume_rules(SAMPLE)
    b = data.basics
    assert (b.name, b.headline, b.location) == ("Priya Sharma", "Full Stack Developer", "Bengaluru, India")
    assert (b.email, b.github, b.website) == ("priya.sharma@gmail.com", "priyasharma", "https://priya.dev")
    assert b.linkedin == "https://linkedin.com/in/priya-sharma"
    assert [(e.role, e.company, e.start, e.end) for e in data.experience] == [
        ("Software Engineer Intern", "Razorpay", "Jan 2024", "Jun 2024"),
        ("Backend Developer", "Freelance", "2022", "2023"),
    ]
    assert data.experience[1].bullets[0].endswith("over 10k requests per day.")  # wrapped line joined
    assert data.projects[0].repo == "priyasharma/profskor"
    assert data.projects[1].description == "Real-time chat app built with Node and Socket.io"
    assert (data.education[0].school, data.education[0].degree) == ("RV College of Engineering", "B.Tech in Computer Science")
    assert "FastAPI" in data.skills and data.achievements == ["Winner, Smart India Hackathon 2023"]


def test_resume_from_github_skips_forks():
    data = resume_from_github(GH_USER, GH_REPOS)
    assert len(data.projects) == 1 and data.skills == ["Python"]
