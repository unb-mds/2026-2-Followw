import httpx
import pytest

from sigaa_client import SigaaParseError, SigaaPublicClient, SigaaSearchError
from sigaa_client.config import (
    PUBLIC_HOME_PATH,
    PUBLIC_PROFESSOR_DISCIPLINES_PATH,
    PUBLIC_PROFESSOR_PROFILE_PATH,
    PUBLIC_PROFESSORS_PATH,
)

FORM = """
<form id="form" name="form" action="/sigaa/public/docente/busca_docentes.jsf">
  <input type="hidden" name="form" value="form">
  <input name="form:nome">
  <select name="form:departamento">
    <option value="0">-- TODOS --</option>
    <option value="508">DEPTO CIÊNCIAS DA COMPUTAÇÃO - BRASÍLIA</option>
  </select>
  <input type="submit" name="form:buscar" value="Buscar">
  <input type="hidden" name="javax.faces.ViewState" value="j_id1">
</form>
"""
RESULTS = """
<table class="listagem"><tbody><tr class="linhaPar topo">
  <td class="foto"><img src="/sigaa/img/no_picture.png"></td>
  <td><span class="nome">MARIA SILVA</span>
  <span class="departamento">DEPTO CIÊNCIAS DA COMPUTAÇÃO</span>
  <span class="pagina"><a href="/sigaa/public/docente/portal.jsf?siape=1234567">ver página pública</a></span></td>
</tr></tbody></table>
"""
PROFILE = """
<div id="left"><h3>MARIA SILVA</h3></div>
<div id="perfil-docente">
  <dl><dt>Descrição pessoal</dt><dd>Pesquisa sistemas.</dd></dl>
  <dl><dt>Formação acadêmica/profissional (Onde obteve os títulos)</dt><dd><i>não informada</i></dd></dl>
  <dl><dt>Áreas de Interesse (ensino e pesquisa)</dt><dd>Sistemas distribuídos</dd></dl>
  <dl><dt>Currículo Lattes:</dt><dd><a href="https://lattes.cnpq.br/123">Currículo</a></dd></dl>
</div>
<div id="contato"><dl><dt>Endereço eletrônico</dt><dd>maria@unb.br</dd></dl></div>
"""
DISCIPLINES = """
<div id="turmas-graduacao"><table class="listagem"><tbody>
  <tr><td class="anoPeriodo">2026.2</td></tr>
  <tr><td class="codigo">CIC0205</td><td>Disciplina</td></tr>
  <tr><td class="codigo">CIC0205</td><td>Disciplina</td></tr>
  <tr><td class="anoPeriodo">2026.1</td></tr>
  <tr><td class="codigo">CIC0108</td><td>Disciplina</td></tr>
</tbody></table></div>
<div id="turmas-pos"><table class="listagem"><tr><td class="codigo">PPGI001</td></tr></table></div>
"""


class FakeSigaa:
    def __init__(self, results=RESULTS, profile=PROFILE, disciplines=DISCIPLINES):
        self.results = results
        self.profile = profile
        self.disciplines = disciplines
        self.payloads = []
        self.paths = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        self.paths.append(path)
        if path == PUBLIC_HOME_PATH:
            return httpx.Response(200, text="home")
        if path == PUBLIC_PROFESSOR_PROFILE_PATH:
            return httpx.Response(200, text=self.profile)
        if path == PUBLIC_PROFESSOR_DISCIPLINES_PATH:
            return httpx.Response(200, text=self.disciplines)
        if path == PUBLIC_PROFESSORS_PATH and request.method == "GET":
            return httpx.Response(200, text=FORM)
        self.payloads.append(dict(httpx.QueryParams(request.content.decode())))
        return httpx.Response(200, text=self.results)


async def test_busca_usa_departamento_viewstate_e_link_siape():
    fake = FakeSigaa()
    async with SigaaPublicClient(transport=httpx.MockTransport(fake)) as client:
        professors = await client.professors.search(508)

    assert fake.paths[:3] == [
        PUBLIC_HOME_PATH,
        PUBLIC_PROFESSORS_PATH,
        PUBLIC_PROFESSORS_PATH,
    ]
    assert fake.payloads[0]["form:departamento"] == "508"
    assert fake.payloads[0]["javax.faces.ViewState"] == "j_id1"
    assert fake.payloads[0]["form:buscar"] == "Buscar"
    assert professors[0].siape == 1234567
    assert professors[0].department.id == 508
    assert professors[0].photo is None


async def test_perfil_e_disciplinas_de_graduacao_agregadas():
    fake = FakeSigaa()
    async with SigaaPublicClient(transport=httpx.MockTransport(fake)) as client:
        professor = (await client.professors.search(508))[0]
        profile = await client.professors.get_profile(professor)

    assert profile.description == "Pesquisa sistemas."
    assert profile.education is None
    assert profile.interests == "Sistemas distribuídos"
    assert profile.lattes == "https://lattes.cnpq.br/123"
    assert profile.email == "maria@unb.br"
    assert [(d.semester, d.code, d.occurrences) for d in profile.disciplines] == [
        ("2026.2", "CIC0205", 2),
        ("2026.1", "CIC0108", 1),
    ]


async def test_nome_curto_nao_consulta_sigaa():
    fake = FakeSigaa()
    async with SigaaPublicClient(transport=httpx.MockTransport(fake)) as client:
        with pytest.raises(SigaaSearchError, match="4 caracteres"):
            await client.professors.search(name="Mar")
    assert fake.paths == []


async def test_busca_por_nome_resolve_departamento_do_resultado():
    fake = FakeSigaa()
    async with SigaaPublicClient(transport=httpx.MockTransport(fake)) as client:
        professors = await client.professors.search(name="Maria")
    assert fake.payloads[0]["form:nome"] == "Maria"
    assert fake.payloads[0]["form:departamento"] == "0"
    assert professors[0].department.id == 508


async def test_busca_sem_resultado_retorna_lista_vazia():
    fake = FakeSigaa(
        results="<ul class='erros'><li>Nenhum docente foi encontrado de acordo com os critérios de busca informados</li></ul>"
    )
    async with SigaaPublicClient(transport=httpx.MockTransport(fake)) as client:
        assert await client.professors.search(508) == []


async def test_perfil_de_outro_docente_falha():
    fake = FakeSigaa(profile=PROFILE.replace("MARIA SILVA", "OUTRA PESSOA"))
    async with SigaaPublicClient(transport=httpx.MockTransport(fake)) as client:
        professor = (await client.professors.search(508))[0]
        with pytest.raises(SigaaParseError, match="OUTRA PESSOA"):
            await client.professors.get_profile(professor)


async def test_email_nao_institucional_fica_nulo():
    fake = FakeSigaa(profile=PROFILE.replace("maria@unb.br", "maria@example.com"))
    async with SigaaPublicClient(transport=httpx.MockTransport(fake)) as client:
        professor = (await client.professors.search(508))[0]
        profile = await client.professors.get_profile(professor)
    assert profile.email is None


async def test_perfil_sem_contato_continua_disponivel():
    fake = FakeSigaa(
        profile=PROFILE.replace(
            '<div id="contato"><dl><dt>Endereço eletrônico</dt><dd>maria@unb.br</dd></dl></div>',
            "",
        )
    )
    async with SigaaPublicClient(transport=httpx.MockTransport(fake)) as client:
        professor = (await client.professors.search(508))[0]
        profile = await client.professors.get_profile(professor)
    assert profile.email is None


async def test_italico_no_texto_do_perfil_nao_e_tratado_como_ausente():
    fake = FakeSigaa(
        profile=PROFILE.replace("Pesquisa sistemas.", "<i>Pesquisa</i> sistemas.")
    )
    async with SigaaPublicClient(transport=httpx.MockTransport(fake)) as client:
        professor = (await client.professors.search(508))[0]
        profile = await client.professors.get_profile(professor)
    assert profile.description == "Pesquisa sistemas."


async def test_docente_sem_disciplinas_de_graduacao_tem_lista_vazia():
    fake = FakeSigaa(
        disciplines='<div id="turmas-graduacao"><p class="vazio">Nenhuma turma encontrada</p></div>'
    )
    async with SigaaPublicClient(transport=httpx.MockTransport(fake)) as client:
        professor = (await client.professors.search(508))[0]
        profile = await client.professors.get_profile(professor)
    assert profile.disciplines == ()
