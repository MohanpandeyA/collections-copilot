from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_now, require_officer
from app.models import User
from app.schemas.outcomes import (
    ContactAttemptIn, ContactAttemptOut, OutcomeBatchIn, OutcomeBatchOut,
)
from app.services import outcome_service

router = APIRouter(tags=["outcomes"])


@router.post("/outcomes/batch", response_model=OutcomeBatchOut)
def outcomes_batch(body: OutcomeBatchIn, officer: User = Depends(require_officer),
                   db: Session = Depends(get_db)):
    return OutcomeBatchOut(results=outcome_service.record_batch(db, officer, body.items))


@router.post("/contact-attempts", response_model=ContactAttemptOut)
def contact_attempt(body: ContactAttemptIn, officer: User = Depends(require_officer),
                    db: Session = Depends(get_db), now: datetime = Depends(get_now)):
    outcome = outcome_service.record_contact_attempt(db, officer, body.loan_id, body.channel, now)
    if outcome is None:
        raise HTTPException(404, "Loan not found")
    return ContactAttemptOut(allowed=outcome[0], block_reason=outcome[1])
