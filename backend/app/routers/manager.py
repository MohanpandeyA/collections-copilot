from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_manager
from app.domain.csv_import import parse_csv
from app.schemas.imports import ImportSummary
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
    return run_import(db, manager, parsed, date.today())
