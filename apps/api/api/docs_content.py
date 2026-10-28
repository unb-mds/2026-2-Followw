import os
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import URLError
from urllib.parse import quote
from urllib.request import urlopen

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
    candidates = [
        *(parent / "docs" for parent in Path(__file__).resolve().parents),
        *(parent / "docs" for parent in Path.cwd().resolve().parents),
        Path.cwd().resolve() / "docs",
    ]
    for candidate in candidates:
        if (candidate / "arquitetura.md").is_file():
            return candidate
    return None


def _get_raw_docs_bases() -> list[str]:
    owner = os.getenv("VERCEL_GIT_REPO_OWNER", "unb-mds")
    repo = os.getenv("VERCEL_GIT_REPO_SLUG", "2026-2-Followw")
    sha = os.getenv("VERCEL_GIT_COMMIT_SHA")
    ref = os.getenv("VERCEL_GIT_COMMIT_REF")

    bases: list[str] = []
    if sha:
        bases.append(f"https://raw.githubusercontent.com/{owner}/{repo}/{sha}/docs/")
    if ref:
        encoded_ref = quote(ref, safe="")
        bases.append(
            f"https://raw.githubusercontent.com/{owner}/{repo}/{encoded_ref}/docs/"
        )
    bases.append("https://raw.githubusercontent.com/unb-mds/2026-2-Followw/main/docs/")
    return list(dict.fromkeys(bases))


def _fetch_remote_doc(filename: str) -> str | None:
    encoded_name = quote(filename)
    for base_url in _get_raw_docs_bases():
        url = f"{base_url}{encoded_name}"
        try:
            with urlopen(url, timeout=5) as response:
                if response.status == 200:
                    return response.read().decode("utf-8")
        except URLError, TimeoutError, OSError:
            continue
    return None


def _normalize_doc_content(content: str) -> str:
    return re.sub(
        r"\((?:\.\./)?assets/([^)]+)\)", rf"({RAW_ASSET_BASE}\1)", content.strip()
    )


def get_full_description(base_description: str) -> str:
    docs_dir = get_docs_dir()
    sections = [base_description.strip()]

    if docs_dir:
        for filename in DOC_FILES:
            file_path = docs_dir / filename
            if not file_path.is_file():
                continue
            content = file_path.read_text(encoding="utf-8")
            sections.append(_normalize_doc_content(content))
    else:
        with ThreadPoolExecutor(max_workers=len(DOC_FILES)) as executor:
            results = list(executor.map(_fetch_remote_doc, DOC_FILES))
        for content in results:
            if content:
                sections.append(_normalize_doc_content(content))

    return "\n\n---\n\n".join(sections)
