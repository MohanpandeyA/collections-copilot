from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_now, require_officer
from app.models import User
from app.schemas.reminders import DraftIn, DraftOut, SendIn, SendOut
from app.services import reminder_service as svc
from app.services.llm import Llm, get_llm
from app.services.messaging import Gateway, gateway_dep

router = APIRouter(prefix="/reminders", tags=["reminders"])


@router.post("/draft", response_model=DraftOut)
def draft(body: DraftIn, officer: User = Depends(require_officer), db: Session = Depends(get_db),
          llm: Llm | None = Depends(get_llm), now: datetime = Depends(get_now)):
    try:
        return svc.create_draft(db, officer, body.loan_id, body.language, body.use_ai, llm, now)
    except svc.NotFound:
        raise HTTPException(404, "Loan not found") from None


@router.post("/{draft_id}/send", response_model=SendOut)
def send(draft_id: int, body: SendIn, officer: User = Depends(require_officer),
         db: Session = Depends(get_db), gateway: Gateway = Depends(gateway_dep),
         now: datetime = Depends(get_now)):
    try:
        draft_row, message_id, blocked = svc.send_draft(db, officer, draft_id, body.channel, gateway, now)
    except svc.NotFound:
        raise HTTPException(404, "Reminder not found") from None
    except svc.NotSendable as err:
        raise HTTPException(409, str(err)) from None
    if blocked:
        raise HTTPException(409, blocked)
    return SendOut(id=draft_row.id, state=draft_row.state, message_id=message_id)
