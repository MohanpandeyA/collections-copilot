from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://localhost/collections_copilot"
    secret_key: str = "dev-only-change-me"
    field_enc_key: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-flash-latest"
    messaging_provider: str = "mock"
    cors_origins: str = "http://localhost:5173"
    promise_sweep_minutes: int = 30  # 0 turns the background sweep off

    @field_validator("database_url")
    @classmethod
    def _use_psycopg_driver(cls, url: str) -> str:
        # Hosted Postgres (Neon, Render) hands out plain postgres:// or postgresql:// URLs
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url[len(prefix):]
        return url


settings = Settings()
