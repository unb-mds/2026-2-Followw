from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"

    cors_origins: list[str] = ["https://followw.app"]

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

    # REST do Upstash; sem URL ou token, Redis e rate limit ficam desativados.
    upstash_redis_rest_url: str | None = None
    upstash_redis_rest_token: str | None = None
    redis_timeout_seconds: float = Field(default=1, gt=0, allow_inf_nan=False)

    # Cotas por IP em janela fixa; login tem uma cota própria, mais restrita.
    rate_limit_requests: int = Field(default=120, gt=0)
    rate_limit_login_requests: int = Field(default=10, gt=0)
    rate_limit_window_seconds: int = Field(default=60, gt=0)


settings = Settings()
