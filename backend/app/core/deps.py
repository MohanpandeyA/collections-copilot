"""FastAPI dependencies: current user and role guards."""
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_token
from app.models import User

oauth2 = OAuth2PasswordBearer(tokenUrl="/auth/login")


def current_user(token: str = Depends(oauth2), db: Session = Depends(get_db)) -> User:
    payload = decode_token(token)
    user = db.get(User, int(payload["sub"])) if payload else None
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token",
                            headers={"WWW-Authenticate": "Bearer"})
    return user


def require_role(role: str):
    def guard(user: User = Depends(current_user)) -> User:
        if user.role != role:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have access to this")
        return user
    return guard


require_officer = require_role("officer")
require_manager = require_role("manager")


def get_now() -> datetime:
    """The server clock. A dependency so tests can pin the time."""
    return datetime.now(timezone.utc)
