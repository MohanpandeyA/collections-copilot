from datetime import date

from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_now, require_manager
from app.domain.csv_import import parse_csv
from app.domain.contact_window import IST
from app.schemas.imports import ImportSummary
from app.schemas.manager import (
    ActivityPage, DashboardOut, InsightsOut, ManagerLoanRow, PromiseRow, RankIn, SweepOut,
)
from app.services import manager_service
from app.services.import_service import run_import
from app.models import User

router = APIRouter(prefix="/manager", tags=["manager"])


@router.get("/ping")
def ping(user: User = Depends(require_manager)):
    return {"ok": True, "branch_id": user.branch_id}


MAX_BYTES = 2 * 1024 * 1024  # 5,000 rows is well under 1 MB; this stops abuse


@router.post("/imports", response_model=ImportSummary)
async def import_overdue(
    file: UploadFile = File(...),
    close_missing: bool = Query(False),
    manager: User = Depends(require_manager),
    db: Session = Depends(get_db),
):
    raw = await file.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, "File is larger than 2 MB")
    try:
        text = raw.decode("utf-8-sig")  # utf-8-sig also strips the BOM Excel adds
    except UnicodeDecodeError:
        raise HTTPException(400, "File is not valid UTF-8 text") from None
    parsed = parse_csv(text)
    if parsed.file_error:
        raise HTTPException(400, parsed.file_error)
    return run_import(db, manager, parsed, date.today(), close_missing=close_missing)


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(manager: User = Depends(require_manager), db: Session = Depends(get_db)):
    return manager_service.dashboard(db, manager)


@router.get("/promises", response_model=list[PromiseRow])
def promises(state: str | None = Query(None, pattern="^(open|kept|broken)$"),
             manager: User = Depends(require_manager), db: Session = Depends(get_db)):
    return manager_service.promises(db, manager, state)


@router.post("/promises/sweep", response_model=SweepOut)
def sweep(manager: User = Depends(require_manager), db: Session = Depends(get_db),
          now: datetime = Depends(get_now)):
    return SweepOut(marked_broken=manager_service.sweep_promises(db, manager, now.astimezone(IST).date()))


@router.get("/activity", response_model=ActivityPage)
def activity(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
             date_from: date | None = None, date_to: date | None = None,
             manager: User = Depends(require_manager), db: Session = Depends(get_db)):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(422, "date_from is after date_to")
    return manager_service.activity(db, manager, limit, offset, date_from, date_to)


@router.get("/insights", response_model=InsightsOut)
def insights(manager: User = Depends(require_manager), db: Session = Depends(get_db),
             now: datetime = Depends(get_now)):
    return manager_service.insights(db, manager, now.astimezone(IST).date())


@router.get("/loans", response_model=list[ManagerLoanRow])
def loans(manager: User = Depends(require_manager), db: Session = Depends(get_db)):
    return manager_service.branch_loans(db, manager)


@router.put("/loans/{loan_id}/rank")
def set_rank(loan_id: str, body: RankIn, manager: User = Depends(require_manager),
             db: Session = Depends(get_db)):
    if not manager_service.set_rank(db, manager, loan_id, body.rank):
        raise HTTPException(404, "Loan not found")
    return {"loan_id": loan_id, "rank": body.rank}
