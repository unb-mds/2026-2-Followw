import re
from pathlib import Path

DOCS_DIR_CANDIDATES = [
    Path(__file__).resolve().parents[3] / "docs",
    Path(__file__).resolve().parents[1] / "docs",
    Path("docs"),
]

DOC_FILES = [
    "arquitetura.md",
    "segurança.md",
    "cache-e-sincronizacao.md",
    "rate-limit.md",
    "offline.md",
    "recommendations.md",
    "observability.md",
    "requisitos.md",
]

RAW_ASSET_BASE = (
    "https://raw.githubusercontent.com/unb-mds/2026-2-Followw/main/docs/assets/"
)


def get_docs_dir() -> Path | None:
    for candidate in DOCS_DIR_CANDIDATES:
        if candidate.is_dir():
            return candidate
    return None


def get_full_description(base_description: str) -> str:
    docs_dir = get_docs_dir()
    if not docs_dir:
        return base_description

    sections = [base_description.strip()]
    for filename in DOC_FILES:
        file_path = docs_dir / filename
        if not file_path.is_file():
            continue
        content = file_path.read_text(encoding="utf-8").strip()
        # Normaliza links de imagens para visualização web nos clientes OpenAPI
        content = re.sub(
            r"\((?:\.\./)?assets/([^)]+)\)", rf"({RAW_ASSET_BASE}\1)", content
        )
        sections.append(content)

    return "\n\n---\n\n".join(sections)
