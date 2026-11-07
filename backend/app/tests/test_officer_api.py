from app.tests.conftest import login


def test_list_requires_officer(client, manager):
    assert client.get("/my/loans", headers=manager).status_code == 403
    assert client.get("/my/loans").status_code == 401


def test_officer_sees_only_own_loans(client):
    h = login(client, "imran")
    ids = [l["loan_id"] for l in client.get("/my/loans", headers=h).json()]
    assert "LN-11930" in ids
    assert "LN-10293" not in ids  # rahul's loan


def test_list_row_has_name_dpd_band_and_no_phone(client, officer):
    rows = client.get("/my/loans", headers=officer).json()
    assert rows
    row = rows[0]
    assert set(row) == {"loan_id", "borrower_name", "outstanding", "dpd", "band", "score"}  # still no phone
    assert row["band"] in {"high", "medium", "low"}


def test_list_is_sorted_by_score_highest_first(client, officer):
    scores = [l["score"] for l in client.get("/my/loans", headers=officer).json()]
    assert scores == sorted(scores, reverse=True)


def test_detail_of_own_loan_has_reasons_and_promise(client, officer):
    res = client.get("/my/loans/LN-10293", headers=officer)
    assert res.status_code == 200
    d = res.json()
    assert d["phone"] == "9000000001" and d["pincode"] == "452001"
    assert len(d["reasons"]) == 3
    assert d["promise"]["state"] == "open" and d["promise"]["promise_date"] == "2026-11-05"


def test_detail_of_another_officers_loan_is_404(client, officer):
    # LN-11930 is imran's. 404, not 403, so the API does not confirm it exists.
    assert client.get("/my/loans/LN-11930", headers=officer).status_code == 404


def test_detail_of_unknown_loan_is_404(client, officer):
    assert client.get("/my/loans/NOPE", headers=officer).status_code == 404


def test_broken_promise_loan_shows_broken_reason(client):
    h = login(client, "imran")
    d = client.get("/my/loans/LN-11930", headers=h).json()
    assert d["promise"]["state"] == "broken"
    assert any(r["code"] == "promise" for r in d["reasons"])



def test_list_rows_carry_the_outstanding_amount(client, officer):
    rows = client.get("/my/loans", headers=officer).json()
    assert all(float(r["outstanding"]) > 0 for r in rows)
