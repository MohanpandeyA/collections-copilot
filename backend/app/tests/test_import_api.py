import pytest
from sqlalchemy import select

from app.core.database import SessionLocal
from app.models import Assignment, Loan, ScoreSnapshot
from app.tests.conftest import login

HEADER = "loan_id,borrower_name,phone,pincode,outstanding,dpd,last_payment_date\n"


def upload(client, headers, body, name="overdue.csv"):
    return client.post("/manager/imports", headers=headers,
                       files={"file": (name, body, "text/csv")})


def test_import_requires_manager(client, officer):
    assert upload(client, officer, HEADER).status_code == 403


def test_import_requires_login(client):
    assert client.post("/manager/imports", files={"file": ("a.csv", HEADER)}).status_code == 401


def test_import_loads_assigns_and_scores(client, manager):
    body = HEADER + (
        "LN-T1,Test One,9100000001,452001,120000,14,2026-10-25\n"
        "LN-T2,Test Two,9100000002,452003,90000,26,\n"
        "LN-T3,Bad Phone,123,452001,1000,5,\n"
    )
    res = upload(client, manager, body)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["loaded"] == 2 and data["rejected_count"] == 1
    assert data["rejected"][0] == {"row_number": 4, "loan_id": "LN-T3",
                                   "reason": "phone must be a 10-digit Indian mobile number"}
    assert data["assigned"] == 2

    with SessionLocal() as db:
        # pincode 452001 belongs to rahul, 452003 to neha, both in Indore Central
        a1 = db.scalar(select(Assignment).where(Assignment.loan_id == "LN-T1", Assignment.active))
        a2 = db.scalar(select(Assignment).where(Assignment.loan_id == "LN-T2", Assignment.active))
        assert a1.officer_id != a2.officer_id
        snap = db.scalar(select(ScoreSnapshot).where(ScoreSnapshot.loan_id == "LN-T2"))
        assert 0 <= snap.score <= 100 and len(snap.reasons) == 3


def test_reupload_updates_without_duplicating_assignment(client, manager):
    upload(client, manager, HEADER + "LN-T4,Test Four,9100000004,452001,50000,10,\n")
    res = upload(client, manager, HEADER + "LN-T4,Test Four,9100000004,452001,45000,11,\n")
    assert res.json()["loaded"] == 1 and res.json()["assigned"] == 0
    with SessionLocal() as db:
        loan = db.get(Loan, "LN-T4")
        assert loan.dpd == 11 and float(loan.outstanding) == 45000
        active = db.scalars(select(Assignment).where(Assignment.loan_id == "LN-T4", Assignment.active)).all()
        assert len(active) == 1


def test_manager_cannot_overwrite_other_branch_loan(client, manager):
    # LN-T5 is created by the east manager, then the central manager tries to take it over
    east = login(client, "manager_east")
    upload(client, east, HEADER + "LN-T5,East Loan,9100000005,452010,70000,8,\n")
    res = upload(client, manager, HEADER + "LN-T5,Hijack,9100000005,452001,1,1,\n")
    assert res.json()["loaded"] == 0
    assert "another branch" in res.json()["rejected"][0]["reason"]


def test_unknown_pincode_is_assigned_as_fallback(client, manager):
    res = upload(client, manager, HEADER + "LN-T6,Far Away,9100000006,999999,10000,3,\n")
    assert res.json()["fallback_count"] == 1


def test_bad_file_returns_400_with_message(client, manager):
    res = upload(client, manager, "loan_id,borrower_name\nLN-1,A\n")
    assert res.status_code == 400 and "Missing column" in res.json()["detail"]


def test_non_csv_binary_is_rejected(client, manager):
    res = client.post("/manager/imports", headers=manager,
                      files={"file": ("x.csv", b"\xff\xfe\x00bad", "text/csv")})
    assert res.status_code == 400


# ---- closing loans and roll-rate snapshots ------------------------------------------------

@pytest.fixture()
def keep_statuses():
    """close_missing closes whole branches, so put every loan's status back afterwards."""
    with SessionLocal() as db:
        before = dict(db.execute(select(Loan.loan_id, Loan.status)).all())
    yield
    with SessionLocal() as db:
        for loan in db.scalars(select(Loan)):
            if loan.loan_id in before:
                loan.status = before[loan.loan_id]
        db.commit()

def test_missing_loans_stay_open_by_default(client, manager):
    upload(client, manager, HEADER + "LN-C1,Close One,9100000011,452001,50000,10,\nLN-C2,Close Two,9100000012,452001,60000,11,\n")
    res = upload(client, manager, HEADER + "LN-C1,Close One,9100000011,452001,50000,10,\n")
    assert res.json()["closed"] == 0
    with SessionLocal() as db:
        assert db.get(Loan, "LN-C2").status == "open"


def test_close_missing_closes_only_loans_absent_from_the_file(client, manager, keep_statuses):
    upload(client, manager, HEADER + "LN-C3,Close Three,9100000013,452001,50000,10,\n")
    res = client.post("/manager/imports?close_missing=true", headers=manager,
                      files={"file": ("a.csv", HEADER + "LN-C4,Close Four,9100000014,452001,40000,9,\n", "text/csv")})
    assert res.status_code == 200 and res.json()["closed"] >= 1
    with SessionLocal() as db:
        assert db.get(Loan, "LN-C3").status == "closed"
        assert db.get(Loan, "LN-C4").status == "open"


def test_close_missing_does_not_close_a_loan_whose_row_was_rejected(client, manager, keep_statuses):
    upload(client, manager, HEADER + "LN-C5,Close Five,9100000015,452001,50000,10,\n")
    bad = HEADER + "LN-C5,Close Five,123,452001,50000,10,\nLN-C6,Close Six,9100000016,452001,1000,3,\n"
    client.post("/manager/imports?close_missing=true", headers=manager, files={"file": ("a.csv", bad, "text/csv")})
    with SessionLocal() as db:
        assert db.get(Loan, "LN-C5").status == "open"


def test_close_missing_with_no_valid_rows_closes_nothing(client, manager, keep_statuses):
    upload(client, manager, HEADER + "LN-C7,Close Seven,9100000017,452001,50000,10,\n")
    res = client.post("/manager/imports?close_missing=true", headers=manager,
                      files={"file": ("a.csv", HEADER + "LN-C8,Bad,123,452001,1,1,\n", "text/csv")})
    assert res.json()["closed"] == 0
    with SessionLocal() as db:
        assert db.get(Loan, "LN-C7").status == "open"


def test_close_missing_never_touches_another_branch(client, manager, keep_statuses):
    from app.tests.conftest import login
    east = login(client, "manager_east")
    upload(client, east, HEADER + "LN-E1,East One,9100000021,452010,50000,10,\n")
    client.post("/manager/imports?close_missing=true", headers=manager,
                files={"file": ("a.csv", HEADER + "LN-C9,Nine,9100000019,452001,1000,3,\n", "text/csv")})
    with SessionLocal() as db:
        assert db.get(Loan, "LN-E1").status == "open"


def test_import_saves_month_start_snapshot_for_new_loans_once(client, manager):
    from app.models import LoanSnapshot
    upload(client, manager, HEADER + "LN-S1,Snap One,9100000031,452001,50000,40,\n")
    upload(client, manager, HEADER + "LN-S1,Snap One,9100000031,452001,50000,41,\n")
    with SessionLocal() as db:
        snaps = db.scalars(select(LoanSnapshot).where(LoanSnapshot.loan_id == "LN-S1")).all()
        assert len(snaps) == 1
