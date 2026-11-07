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
