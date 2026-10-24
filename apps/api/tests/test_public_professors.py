import pytest

from api.db.models import Professor, Unity


@pytest.fixture
def catalog(database):
    with database.begin() as session:
        session.add(Unity(id=508, name="DEPTO CIÊNCIAS DA COMPUTAÇÃO - BRASÍLIA"))
        session.add_all(
            [
                Professor(
                    siape=123,
                    name="MARIA ÁLVARES",
                    department_id=508,
                    photo=None,
                    url="",
                    description="Pesquisa sistemas.",
                    education=None,
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
                    department_id=673,
                    url="",
                    disciplines=[],
                ),
            ]
        )


def test_lista_paginada_filtra_nome_departamento_e_semestre(client, catalog):
    response = client.get(
        "/public/professors",
        params={"q": "alva", "department_id": 508, "semester": "2026.2"},
    )
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["siape"] == 123
    assert data["items"][0]["department_name"].startswith("DEPTO CIÊNCIAS")
    assert "email" not in data["items"][0]
    assert client.get("/api/public/professors").status_code == 200
    assert client.get("/api/professors").status_code == 404

    page = client.get("/public/professors?page=2&page_size=1").json()
    assert page["total"] == 2
    assert len(page["items"]) == 1
    assert client.get("/public/professors?q=____").json()["total"] == 0
    beyond = client.get("/public/professors?page=9223372036854775808").json()
    assert beyond["total"] == 2
    assert beyond["items"] == []


def test_detalhe_traz_perfil_e_disciplinas_sem_nome_ou_carga(client, catalog):
    response = client.get("/public/professors/123")
    assert response.status_code == 200
    data = response.json()
    assert data["description"] == "Pesquisa sistemas."
    assert data["email"] == "maria@unb.br"
    assert (
        data["url"] == "https://sigaa.unb.br/sigaa/public/docente/portal.jsf?siape=123"
    )
    assert data["disciplines"] == [
        {"semester": "2026.2", "code": "CIC0205", "occurrences": 2},
        {"semester": "2025.1", "code": "CIC0108", "occurrences": 1},
    ]
    assert client.get("/public/professors/999").status_code == 404


def test_nome_curto_e_paginacao_invalida_retornam_422(client, catalog):
    for path in (
        "/public/professors?q=mar",
        "/public/professors?q=mar%20%20",
        "/public/professors?q=%20%20%20%20",
        "/public/professors?q=abcd%00",
        "/public/professors?department_id=2147483648",
        "/public/professors?page=0",
        "/public/professors?page_size=101",
        "/public/professors/2147483648",
    ):
        assert client.get(path).status_code == 422
