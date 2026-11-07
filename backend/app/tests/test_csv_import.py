from decimal import Decimal

from app.domain.csv_import import parse_csv

HEADER = "loan_id,borrower_name,phone,pincode,outstanding,dpd,last_payment_date\n"


def test_valid_row_is_parsed():
    res = parse_csv(HEADER + "LN-1,Asha Rao,9000000010,452001,150000.50,12,2026-10-20\n")
    assert res.rejected == []
    row = res.rows[0]
    assert row.loan_id == "LN-1"
    assert row.outstanding == Decimal("150000.50")
    assert row.dpd == 12
    assert row.last_payment_date.isoformat() == "2026-10-20"


def test_last_payment_date_is_optional():
    res = parse_csv(HEADER + "LN-2,Ravi,9000000011,452001,1000,5,\n")
    assert res.rows[0].last_payment_date is None


def test_bad_rows_are_rejected_with_row_number_and_reason():
    csv = HEADER + (
        "LN-3,Ok Name,9000000012,452001,1000,5,\n"      # row 2: fine
        "LN-4,No Phone,12345,452001,1000,5,\n"           # row 3: bad phone
        "LN-5,Bad Pin,9000000013,45,1000,5,\n"           # row 4: bad pincode
        "LN-6,Neg,9000000014,452001,-5,5,\n"             # row 5: negative amount
        "LN-7,Words,9000000015,452001,abc,5,\n"          # row 6: amount not a number
        "LN-8,Dpd,9000000016,452001,1000,-1,\n"          # row 7: negative dpd
        ",Blank id,9000000017,452001,1000,5,\n"          # row 8: missing id
    )
    res = parse_csv(csv)
    assert [r.loan_id for r in res.rows] == ["LN-3"]
    assert [r.row_number for r in res.rejected] == [3, 4, 5, 6, 7, 8]
    assert all(r.reason for r in res.rejected)


def test_duplicate_loan_id_in_file_is_rejected():
    csv = HEADER + "LN-9,A,9000000018,452001,100,5,\nLN-9,B,9000000019,452001,200,6,\n"
    res = parse_csv(csv)
    assert len(res.rows) == 1
    assert "duplicate" in res.rejected[0].reason.lower()


def test_missing_required_column_rejects_whole_file():
    res = parse_csv("loan_id,borrower_name\nLN-1,Asha\n")
    assert res.rows == []
    assert "missing column" in res.file_error.lower()


def test_empty_file_gives_file_error():
    assert parse_csv("").file_error
