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


settings = Settings()
