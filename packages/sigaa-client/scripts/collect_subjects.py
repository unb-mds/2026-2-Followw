"""Coleta os componentes citados nos CSVs de dados, com requisitos e unidade responsável.

Cada código sai do catálogo público ou, se inativo, do link de uma matriz que o traz. Os
requisitos dos acrescentados são seguidos até não aparecer código novo.
"""

import argparse
import asyncio
from collections.abc import Iterable, Mapping, Sequence
from functools import partial
from pathlib import Path

from _catalog import (
    COLUMNS,
    Row,
    Source,
    read_curriculum_sources,
    read_reference_codes,
    read_rows,
    read_unit_ids,
    referenced_codes,
    subject_row,
)
from _collect import DATA_DIR, NETWORK_ERRORS, run_pool, with_retries, write_csv

from sigaa_client import (
    PublicSubject,
    SigaaParseError,
    SigaaPublicClient,
    SigaaSearchError,
    SubjectDetails,
    lookup_key,
)

OUTPUT = DATA_DIR / "subjects.csv"
CURRICULUM_COMPONENTS = DATA_DIR / "curriculum_components.csv"
UNITS = DATA_DIR / "units.csv"
DELAY = 0.3
SAMPLE = 20


def _fail(
    failed: set[str], codes: Iterable[str], label: object, error: Exception
) -> None:
    failed.update(codes)
    print(f"Falha {label}: {error}", flush=True)


def _sample(codes: Sequence[str]) -> str:
    rest = len(codes) - SAMPLE
    return ", ".join(codes[:SAMPLE]) + (f" e mais {rest}" if rest > 0 else "")


async def from_catalog(
    codes: set[str], failed: set[str], workers: int = 2
) -> list[SubjectDetails]:
    """Busca por prefixo (e por código, se o SIGAA truncar) e abre o resumo de cada um."""
    prefixes = sorted({code.rstrip("0123456789") for code in codes})
    print(f"Catálogo: {len(codes)} códigos em {len(prefixes)} prefixos.", flush=True)

    async def search(client: SigaaPublicClient, prefix: str) -> list[PublicSubject]:
        wanted = {
            code
            for code in codes
            if code.startswith(prefix) and code[len(prefix) :].isdigit()
        }
        found: dict[str, PublicSubject] = {}
        try:
            result = await with_retries(
                lambda: client.subjects.search(code=prefix), prefix
            )
            found = {item.code: item for item in result.items if item.code in wanted}
            if result.truncated:
                for code in sorted(wanted - found.keys()):
                    await asyncio.sleep(DELAY)
                    exact = await with_retries(
                        partial(client.subjects.search, code=code), code
                    )
                    found |= {i.code: i for i in exact.items if i.code == code}
        except NETWORK_ERRORS as error:
            _fail(failed, wanted - found.keys(), f"na busca {prefix}", error)
        await asyncio.sleep(DELAY)
        return [found[code] for code in sorted(found)]

    async def details(
        client: SigaaPublicClient, subject: PublicSubject
    ) -> SubjectDetails | None:
        try:
            return await with_retries(
                lambda: client.subjects.get_details(subject), subject.code
            )
        except NETWORK_ERRORS as error:
            _fail(failed, [str(subject.code)], subject.code, error)
            return None
        finally:
            await asyncio.sleep(DELAY)

    groups = await run_pool(prefixes, search, workers, "Busca")
    found = [subject for group in groups for subject in group]
    print(f"Catálogo: {len(found)} de {len(codes)} códigos.", flush=True)
    items = await run_pool(found, details, workers, "Detalhes")
    return [item for item in items if item is not None]


async def from_matrices(
    codes: set[str],
    sources: Mapping[str, Sequence[Source]],
    failed: set[str],
    workers: int = 2,
) -> list[SubjectDetails]:
    """Os inativos pela primeira matriz com detalhes legíveis do componente."""

    async def details(client: SigaaPublicClient, code: str) -> SubjectDetails | None:
        for course, curriculum in sources[code]:
            try:
                return await with_retries(
                    partial(
                        client.curricula.get_subject_details, course, curriculum, code
                    ),
                    code,
                )
            except SigaaSearchError:
                continue
            except NETWORK_ERRORS as error:
                _fail(failed, [code], f"{code} na matriz {curriculum}", error)
                if not isinstance(error, SigaaParseError):
                    return None
            finally:
                await asyncio.sleep(DELAY)
        return None

    found = await run_pool(sorted(codes & sources.keys()), details, workers, "Matrizes")
    return [item for item in found if item is not None]


async def resolve(
    rows: Iterable[Row],
    wanted: Iterable[str],
    sources: Mapping[str, Sequence[Source]],
    unit_ids: Mapping[str, int],
    workers: int = 2,
    refresh: bool = False,
) -> list[Row]:
    """Ponto fixo: catálogo, depois matrizes, até os requisitos não citarem código novo.

    Sem `refresh`, busca apenas referências ainda sem linha. Com ele, coleta tudo de
    novo e fica com a linha antiga de quem o SIGAA não devolver.
    """
    previous = {str(row["code"]): row for row in rows}
    if refresh:
        found, missing = {}, set(wanted) | previous.keys()
    else:
        found = dict(previous)
        missing = (set(wanted) | referenced_codes(found.values())) - found.keys()
    attempted: set[str] = set()
    unmatched: set[str] = set()
    failed: set[str] = set()
    while missing:
        attempted |= missing
        details = await from_catalog(missing, failed, workers)
        details += await from_matrices(
            missing - {item.code for item in details}, sources, failed, workers
        )
        unmatched |= {
            item.unit
            for item in details
            if item.unit and lookup_key(item.unit) not in unit_ids
        }
        added = [subject_row(item, unit_ids) for item in details]
        for row in added:
            code = str(row["code"])
            if row["unit_id"] is None:
                row["unit_id"] = previous.get(code, {}).get("unit_id") or None
            found[code] = row
        retained = [
            previous[code] for code in (missing & previous.keys()) - found.keys()
        ]
        missing = referenced_codes([*added, *retained]) - found.keys() - attempted

    unresolved = attempted - found.keys()
    kept = unresolved & previous.keys()
    failures = sorted(unresolved & failed)
    absent = sorted(unresolved - failed)
    print(f"Coletados: {len(attempted) - len(unresolved)}.")
    if unmatched:
        print("Unidades fora de units.csv: " + "; ".join(sorted(unmatched)))
    if failures:
        print(f"Falhas ({len(failures)}), tente de novo: " + _sample(failures))
    if absent:
        print(f"Sem resultado no SIGAA ({len(absent)}): " + _sample(absent))
    if kept:
        print(f"Mantidas as linhas antigas de {len(kept)} sem resultado agora.")
    found |= {code: previous[code] for code in kept}
    return [found[code] for code in sorted(found)]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="coleta de novo os componentes que já estão no CSV.",
    )
    parser.add_argument("--workers", type=int, default=2)
    args = parser.parse_args()

    # O CSV de componentes é o alvo, não fonte: mesmo com `--output` em outro lugar.
    targets = {OUTPUT.resolve(), args.output.resolve()}
    wanted = read_reference_codes(
        path for path in DATA_DIR.glob("*.csv") if path.resolve() not in targets
    )
    rows = asyncio.run(
        resolve(
            read_rows(args.output),
            wanted,
            read_curriculum_sources(CURRICULUM_COMPONENTS),
            read_unit_ids(UNITS),
            args.workers,
            args.refresh,
        )
    )
    if not rows:
        raise RuntimeError("Nenhum componente encontrado; nada foi salvo.")
    write_csv((args.output, COLUMNS, rows))
    print(f"Salvo em {args.output}: {len(rows)} componentes.")


if __name__ == "__main__":
    main()
