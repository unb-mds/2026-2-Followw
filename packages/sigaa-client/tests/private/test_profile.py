import httpx
import pytest

from sigaa_client import (
    CourseShift,
    CurriculumWorkload,
    SigaaClient,
    SigaaParseError,
)

CARD = """
<div id="perfil-docente">
  <div class="foto"><img src="/arquivos/foto.jpg"/></div>
  <div class="info-docente">
    <span class="nome">FULANO DE TAL</span>
    Bio de teste.
  </div>
  <table>
    <tr><td>Matrícula:</td><td>251000000</td></tr>
    <tr><td>Curso:</td><td>ENGENHARIA DE SOFTWARE/FCTE - Bacharelado</td></tr>
    <tr><td>Nível:</td><td>Graduação</td></tr>
    <tr><td>Entrada:</td><td>2025.1</td></tr>
    <tr><td colspan="2">
      <table>
        <tr><td><acronym title="Índice de Rendimento Acadêmico">IRA:</acronym></td><td>3.9524</td></tr>
        <tr><td><acronym title="Média Ponderada">MP:</acronym></td><td>4.1724</td></tr>
      </table>
    </td></tr>
    <tr><td colspan="2">
      <i><center>Integraliza&#231;&#245;es:</center></i>
      <table>
        <tr><td> CH. Obrigat&#243;ria Pendente </td><td align="right"> 2175 </td></tr>
        <tr><td> CH. Optativa Pendente </td><td align="right"> 420 </td></tr>
        <tr><td> CH. Total Curr&#237;culo </td><td align="right"> 3525 </td></tr>
        <tr><td> CH. Complementar Pendente </td><td align="right"> 0 </td></tr>
        <tr><td colspan="2" align="center"> 26% Integralizado </td></tr>
      </table>
    </td></tr>
  </table>
</div>
"""

CARD_SEM_INDICES = """
<div id="perfil-docente">
  <div class="info-docente">
    <span class="nome">FULANO DE TAL</span>
  </div>
  <table>
    <tr><td>Matrícula:</td><td>251000000</td></tr>
    <tr><td>Curso:</td><td>ENGENHARIA DE SOFTWARE/FCTE - Bacharelado</td></tr>
    <tr><td>Nível:</td><td>Graduação</td></tr>
  </table>
</div>
"""

DASHBOARD = f"<html><body>{CARD}</body></html>"
DASHBOARD_SEM_INDICES = f"<html><body>{CARD_SEM_INDICES}</body></html>"
DASHBOARD_ATUALIZADO = f"""<html><body>
<div id="painel-erros"><ul class="info"><li>Perfil atualizado com sucesso!</li></ul></div>
{CARD}</body></html>"""


class FakeDashboard:
    def __init__(self, page: str = DASHBOARD) -> None:
        self.page = page
        self.requests: list[httpx.Request] = []

    @property
    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self)

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return httpx.Response(200, text=self.page)


async def test_get_profile_faz_um_unico_get():
    sigaa = FakeDashboard()
    async with SigaaClient(session_token="tok", transport=sigaa.transport) as client:
        profile = await client.profile.get_profile()

    assert [r.method for r in sigaa.requests] == ["GET"]
    assert profile.name == "FULANO DE TAL"
    assert profile.registration == "251000000"
    assert (profile.course, profile.unit) == ("ENGENHARIA DE SOFTWARE", "FCTE")
    assert profile.shift == CourseShift.DIURNO
    assert profile.entry_semester == "2025.1"
    assert profile.bio == "Bio de teste."
    assert profile.photo == "https://sigaa.unb.br/arquivos/foto.jpg"
    assert profile.ira == 3.9524
    assert profile.mp == 4.1724
    assert profile.integralization == 26
    assert profile.workload == CurriculumWorkload(
        total=3525,
        pending_mandatory=2175,
        pending_optional=420,
        pending_complementary=0,
    )


@pytest.mark.parametrize(
    ("course", "shift"),
    [
        ("ENGENHARIA DE SOFTWARE/FCTE - Bacharelado - MT", CourseShift.DIURNO),
        ("ADMINISTRAÇÃO/FCTE - Bacharelado - N", CourseShift.NOTURNO),
        ("ADMINISTRAÇÃO/FCTE - Bacharelado", CourseShift.DIURNO),
        ("ADMINISTRAÇÃO/FCTE", None),
    ],
)
async def test_get_profile_turno_vem_do_fim_da_linha_do_curso(course, shift):
    page = DASHBOARD.replace("ENGENHARIA DE SOFTWARE/FCTE - Bacharelado", course)
    sigaa = FakeDashboard(page=page)
    async with SigaaClient(session_token="tok", transport=sigaa.transport) as client:
        profile = await client.profile.get_profile()

    assert (profile.course, profile.unit) == (course.split("/")[0], "FCTE")
    assert profile.shift == shift


async def test_get_profile_sem_foto_nao_devolve_o_no_picture():
    page = DASHBOARD.replace("/arquivos/foto.jpg", "/sigaa/img/no_picture.png")
    sigaa = FakeDashboard(page=page)
    async with SigaaClient(session_token="tok", transport=sigaa.transport) as client:
        profile = await client.profile.get_profile()

    assert profile.photo is None


async def test_get_profile_mantem_foto_enviada_com_nome_no_picture():
    foto = "https://arquivos.unb.br/arquivos/2020090019676920547460c2e4c9016a4/no_picture.png"
    sigaa = FakeDashboard(page=DASHBOARD.replace("/arquivos/foto.jpg", foto))
    async with SigaaClient(session_token="tok", transport=sigaa.transport) as client:
        profile = await client.profile.get_profile()

    assert profile.photo == foto


async def test_get_profile_sem_indices_academicos_vem_none():
    sigaa = FakeDashboard(page=DASHBOARD_SEM_INDICES)
    async with SigaaClient(session_token="tok", transport=sigaa.transport) as client:
        profile = await client.profile.get_profile()

    assert profile.ira is None
    assert profile.mp is None
    assert profile.workload is None
    assert profile.entry_semester is None


@pytest.mark.parametrize("value", ["2025", "2025.0", "25.1", "2025/1"])
async def test_entrada_fora_do_formato_e_barulhenta(value):
    sigaa = FakeDashboard(page=DASHBOARD.replace("2025.1", value))
    async with SigaaClient(session_token="tok", transport=sigaa.transport) as client:
        with pytest.raises(SigaaParseError):
            await client.profile.get_profile()


async def test_carga_horaria_incompleta_e_barulhenta():
    page = DASHBOARD.replace("CH. Optativa Pendente", "CH. Outra Coisa")
    sigaa = FakeDashboard(page=page)
    async with SigaaClient(session_token="tok", transport=sigaa.transport) as client:
        with pytest.raises(SigaaParseError):
            await client.profile.get_profile()


EDIT_FORM = """<form name="form:1" action="/sigaa/portais/discente/perfil.jsf">
<input type="hidden" name="form:1" value="form:1">
<input type="hidden" name="javax.faces.ViewState" value="state">
<input type="hidden" name="apenasSenha" value="">
<input type="hidden" name="inputHiddenOpcaoExibir" value="3">
<input name="cpf" value="">
<input type="hidden" name="idFoto" value="">
<img id="fotoPerfil" src="/sigaa/img/no_picture.png">
<textarea name="descricaoPessoal">Bio de teste.</textarea>
<textarea name="areasInteresse">Interesse preservado</textarea>
<textarea name="form:assinatura">Assinatura preservada</textarea>
<input name="curriculoLattes" value="https://lattes.cnpq.br/teste">
<input type="checkbox" checked name="checkBoxReprovacoesNoMesmoComponenteConsideradas">
<input type="submit" name="form:salvar" value="Gravar perfil">
</form>"""


async def test_edita_bio_preservando_campos_e_sem_resetar_qrcode():
    page = EDIT_FORM
    requests = []

    def handle(request):
        nonlocal page
        requests.append(request)
        if request.method == "POST":
            body = request.content.decode()
            assert "Interesse preservado" in body
            assert "Assinatura preservada" in body
            assert "https://lattes.cnpq.br/teste" in body
            assert "checkBoxReprovacoesNoMesmoComponenteConsideradas" not in body
            assert "multipart/form-data" in request.headers["content-type"]
            assert 'name="apenasSenha"\r\n\r\n\r\n' in body
            assert 'name="inputHiddenOpcaoExibir"\r\n\r\n2\r\n' in body
            page = page.replace("Bio de teste.", "Nova bio")
            return httpx.Response(200, text=DASHBOARD_ATUALIZADO)
        if request.url.path.endswith("discente.jsf"):
            return httpx.Response(200, text=DASHBOARD)
        return httpx.Response(200, text=page)

    async with SigaaClient(
        session_token="tok", transport=httpx.MockTransport(handle)
    ) as client:
        await client.profile.update_profile(password="segredo-teste", bio="Nova bio")
    assert len([r for r in requests if r.method == "POST"]) == 1


async def test_recusa_action_externo_sem_enviar_senha():
    fake = FakeDashboard(
        EDIT_FORM.replace(
            "/sigaa/portais/discente/perfil.jsf", "https://example.org/roubar"
        )
    )
    async with SigaaClient(session_token="tok", transport=fake.transport) as client:
        with pytest.raises(SigaaParseError):
            await client.profile.update_profile(password="segredo", bio="nova")
    assert all(r.method == "GET" for r in fake.requests)


async def test_http_200_sem_alteracao_nao_confirma_sucesso():
    fake = FakeDashboard(EDIT_FORM)
    async with SigaaClient(session_token="tok", transport=fake.transport) as client:
        with pytest.raises(SigaaParseError, match="não confirmou a atualização"):
            await client.profile.update_profile(password="segredo", bio="nova")


async def test_timeout_na_escrita_nao_repete_post():
    posts = 0

    def handle(request):
        nonlocal posts
        if request.method == "POST":
            posts += 1
            raise httpx.ReadTimeout("timeout")
        return httpx.Response(200, text=EDIT_FORM)

    async with SigaaClient(
        session_token="tok", transport=httpx.MockTransport(handle)
    ) as client:
        with pytest.raises(httpx.ReadTimeout):
            await client.profile.update_profile(password="segredo", bio="nova")
    assert posts == 1


def _form_com_foto():
    return EDIT_FORM.replace(
        "/sigaa/img/no_picture.png", "/arquivos/antiga.jpg"
    ).replace(
        "</form>",
        """<a id="btnExcluirFoto" onclick="jsfcljs(f,{'btnExcluirFoto':'btnExcluirFoto','idFotoRemovida':'123'},'')"></a></form>""",
    )


async def test_remocao_exclui_e_grava_o_perfil_a_partir_da_resposta():
    page = _form_com_foto()
    staged = page.replace("/arquivos/antiga.jpg", "/sigaa/img/no_picture.png")
    posts = []

    def handle(request):
        nonlocal page
        if request.method == "POST":
            body = request.content.decode()
            posts.append(body)
            if "idFotoRemovida" in body:
                assert "form:salvar" not in body
                return httpx.Response(200, text=staged)
            assert "form:salvar" in body
            assert "Bio de teste." in body
            page = staged
            return httpx.Response(200, text=DASHBOARD_ATUALIZADO)
        if request.url.path.endswith("discente.jsf"):
            return httpx.Response(200, text=DASHBOARD)
        return httpx.Response(200, text=page)

    async with SigaaClient(
        session_token="tok", transport=httpx.MockTransport(handle)
    ) as client:
        await client.profile.update_profile(password="segredo", remove_photo=True)
    assert len(posts) == 2


async def test_remocao_sem_mensagem_ao_gravar_nao_confirma_sucesso():
    page = _form_com_foto()
    staged = page.replace("/arquivos/antiga.jpg", "/sigaa/img/no_picture.png")

    def handle(request):
        if request.method == "POST":
            return httpx.Response(200, text=staged)
        return httpx.Response(200, text=page)

    async with SigaaClient(
        session_token="tok", transport=httpx.MockTransport(handle)
    ) as client:
        with pytest.raises(SigaaParseError, match="não confirmou a remoção"):
            await client.profile.update_profile(password="segredo", remove_photo=True)


async def test_foto_na_mesma_url_e_confirmada_pela_mensagem():
    path = "/arquivos/perfil.jpg"
    page = EDIT_FORM.replace("/sigaa/img/no_picture.png", path)
    posts = 0

    def handle(request):
        nonlocal posts
        if request.method == "POST":
            posts += 1
            assert b'name="alterarFoto"; filename="perfil.jpg"' in request.content
            assert b"Bio de teste." in request.content
            return httpx.Response(200, text=DASHBOARD_ATUALIZADO)
        if request.url.path.endswith("discente.jsf"):
            return httpx.Response(200, text=DASHBOARD)
        return httpx.Response(200, text=page)

    async with SigaaClient(
        session_token="tok", transport=httpx.MockTransport(handle)
    ) as client:
        profile = await client.profile.update_profile(
            password="segredo", photo=b"foto nova"
        )
    assert profile.photo.endswith(path)
    assert posts == 1


async def test_redirecionamento_de_gravacao_nao_reenvia_senha():
    page = EDIT_FORM
    requests = []

    def handle(request):
        nonlocal page
        requests.append(request)
        if request.method == "POST":
            page = page.replace("Bio de teste.", "Nova bio")
            return httpx.Response(
                302, headers={"location": "/sigaa/portais/discente/discente.jsf"}
            )
        if request.url.path.endswith("discente.jsf"):
            return httpx.Response(200, text=DASHBOARD_ATUALIZADO)
        return httpx.Response(200, text=page)

    async with SigaaClient(
        session_token="tok", transport=httpx.MockTransport(handle)
    ) as client:
        await client.profile.update_profile(password="segredo", bio="Nova bio")
    assert len([r for r in requests if r.method == "POST"]) == 1


async def test_redirecionamento_pelo_portal_segue_ate_a_home_com_mensagem():
    page = EDIT_FORM
    paths = []

    def handle(request):
        nonlocal page
        paths.append(request.url.path)
        if request.method == "POST":
            page = page.replace("Bio de teste.", "Nova bio")
            return httpx.Response(
                302, headers={"location": "/sigaa/verPortalDiscente.do"}
            )
        if request.url.path == "/sigaa/verPortalDiscente.do":
            return httpx.Response(
                302, headers={"location": "/sigaa/portais/discente/discente.jsf"}
            )
        if request.url.path.endswith("discente.jsf"):
            return httpx.Response(200, text=DASHBOARD_ATUALIZADO)
        return httpx.Response(200, text=page)

    async with SigaaClient(
        session_token="tok", transport=httpx.MockTransport(handle)
    ) as client:
        await client.profile.update_profile(password="segredo", bio="Nova bio")
    assert "/sigaa/verPortalDiscente.do" in paths


async def test_redirecionamento_para_home_sem_mensagem_nao_confirma_sucesso():
    def handle(request):
        if request.method == "POST":
            return httpx.Response(
                302, headers={"location": "/sigaa/portais/discente/discente.jsf"}
            )
        return httpx.Response(
            200,
            text=DASHBOARD if request.url.path.endswith("discente.jsf") else EDIT_FORM,
        )

    async with SigaaClient(
        session_token="tok", transport=httpx.MockTransport(handle)
    ) as client:
        with pytest.raises(SigaaParseError, match="não confirmou a atualização"):
            await client.profile.update_profile(password="segredo", bio="nova")


async def test_tela_sem_imagem_nao_e_confundida_com_foto_removida():
    fake = FakeDashboard(
        EDIT_FORM.replace('<img id="fotoPerfil" src="/sigaa/img/no_picture.png">', "")
    )
    async with SigaaClient(session_token="tok", transport=fake.transport) as client:
        with pytest.raises(SigaaParseError, match="Imagem de perfil ausente"):
            await client.profile.update_profile(password="segredo", remove_photo=True)
    assert all(request.method == "GET" for request in fake.requests)
