from fastapi import APIRouter, Depends

from app.core.deps import require_manager
from app.models import User

router = APIRouter(prefix="/manager", tags=["manager"])


@router.get("/ping")
def ping(user: User = Depends(require_manager)):
    return {"ok": True, "branch_id": user.branch_id}
