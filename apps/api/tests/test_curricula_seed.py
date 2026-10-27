import csv

import pytest
from pydantic import ValidationError
from sqlalchemy import func, select

from api.db.models import Course, Curriculum, CurriculumComponent
from api.db.seed.courses import read_courses, seed_courses
from api.db.seed.curricula import COMPONENTS_CSV, read_curricula, seed_curricula
from api.db.seed.units import seed_units

MATRIX_COLUMNS = (
    "sigaa_id,course_sigaa_id,code,created_year,active,shift,valid_from,matrix"
)
COMPONENT_COLUMNS = "course_sigaa_id,curriculum_sigaa_id,period,kind,subject_codes"
MATRIX = "456,414112,8117/1,2020,true,D,2020.1,ADMINISTRAÇÃO - D"
COMPONENTS = [
    "414112,456,1,required,ADM0023",
    "414112,456,0,optional,ADM0002",
    "414112,456,,complementary,ADM0100",
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
    assert len(
        {
            (row["course_sigaa_id"], row["curriculum_sigaa_id"], row["period"])
            for row in components
        }
    ) == len(components)
    assert all(row["period"] == "0" for row in components if row["kind"] == "optional")
    assert any(row["kind"] == "complementary" for row in components)


@pytest.mark.parametrize(
    ("matrices", "components", "error"),
    [
        ([MATRIX, MATRIX], COMPONENTS, "repetido"),
        ([], [], "vazio"),
        ([MATRIX], COMPONENTS + [COMPONENTS[0]], "repetido"),
        ([MATRIX], ["414112,456,1,required,ADM0023 ADM0023"], "repetido"),
        ([MATRIX], ["414112,999,1,required,ADM0023"], "Matriz ausente"),
        ([MATRIX], ["414112,456,1,optional,ADM0023"], "inválido"),
        ([MATRIX], ["414112,456,0,required,ADM0023"], "inválido"),
        ([MATRIX], ["414112,456,-1,required,ADM0023"], "inválido"),
        ([MATRIX], ["414112,456,0,complementary,ADM0023"], "inválido"),
        ([MATRIX], [], "sem componentes"),
    ],
)
def test_csvs_invalidos_sao_barulhentos(tmp_path, matrices, components, error):
    with pytest.raises(ValueError, match=error):
        read_curricula(*_csvs(tmp_path, matrices, components))


def test_vigencia_invalida_e_rejeitada(tmp_path):
    with pytest.raises(ValidationError):
        read_curricula(*_csvs(tmp_path, [MATRIX.replace("2020.1", "2020")]))


def test_periodos_agrupados_preservam_listas_e_periodos_vazios(tmp_path):
    (item,) = read_curricula(
        *_csvs(
            tmp_path,
            components=[
                "414112,456,1,required,adm0023 ADM0024",
                "414112,456,2,required,",
                "414112,456,0,optional,adm0002 ADM0003",
                "414112,456,,complementary,adm0100 ADM0101",
            ],
        )
    )
    assert item.shift == "D"
    assert [(p.period, p.required) for p in item.required_by_period] == [
        (1, ("ADM0023", "ADM0024")),
        (2, ()),
    ]
    assert item.optional == ("ADM0002", "ADM0003")
    assert item.complementary == ("ADM0100", "ADM0101")


async def test_seed_resolve_id_local_atualiza_e_remove_componentes_obsoletos(
    async_database, tmp_path
):
    async with async_database.begin() as session:
        session.add(Course(id=987, sigaa_id=414112, name="ADMINISTRAÇÃO", unit_id=673))
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
    updated = ["414112,456,2,required,ADM0023", "414112,456,0,optional,ADM0315"]
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


async def test_seed_inativa_matrizes_que_sairam_do_csv(
    async_database, tmp_path, caplog
):
    newer = MATRIX.replace("456,", "789,").replace("2020", "2024")
    newer_components = [row.replace(",456,", ",789,") for row in COMPONENTS]
    other_matrix = MATRIX.replace("414112", "414113")
    other_components = [row.replace("414112", "414113") for row in COMPONENTS]
    async with async_database.begin() as session:
        session.add_all(
            [
                Course(sigaa_id=414112, name="D", unit_id=673),
                Course(sigaa_id=414113, name="N", unit_id=673),
            ]
        )
        await session.flush()
        await seed_curricula(
            session,
            *_csvs(
                tmp_path,
                [MATRIX, newer, other_matrix],
                COMPONENTS + newer_components + other_components,
            ),
        )
        assert "without_active" not in caplog.text
        await seed_curricula(
            session,
            *_csvs(tmp_path, [newer], ["414112,789,0,optional,NOVO"]),
        )
    async with async_database() as session:
        rows = (
            await session.execute(
                select(Course.sigaa_id, Curriculum.sigaa_id, Curriculum.active)
                .join(Curriculum, Curriculum.course_id == Course.id)
                .order_by(Course.sigaa_id, Curriculum.sigaa_id)
            )
        ).all()
        assert rows == [
            (414112, 456, False),
            (414112, 789, True),
            (414113, 456, False),
        ]
        components = (
            await session.scalars(
                select(CurriculumComponent.subject_code)
                .join(Curriculum, Curriculum.id == CurriculumComponent.curriculum_id)
                .where(Curriculum.sigaa_id == 789)
            )
        ).all()
        assert components == ["NOVO"]
    assert "courses_without_active_curriculum" in caplog.text


async def test_dataset_completo_pode_ser_semeado_duas_vezes(async_database):
    async with async_database.begin() as session:
        await seed_units(session)
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
