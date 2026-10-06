import re

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"

    cors_origins: list[str] = ["https://followw.app"]
    cookie_domain: str | None = None

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

    @field_validator("cookie_domain")
    @classmethod
    def validate_cookie_domain(cls, value: str | None) -> str | None:
        if value is None or not (value := value.strip()):
            return None
        domain = value.removeprefix(".")
        if len(domain) > 253 or any(
            re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?", label)
            is None
            for label in domain.split(".")
        ):
            raise ValueError(
                "Use apenas o domínio, sem URL, porta, caminho ou comentário."
            )
        return value


settings = Settings()
