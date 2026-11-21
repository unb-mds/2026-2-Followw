import httpx
import pytest

from sigaa_client import SigaaClient, SigaaParseError
from sigaa_client.config import DASHBOARD_PATH, PROFILE_EDIT_PATH, SIGAA_BASE_URL

_FORM = """<form name="form:1" action="/sigaa/portais/discente/perfil.jsf">
<input type="hidden" name="javax.faces.ViewState" value="state">
<img id="fotoPerfil" src="/arquivos/antiga.jpg">
<textarea name="descricaoPessoal">Bio anterior</textarea>
<input type="submit" name="form:salvar" value="Gravar perfil">
<a id="btnExcluirFoto" onclick="jsfcljs(f,{'btnExcluirFoto':'btnExcluirFoto','idFotoRemovida':'123'},'')"></a>
</form>"""
_WITHOUT_PHOTO = _FORM.replace("/arquivos/antiga.jpg", "/sigaa/img/no_picture.png")
_SUCCESS = '<div id="painel-erros"><ul class="info"><li>Perfil atualizado com sucesso!</li></ul></div>'
_DASHBOARD = """<div id="perfil-docente">
<div class="info-docente"><span class="nome">ALUNO</span></div>
<table>
<tr><td>Matrícula</td><td>251000000</td></tr>
<tr><td>Curso</td><td>ENGENHARIA DE SOFTWARE/FCTE - Bacharelado</td></tr>
<tr><td>Nível</td><td>Graduação</td></tr>
</table></div>"""


@pytest.mark.parametrize(
    ("location", "notice", "photo_path"),
    [
        ("perfil.jsf?salvo=1", _SUCCESS, "/arquivos/antiga.jpg"),
        (DASHBOARD_PATH, "", "/arquivos/nova.jpg"),
    ],
    ids=["confirma pela mensagem", "confirma pela url alterada"],
)
async def test_upload_confirma_apos_redirecionamento_do_sigaa(
    location, notice, photo_path
):
    saved = False

    def handle(request):
        nonlocal saved
        if request.method == "POST":
            saved = True
            return httpx.Response(302, headers={"location": location})
        if request.url.path == DASHBOARD_PATH:
            return httpx.Response(200, text=_DASHBOARD)
        page = _FORM.replace("/arquivos/antiga.jpg", photo_path)
        return httpx.Response(200, text=notice + page if saved else _FORM)

    async with SigaaClient(
        session_token="tok", transport=httpx.MockTransport(handle)
    ) as client:
        profile = await client.profile.update_profile(password="segredo", photo=b"foto")
    assert profile.photo == SIGAA_BASE_URL + photo_path


@pytest.mark.parametrize("com_aviso", [False, True])
async def test_confirmacao_da_remocao_vem_da_releitura_do_sigaa(com_aviso):
    posts = 0

    def handle(request):
        nonlocal posts
        if request.method == "POST":
            posts += 1
            if posts == 1:
                return httpx.Response(200, text=_WITHOUT_PHOTO)
            return httpx.Response(200, text=_SUCCESS if com_aviso else "")
        if request.url.path == DASHBOARD_PATH:
            return httpx.Response(200, text=_DASHBOARD)
        return httpx.Response(
            200, text=_WITHOUT_PHOTO if posts == 2 and not com_aviso else _FORM
        )

    async with SigaaClient(
        session_token="tok", transport=httpx.MockTransport(handle)
    ) as client:
        if com_aviso:
            with pytest.raises(SigaaParseError, match="não confirmou a remoção"):
                await client.profile.update_profile(
                    password="segredo", remove_photo=True
                )
        else:
            profile = await client.profile.update_profile(
                password="segredo", remove_photo=True
            )
            assert profile.photo is None
    assert posts == 2


@pytest.mark.parametrize(
    ("after", "notice", "bio"),
    [
        (_FORM.replace("Bio anterior", "Nova bio"), "", "Nova bio"),
        (
            _FORM.replace("/arquivos/antiga.jpg", "/arquivos/nova.jpg"),
            _SUCCESS,
            "Nova bio",
        ),
        (_FORM, '<ul class="info"><li>Consulta concluída com sucesso.</li></ul>', None),
        (_WITHOUT_PHOTO, _SUCCESS, None),
    ],
    ids=["so bio mudou", "bio nao gravada", "aviso alheio", "foto ausente"],
)
async def test_upload_exige_confirmacao_dos_campos_solicitados(after, notice, bio):
    saved = False

    def handle(request):
        nonlocal saved
        if request.method == "POST":
            saved = True
            return httpx.Response(200, text=notice)
        if request.url.path == DASHBOARD_PATH:
            return httpx.Response(200, text=_DASHBOARD)
        return httpx.Response(200, text=after if saved else _FORM)

    async with SigaaClient(
        session_token="tok", transport=httpx.MockTransport(handle)
    ) as client:
        with pytest.raises(SigaaParseError, match="não confirmou a atualização"):
            await client.profile.update_profile(
                password="segredo", photo=b"foto", bio=bio
            )


@pytest.mark.parametrize("remove_photo", [False, True], ids=["troca", "remocao"])
@pytest.mark.parametrize("lost_response", ["timeout", "503"])
async def test_resposta_incerta_confirma_no_sigaa_sem_repetir_post(
    remove_photo, lost_response
):
    posts = 0
    saved = False
    after = _WITHOUT_PHOTO if remove_photo else _FORM.replace("antiga.jpg", "nova.jpg")

    def handle(request):
        nonlocal posts, saved
        if request.method == "POST":
            posts += 1
            if remove_photo and posts == 1:
                return httpx.Response(200, text=_WITHOUT_PHOTO)
            saved = True
            if lost_response == "503":
                return httpx.Response(503)
            raise httpx.ReadTimeout("Resposta da gravação perdida")
        if request.url.path == DASHBOARD_PATH:
            return httpx.Response(200, text=_DASHBOARD)
        return httpx.Response(200, text=after if saved else _FORM)

    async with SigaaClient(
        session_token="tok", transport=httpx.MockTransport(handle)
    ) as client:
        profile = await client.profile.update_profile(
            password="segredo",
            remove_photo=remove_photo,
            photo=None if remove_photo else b"foto",
        )
    assert posts == (2 if remove_photo else 1)
    assert profile.photo == (
        None if remove_photo else SIGAA_BASE_URL + "/arquivos/nova.jpg"
    )


async def test_redirecionamento_de_gravacao_recusa_outro_host():
    requests = []

    def handle(request):
        requests.append(request)
        if request.method == "POST":
            return httpx.Response(
                302, headers={"location": f"https://example.org{PROFILE_EDIT_PATH}"}
            )
        if request.url.path == DASHBOARD_PATH:
            return httpx.Response(200, text=_DASHBOARD)
        return httpx.Response(200, text=_SUCCESS + _FORM)

    async with SigaaClient(
        session_token="tok", transport=httpx.MockTransport(handle)
    ) as client:
        with pytest.raises(SigaaParseError, match="Redirecionamento inesperado"):
            await client.profile.update_profile(password="segredo", photo=b"foto")
    assert len(requests) == 2
