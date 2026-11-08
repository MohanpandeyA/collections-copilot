from fastapi.testclient import TestClient

from app.main import app


def test_health_checks_database():
    res = TestClient(app).get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_health_answers_head_for_uptime_pingers():
    assert TestClient(app).head("/health").status_code == 200
