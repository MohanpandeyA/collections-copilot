"""The promise sweep: shared by the manager's button and the background job."""
import asyncio
from datetime import date, datetime

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.core.database import SessionLocal
from app.domain.contact_window import IST
from app.main import app, lifespan
from app.models import Loan, Promise, ScoreSnapshot
from app.services import promise_service
from app.tests.test_manager_api import new_loan


@pytest.fixture(autouse=True)
def keep_promise_states():
    """The job sweeps every branch, so put the seeded promises back for the other test files."""
    with SessionLocal() as db:
        before = {p.id: p.state for p in db.scalars(select(Promise))}
    yield
    with SessionLocal() as db:
        for p in db.scalars(select(Promise)):
            if p.id in before:
                p.state = before[p.id]
        db.commit()


def _promise(lid, day, state="open"):
    with SessionLocal() as db:
        db.add(Promise(loan_id=lid, promise_date=day, amount=1000, state=state))
        db.commit()


def _state(lid):
    with SessionLocal() as db:
        return db.scalar(select(Promise.state).where(Promise.loan_id == lid))


def test_job_breaks_past_due_promises_in_every_branch_and_leaves_the_rest(client, manager):
    past, today_, future = new_loan(client, manager), new_loan(client, manager), new_loan(client, manager)
    _promise(past, date(2026, 11, 1))
    _promise(today_, date(2026, 11, 8))     # due today: still time to pay
    _promise(future, date(2026, 11, 20))
    n = promise_service.sweep_job(datetime(2026, 11, 8, 9, tzinfo=IST))
    assert n >= 1
    assert (_state(past), _state(today_), _state(future)) == ("broken", "open", "open")


def test_job_is_safe_to_repeat(client, manager):
    lid = new_loan(client, manager)
    _promise(lid, date(2026, 11, 1))
    now = datetime(2026, 11, 8, 9, tzinfo=IST)
    promise_service.sweep_job(now)
    assert promise_service.sweep_job(now) == 0
    assert _state(lid) == "broken"


def test_broken_promise_rescoring_is_saved_for_the_day(client, manager):
    lid = new_loan(client, manager)
    _promise(lid, date(2026, 11, 1))
    promise_service.sweep_job(datetime(2026, 11, 8, 9, tzinfo=IST))
    with SessionLocal() as db:
        snap = db.scalar(select(ScoreSnapshot).where(ScoreSnapshot.loan_id == lid, ScoreSnapshot.scored_on == date(2026, 11, 8)))
    assert snap is not None
    assert any(r["text"].startswith("Broke a promise to pay") for r in snap.reasons)


def test_closed_loans_are_not_rescored(client, manager):
    lid = new_loan(client, manager)
    _promise(lid, date(2026, 11, 1))
    with SessionLocal() as db:
        db.get(Loan, lid).status = "closed"
        db.commit()
    promise_service.sweep_job(datetime(2026, 11, 9, 9, tzinfo=IST))  # a later day than the import's own score
    with SessionLocal() as db:
        assert db.scalar(select(ScoreSnapshot).where(ScoreSnapshot.loan_id == lid, ScoreSnapshot.scored_on == date(2026, 11, 9))) is None
    assert _state(lid) == "broken"


def test_a_failing_run_is_swallowed_so_the_loop_keeps_going(monkeypatch):
    def boom(*_a, **_k):
        raise RuntimeError("db down")
    monkeypatch.setattr(promise_service, "sweep_due", boom)
    assert promise_service.sweep_job() == 0


def test_background_loop_starts_with_the_app_and_stops_with_it(monkeypatch):
    calls = []
    monkeypatch.setattr("app.main.sweep_job", lambda: calls.append(1))
    monkeypatch.setattr(settings, "promise_sweep_minutes", 60)

    async def run():
        async with lifespan(app):
            await asyncio.sleep(0.2)
        return len(calls)

    assert asyncio.run(run()) == 1


def test_background_loop_can_be_switched_off(monkeypatch):
    calls = []
    monkeypatch.setattr("app.main.sweep_job", lambda: calls.append(1))
    monkeypatch.setattr(settings, "promise_sweep_minutes", 0)

    async def run():
        async with lifespan(app):
            await asyncio.sleep(0.1)

    asyncio.run(run())
    assert calls == []
