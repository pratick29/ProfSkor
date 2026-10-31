from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from auth import require_admin, require_user
from main import app, normalize_weights


client = TestClient(app)


class FakeAuth:
    def __init__(self, user):
        self._user = user

    def get_user(self, token):
        if token != "valid":
            raise Exception("invalid token")
        return SimpleNamespace(user=self._user)


def fake_supabase(user_metadata=None, app_metadata=None):
    user = SimpleNamespace(
        id="u1", email="a@b.c", user_metadata=user_metadata or {}, app_metadata=app_metadata or {}
    )
    return SimpleNamespace(auth=FakeAuth(user))


def test_health_endpoint():
    res = client.get("/health")
    assert res.status_code == 200
    payload = res.json()
    assert payload["status"] == "ok"


def test_normalize_weights():
    data = normalize_weights({"github": 40, "leetcode": 40, "linkedin": 20})
    assert round(data["github"], 2) == 0.4
    assert round(sum(data.values()), 6) == 1


def test_x_user_id_header_does_not_authenticate():
    res = client.get("/scores/history", headers={"X-User-Id": "someone-else"})
    assert res.status_code == 401


def test_require_user_accepts_valid_token():
    user = require_user(fake_supabase(), "Bearer valid")
    assert user["id"] == "u1"


def test_require_user_rejects_invalid_token():
    with pytest.raises(HTTPException) as exc:
        require_user(fake_supabase(), "Bearer forged")
    assert exc.value.status_code == 401


def test_admin_ignores_user_editable_metadata():
    with pytest.raises(HTTPException) as exc:
        require_admin(fake_supabase(user_metadata={"user_type": "admin"}), "Bearer valid", None)
    assert exc.value.status_code == 403


def test_admin_uses_app_metadata_role():
    user = require_admin(fake_supabase(app_metadata={"role": "admin"}), "Bearer valid", None)
    assert user["id"] == "u1"
