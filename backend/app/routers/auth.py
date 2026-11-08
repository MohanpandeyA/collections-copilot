from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import current_user
from app.core.ratelimit import client_ip, login_limiter
from app.core.security import create_token, verify_password
from app.models import User
from app.schemas.auth import TokenOut, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

# One message for both failures, so the API never reveals which usernames exist.
BAD_LOGIN = "Incorrect username or password"


@router.post("/login", response_model=TokenOut)
def login(request: Request, form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    who = client_ip(request)
    wait = login_limiter.retry_after(who, form.username)
    if wait:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many failed attempts. Try again later.",
                            headers={"Retry-After": str(wait)})
    user = db.scalar(select(User).where(User.username == form.username))
    if user is None or not verify_password(form.password, user.password_hash):
        login_limiter.record_failure(who, form.username)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, BAD_LOGIN)
    login_limiter.clear(who, form.username)
    return TokenOut(access_token=create_token(user.id, user.role), role=user.role, language=user.language)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user
