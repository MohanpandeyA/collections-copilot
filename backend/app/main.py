from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine
from app.routers import auth, manager, officer, outcomes, reminders

app = FastAPI(title="Collections Copilot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth.router)
app.include_router(manager.router)
app.include_router(officer.router)
app.include_router(outcomes.router)
app.include_router(reminders.router)


@app.get("/health")
def health():
    with engine.connect() as conn:
        conn.execute(text("select 1"))
    return {"status": "ok"}
