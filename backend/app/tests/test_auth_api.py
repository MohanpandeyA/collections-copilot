from app.tests.conftest import login


def test_login_returns_token_and_role(client):
    res = client.post("/auth/login", data={"username": "rahul", "password": "demo123"})
    body = res.json()
    assert res.status_code == 200
    assert body["role"] == "officer" and body["access_token"]


def test_wrong_password_is_rejected_without_hinting_which_part(client):
    res = client.post("/auth/login", data={"username": "rahul", "password": "nope"})
    assert res.status_code == 401
    assert res.json()["detail"] == "Incorrect username or password"


def test_unknown_user_gets_same_message(client):
    res = client.post("/auth/login", data={"username": "ghost", "password": "x"})
    assert res.status_code == 401
    assert res.json()["detail"] == "Incorrect username or password"


def test_me_requires_a_token(client):
    assert client.get("/auth/me").status_code == 401


def test_me_returns_profile(client, officer):
    res = client.get("/auth/me", headers=officer)
    assert res.json()["username"] == "rahul"
    assert "password_hash" not in res.json()


def test_garbage_token_is_rejected(client):
    res = client.get("/auth/me", headers={"Authorization": "Bearer not.a.token"})
    assert res.status_code == 401


def test_officer_cannot_open_manager_only_route(client, officer):
    assert client.get("/manager/ping", headers=officer).status_code == 403


def test_manager_can_open_manager_route(client, manager):
    assert client.get("/manager/ping", headers=manager).status_code == 200
