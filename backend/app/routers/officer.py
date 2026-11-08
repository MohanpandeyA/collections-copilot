from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_now, require_officer
from app.models import User
from app.schemas.officer import LoanDetailOut, LoanRowOut
from app.services import officer_service

router = APIRouter(prefix="/my", tags=["officer"])


@router.get("/loans", response_model=list[LoanRowOut])
def list_loans(officer: User = Depends(require_officer), db: Session = Depends(get_db),
               now: datetime = Depends(get_now)):
    return officer_service.my_loans(db, officer, now)


@router.get("/loans/{loan_id}", response_model=LoanDetailOut)
def loan_detail(loan_id: str, officer: User = Depends(require_officer), db: Session = Depends(get_db)):
    detail = officer_service.my_loan_detail(db, officer, loan_id)
    if detail is None:
        # 404 for both "missing" and "not yours", so the API never confirms a loan exists
        raise HTTPException(404, "Loan not found")
    return detail
