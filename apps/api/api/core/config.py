from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../../.env"), extra="ignore")

    environment: str = "development"
    docs_url: str = "https://followw.mintlify.site"

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
    rate_limit_requests: int = Field(default=600, gt=0)
    rate_limit_login_requests: int = Field(default=30, gt=0)
    rate_limit_window_seconds: int = Field(default=60, gt=0)
    # Assina o IP original que o SSR encaminha; sem ele, o encaminhamento é ignorado.
    rate_limit_secret_key: str | None = Field(default=None, min_length=32)

    @field_validator("rate_limit_secret_key", mode="before")
    @classmethod
    def _empty_as_none(cls, value: str | None) -> str | None:
        return value or None


settings = Settings()
