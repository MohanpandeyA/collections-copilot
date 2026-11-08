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


# --- failed-login limit ----------------------------------------------------------------

import pytest

from app.core import ratelimit
from app.core.ratelimit import FailureLimiter


def _bad(client, user="rahul", **kw):
    return client.post("/auth/login", data={"username": user, "password": "wrong"}, **kw)


def test_five_wrong_passwords_lock_that_username_with_retry_after(client):
    assert [_bad(client).status_code for _ in range(5)] == [401] * 5
    locked = _bad(client)
    assert locked.status_code == 429
    assert int(locked.headers["Retry-After"]) > 0
    # even the right password is refused while locked, or the lock would not stop guessing
    assert client.post("/auth/login", data={"username": "rahul", "password": "demo123"}).status_code == 429


def test_lock_on_one_username_does_not_block_another(client):
    for _ in range(6):
        _bad(client)
    assert client.post("/auth/login", data={"username": "manager_central", "password": "demo123"}).status_code == 200


def test_a_good_login_clears_the_count(client):
    for _ in range(4):
        _bad(client)
    assert client.post("/auth/login", data={"username": "rahul", "password": "demo123"}).status_code == 200
    assert [_bad(client).status_code for _ in range(5)] == [401] * 5


def test_one_client_guessing_many_usernames_is_stopped(client):
    codes = [_bad(client, user=f"ghost{i}").status_code for i in range(ratelimit.MAX_PER_CLIENT + 1)]
    assert codes[:-1] == [401] * ratelimit.MAX_PER_CLIENT and codes[-1] == 429


def test_proxy_header_uses_the_address_the_proxy_added_not_one_the_caller_wrote(client):
    # a caller cannot dodge the limit by inventing a new first entry on every request
    for i in range(5):
        _bad(client, headers={"X-Forwarded-For": f"9.9.9.{i}, 10.0.0.1"})
    assert _bad(client, headers={"X-Forwarded-For": "8.8.8.8, 10.0.0.1"}).status_code == 429
    # a different real client (the proxy's last entry) is not affected
    assert _bad(client, headers={"X-Forwarded-For": "8.8.8.8, 10.0.0.2"}).status_code == 401


def test_limit_expires_after_the_window():
    t = [0.0]
    lim = FailureLimiter(clock=lambda: t[0])
    for _ in range(ratelimit.MAX_PER_USER):
        lim.record_failure("1.1.1.1", "rahul")
    assert lim.retry_after("1.1.1.1", "rahul") > 0
    t[0] = ratelimit.WINDOW_SECONDS + 1
    assert lim.retry_after("1.1.1.1", "rahul") == 0


# --- CORS ------------------------------------------------------------------------------

def test_cors_allows_the_configured_origin_only(client):
    ok = client.options("/auth/login", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"
    bad = client.options("/auth/login", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in bad.headers


def test_cors_does_not_offer_delete_or_patch(client):
    res = client.options("/auth/login", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "DELETE"})
    assert res.status_code == 400
    allowed = res.headers.get("access-control-allow-methods", "")
    assert "DELETE" not in allowed and "PATCH" not in allowed
