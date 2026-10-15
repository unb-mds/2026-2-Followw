import json

import pytest
from pydantic import ValidationError
from sqlalchemy import select

from api.db.models import Course, Curriculum
from api.db.seed.courses import read_courses, seed_courses
from api.db.seed.curricula import read_curricula, seed_curricula
from api.db.seed.unities import seed_unities

ITEM = {
    "sigaa_id": 456,
    "course_sigaa_id": 414112,
    "code": "8117/1",
    "created_year": 2020,
    "active": True,
    "shift": "Matutino e Vespertino",
    "valid_from": "2020.1",
    "matrix": "ADMINISTRAÇÃO - D",
    "required_by_period": [
        {"period": 1, "required": ["ADM0023"]},
        {"period": 2, "required": []},
    ],
    "optional": ["ADM0002"],
    "complementary": [],
}


def _json(tmp_path, items):
    path = tmp_path / "curricula.json"
    path.write_text(json.dumps(items), encoding="utf-8")
    return path


def test_dataset_tem_curriculos_validos_e_cursos_conhecidos():
    courses = {item.sigaa_id for item in read_courses()}
    curricula = read_curricula()
    assert {item.course_sigaa_id for item in curricula} <= courses
    assert all(item.active and item.required_by_period for item in curricula)
    assert any(item.optional for item in curricula)


def test_json_invalido_ou_repetido_e_barulhento(tmp_path):
    with pytest.raises(ValueError, match="repetido"):
        read_curricula(_json(tmp_path, [ITEM, ITEM]))
    with pytest.raises(ValueError, match="vazio"):
        read_curricula(_json(tmp_path, []))
    with pytest.raises(ValidationError):
        read_curricula(_json(tmp_path, [ITEM | {"valid_from": "2020"}]))
    with pytest.raises(ValidationError):
        read_curricula(_json(tmp_path, [ITEM | {"required_by_period": "ADM0023"}]))


async def test_seed_resolve_id_local_e_atualiza_sem_duplicar(async_database, tmp_path):
    async with async_database.begin() as session:
        course = Course(id=987, sigaa_id=414112, name="ADMINISTRAÇÃO", unity_id=673)
        session.add(course)
        await session.flush()
        await seed_curricula(session, _json(tmp_path, [ITEM]))
    async with async_database() as session:
        original = (await session.scalars(select(Curriculum))).one()
        original_id = original.id
        assert original.course_id == 987
        assert original.data["required_by_period"] == ITEM["required_by_period"]
    updated = ITEM | {"optional": ["ADM0002", "ADM0315"], "valid_from": "2020.2"}
    async with async_database.begin() as session:
        await seed_curricula(session, _json(tmp_path, [updated]))
        await seed_curricula(session, _json(tmp_path, [updated]))
    async with async_database() as session:
        saved = (await session.scalars(select(Curriculum))).one()
        assert saved.id == original_id
        assert saved.valid_from == "2020.2"
        assert saved.data == updated


async def test_seed_recusa_curso_desconhecido_antes_de_gravar(async_database, tmp_path):
    async with async_database.begin() as session:
        with pytest.raises(ValueError, match="ausentes no banco"):
            await seed_curricula(session, _json(tmp_path, [ITEM]))
        assert not (await session.scalars(select(Curriculum))).all()


async def test_dataset_completo_pode_ser_semeado_duas_vezes(async_database):
    async with async_database.begin() as session:
        await seed_unities(session)
        await seed_courses(session)
        await seed_curricula(session)
        await seed_curricula(session)
    async with async_database() as session:
        saved = (await session.scalars(select(Curriculum))).all()
        assert len(saved) == len(read_curricula())
        assert {(item.data["course_sigaa_id"], item.sigaa_id) for item in saved} == {
            (item.course_sigaa_id, item.sigaa_id) for item in read_curricula()
        }
