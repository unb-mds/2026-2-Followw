"""O que as coletas do SIGAA público têm em comum: pool de sessões, retentativa e CSV."""

import argparse
import asyncio
import csv
import re
from collections.abc import Awaitable, Callable, Iterable, Mapping, Sequence
from pathlib import Path

import httpx

from sigaa_client import SigaaError, SigaaPublicClient, SigaaSearchError, Unit

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
ATTEMPTS = 3
RETRY_DELAY = 2
UNIT_DELAY = 0.5
TIMEOUT = 45
PROGRESS_EVERY = 50
NETWORK_ERRORS = (SigaaError, httpx.HTTPError)

_SEMESTER_RE = re.compile(r"[0-9]{4}\.[0-9]")

type Table = tuple[Path, Sequence[str], Iterable[Mapping[str, object]]]


def parse_semester(semester: str | None) -> tuple[int | None, int | None]:
    """`2026.2` -> `(2026, 2)`; sem semestre vale o que o form do SIGAA traz."""
    if semester is None:
        return None, None
    if not _SEMESTER_RE.fullmatch(semester):
        raise ValueError("o semestre deve usar o formato AAAA.P")
    year, period = semester.split(".")
    return int(year), int(period)


def parse_args(description: str | None, output: Path) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--semester", help="AAAA.P; omitido usa o formulário do SIGAA.")
    parser.add_argument("--output", type=Path, default=output)
    parser.add_argument(
        "--unit", action="append", help="id ou nome exato de uma unidade (repetível)."
    )
    parser.add_argument("--workers", type=int, default=2)
    args = parser.parse_args()
    try:
        parse_semester(args.semester)
    except ValueError as error:
        parser.error(f"--semester: {error}")
    return args


async def with_retries[T](step: Callable[[], Awaitable[T]], label: object) -> T:
    """Refaz `step` em erro de rede; recusa da busca não muda na segunda vez."""
    for attempt in range(ATTEMPTS):
        try:
            return await step()
        except SigaaSearchError:
            raise
        except NETWORK_ERRORS as error:
            if attempt == ATTEMPTS - 1:
                raise
            print(f"Nova tentativa {label}: {error}", flush=True)
            await asyncio.sleep(RETRY_DELAY)
    raise AssertionError("ATTEMPTS deve ser positivo")


async def run_pool[I, T](
    items: Iterable[I],
    work: Callable[[SigaaPublicClient, I], Awaitable[T]],
    workers: int = 2,
    label: str | None = None,
) -> list[T]:
    """`work` em cada item, com `workers` sessões próprias; os resultados vêm na ordem dos itens."""
    pending = list(enumerate(items))
    queue = iter(pending)
    results: dict[int, T] = {}

    async def worker() -> None:
        async with SigaaPublicClient(timeout=TIMEOUT) as client:
            for index, item in queue:
                results[index] = await work(client, item)
                if label and (
                    len(results) % PROGRESS_EVERY == 0 or len(results) == len(pending)
                ):
                    print(f"{label}: {len(results)} de {len(pending)}.", flush=True)

    if not pending:
        return []
    try:
        async with asyncio.TaskGroup() as tasks:
            for _ in range(min(workers, len(pending))):
                tasks.create_task(worker())
    except ExceptionGroup as group:
        # Um worker que falha derruba os outros; o chamador vê o erro original.
        raise group.exceptions[0] from None
    return [results[index] for index, _ in pending]


def _classroom_units(client: SigaaPublicClient) -> Awaitable[list[Unit]]:
    return client.classrooms.list_units()


async def load_units(
    only: Sequence[str] | None = None,
    list_units: Callable[[SigaaPublicClient], Awaitable[list[Unit]]] = _classroom_units,
) -> list[Unit]:
    """As unidades de `list_units` (padrão: turmas); `only` filtra por id ou nome exato."""
    async with SigaaPublicClient(timeout=TIMEOUT) as client:
        units = await list_units(client)
    if not units:
        raise RuntimeError("O SIGAA não retornou unidades.")
    if only:
        wanted = {name.casefold() for name in only}
        units = [u for u in units if wanted & {str(u.id), u.name.casefold()}]
        if not units:
            raise RuntimeError(f"Nenhuma unidade casa com {list(only)}.")
    return units


async def collect_by_unit[T](
    units: Sequence[Unit],
    collect: Callable[[SigaaPublicClient, Unit], Awaitable[T]],
    describe: Callable[[T], str],
    workers: int = 2,
) -> dict[int, T]:
    """Roda `collect` em cada unidade; falha no fim se alguma unidade falhar.

    Uma unidade com erro de rede é tentada de novo até `ATTEMPTS` vezes, então `collect`
    deve poder ser chamada outra vez sobre a mesma unidade.
    """
    failed: list[int] = []

    async def work(client: SigaaPublicClient, unit: Unit) -> T | None:
        try:
            found = await with_retries(lambda: collect(client, unit), unit.id)
        except NETWORK_ERRORS as error:
            failed.append(unit.id)
            print(f"Falha {unit.id}: {error}", flush=True)
            return None
        print(f"{unit.id} ({unit.name}): {describe(found)}", flush=True)
        await asyncio.sleep(UNIT_DELAY)
        return found

    found = await run_pool(units, work, workers)
    if failed:
        raise RuntimeError(f"Unidades com falha: {sorted(failed)}; nada foi salvo.")
    return {unit.id: item for unit, item in zip(units, found, strict=True)}


def write_csv(*tables: Table) -> None:
    """Escreve cada CSV num temporário e só troca todos no fim: coleta interrompida não estraga nenhum."""
    staged: list[tuple[Path, Path]] = []
    try:
        for path, columns, rows in tables:
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_suffix(".tmp")
            staged.append((temporary, path))
            with temporary.open("w", encoding="utf-8", newline="") as file:
                writer = csv.DictWriter(file, columns, lineterminator="\n")
                writer.writeheader()
                for row in rows:
                    writer.writerow({column: row[column] for column in columns})
        for temporary, path in staged:
            temporary.replace(path)
    finally:
        for temporary, _ in staged:
            temporary.unlink(missing_ok=True)
