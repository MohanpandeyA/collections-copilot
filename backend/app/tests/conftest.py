"""API tests run against the real local Postgres, reseeded before the session."""
import pytest
from fastapi.testclient import TestClient

from app import seed
from app.main import app


@pytest.fixture(scope="session", autouse=True)
def _seeded_db():
    seed.main()


@pytest.fixture()
def client():
    return TestClient(app)


def login(client, username, password="demo123"):
    res = client.post("/auth/login", data={"username": username, "password": password})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.fixture()
def officer(client):
    return login(client, "rahul")


@pytest.fixture()
def manager(client):
    return login(client, "manager_central")
