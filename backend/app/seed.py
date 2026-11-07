"""Load fake sample data. Run: python -m app.seed

All names, phones and amounts are invented. The three brief loans are included
so the demo matches the client's sample data. Re-running resets the tables.
"""
import random
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import bcrypt
from sqlalchemy import text

from app import models as m
from app.core.database import Base, SessionLocal, engine
from app.services.scoring_service import score_loans

DEMO_PASSWORD = "demo123"  # demo accounts only, shown in deployment.md
TODAY = date(2026, 11, 7)
random.seed(42)  # reproducible demo data

BRANCHES = ["Indore Central", "Indore East"]
OFFICERS = [
    # username, name, branch, pincodes
    ("rahul", "Rahul Chouhan", "Indore Central", ["452001", "452002"]),
    ("neha", "Neha Solanki", "Indore Central", ["452003"]),
    ("imran", "Imran Qureshi", "Indore Central", ["452004"]),
    ("vikas", "Vikas Patidar", "Indore East", ["452010", "452011"]),
    ("sunita", "Sunita Verma", "Indore East", ["452012"]),
    ("arjun", "Arjun Meena", "Indore East", ["452013"]),
]
MANAGERS = [
    ("manager_central", "Priya Jain", "Indore Central"),
    ("manager_east", "Deepak Sharma", "Indore East"),
]
TEMPLATES = [
    ("payment_reminder", "en", "Dear {name}, your loan payment of Rs {amount} was due on {date}. Please pay at the earliest.", True),
    ("payment_reminder", "hi", "प्रिय {name}, आपकी ऋण किस्त ₹{amount} {date} को देय थी। कृपया शीघ्र भुगतान करें।", True),
    ("promise_reminder", "en", "Dear {name}, you promised to pay Rs {amount} by {date}. Kindly keep your promise.", True),
    ("promise_reminder", "hi", "प्रिय {name}, आपने {date} तक ₹{amount} देने का वादा किया था। कृपया अपना वादा निभाएँ।", True),
]
# The three sample loans from the client brief (Company B/C/D are fictional labels)
SAMPLE_LOANS = [
    ("LN-10293", "Company B (packaging unit)", "9000000001", "452001", "Indore Central", "640000", 12, date(2026, 11, 5), "rahul"),
    ("LN-10871", "Company C (fertiliser shop)", "9000000002", "452003", "Indore Central", "310000", 27, None, "neha"),
    ("LN-11930", "Company D (printing press)", "9000000003", "452004", "Indore Central", "220000", 19, date(2026, 10, 31), "imran"),
]
FIRST = ["Ramesh", "Sunil", "Anita", "Kiran", "Mahesh", "Pooja", "Ravi", "Sanjay", "Geeta", "Manoj", "Asha", "Nitin"]
BUSINESS = ["garment unit", "kirana store", "dairy farm", "auto parts shop", "tailoring unit", "flour mill", "steel fabrication", "medical store"]


def build_generated_loans(branch_pincodes, officer_by_pin):
    """About 30 extra overdue loans with varied DPD, amounts and promise history."""
    rows = []
    for i in range(30):
        branch, pins = random.choice(list(branch_pincodes.items()))
        pin = random.choice(pins)
        dpd = random.randint(1, 45)
        amount = Decimal(random.randrange(50_000, 900_000, 5_000))
        name = f"{random.choice(FIRST)} {random.choice(BUSINESS).title()}"
        last_pay = TODAY - timedelta(days=dpd + random.randint(20, 40))
        rows.append((f"LN-{11000 + i}", name, f"90000{10000 + i}", pin, branch, amount, dpd, last_pay, officer_by_pin.get(pin)))
    return rows


def reset(db):
    for table in reversed(Base.metadata.sorted_tables):
        db.execute(text(f'TRUNCATE TABLE "{table.name}" RESTART IDENTITY CASCADE'))


def main():
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        reset(db)
        pw_hash = bcrypt.hashpw(DEMO_PASSWORD.encode(), bcrypt.gensalt()).decode()

        branches = {name: m.Branch(name=name) for name in BRANCHES}
        db.add_all(branches.values())
        db.flush()

        users = {}
        for username, name, branch, pins in OFFICERS:
            u = m.User(username=username, password_hash=pw_hash, full_name=name, role="officer",
                       branch_id=branches[branch].id, pincodes=pins)
            users[username] = u
        for username, name, branch in MANAGERS:
            u = m.User(username=username, password_hash=pw_hash, full_name=name, role="manager",
                       branch_id=branches[branch].id, pincodes=[])
            users[username] = u
        db.add_all(users.values())
        db.flush()

        db.add_all(m.ReminderTemplate(code=c, language=lang, body=b, approved=a) for c, lang, b, a in TEMPLATES)

        batch = m.ImportBatch(uploaded_by=users["manager_central"].id, rows_ok=0, rows_rejected=0)
        db.add(batch)
        db.flush()

        officer_by_pin = {}
        branch_pins = {}
        for username, _, branch, pins in OFFICERS:
            for p in pins:
                officer_by_pin[p] = users[username].id
                branch_pins.setdefault(branch, []).append(p)

        loan_rows = [
            (lid, name, phone, pin, branches[br].id, Decimal(amt), dpd, lp, users[off].id)
            for lid, name, phone, pin, br, amt, dpd, lp, off in SAMPLE_LOANS
        ]
        loan_rows += [
            (lid, name, phone, pin, branches[br].id, amt, dpd, lp, off)
            for lid, name, phone, pin, br, amt, dpd, lp, off in build_generated_loans(branch_pins, officer_by_pin)
        ]

        for lid, name, phone, pin, branch_id, amt, dpd, lp, officer_id in loan_rows:
            db.add(m.Loan(loan_id=lid, borrower_name=name, phone=phone, pincode=pin, branch_id=branch_id,
                          outstanding=amt, dpd=dpd, last_payment_date=lp, batch_id=batch.id))
        db.flush()
        for lid, *_rest, officer_id in loan_rows:
            db.add(m.Assignment(loan_id=lid, officer_id=officer_id, active=True))

        # Broken promise on LN-11930 and an open promise on LN-10293, from the brief
        officer_neha = users["neha"].id
        db.add(m.Outcome(client_id=uuid.UUID("00000000-0000-4000-8000-000000000001"), loan_id="LN-11930",
                         officer_id=users["imran"].id, result="promise",
                         occurred_at=datetime(2026, 10, 25, 11, 0, tzinfo=timezone.utc), note="Will pay after 31 Oct"))
        db.flush()
        db.add(m.Promise(loan_id="LN-11930", outcome_id=uuid.UUID("00000000-0000-4000-8000-000000000001"),
                         promise_date=date(2026, 10, 31), amount=Decimal("50000"), state="broken"))
        db.add(m.Promise(loan_id="LN-10293", promise_date=date(2026, 11, 5), amount=Decimal("100000"), state="open"))
        db.flush()
        score_loans(db, [r[0] for r in loan_rows], TODAY)
        db.commit()
        print(f"Seeded: {len(BRANCHES)} branches, {len(users)} users, {len(loan_rows)} loans, {len(TEMPLATES)} templates")
    finally:
        db.close()


if __name__ == "__main__":
    main()
