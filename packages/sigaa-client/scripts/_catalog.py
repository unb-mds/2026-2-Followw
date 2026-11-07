"""Liga os CSVs de dados aos componentes, sem rede: quem falta, de onde vem e a linha final."""

import csv
import json
import re
from collections.abc import Iterable, Mapping
from pathlib import Path

from sigaa_client import SubjectDetails, lookup_key

REQUIREMENTS = ("prerequisites", "corequisites", "equivalences")
COLUMNS = ("code", "name", "hours", "unit_id", *REQUIREMENTS)
_CODE_RE = re.compile(r"\b[A-Z]+[0-9]+\b")

type Row = Mapping[str, object]
type Source = tuple[int, int]


def referenced_codes(rows: Iterable[Row]) -> set[str]:
    """Os códigos citados nos requisitos das linhas de componentes."""
    return {
        code
        for row in rows
        for field in REQUIREMENTS
        for code in _CODE_RE.findall(str(row.get(field) or ""))
    }


def read_reference_codes(paths: Iterable[Path]) -> set[str]:
    """Os códigos que turmas, matrizes e docentes citam nos CSVs."""
    codes: set[str] = set()
    for path in paths:
        with path.open(encoding="utf-8", newline="") as file:
            for row in csv.DictReader(file):
                for field in ("subject_code", "subject_codes"):
                    codes.update(_CODE_RE.findall((row.get(field) or "").upper()))
                for disciplines in json.loads(row.get("disciplines") or "{}").values():
                    codes.update(code.strip().upper() for code in disciplines)
    return codes


def read_curriculum_sources(path: Path) -> dict[str, list[Source]]:
    """Por código, as matrizes `(curso, currículo)` que o trazem, na ordem do CSV."""
    sources: dict[str, list[Source]] = {}
    with path.open(encoding="utf-8", newline="") as file:
        for row in csv.DictReader(file):
            source = (int(row["course_sigaa_id"]), int(row["curriculum_sigaa_id"]))
            for code in row["subject_codes"].split():
                known = sources.setdefault(code.strip().upper(), [])
                if source not in known:
                    known.append(source)
    return sources


def read_unit_ids(path: Path) -> dict[str, int]:
    """O id de cada unidade pelo nome, ignorando acento e caixa."""
    with path.open(encoding="utf-8", newline="") as file:
        return {lookup_key(row["name"]): int(row["id"]) for row in csv.DictReader(file)}


def read_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        if not set(COLUMNS) <= set(reader.fieldnames or ()):
            raise ValueError(f"{path.name} sem as colunas {', '.join(COLUMNS)}.")
        return list(reader)


def subject_row(
    subject: SubjectDetails, unit_ids: Mapping[str, int]
) -> dict[str, object]:
    unit_id = unit_ids.get(lookup_key(subject.unit)) if subject.unit else None
    return subject.model_dump(include={"code", "name", "hours", *REQUIREMENTS}) | {
        "unit_id": unit_id
    }
