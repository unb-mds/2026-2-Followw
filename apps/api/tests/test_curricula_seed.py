import csv

import pytest
from pydantic import ValidationError
from sqlalchemy import func, select

from api.db.models import Course, Curriculum, CurriculumComponent
from api.db.seed.courses import read_courses, seed_courses
from api.db.seed.curricula import COMPONENTS_CSV, read_curricula, seed_curricula
from api.db.seed.unities import seed_unities

MATRIX_COLUMNS = (
    "sigaa_id,course_sigaa_id,code,created_year,active,shift,valid_from,matrix"
)
COMPONENT_COLUMNS = "course_sigaa_id,curriculum_sigaa_id,subject_code,period,kind"
MATRIX = "456,414112,8117/1,2020,true,Matutino e Vespertino,2020.1,ADMINISTRAÇÃO - D"
COMPONENTS = [
    "414112,456,ADM0023,1,required",
    "414112,456,ADM0002,0,optional",
    "414112,456,ADM0100,,complementary",
]


def _csvs(tmp_path, matrices=None, components=None):
    path = tmp_path / "curricula.csv"
    contents = tmp_path / "curriculum_components.csv"
    path.write_text(
        MATRIX_COLUMNS
        + "\n"
        + "\n".join(matrices if matrices is not None else [MATRIX])
        + "\n",
        encoding="utf-8",
    )
    contents.write_text(
        COMPONENT_COLUMNS
        + "\n"
        + "\n".join(components if components is not None else COMPONENTS)
        + "\n",
        encoding="utf-8",
    )
    return path, contents


def test_dataset_tem_curriculos_validos_e_cursos_conhecidos():
    courses = {item.sigaa_id for item in read_courses()}
    curricula = read_curricula()
    assert {item.course_sigaa_id for item in curricula} <= courses
    assert all(item.active and item.required_by_period for item in curricula)
    with COMPONENTS_CSV.open(encoding="utf-8", newline="") as file:
        components = list(csv.DictReader(file))
    assert components
    assert all(row["period"] == "0" for row in components if row["kind"] == "optional")
    assert any(row["kind"] == "complementary" for row in components)


@pytest.mark.parametrize(
    ("matrices", "components", "error"),
    [
        ([MATRIX, MATRIX], COMPONENTS, "repetido"),
        ([], [], "vazio"),
        ([MATRIX], COMPONENTS + [COMPONENTS[0]], "repetido"),
        ([MATRIX], ["414112,999,ADM0023,1,required"], "Matriz ausente"),
        ([MATRIX], ["414112,456,ADM0023,1,optional"], "inválido"),
        ([MATRIX], ["414112,456,ADM0023,0,required"], "inválido"),
        ([MATRIX], ["414112,456,ADM0023,-1,required"], "inválido"),
        ([MATRIX], ["414112,456,ADM0023,0,complementary"], "inválido"),
        ([MATRIX], [], "sem componentes"),
    ],
)
def test_csvs_invalidos_sao_barulhentos(tmp_path, matrices, components, error):
    with pytest.raises(ValueError, match=error):
        read_curricula(*_csvs(tmp_path, matrices, components))


def test_vigencia_invalida_e_rejeitada(tmp_path):
    with pytest.raises(ValidationError):
        read_curricula(*_csvs(tmp_path, [MATRIX.replace("2020.1", "2020")]))


async def test_seed_resolve_id_local_atualiza_e_remove_componentes_obsoletos(
    async_database, tmp_path
):
    async with async_database.begin() as session:
        session.add(Course(id=987, sigaa_id=414112, name="ADMINISTRAÇÃO", unity_id=673))
        await session.flush()
        await seed_curricula(session, *_csvs(tmp_path))
    async with async_database() as session:
        original = (await session.scalars(select(Curriculum))).one()
        original_id = original.id
        assert original.course_id == 987
        rows = (await session.scalars(select(CurriculumComponent))).all()
        assert {(row.subject_code, row.period, row.kind) for row in rows} == {
            ("ADM0023", 1, "required"),
            ("ADM0002", 0, "optional"),
            ("ADM0100", None, "complementary"),
        }
    updated = ["414112,456,ADM0023,2,required", "414112,456,ADM0315,0,optional"]
    async with async_database.begin() as session:
        paths = _csvs(tmp_path, [MATRIX.replace("2020.1", "2020.2")], updated)
        await seed_curricula(session, *paths)
        await seed_curricula(session, *paths)
    async with async_database() as session:
        saved = (await session.scalars(select(Curriculum))).one()
        assert saved.id == original_id
        assert saved.valid_from == "2020.2"
        rows = (await session.scalars(select(CurriculumComponent))).all()
        assert {(row.subject_code, row.period, row.kind) for row in rows} == {
            ("ADM0023", 2, "required"),
            ("ADM0315", 0, "optional"),
        }
        assert all(row.curriculum_id == original_id for row in rows)


async def test_seed_recusa_curso_desconhecido_antes_de_gravar(async_database, tmp_path):
    async with async_database.begin() as session:
        with pytest.raises(ValueError, match="ausentes no banco"):
            await seed_curricula(session, *_csvs(tmp_path))
        assert not (await session.scalars(select(Curriculum))).all()


async def test_seed_parcial_preserva_componentes_dos_outros_cursos(
    async_database, tmp_path
):
    other_matrix = MATRIX.replace("414112", "414113")
    other_components = [row.replace("414112", "414113") for row in COMPONENTS]
    async with async_database.begin() as session:
        session.add_all(
            [
                Course(sigaa_id=414112, name="D", unity_id=673),
                Course(sigaa_id=414113, name="N", unity_id=673),
            ]
        )
        await session.flush()
        await seed_curricula(
            session,
            *_csvs(tmp_path, [MATRIX, other_matrix], COMPONENTS + other_components),
        )
        await seed_curricula(
            session, *_csvs(tmp_path, components=["414112,456,NOVO,0,optional"])
        )
    async with async_database() as session:
        rows = (
            await session.execute(
                select(Course.sigaa_id, CurriculumComponent.subject_code)
                .join(Curriculum, Curriculum.course_id == Course.id)
                .join(
                    CurriculumComponent,
                    CurriculumComponent.curriculum_id == Curriculum.id,
                )
            )
        ).all()
        assert set(rows) == {
            (414112, "NOVO"),
            (414113, "ADM0023"),
            (414113, "ADM0002"),
            (414113, "ADM0100"),
        }


async def test_dataset_completo_pode_ser_semeado_duas_vezes(async_database):
    async with async_database.begin() as session:
        await seed_unities(session)
        await seed_courses(session)
        await seed_curricula(session)
        await seed_curricula(session)
    async with async_database() as session:
        saved = (await session.scalars(select(Curriculum))).all()
        assert len(saved) == len(read_curricula())
        expected = sum(
            sum(len(period.required) for period in item.required_by_period)
            + len(item.optional)
            + len(item.complementary)
            for item in read_curricula()
        )
        assert (
            await session.scalar(select(func.count()).select_from(CurriculumComponent))
            == expected
        )
        assert (
            await session.scalar(
                select(func.count())
                .select_from(CurriculumComponent)
                .where(
                    CurriculumComponent.kind == "optional",
                    CurriculumComponent.period != 0,
                )
            )
            == 0
        )
