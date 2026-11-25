from datetime import datetime
from uuid import uuid4

from api.modules.oauth.scopes import Scope


def test_consulta_historica_por_lista_e_id_exige_aceite_adicional(
    client, emitir, turmas, id_da_turma
):
    def headers(*extra):
        grant = emitir(Scope.CLASSROOMS, Scope.MEMBERS, *extra)
        return {"Authorization": f"Bearer {grant.access_token}"}

    current = headers()
    rooms = client.get("/classrooms", headers=current)
    assert rooms.status_code == 200
    assert "cache-control" in rooms.headers and "age" in rooms.headers
    assert [room["id"] for room in rooms.json()] == [id_da_turma("AAA")]
    assert "status" in rooms.json()[0] and "grade" not in rooms.json()[0]
    assert [
        room["id"]
        for room in client.get("/classrooms?semester=2026.2", headers=current).json()
    ] == [id_da_turma("AAA")]
    for path in (
        "/classrooms?semester=all",
        "/classrooms?semester=2025.2",
        "/classrooms?semester=2020.1",
        f"/classrooms/{id_da_turma('BBB')}/members",
    ):
        assert client.get(path, headers=current).status_code == 403
    past = client.get(
        "/classrooms?semester=2025.2", headers=headers(Scope.HISTORY)
    ).json()
    assert past[0]["id"] == id_da_turma("BBB") and "grade" not in past[0]
    # Como na web, as menções vêm do sync da conta.
    client.post(
        "/auth/sigaa", json={"registration": "251000000", "password": "senha123"}
    )
    client.cookies.clear()
    graded = client.get(
        "/classrooms?semester=2025.2", headers=headers(Scope.HISTORY, Scope.GRADES)
    ).json()
    assert graded[0]["grade"] == "MS"


def test_agenda_separa_horarios_da_frequencia(client, emitir, turmas, hoje):
    hoje(datetime(2026, 9, 17, 15))

    def aulas(*permissions):
        pair = emitir(Scope.CLASSROOMS, *permissions)
        response = client.get(
            "/lessons", headers={"Authorization": f"Bearer {pair.access_token}"}
        )
        assert response.status_code == 200
        return [lesson for day in response.json() for lesson in day["lessons"]]

    schedule = aulas()
    assert schedule and "start_time" in schedule[0]
    assert all("marked" not in lesson and "status" not in lesson for lesson in schedule)
    attendance = aulas(Scope.FREQUENCY)
    assert all({"marked", "status"} <= lesson.keys() for lesson in attendance)


def test_busca_publica_com_bearer_so_oferece_catalogo(client, emitir):
    pair = emitir()
    response = client.get(
        "/public/subjects", headers={"Authorization": f"Bearer {pair.access_token}"}
    )
    assert response.status_code == 422
    assert "`q`" in response.text


def test_oauth_nao_permite_marcar_post_como_lido(client, emitir):
    pair = emitir(*Scope)
    headers = {"Authorization": f"Bearer {pair.access_token}"}
    for method in (client.put, client.delete):
        assert (
            method(
                f"/classrooms/{uuid4()}/posts/news:1/read", headers=headers
            ).status_code
            == 403
        )


def test_feed_e_frequencia_trazem_a_turma_completa_e_omitem_so_a_mencao(
    client, emitir, noticias, id_da_turma
):
    listing = emitir(Scope.CLASSROOMS).access_token
    client.get("/classrooms", headers={"Authorization": f"Bearer {listing}"})
    path = f"/classrooms/{id_da_turma('AAA')}/posts"
    for scopes in ((), (Scope.GRADES,)):
        token = emitir(Scope.CLASSROOMS, Scope.POSTS, Scope.FREQUENCY, *scopes)
        headers = {"Authorization": f"Bearer {token.access_token}"}
        assert client.get(path, headers=headers).status_code == 200
        feed = client.get("/posts", headers=headers)
        frequencies = client.get("/classrooms/frequency", headers=headers)
        assert feed.status_code == frequencies.status_code == 200
        for item in (feed.json()["items"][0], frequencies.json()[0]):
            room = item["classroom"]
            assert room["id"] == id_da_turma("AAA")
            assert room["subject"]["code"] == "CIC0001"
            assert ("grade" in room) == (Scope.GRADES in scopes)
