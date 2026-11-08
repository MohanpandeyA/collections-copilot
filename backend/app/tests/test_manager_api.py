import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.deps import get_now
from app.main import app
from app.models import Promise
from app.tests.conftest import login

HEADER = "loan_id,borrower_name,phone,pincode,outstanding,dpd,last_payment_date\n"
IST = timezone(timedelta(hours=5, minutes=30))


def new_loan(client, manager, pin="452001", prefix="LN-M"):
    lid = f"{prefix}{uuid.uuid4().hex[:8]}"
    body = HEADER + f"{lid},Manager Test,9300000001,{pin},60000,9,\n"
    client.post("/manager/imports", headers=manager, files={"file": ("a.csv", body, "text/csv")})
    return lid


@pytest.fixture()
def east(client):
    return login(client, "manager_east")


# --- dashboard ---------------------------------------------------------------

def test_dashboard_requires_manager(client, officer):
    assert client.get("/manager/dashboard", headers=officer).status_code == 403


def test_dashboard_shape_and_consistency(client, manager):
    d = client.get("/manager/dashboard", headers=manager).json()
    rr = d["roll_rate"]
    assert rr["cohort"] >= rr["rolled"] >= 0
    assert d["open_loans"] > 0 and float(d["overdue_amount"]) > 0
    names = {o["officer_name"] for o in d["by_officer"]}
    assert {"Rahul Chouhan", "Neha Solanki", "Imran Qureshi"} <= names
    assert sum(o["cohort"] for o in d["by_officer"]) == rr["cohort"]
    assert d["broken_promises"] >= 1  # LN-11930 from the brief


def test_dashboard_is_scoped_to_the_managers_branch(client, manager, east):
    central = {o["officer_name"] for o in client.get("/manager/dashboard", headers=manager).json()["by_officer"]}
    east_names = {o["officer_name"] for o in client.get("/manager/dashboard", headers=east).json()["by_officer"]}
    assert central.isdisjoint(east_names) and "Vikas Patidar" in east_names


# --- promise tracker -------------------------------------------------------------

def test_promise_tracker_lists_brief_examples_with_officer(client, manager):
    rows = client.get("/manager/promises", headers=manager).json()
    by_loan = {r["loan_id"]: r for r in rows}
    assert by_loan["LN-11930"]["state"] == "broken" and by_loan["LN-11930"]["officer_name"] == "Imran Qureshi"
    assert by_loan["LN-10293"]["state"] == "open"


def test_promise_tracker_filters_by_state_and_rejects_unknown(client, manager):
    rows = client.get("/manager/promises?state=broken", headers=manager).json()
    assert rows and all(r["state"] == "broken" for r in rows)
    assert client.get("/manager/promises?state=weird", headers=manager).status_code == 422


def test_promise_tracker_hides_other_branch(client, east):
    assert "LN-11930" not in [r["loan_id"] for r in client.get("/manager/promises", headers=east).json()]


def test_sweep_marks_only_past_due_open_promises_broken(client, manager):
    lid = new_loan(client, manager)
    with SessionLocal() as db:
        db.add(Promise(loan_id=lid, promise_date=date(2026, 10, 30), amount=1000, state="open"))
        db.commit()
    app.dependency_overrides[get_now] = lambda: datetime(2026, 11, 1, 12, tzinfo=IST)
    try:
        res = client.post("/manager/promises/sweep", headers=manager)
    finally:
        app.dependency_overrides.pop(get_now, None)
    assert res.status_code == 200 and res.json()["marked_broken"] >= 1
    with SessionLocal() as db:
        assert db.scalar(select(Promise.state).where(Promise.loan_id == lid)) == "broken"
        assert db.scalar(select(Promise.state).where(Promise.loan_id == "LN-10293")) == "open"  # due 5 Nov


# --- activity log ------------------------------------------------------------------

def test_activity_log_shows_branch_outcomes_newest_first(client, manager, east):
    lid = new_loan(client, manager)
    h = login(client, "rahul")
    item = {"client_id": str(uuid.uuid4()), "loan_id": lid, "result": "unreachable",
            "occurred_at": datetime(2026, 11, 7, 12, tzinfo=IST).isoformat()}
    client.post("/outcomes/batch", headers=h, json={"items": [item]})
    rows = client.get("/manager/activity", headers=manager).json()["items"]
    assert rows[0]["loan_id"] == lid and rows[0]["officer_name"] == "Rahul Chouhan"
    times = [r["occurred_at"] for r in rows]
    assert times == sorted(times, reverse=True)
    assert lid not in [r["loan_id"] for r in client.get("/manager/activity", headers=east).json()["items"]]


# --- reorder -------------------------------------------------------------------------

def test_manager_loans_lists_officer_and_score(client, manager):
    rows = client.get("/manager/loans", headers=manager).json()
    row = next(r for r in rows if r["loan_id"] == "LN-10293")
    assert row["officer_name"] == "Rahul Chouhan" and row["rank"] is None and "band" in row


def test_manager_loans_include_outstanding_for_the_age_chart(client, manager):
    rows = client.get("/manager/loans", headers=manager).json()
    row = next(r for r in rows if r["loan_id"] == "LN-10293")
    assert float(row["outstanding"]) > 0


def test_rank_moves_loan_to_top_of_officers_list_and_can_be_cleared(client, manager, officer):
    lid = new_loan(client, manager)
    try:
        assert client.put(f"/manager/loans/{lid}/rank", headers=manager, json={"rank": 1}).status_code == 200
        assert client.get("/my/loans", headers=officer).json()[0]["loan_id"] == lid
    finally:
        assert client.put(f"/manager/loans/{lid}/rank", headers=manager, json={"rank": None}).status_code == 200
    rows = client.get("/my/loans", headers=officer).json()
    scores = [l["score"] for l in rows if not l["visited_today"]]  # visited loans sit at the bottom
    assert scores == sorted(scores, reverse=True)


def test_rank_on_other_branch_loan_is_404(client, east):
    res = client.put("/manager/loans/LN-10293/rank", headers=east, json={"rank": 1})
    assert res.status_code == 404


def test_rank_must_be_positive(client, manager):
    assert client.put("/manager/loans/LN-10293/rank", headers=manager, json={"rank": 0}).status_code == 422
