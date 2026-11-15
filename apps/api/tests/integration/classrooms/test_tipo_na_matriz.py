from sqlalchemy import select

from api.db.models import Course, Curriculum, CurriculumComponent, User

from .helpers import ANTIGA, ATUAL, _login, _turma


def _matriz(database, components: list[tuple[str, str, int | None]]) -> None:
    with database.begin() as session:
        user = session.scalar(select(User).where(User.registration == "251000000"))
        course = Course(name="CURSO DA MATRIZ", shift="DIURNO", unit_id=673)
        session.add(course)
        session.flush()
        curriculum = Curriculum(
            course_id=course.id,
            sigaa_id=1,
            code="100/1",
            valid_from="2020.1",
            created_year=2020,
            active=True,
            shift="D",
            matrix="Fluxo",
        )
        session.add(curriculum)
        session.flush()
        session.add_all(
            CurriculumComponent(
                curriculum_id=curriculum.id,
                subject_code=code,
                kind=kind,
                period=period,
            )
            for code, kind, period in components
        )
        user.curriculum_id = curriculum.id


def _tipos(client) -> dict[str, str | None]:
    response = client.get("/classrooms?semester=all")
    return {c["subject"]["code"]: c["subject"]["kind"] for c in response.json()}


def test_turmas_trazem_o_tipo_da_materia_na_matriz_do_aluno(client, turmas, database):
    turmas.classrooms.list_classrooms.return_value = [
        ATUAL,
        ANTIGA,
        _turma("CCC", "FGA0200", current=True),
        _turma("DDD", "LIVRE001", current=True),
    ]
    _login(client)
    _matriz(
        database,
        [
            ("FGA0146", "required", 1),
            ("FGA0158", "optional", 0),
            ("FGA0200", "complementary", None),
        ],
    )

    assert _tipos(client) == {
        "FGA0146": "mandatory",
        "FGA0158": "optional",
        "FGA0200": "optional",
        "LIVRE001": "free",
    }


def test_sem_matriz_o_tipo_vem_nulo(client, turmas):
    _login(client)

    assert _tipos(client) == {"FGA0146": None, "FGA0158": None}
