"""O que as coletas unidade a unidade da busca pública de turmas têm em comum."""

import asyncio
import csv
import re
from collections.abc import Awaitable, Callable, Iterable, Mapping, Sequence
from pathlib import Path

import httpx

from sigaa_client import SigaaError, SigaaPublicClient, Unit

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
ATTEMPTS = 3
RETRY_DELAY = 2
UNIT_DELAY = 0.5
TIMEOUT = 45
NETWORK_ERRORS = (SigaaError, httpx.HTTPError)

_SEMESTER_RE = re.compile(r"[0-9]{4}\.[0-9]")


def parse_semester(semester: str | None) -> tuple[int | None, int | None]:
    """`2026.2` -> `(2026, 2)`; sem semestre vale o que o form do SIGAA traz."""
    if semester is None:
        return None, None
    if not _SEMESTER_RE.fullmatch(semester):
        raise ValueError("o semestre deve usar o formato AAAA.P")
    year, period = semester.split(".")
    return int(year), int(period)


async def load_units(only: Sequence[str] | None = None) -> list[Unit]:
    """As unidades da busca; `only` filtra por id ou nome exato."""
    async with SigaaPublicClient(timeout=TIMEOUT) as client:
        units = await client.classrooms.list_units()
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
    """Roda `collect` em cada unidade, com `workers` sessões; falha se alguma unidade falhar.

    Uma unidade com erro de rede é tentada de novo até `ATTEMPTS` vezes.
    """
    found_by_unit: dict[int, T] = {}
    failed: list[int] = []
    queue: asyncio.Queue[Unit] = asyncio.Queue()
    for unit in units:
        queue.put_nowait(unit)

    async def worker():
        async with SigaaPublicClient(timeout=TIMEOUT) as client:
            while not queue.empty():
                unit = queue.get_nowait()
                try:
                    found_by_unit[unit.id] = await _attempts(collect, client, unit)
                except NETWORK_ERRORS as error:
                    failed.append(unit.id)
                    print(f"Falha {unit.id}: {error}", flush=True)
                    continue
                print(
                    f"{unit.id} ({unit.name}): {describe(found_by_unit[unit.id])}",
                    flush=True,
                )
                await asyncio.sleep(UNIT_DELAY)

    await asyncio.gather(*(worker() for _ in range(workers)))
    if failed:
        raise RuntimeError(f"Unidades com falha: {sorted(failed)}; nada foi salvo.")
    return found_by_unit


async def _attempts[T](
    collect: Callable[[SigaaPublicClient, Unit], Awaitable[T]],
    client: SigaaPublicClient,
    unit: Unit,
) -> T:
    for _ in range(ATTEMPTS - 1):
        try:
            return await collect(client, unit)
        except NETWORK_ERRORS as error:
            print(f"Nova tentativa {unit.id}: {error}", flush=True)
            await asyncio.sleep(RETRY_DELAY)
    return await collect(client, unit)


def write_csv(
    rows: Iterable[Mapping[str, object]], columns: Sequence[str], path: Path
) -> None:
    """Escreve num temporário e troca no fim: uma coleta interrompida não estraga o CSV."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    with temporary.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, columns, lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow({column: row[column] for column in columns})
    temporary.replace(path)
