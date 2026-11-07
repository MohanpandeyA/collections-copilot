from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import current_user
from app.core.security import create_token, verify_password
from app.models import User
from app.schemas.auth import TokenOut, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

# One message for both failures, so the API never reveals which usernames exist.
BAD_LOGIN = "Incorrect username or password"


@router.post("/login", response_model=TokenOut)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == form.username))
    if user is None or not verify_password(form.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, BAD_LOGIN)
    return TokenOut(access_token=create_token(user.id, user.role), role=user.role, language=user.language)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user
