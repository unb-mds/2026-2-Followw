"""Atualiza o índice público de prefixos consultando todas as unidades do SIGAA."""

import argparse
import asyncio
import json
import re
from datetime import UTC, datetime
from pathlib import Path

import httpx
from sigaa_client import SigaaError, SigaaPublicClient
from sigaa_client.config import PUBLIC_CLASSROOMS_PATH, SIGAA_BASE_URL

OUTPUT = Path(__file__).resolve().parents[1] / "api/data/classroom_code_units.json"
CODE = re.compile(r"([A-Z]+)[0-9]+")


async def collect_index(semester: str | None = None) -> dict:
    year, period = map(int, semester.split(".")) if semester else (None, None)
    async with SigaaPublicClient(timeout=45) as client:
        units = await client.classrooms.list_units()
    if not units:
        raise RuntimeError("O SIGAA não retornou unidades; índice anterior preservado.")

    prefixes: dict[str, set[int]] = {}
    semesters: set[str] = set()
    empty_units: list[int] = []
    failed: list[int] = []
    queue = asyncio.Queue()
    for unit in units:
        queue.put_nowait(unit)

    async def worker():
        async with SigaaPublicClient(timeout=45) as client:
            while not queue.empty():
                unit = queue.get_nowait()
                for attempt in range(3):
                    try:
                        rows = await client.classrooms.search(
                            unit.id, year=year, period=period
                        )
                        break
                    except (SigaaError, httpx.HTTPError) as error:
                        if attempt == 2:
                            failed.append(unit.id)
                            print(f"Falha {unit.id}: {error}", flush=True)
                        else:
                            await asyncio.sleep(2)
                else:
                    continue
                found = set()
                for row in rows:
                    match = CODE.fullmatch((row.subject.code or "").strip().upper())
                    if match:
                        prefix = match[1]
                        prefixes.setdefault(prefix, set()).add(unit.id)
                        found.add(prefix)
                    semesters.add(row.semester)
                if not rows:
                    empty_units.append(unit.id)
                print(
                    f"{unit.id}: {len(rows)} turmas; {', '.join(sorted(found))}",
                    flush=True,
                )
                await asyncio.sleep(0.5)

    await asyncio.gather(worker(), worker())
    if failed:
        raise RuntimeError(
            f"Unidades com falha: {sorted(failed)}; índice anterior preservado."
        )
    if not prefixes:
        raise RuntimeError("Nenhum prefixo encontrado; índice anterior preservado.")
    return {
        "source": f"{SIGAA_BASE_URL}{PUBLIC_CLASSROOMS_PATH}",
        "generated_at": datetime.now(UTC).isoformat(),
        "semesters": sorted(semesters),
        "units": {
            str(unit.id): unit.name for unit in sorted(units, key=lambda u: u.id)
        },
        "units_without_classes": sorted(empty_units),
        "prefixes": {prefix: sorted(ids) for prefix, ids in sorted(prefixes.items())},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--semester", help="AAAA.P; omitido usa o formulário do SIGAA.")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    if args.semester and not re.fullmatch(r"[0-9]{4}\.[0-9]", args.semester):
        parser.error("--semester deve usar o formato AAAA.P")
    index = asyncio.run(collect_index(args.semester))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    temporary.replace(args.output)
    print(
        f"Índice salvo: {len(index['units'])} unidades, {len(index['prefixes'])} prefixos."
    )


if __name__ == "__main__":
    main()
