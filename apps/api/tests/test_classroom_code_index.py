import asyncio
import json
import runpy
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from sigaa_client import PublicClassroom, SigaaParseError, Subject, Unit

from api.services.public_classroom import _code_units

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/update_classroom_code_units.py"


@pytest.fixture
def updater(monkeypatch):
    collect = runpy.run_path(str(SCRIPT))["collect_index"]
    client = MagicMock()
    client.__aenter__.return_value = client
    client.classrooms.list_units = AsyncMock(
        return_value=[
            Unit(id=1, name="Unidade A"),
            Unit(id=2, name="Unidade B"),
            Unit(id=3, name="Sem oferta"),
        ]
    )
    monkeypatch.setitem(
        collect.__globals__, "SigaaPublicClient", lambda **kwargs: client
    )
    monkeypatch.setitem(
        collect.__globals__,
        "asyncio",
        SimpleNamespace(Queue=asyncio.Queue, gather=asyncio.gather, sleep=AsyncMock()),
    )
    return collect, client


async def test_indice_coleta_todos_prefixos_por_unidade_e_preserva_multiplas_unidades(
    updater,
):
    collect, client = updater
    codes = {1: ["FGA0132", "FCTE0030", "FGA0001"], 2: ["FGA0132"], 3: []}

    async def search(unit, *, year, period):
        assert (year, period) == (2026, 2)
        return [
            PublicClassroom(
                number="01",
                semester="2026.2",
                subject=Subject(name="Disciplina", code=code),
            )
            for code in codes[unit]
        ]

    client.classrooms.search = AsyncMock(side_effect=search)
    index = await collect("2026.2")
    assert index["prefixes"] == {"FCTE": [1], "FGA": [1, 2]}
    assert set(index["units"]) == {"1", "2", "3"}
    assert index["units_without_classes"] == [3]
    assert index["semesters"] == ["2026.2"]
    assert client.classrooms.search.await_count == 3


async def test_indice_nao_aceita_coleta_parcial(updater):
    collect, client = updater
    client.classrooms.search = AsyncMock(side_effect=SigaaParseError("layout mudou"))
    with pytest.raises(RuntimeError, match="índice anterior preservado"):
        await collect()
    assert client.classrooms.search.await_count == 9


async def test_indice_repete_falha_transitoria_e_mantem_semestre_do_formulario(updater):
    collect, client = updater
    client.classrooms.list_units.return_value = [Unit(id=1, name="Unidade A")]
    client.classrooms.search = AsyncMock(
        side_effect=[
            SigaaParseError("temporário"),
            [
                PublicClassroom(
                    number="01",
                    semester="2026.2",
                    subject=Subject(name="Disciplina", code="FGA0132"),
                )
            ],
        ]
    )
    index = await collect()
    assert index["prefixes"] == {"FGA": [1]}
    assert client.classrooms.search.await_count == 2
    client.classrooms.search.assert_awaited_with(1, year=None, period=None)


def test_indice_distribuido_tem_origem_e_unidades_validas():
    path = SCRIPT.parents[1] / "api/data/classroom_code_units.json"
    index = json.loads(path.read_text(encoding="utf-8"))
    assert index["source"] == "https://sigaa.unb.br/sigaa/public/turmas/listar.jsf"
    assert index["generated_at"]
    assert index["semesters"]
    assert index["prefixes"]["FGA"] == [673]
    assert index["prefixes"]["FCTE"] == [673]
    assert index["prefixes"]["MAT"] == [518]
    assert _code_units() == index["prefixes"]
    for prefix, units in index["prefixes"].items():
        assert prefix.isascii() and prefix.isalpha() and prefix.isupper()
        assert units == sorted(set(units))
        assert all(str(unit) in index["units"] for unit in units)
        assert not set(units) & set(index["units_without_classes"])
