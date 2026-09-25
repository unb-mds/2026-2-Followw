from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"

    database_url: str

    # Deriva as chaves que cifram os cookies (JWE) e os jobs.
    jwt_secret_key: str = Field(min_length=32)
    access_token_expire_minutes: int = 40
    refresh_token_expire_minutes: int = 60 * 24 * 14  # 14 days

    # URL pública da API: o QStash entrega os jobs em `{public_url}/jobs`.
    public_url: str
    qstash_url: str | None = None
    qstash_token: str
    qstash_current_signing_key: str
    qstash_next_signing_key: str


settings = Settings()
