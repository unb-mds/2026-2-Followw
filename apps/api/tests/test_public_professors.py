import pytest
from sqlalchemy import inspect

from api.db.models import Professor, Subject, Unit
from api.modules.public_professors.repository import ProfessorRepository


@pytest.fixture
def catalog(database):
    with database.begin() as session:
        session.add(Unit(id=508, name="DEPTO CIÊNCIAS DA COMPUTAÇÃO - BRASÍLIA"))
        session.add(
            Subject(code="CIC0205", name="FUNDAMENTOS DE SISTEMAS OPERACIONAIS")
        )
        session.add_all(
            [
                Professor(
                    siape=123,
                    name="MARIA ÁLVARES",
                    unit_id=508,
                    photo=None,
                    description="Pesquisa sistemas.",
                    education=[
                        {
                            "level": "GRADUAÇÃO",
                            "start_year": "2018",
                            "end_year": "2021",
                            "course": "Computação",
                            "institution": "Universidade Estadual de Goiás",
                        }
                    ],
                    interests="Computação",
                    lattes=None,
                    email="maria@unb.br",
                    disciplines=[
                        {"semester": "2026.2", "code": "CIC0205", "occurrences": 2},
                        {"semester": "2025.1", "code": "CIC0108", "occurrences": 1},
                    ],
                ),
                Professor(
                    siape=456,
                    name="JOÃO SILVA",
                    unit_id=673,
                    disciplines=[],
                ),
            ]
        )


def test_lista_paginada_filtra_nome_unidade_e_semestre(client, catalog):
    response = client.get(
        "/public/professors",
        params={"q": "alva", "unit": "508", "semester": "2026.2"},
    )
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["siape"] == 123
    assert data["items"][0]["unit"]["name"].startswith("DEPTO CIÊNCIAS")
    assert "email" not in data["items"][0]
    assert client.get("/api/public/professors").status_code == 200
    assert client.get("/api/professors").status_code == 404

    por_sigla = client.get("/public/professors", params={"unit": " fcte "}).json()
    assert [item["siape"] for item in por_sigla["items"]] == [456]

    page = client.get("/public/professors?page=2&page_size=1").json()
    assert page["total"] == 2
    assert len(page["items"]) == 1
    assert client.get("/public/professors?q=____").json()["total"] == 0
    beyond = client.get("/public/professors?page=9223372036854775808").json()
    assert beyond["total"] == 2
    assert beyond["items"] == []


def test_detalhe_traz_perfil_e_disciplinas_com_nome_do_catalogo(client, catalog):
    response = client.get("/public/professors/123")
    assert response.status_code == 200
    data = response.json()
    assert data["description"] == "Pesquisa sistemas."
    assert data["education"] == [
        {
            "level": "GRADUAÇÃO",
            "start_year": "2018",
            "end_year": "2021",
            "course": "Computação",
            "institution": "Universidade Estadual de Goiás",
        }
    ]
    assert data["interests"] == "Computação"
    assert data["email"] == "maria@unb.br"
    assert (
        data["url"] == "https://sigaa.unb.br/sigaa/public/docente/portal.jsf?siape=123"
    )
    assert data["disciplines"] == [
        {
            "semester": "2026.2",
            "code": "CIC0205",
            "occurrences": 2,
            "name": "FUNDAMENTOS DE SISTEMAS OPERACIONAIS",
        },
        {"semester": "2025.1", "code": "CIC0108", "occurrences": 1, "name": None},
    ]
    assert client.get("/public/professors/999").status_code == 404


async def test_listagem_carrega_apenas_campos_do_resumo(async_database):
    async with async_database.begin() as session:
        session.add(Professor(siape=123, name="MARIA", unit_id=673, disciplines=[]))
    async with async_database() as session:
        professors, total = await ProfessorRepository(session).list(
            None, None, None, 1, 20
        )
        assert total == 1
        assert professors[0].unit.name
        assert "education" in inspect(professors[0]).unloaded
        assert "disciplines" in inspect(professors[0]).unloaded


def test_nome_curto_e_paginacao_invalida_retornam_422(client, catalog):
    assert client.get("/public/professors?q=mar").status_code == 200

    for path in (
        "/public/professors?q=ma",
        "/public/professors?q=ma%20%20",
        "/public/professors?q=%20%20%20%20",
        "/public/professors?q=abcd%00",
        "/public/professors?unit=2147483648",
        "/public/professors?unit=0",
        "/public/professors?unit=XYZ",
        "/public/professors?unit=%C2%B2",
        "/public/professors?unit=",
        "/public/professors?page=0",
        "/public/professors?page_size=101",
        "/public/professors/2147483648",
    ):
        assert client.get(path).status_code == 422
