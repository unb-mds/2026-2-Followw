import pytest
from sqlalchemy import func, select

from api.db.courses import course_ids
from api.db.models import Course, User
from api.db.seed.courses import COURSES_CSV, read_courses, seed_courses
from api.db.seed.unities import UNITIES_CSV, read_unities

LOGIN = {"registration": "251000000", "password": "senha123"}


def _csv(tmp_path, *lines):
    path = tmp_path / "courses.csv"
    path.write_text(
        "id,unity_id,shift,name\n" + "\n".join(lines) + "\n", encoding="utf-8"
    )
    return path


def _login(client, sigaa, course="ENGENHARIA DE SOFTWARE/FCTE - Bacharelado"):
    sigaa.profile = sigaa.profile.replace(
        "ENGENHARIA DE SOFTWARE/FCTE - Bacharelado", course
    )
    client.post("/auth/sigaa", json=LOGIN)


def test_csv_do_repositorio_aponta_para_unidades_que_existem():
    unities = {unity.id for unity in read_unities(UNITIES_CSV)}
    courses = {course.sigaa_id: course for course in read_courses(COURSES_CSV)}

    assert {course.unity_id for course in courses.values()} <= unities
    assert (courses[414924].name, courses[414924].unity_id) == (
        "ENGENHARIA DE SOFTWARE",
        673,
    )


def test_turno_vazio_fica_nulo_e_id_repetido_e_barulhento(tmp_path):
    (curso,) = read_courses(_csv(tmp_path, "1,673,,SOFTWARE"))
    assert (curso.sigaa_id, curso.shift) == (1, None)

    with pytest.raises(ValueError, match="repetido"):
        read_courses(_csv(tmp_path, "1,673,DIURNO,A", "1,673,NOTURNO,B"))


async def test_seed_atualiza_pelo_id_do_sigaa_e_nao_duplica(async_database, tmp_path):
    async with async_database.begin() as session:
        await seed_courses(session, _csv(tmp_path, "10,673,DIURNO,SOFTWARE"))
    async with async_database.begin() as session:
        await seed_courses(
            session, _csv(tmp_path, "10,673,NOTURNO,ENGENHARIA DE SOFTWARE")
        )

    async with async_database() as session:
        (course,) = (await session.scalars(select(Course))).all()
    assert (course.sigaa_id, course.shift, course.name) == (
        10,
        "NOTURNO",
        "ENGENHARIA DE SOFTWARE",
    )


async def test_curso_que_falta_e_criado_uma_vez(async_database):
    pair = ("ENGENHARIA DE SOFTWARE", "FCTE")
    async with async_database.begin() as session:
        first = await course_ids(session, [pair, pair])
    async with async_database.begin() as session:
        second = await course_ids(session, [pair])

    assert first == second
    async with async_database() as session:
        (course,) = (await session.scalars(select(Course))).all()
    assert (course.sigaa_id, course.unity_id) == (None, 673)


async def test_curso_do_sigaa_e_reaproveitado(async_database):
    async with async_database.begin() as session:
        session.add(Course(sigaa_id=5, name="SOFTWARE", unity_id=673))
    async with async_database.begin() as session:
        ids = await course_ids(session, [("SOFTWARE", "FCTE")])

    async with async_database() as session:
        course = await session.scalar(select(Course))
        assert ids == {("SOFTWARE", "FCTE"): course.id}
        assert await session.scalar(select(func.count(Course.id))) == 1


def _administracao(session, *shifts):
    session.add_all(
        Course(sigaa_id=i, name="ADMINISTRAÇÃO", shift=shift, unity_id=673)
        for i, shift in enumerate(shifts, 1)
    )


async def test_nome_que_casa_com_dois_cursos_fica_com_o_diurno(async_database):
    async with async_database.begin() as session:
        _administracao(session, "NOTURNO", "DIURNO")
    pair = ("ADMINISTRAÇÃO", "FCTE")
    async with async_database.begin() as session:
        ids = await course_ids(session, [pair])

    async with async_database() as session:
        diurno = await session.scalar(select(Course).where(Course.shift == "DIURNO"))
        assert ids == {pair: diurno.id}
        assert await session.scalar(select(func.count(Course.id))) == 2


async def test_turno_escolhe_entre_cursos_de_mesmo_nome(async_database):
    async with async_database.begin() as session:
        _administracao(session, "DIURNO", "NOTURNO")
    pair = ("ADMINISTRAÇÃO", "FCTE")
    async with async_database.begin() as session:
        noturno = await course_ids(session, [pair], "NOTURNO")
        diurno = await course_ids(session, [pair], "DIURNO")

    async with async_database() as session:
        by_shift = {c.shift: c.id for c in await session.scalars(select(Course))}
    assert noturno == {pair: by_shift["NOTURNO"]}
    assert diurno == {pair: by_shift["DIURNO"]}


async def test_turno_que_nao_existe_cai_no_diurno(async_database):
    async with async_database.begin() as session:
        _administracao(session, "NOTURNO", "DIURNO")
    pair = ("ADMINISTRAÇÃO", "FCTE")
    async with async_database.begin() as session:
        ids = await course_ids(session, [pair], "INTEGRAL")

    async with async_database() as session:
        diurno = await session.scalar(select(Course).where(Course.shift == "DIURNO"))
        assert ids == {pair: diurno.id}


async def test_diurnos_de_mesmo_nome_ficam_com_o_primeiro(async_database):
    async with async_database.begin() as session:
        _administracao(session, "DIURNO", "DIURNO")
    pair = ("ADMINISTRAÇÃO", "FCTE")
    async with async_database.begin() as session:
        ids = await course_ids(session, [pair])

    assert ids == {pair: 1}


async def test_unidade_fora_da_tabela_nao_gera_curso(async_database):
    async with async_database.begin() as session:
        ids = await course_ids(
            session, [("SOFTWARE", "XYZ"), (None, "FCTE"), ("A", None)]
        )

    assert ids == {}
    async with async_database() as session:
        assert await session.scalar(select(func.count(Course.id))) == 0


def test_perfil_cria_o_curso_e_o_reaproveita_no_proximo_login(client, sigaa, database):
    _login(client, sigaa)

    perfil = client.get("/me").json()
    assert (perfil["course"], perfil["unity"]) == ("ENGENHARIA DE SOFTWARE", "FCTE")
    _login(client, sigaa)
    with database() as session:
        user = session.scalar(select(User).where(User.registration == "251000000"))
        assert (user.course.name, user.course.unity_id) == (
            "ENGENHARIA DE SOFTWARE",
            673,
        )
        assert session.scalar(select(func.count(Course.id))) == 1


def test_perfil_com_unidade_fora_da_tabela_fica_sem_curso(client, sigaa, database):
    _login(client, sigaa, "ENGENHARIA DE SOFTWARE/XYZ")

    response = client.get("/me")

    assert response.status_code == 200
    assert (response.json()["course"], response.json()["unity"]) == (None, None)
    with database() as session:
        assert session.scalar(select(User.course_id)) is None


def test_perfil_de_curso_ambiguo_fica_com_o_diurno(client, sigaa, database):
    with database.begin() as session:
        session.add_all(
            Course(sigaa_id=i, name="ENGENHARIA DE SOFTWARE", shift=shift, unity_id=673)
            for i, shift in ((1, "NOTURNO"), (2, "DIURNO"))
        )
    _login(client, sigaa)

    perfil = client.get("/me").json()

    assert (perfil["course"], perfil["unity"]) == ("ENGENHARIA DE SOFTWARE", "FCTE")
    assert perfil["shift"] == "DIURNO"


def test_perfil_noturno_liga_o_curso_noturno(client, sigaa, database):
    with database.begin() as session:
        session.add_all(
            Course(sigaa_id=i, name="ENGENHARIA DE SOFTWARE", shift=shift, unity_id=673)
            for i, shift in ((1, "DIURNO"), (2, "NOTURNO"))
        )
    _login(client, sigaa, "ENGENHARIA DE SOFTWARE/FCTE - Bacharelado - N")

    with database() as session:
        user = session.scalar(select(User).where(User.registration == "251000000"))
        assert user.course.sigaa_id == 2
