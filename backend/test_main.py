from fastapi.testclient import TestClient

from main import app, normalize_weights


client = TestClient(app)


def test_health_endpoint():
    res = client.get("/health")
    assert res.status_code == 200
    payload = res.json()
    assert payload["status"] == "ok"


def test_normalize_weights():
    data = normalize_weights({"github": 40, "leetcode": 40, "linkedin": 20})
    assert round(data["github"], 2) == 0.4
    assert round(sum(data.values()), 6) == 1
