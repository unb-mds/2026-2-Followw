import httpx
import pytest
from sigaa_client.config import DASHBOARD_PATH, PROFILE_EDIT_PATH, SIGAA_BASE_URL

from .helpers import CREDENCIAIS, PERFIL

_FORM = f"""<form name="form:1" action="{PROFILE_EDIT_PATH}">
<input type="hidden" name="javax.faces.ViewState" value="state">
<img id="fotoPerfil" src="/arquivos/foto.jpg">
<textarea name="descricaoPessoal">Bio de teste.</textarea>
<input type="submit" name="form:salvar" value="Gravar perfil">
<a id="btnExcluirFoto" onclick="jsfcljs(f,{{'btnExcluirFoto':'btnExcluirFoto','idFotoRemovida':'123'}},'')"></a>
</form>"""
_WITHOUT_PHOTO = _FORM.replace("/arquivos/foto.jpg", "/sigaa/img/no_picture.png")
_NEW_BIO = "Bio nova\nSegunda linha"


@pytest.mark.parametrize(
    ("cached", "confirmed"),
    [(True, True), (False, True), (True, False)],
    ids=["remove com cache", "edita sem cache", "sem confirmacao"],
)
def test_painel_fora_apos_confirmacao_usa_dados_academicos_disponiveis(
    client, cookies, sigaa, monkeypatch, cached, confirmed
):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    sigaa.profile = PERFIL
    if cached:
        baseline = client.get("/me").json()
        assert baseline["photo"] == f"{SIGAA_BASE_URL}/arquivos/foto.jpg"
        assert baseline["bio"] == "Bio de teste."
    original = sigaa._sigaa
    writes = []
    confirmed_form = None

    def handle(request):
        nonlocal confirmed_form
        if request.url.path == PROFILE_EDIT_PATH:
            if request.method == "POST":
                writes.append(request)
                if cached and len(writes) == 1:
                    return httpx.Response(200, text=_WITHOUT_PHOTO)
                if confirmed:
                    confirmed_form = (
                        _WITHOUT_PHOTO
                        if cached
                        else _FORM.replace("Bio de teste.", _NEW_BIO)
                    )
            return httpx.Response(200, text=confirmed_form or _FORM)
        if request.url.path == DASHBOARD_PATH and writes:
            raise httpx.ReadTimeout("Painel fora após a edição", request=request)
        return original(request)

    monkeypatch.setattr(sigaa, "_sigaa", handle)
    response = client.patch(
        "/me/profile",
        data=(
            {"photo_action": "remove"}
            if cached
            else {"photo_action": "keep", "bio": _NEW_BIO}
        ),
        headers={"origin": "https://followw.app"},
    )
    assert len(writes) == (2 if cached else 1)
    if not confirmed:
        assert response.status_code == 502
        assert (
            client.get("/me").json()["photo"] == f"{SIGAA_BASE_URL}/arquivos/foto.jpg"
        )
        return

    assert response.status_code == 200, response.text
    result = response.json()
    assert result["name"] == "NOME DISCENTE"
    assert result["photo"] == (
        None if cached else f"{SIGAA_BASE_URL}/arquivos/foto.jpg"
    )
    assert result["bio"] == ("Bio de teste." if cached else _NEW_BIO)
    assert client.get("/me").json() == result


def test_falha_ao_ler_painel_sem_cache_interrompe_antes_do_post(
    client, cookies, sigaa, monkeypatch
):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    original = sigaa._sigaa
    panel_reads = 0
    writes = []

    def handle(request):
        nonlocal panel_reads
        if request.url.path == DASHBOARD_PATH:
            panel_reads += 1
            if panel_reads > 1:
                raise httpx.ReadTimeout("Painel fora antes da edição", request=request)
        if request.url.path == PROFILE_EDIT_PATH:
            if request.method == "POST":
                writes.append(request)
            return httpx.Response(200, text=_FORM)
        return original(request)

    monkeypatch.setattr(sigaa, "_sigaa", handle)
    response = client.patch(
        "/me/profile",
        data={"photo_action": "keep", "bio": "Bio nova"},
        headers={"origin": "https://followw.app"},
    )
    assert response.status_code == 502
    assert writes == []
