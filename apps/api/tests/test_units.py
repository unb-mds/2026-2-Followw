import pytest
from sqlalchemy import select

from api.db.models import Unit
from api.db.seed.units import UNITS_CSV, read_units, seed_units
from api.db.units import unit_ids


def _csv(tmp_path, *lines):
    path = tmp_path / "units.csv"
    path.write_text("id,code,name\n" + "\n".join(lines) + "\n", encoding="utf-8")
    return path


def test_csv_do_repositorio_tem_ids_e_codigos_unicos():
    units = {unit.id: unit for unit in read_units(UNITS_CSV)}

    assert units[673].code == "FCTE"
    assert units[673].name.startswith("CAMPUS UNB GAMA")
    assert all(unit.name for unit in units.values())


def test_codigo_vazio_fica_nulo_e_o_preenchido_vai_em_caixa_alta(tmp_path):
    units = read_units(_csv(tmp_path, "508,,DEPTO CIC", "673, fcte ,GAMA"))

    assert [(u.id, u.code) for u in units] == [(508, None), (673, "FCTE")]


@pytest.mark.parametrize(
    "lines", [("1,AAA,Um", "2,AAA,Dois"), ("1,AAA,Um", "1,BBB,Outro")]
)
def test_id_ou_codigo_repetido_e_barulhento(tmp_path, lines):
    with pytest.raises(ValueError, match="repetido"):
        read_units(_csv(tmp_path, *lines))


async def test_seed_cria_atualiza_e_nao_duplica(async_database, tmp_path):
    first = _csv(tmp_path, "508,,DEPTO CIC", "673,FCTE,GAMA")
    async with async_database.begin() as session:
        await seed_units(session, first)

    renamed = _csv(tmp_path, "508,CIC,DEPTO CIÊNCIAS DA COMPUTAÇÃO", "673,FCTE,GAMA")
    async with async_database.begin() as session:
        await seed_units(session, renamed)

    async with async_database() as session:
        rows = (await session.scalars(select(Unit).order_by(Unit.id))).all()
    assert [(u.id, u.code, u.name) for u in rows] == [
        (508, "CIC", "DEPTO CIÊNCIAS DA COMPUTAÇÃO"),
        (673, "FCTE", "GAMA"),
    ]


async def test_ids_pelo_codigo_ignoram_o_que_nao_esta_na_tabela(async_database):
    async with async_database() as session:
        ids = await unit_ids(session, ["FCTE", "XYZ", None, ""])

    assert ids == {"FCTE": 673}
