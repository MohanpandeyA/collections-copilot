"""Validate the daily overdue CSV. Pure: no database, no framework.

Bad rows are collected with a row number and a reason instead of failing the
whole file, so the manager can fix just those rows and re-upload.
"""
import csv
import io
import re
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation

REQUIRED = ["loan_id", "borrower_name", "phone", "pincode", "outstanding", "dpd"]
OPTIONAL = ["last_payment_date"]
MAX_ROWS = 5000

PHONE_RE = re.compile(r"^[6-9]\d{9}$")  # Indian mobile: 10 digits starting 6-9
PIN_RE = re.compile(r"^\d{6}$")


@dataclass(frozen=True)
class LoanRow:
    loan_id: str
    borrower_name: str
    phone: str
    pincode: str
    outstanding: Decimal
    dpd: int
    last_payment_date: date | None


@dataclass(frozen=True)
class RejectedRow:
    row_number: int  # 1 is the header, so the first data row is 2
    loan_id: str
    reason: str


@dataclass
class ParseResult:
    rows: list[LoanRow] = field(default_factory=list)
    rejected: list[RejectedRow] = field(default_factory=list)
    file_error: str | None = None


def _parse_row(raw: dict) -> LoanRow:
    """Build a LoanRow or raise ValueError with a human-readable reason."""
    get = lambda k: (raw.get(k) or "").strip()  # noqa: E731

    loan_id = get("loan_id")
    if not loan_id:
        raise ValueError("loan_id is missing")
    name = get("borrower_name")
    if not name:
        raise ValueError("borrower_name is missing")
    phone = get("phone")
    if not PHONE_RE.match(phone):
        raise ValueError("phone must be a 10-digit Indian mobile number")
    pincode = get("pincode")
    if not PIN_RE.match(pincode):
        raise ValueError("pincode must be 6 digits")
    try:
        outstanding = Decimal(get("outstanding"))
    except InvalidOperation:
        raise ValueError("outstanding is not a number") from None
    if not outstanding.is_finite() or outstanding < 0:
        raise ValueError("outstanding must be zero or more")
    try:
        dpd = int(get("dpd"))
    except ValueError:
        raise ValueError("dpd is not a whole number") from None
    if dpd < 0:
        raise ValueError("dpd must be zero or more")
    last = get("last_payment_date")
    try:
        last_date = date.fromisoformat(last) if last else None
    except ValueError:
        raise ValueError("last_payment_date must be YYYY-MM-DD") from None
    return LoanRow(loan_id, name, phone, pincode, outstanding, dpd, last_date)


def parse_csv(text: str) -> ParseResult:
    result = ParseResult()
    if not text.strip():
        result.file_error = "File is empty"
        return result

    reader = csv.DictReader(io.StringIO(text))
    missing = [c for c in REQUIRED if c not in (reader.fieldnames or [])]
    if missing:
        result.file_error = "Missing column: " + ", ".join(missing)
        return result

    seen: set[str] = set()
    for number, raw in enumerate(reader, start=2):
        if number - 1 > MAX_ROWS:
            result.file_error = f"Too many rows (limit {MAX_ROWS})"
            return result
        loan_id = (raw.get("loan_id") or "").strip()
        try:
            row = _parse_row(raw)
            if row.loan_id in seen:
                raise ValueError("duplicate loan_id in this file")
        except ValueError as err:
            result.rejected.append(RejectedRow(number, loan_id, str(err)))
            continue
        seen.add(row.loan_id)
        result.rows.append(row)
    return result
