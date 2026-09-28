"""Gera a documentação estática em apps/docs/dist: `uv run apps/docs/build.py`."""

import os
from pathlib import Path

# O build só lê o schema da app: não abre banco nem QStash, então valores fictícios bastam.
for key, value in {
    "DATABASE_URL": "postgresql+asyncpg://docs@localhost/docs",
    "JWT_SECRET_KEY": "somente-para-gerar-a-documentacao-estatica",
    "PUBLIC_URL": "https://followw.app",
    "QSTASH_TOKEN": "docs",
    "QSTASH_CURRENT_SIGNING_KEY": "docs",
    "QSTASH_NEXT_SIGNING_KEY": "docs",
}.items():
    os.environ.setdefault(key, value)

from api.docs import build_static

if __name__ == "__main__":
    out = Path(__file__).parent / "dist"
    build_static(out)
    print(f"Documentação gerada em {out}")
