"""Paged activity with a date filter, and the server-side numbers behind the dashboard charts."""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import delete, select

from app.core.database import SessionLocal
from app.core.deps import get_now
from app.main import app
from app.models import Outcome, User
from app.tests.conftest import login
from app.tests.test_manager_api import new_loan

IST = timezone(timedelta(hours=5, minutes=30))


@pytest.fixture()
def east(client):
    return login(client, "manager_east")


def log(client, officer, loan_id, result, when, **extra):
    item = {"client_id": str(uuid.uuid4()), "loan_id": loan_id, "result": result, "occurred_at": when.isoformat(), **extra}
    res = client.post("/outcomes/batch", headers=officer, json={"items": [item]})
    assert res.json()["results"][0]["status"] == "created", res.text
    return item["client_id"]


def at(day, hour=11, minute=0):
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=IST)


@pytest.fixture()
def far_future_loan(client, manager):
    """Activity in 2031 touches nothing else in the seed, so counts in that window are exact."""
    return new_loan(client, manager)


@pytest.fixture(autouse=True)
def _tidy():
    yield
    with SessionLocal() as db:
        db.execute(delete(Outcome).where(Outcome.occurred_at >= datetime(2031, 1, 1, tzinfo=IST)))
        db.commit()


# --- activity paging and dates -----------------------------------------------------------

def test_activity_is_paged_with_a_total_and_no_row_repeats(client, officer, manager, far_future_loan):
    for i in range(5):
        log(client, officer, far_future_loan, "unreachable", at(date(2031, 3, 1), 9, i * 5))  # 5 minutes apart
    q = "date_from=2031-03-01&date_to=2031-03-01"
    p1 = client.get(f"/manager/activity?{q}&limit=2&offset=0", headers=manager).json()
    p2 = client.get(f"/manager/activity?{q}&limit=2&offset=2", headers=manager).json()
    p3 = client.get(f"/manager/activity?{q}&limit=2&offset=4", headers=manager).json()
    assert (p1["total"], p1["limit"], p1["offset"]) == (5, 2, 0)
    assert [len(p["items"]) for p in (p1, p2, p3)] == [2, 2, 1]
    ids = [r["client_id"] for p in (p1, p2, p3) for r in p["items"]]
    assert len(set(ids)) == 5
    times = [r["occurred_at"] for p in (p1, p2, p3) for r in p["items"]]
    assert times == sorted(times, reverse=True)


def test_rows_with_the_same_time_still_page_without_repeats(client, manager, far_future_loan):
    with SessionLocal() as db:
        rahul = db.scalar(select(User.id).where(User.username == "rahul"))
        for _ in range(4):
            db.add(Outcome(client_id=uuid.uuid4(), loan_id=far_future_loan, officer_id=rahul,
                           result="unreachable", occurred_at=at(date(2031, 4, 1))))
        db.commit()
    seen = [client.get(f"/manager/activity?date_from=2031-04-01&date_to=2031-04-01&limit=1&offset={i}",
                       headers=manager).json()["items"][0]["client_id"] for i in range(4)]
    assert len(set(seen)) == 4


def test_date_filter_uses_ist_days_and_includes_both_ends(client, officer, manager, far_future_loan):
    log(client, officer, far_future_loan, "dispute", at(date(2031, 5, 10), 0, 30))    # just after IST midnight
    log(client, officer, far_future_loan, "dispute", at(date(2031, 5, 10), 23, 30))   # just before the next
    log(client, officer, far_future_loan, "dispute", at(date(2031, 5, 11), 0, 10))
    def total(a, b):
        return client.get(f"/manager/activity?date_from={a}&date_to={b}", headers=manager).json()["total"]
    assert total("2031-05-10", "2031-05-10") == 2
    assert total("2031-05-11", "2031-05-11") == 1
    assert total("2031-05-10", "2031-05-11") == 3
    assert total("2031-05-12", "2031-05-30") == 0
    assert total("2031-05-11", "2031-05-30") == 1  # open-ended on one side works too


def test_activity_rejects_bad_dates_and_sizes(client, manager):
    for q in ("date_from=2031-05-12&date_to=2031-05-10", "limit=0", "limit=201", "offset=-1", "date_from=not-a-date"):
        assert client.get(f"/manager/activity?{q}", headers=manager).status_code == 422, q


def test_activity_default_page_is_50_and_total_counts_everything(client, manager):
    page = client.get("/manager/activity", headers=manager).json()
    assert page["limit"] == 50 and len(page["items"]) <= 50 and page["total"] >= len(page["items"])


def test_activity_stays_inside_the_branch(client, officer, manager, east, far_future_loan):
    log(client, officer, far_future_loan, "paid", at(date(2031, 6, 1)), amount_received="100")
    q = "date_from=2031-06-01&date_to=2031-06-01"
    assert client.get(f"/manager/activity?{q}", headers=manager).json()["total"] == 1
    assert client.get(f"/manager/activity?{q}", headers=east).json() == {"items": [], "total": 0, "limit": 50, "offset": 0}


# --- insights ----------------------------------------------------------------------------

def pin_today(day):
    app.dependency_overrides[get_now] = lambda: at(day, 15)


def unpin():
    app.dependency_overrides.pop(get_now, None)


def test_insights_agree_with_the_lists_they_replace(client, manager):
    loans = client.get("/manager/loans", headers=manager).json()
    ins = client.get("/manager/insights", headers=manager).json()
    assert ins["bands"] == {b: sum(1 for l in loans if l["band"] == b) for b in ("high", "medium", "low")}
    edges = [(1, 30), (31, 60), (61, 90), (91, 10**9)]
    expect = [sum(float(l["outstanding"]) for l in loans if lo <= l["dpd"] <= hi) for lo, hi in edges]
    assert [float(b["amount"]) for b in ins["overdue_by_age"]] == pytest.approx(expect)
    assert [b["key"] for b in ins["overdue_by_age"]] == ["b1", "b2", "b3", "b4"]
    promises = client.get("/manager/promises", headers=manager).json()
    assert ins["promises"] == {s: sum(1 for p in promises if p["state"] == s) for s in ("open", "kept", "broken")}
    opens = sorted((p for p in promises if p["state"] == "open"), key=lambda p: p["promise_date"])[:4]
    assert [(p["loan_id"], p["promise_date"]) for p in ins["next_promises"]] == [(p["loan_id"], p["promise_date"]) for p in opens]


def test_insights_visits_cover_seven_ist_days_with_zeros_and_a_result_mix(client, officer, manager, far_future_loan):
    today = date(2031, 7, 10)
    log(client, officer, far_future_loan, "unreachable", at(date(2031, 7, 10), 9))
    log(client, officer, far_future_loan, "dispute", at(date(2031, 7, 10), 10))
    log(client, officer, far_future_loan, "paid", at(date(2031, 7, 8)), amount_received="100")
    log(client, officer, far_future_loan, "unreachable", at(date(2031, 7, 3)))   # 7 days back: outside
    log(client, officer, far_future_loan, "unreachable", at(date(2031, 7, 4), 0, 5))  # first IST day of the window
    pin_today(today)
    try:
        ins = client.get("/manager/insights", headers=manager).json()
    finally:
        unpin()
    days = ins["visits_by_day"]
    assert [d["day"] for d in days] == [f"2031-07-{n:02d}" for n in range(4, 11)]
    assert {d["day"]: d["count"] for d in days} == {"2031-07-04": 1, "2031-07-05": 0, "2031-07-06": 0, "2031-07-07": 0,
                                                    "2031-07-08": 1, "2031-07-09": 0, "2031-07-10": 2}
    assert ins["result_mix"] == {"paid": 1, "promise": 0, "unreachable": 2, "dispute": 1}


def test_insights_are_branch_scoped_and_need_a_manager(client, officer, manager, east, far_future_loan):
    log(client, officer, far_future_loan, "dispute", at(date(2031, 8, 5)))
    pin_today(date(2031, 8, 5))
    try:
        mine = client.get("/manager/insights", headers=manager).json()
        theirs = client.get("/manager/insights", headers=east).json()
    finally:
        unpin()
    assert mine["result_mix"]["dispute"] == 1 and theirs["result_mix"]["dispute"] == 0
    assert client.get("/manager/insights", headers=officer).status_code == 403
    assert client.get("/manager/insights").status_code == 401


def test_closed_loans_leave_the_chart_numbers(client, officer, manager):
    lid = new_loan(client, manager)
    before = client.get("/manager/insights", headers=manager).json()
    log(client, officer, lid, "paid", at(date(2031, 9, 1)), amount_received="60000")  # clears the whole loan
    after = client.get("/manager/insights", headers=manager).json()
    assert sum(after["bands"].values()) == sum(before["bands"].values()) - 1
    assert float(after["overdue_by_age"][0]["amount"]) == pytest.approx(float(before["overdue_by_age"][0]["amount"]) - 60000)
