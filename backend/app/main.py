import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine
from app.routers import auth, manager, officer, outcomes, reminders
from app.services.promise_service import sweep_job


async def sweep_loop(minutes: int) -> None:
    """Runs the promise sweep now and then every `minutes`. The sweep is idempotent, so two
    instances running it at once is harmless."""
    while True:
        await asyncio.to_thread(sweep_job)
        await asyncio.sleep(minutes * 60)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(sweep_loop(settings.promise_sweep_minutes)) if settings.promise_sweep_minutes > 0 else None
    try:
        yield
    finally:
        if task:
            task.cancel()


app = FastAPI(title="Collections Copilot API", lifespan=lifespan)

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


@app.api_route("/health", methods=["GET", "HEAD"])  # HEAD because some uptime pingers use it
def health():
    with engine.connect() as conn:
        conn.execute(text("select 1"))
    return {"status": "ok"}
