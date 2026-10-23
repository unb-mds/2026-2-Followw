from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from http.cookies import SimpleCookie
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import ANY, AsyncMock

import httpx
import pytest
from pydantic import SecretStr
from pypdf import PdfReader
from sigaa_client import (
    AuthenticationFailed,
    Credentials,
    CurriculumWorkload,
    DocumentUnavailable,
    EnrollmentCertificate,
    MissingProfilePhoto,
    RestaurantCredentials,
    RestaurantStatement,
    RestaurantStatementEntry,
    SessionExpired,
    SigaaParseError,
    UserProfile,
)
from sigaa_client import UserLevel as SigaaUserLevel
from sigaa_client.config import SIGAA_BASE_URL
from sqlalchemy import select

from api.cookies import (
    ACCESS_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    decrypt_cookie,
    encrypt_cookie,
)
from api.db.enums import UserLevel
from api.db.main import get_sessionmaker
from api.db.models import Curriculum, User
from api.modules.me.repository import UserRepository

CREDENCIAIS = Credentials(registration="251000000", password=SecretStr("senha123"))
NO_CACHE = {"Cache-Control": "no-cache"}
PERFIL = """
<html><body><div id="perfil-docente">
  <div class="foto"><img src="/arquivos/foto.jpg" /></div>
  <div class="info-docente"><span class="nome">NOME DISCENTE</span>Bio de teste.</div>
  <table>
    <tr><td>Matrícula:</td><td>251000000</td></tr>
    <tr><td>Curso:</td><td>ENGENHARIA DE SOFTWARE/FCTE - Bacharelado</td></tr>
    <tr><td>Nível:</td><td>GRADUAÇÃO</td></tr>
    <tr><td>Entrada:</td><td>2025.1</td></tr>
    <tr><td colspan="2"><table>
      <tr><td><acronym>IRA:</acronym></td><td>3.9524</td></tr>
      <tr><td><acronym>MP:</acronym></td><td>4.1724</td></tr>
    </table></td></tr>
    <tr><td colspan="2"><table>
      <tr><td> CH. Obrigat&#243;ria Pendente </td><td> 2175 </td></tr>
      <tr><td> CH. Optativa Pendente </td><td> 420 </td></tr>
      <tr><td> CH. Total Curr&#237;culo </td><td> 3525 </td></tr>
      <tr><td> CH. Complementar Pendente </td><td> 0 </td></tr>
    </table></td></tr>
  </table>
  <span>35% Integralizado</span>
</div></body></html>
"""


def test_login_seguido_de_me_responde_do_cache(client, sigaa):
    sigaa.profile = PERFIL
    login = client.post(
        "/auth/sigaa", json={"registration": "251000000", "password": "senha123"}
    )
    assert login.status_code == 200
    requests_before = sigaa.profile_requests

    response = client.get("/me")

    assert response.status_code == 200
    assert response.json() == {
        "name": "NOME DISCENTE",
        "registration": "251000000",
        "photo": f"{SIGAA_BASE_URL}/arquivos/foto.jpg",
        "email": None,
        "bio": "Bio de teste.",
        "unit": {"id": 673, "code": "FCTE", "name": "CAMPUS UNB GAMA"},
        "course": {"id": ANY, "name": "ENGENHARIA DE SOFTWARE", "shift": None},
        "entry_semester": "2025.1",
        "integralization": 35,
        "workload": {
            "total": 3525,
            "pending_mandatory": 2175,
            "pending_optional": 420,
            "pending_complementary": 0,
        },
        "period_max_workload": None,
        "ira": 3.9524,
        "mp": 4.1724,
        "level": "Graduação",
    }
    assert sigaa.profile_requests == requests_before
    sigaa.profile = PERFIL.replace("3.9524", "4.0")
    assert client.get("/me").json()["ira"] == 3.9524
    assert client.get("/me", headers=NO_CACHE).json()["ira"] == 4.0
    assert client.get("/me").json()["ira"] == 4.0
    assert sigaa.profile_requests == requests_before + 1
    # Só a sessão do usuário segue aberta: a do sync da conta foi encerrada.
    assert sigaa.logins - sigaa.logouts == 1


def test_troca_de_curso_loga_com_a_matricula_antiga_e_me_responde_o_perfil(
    client, sigaa, database
):
    # O CAS só aceita a matrícula antiga; o perfil já mostra a do curso novo.
    sigaa.profile = PERFIL.replace("<td>251000000</td>", "<td>252000000</td>")
    login = client.post(
        "/auth/sigaa", json={"registration": "251000000", "password": "senha123"}
    )
    assert login.status_code == 200

    response = client.get("/me")
    client.patch("/me/settings", json={"displayName": "Ana"})

    assert response.status_code == 200
    assert response.json()["registration"] == "252000000"
    assert client.get("/me/settings").json() == {"displayName": "Ana"}

    with database() as session:
        users = [
            (u.registration, u.old_registration, u.settings)
            for u in session.scalars(select(User))
        ]
    assert users == [("252000000", "251000000", {"displayName": "Ana"})]


def test_me_sem_campos_opcionais_retorna_null(client, sigaa, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))

    response = client.get("/me")

    assert response.status_code == 200
    for field in (
        "photo",
        "email",
        "bio",
        "entry_semester",
        "integralization",
        "workload",
        "period_max_workload",
        "ira",
        "mp",
    ):
        assert response.json()[field] is None


def test_me_traz_carga_maxima_por_periodo_da_matriz(client, sigaa, database):
    sigaa.profile = PERFIL
    client.post(
        "/auth/sigaa", json={"registration": "251000000", "password": "senha123"}
    )
    with database.begin() as session:
        user = session.scalars(select(User)).one()
        user.curriculum = Curriculum(
            course_id=user.course_id,
            sigaa_id=1,
            code="6360/1",
            valid_from="2025.1",
            created_year=2025,
            active=True,
            matrix="ENGENHARIA DE SOFTWARE",
            period_max_workload=420,
        )

    assert client.get("/me").json()["period_max_workload"] == 420


@pytest.mark.parametrize("refresh", [None, "cookie-invalido", "expirado"])
def test_me_sem_refresh_valido_retorna_401(client, sigaa, cookies, refresh):
    sigaa.valid_tokens.add("app14~VIVO")
    client.cookies.update(cookies(access="app14~VIVO"))
    if refresh == "expirado":
        refresh = encrypt_cookie(
            REFRESH_COOKIE_NAME,
            {
                "registration": CREDENCIAIS.registration,
                "password": "senha123",
                "exp": int((datetime.now(UTC) - timedelta(minutes=1)).timestamp()),
            },
        )
    if refresh is not None:
        client.cookies.set(REFRESH_COOKIE_NAME, refresh)

    response = client.get("/me")

    assert response.status_code == 401
    assert sigaa.logins == 0


def test_me_sem_cookies_retorna_401(client, sigaa):
    assert client.get("/me").status_code == 401
    assert sigaa.logins == 0


@pytest.mark.parametrize("access", [None, "app14~MORTO"])
def test_me_renova_sessao_e_devolve_cookies(client, sigaa, cookies, access):
    client.cookies.update(cookies(access=access, refresh=CREDENCIAIS))

    response = client.get("/me")

    assert response.status_code == 200
    assert sigaa.logins == 1
    token = decrypt_cookie(ACCESS_COOKIE_NAME, response.cookies[ACCESS_COOKIE_NAME])
    assert token["session_token"] == "app14~TOKEN1"
    assert REFRESH_COOKIE_NAME in response.cookies


@pytest.mark.parametrize("access", [None, "app14~MORTO"])
def test_me_com_credenciais_recusadas_retorna_401(client, sigaa, cookies, access):
    client.cookies.update(cookies(access=access, refresh=CREDENCIAIS))
    sigaa.password = "senha-alterada"

    assert client.get("/me").status_code == 401


@pytest.mark.parametrize("access", [None, "app14~VIVO"])
def test_me_com_sigaa_indisponivel_retorna_502(client, sigaa, cookies, access):
    sigaa.valid_tokens.add("app14~VIVO")
    client.cookies.update(cookies(access=access, refresh=CREDENCIAIS))
    sigaa.unavailable = True

    response = client.get("/me")

    assert response.status_code == 502
    assert response.json() == {"detail": "SIGAA is unavailable"}


def test_me_com_login_sem_token_retorna_502(client, sigaa, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    sigaa.mode = "sem_cookie"

    assert client.get("/me").status_code == 502


@pytest.mark.parametrize(
    "page",
    [
        pytest.param("<html>layout inesperado</html>", id="sem-perfil"),
        pytest.param(PERFIL.replace("3.9524", "invalido"), id="ira-invalido"),
    ],
)
def test_me_com_perfil_invalido_retorna_502(client, sigaa, cookies, page):
    sigaa.valid_tokens.add("app14~VIVO")
    client.cookies.update(cookies(access="app14~VIVO", refresh=CREDENCIAIS))
    sigaa.profile = page

    assert client.get("/me").status_code == 502


def test_me_aceita_indice_zero(client, sigaa, cookies):
    sigaa.valid_tokens.add("app14~VIVO")
    client.cookies.update(cookies(access="app14~VIVO", refresh=CREDENCIAIS))
    sigaa.profile = PERFIL.replace("4.1724", "0")

    response = client.get("/me")

    assert response.status_code == 200
    assert response.json()["mp"] == 0


def test_me_com_erro_http_do_sigaa_retorna_502(client, sigaa, cookies):
    sigaa.valid_tokens.add("app14~VIVO")
    client.cookies.update(cookies(access="app14~VIVO", refresh=CREDENCIAIS))
    sigaa.profile_status = 503

    assert client.get("/me").status_code == 502


def test_me_apos_logout_exige_novo_login(client, sigaa):
    client.post(
        "/auth/sigaa", json={"registration": "251000000", "password": "senha123"}
    )
    assert client.get("/me").status_code == 200
    assert client.delete("/auth/sigaa").status_code == 200
    assert client.get("/me").status_code == 401


def test_me_documenta_campos_e_erros(client):
    schema = client.get("/openapi.json").json()
    route = schema["paths"]["/me"]["get"]
    assert "401" in route["responses"]
    fields = schema["components"]["schemas"]["UserProfile"]["properties"]
    assert {
        "name",
        "photo",
        "email",
        "bio",
        "unit",
        "course",
        "entry_semester",
        "integralization",
        "workload",
        "period_max_workload",
        "ira",
        "mp",
    } <= fields.keys()
    assert "password" not in fields
    assert "session_token" not in fields


def _entry(description, amount="0.00", *, day=25):
    return RestaurantStatementEntry(
        occurred_at=datetime.fromisoformat(f"2026-09-{day}T12:00:00"),
        description=description,
        amount=Decimal(amount),
    )


@pytest.fixture
def documents(stub_sigaa):
    pdf = b"%PDF-1.7\n%teste\n%%EOF"
    stub_sigaa.documents = SimpleNamespace(
        get_student_card_pdf=AsyncMock(return_value=pdf),
        get_transcript_pdf=AsyncMock(return_value=pdf),
        get_enrollment_certificate=AsyncMock(
            return_value=EnrollmentCertificate(
                issued_at="20/10/2026 21:52",
                identification=(
                    ("Período Letivo", "2026.2 (10/08/2026 à 14/12/2026)"),
                    ("Nível", "GRADUAÇÃO"),
                    ("Matrícula", "251000000"),
                    ("Vínculo", "REGULAR"),
                    ("Nome", "JOÃO DA CONCEIÇÃO"),
                    ("Curso", "ENGENHARIA DE SOFTWARE"),
                ),
                enrollment_headers=(
                    "Cód.",
                    "Componentes Curriculares/Docentes",
                    "Turma",
                    "Status",
                    "Horário",
                ),
                enrollments=(
                    (
                        "MAT0027",
                        "CÁLCULO 3\nDOCENTE DE TESTE\nTipo: DISCIPLINA   Local: SALA 1",
                        "12",
                        "MATRICULADO(A)",
                        "235M34",
                    ),
                ),
                schedule=(
                    ("Horários", "Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"),
                    (
                        "08:00 - 08:55",
                        "---",
                        "MAT0027",
                        "---",
                        "---",
                        "---",
                        "---",
                        "---",
                    ),
                ),
                authentication="Para verificar a autenticidade deste documento acesse https://sigaa.unb.br/sigaa/documentos/ informando a matrícula, a data de emissão e o código de verificação 012345abcd",
                footer="SIGAA | STI | Copyright © 2006-2026 - UFRN - app-teste",
            )
        ),
    )
    return stub_sigaa.documents


@pytest.fixture
def restaurant(stub_sigaa):
    stub_sigaa.restaurant = SimpleNamespace(
        get_restaurant_statement=AsyncMock(
            return_value=RestaurantStatement(
                balance=Decimal("12.50"),
                group=2,
                entries=(
                    _entry("Saldo", "12.50"),
                    _entry("Grupo 2 Almoço", "6.10"),
                ),
            )
        ),
        get_restaurant_credentials=AsyncMock(
            return_value=RestaurantCredentials(
                token="TOKEN-TESTE",
                valid_until=date(2027, 3, 1),
            )
        ),
    )
    return stub_sigaa.restaurant


DOCUMENT_DOWNLOADS = [
    ("student-card", "get_student_card_pdf"),
    ("transcript", "get_transcript_pdf"),
    ("enrollment-certificate", "get_enrollment_certificate"),
]


@pytest.mark.parametrize(
    "path,method,filename",
    [
        ("student-card", "get_student_card_pdf", "carteirinha.pdf"),
        ("transcript", "get_transcript_pdf", "historico.pdf"),
    ],
)
def test_download_documento_preserva_conteudo_cookies_e_nao_usa_cache(
    client, cookies, documents, qstash, path, method, filename
):
    def banco_proibido():
        pytest.fail("Download de documento não deve usar banco")

    client.app.dependency_overrides[get_sessionmaker] = banco_proibido
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    for _ in range(2):
        response = client.post(f"/me/{path}")
        assert response.status_code == 200
        assert response.content == getattr(documents, method).return_value
        assert response.headers["content-type"] == "application/pdf"
        assert (
            response.headers["content-disposition"]
            == f'attachment; filename="{filename}"'
        )
        assert response.headers["cache-control"] == "no-store"
        assert int(response.headers["content-length"]) == len(response.content)
        assert ACCESS_COOKIE_NAME in response.cookies
        assert REFRESH_COOKIE_NAME in response.cookies
    assert getattr(documents, method).await_count == 2
    assert qstash.published == []


@pytest.mark.parametrize("path,method", DOCUMENT_DOWNLOADS)
def test_download_documento_exige_login(client, stub_sigaa, documents, path, method):
    assert client.post(f"/me/{path}").status_code == 401
    getattr(documents, method).assert_not_awaited()
    stub_sigaa.created.assert_not_called()


@pytest.mark.parametrize(
    "error,status",
    [
        (AuthenticationFailed(), 401),
        (SessionExpired(), 502),
        (SigaaParseError("PDF inválido"), 502),
        (httpx.ReadTimeout("fora"), 502),
    ],
)
@pytest.mark.parametrize("path,method", DOCUMENT_DOWNLOADS)
def test_download_documento_traduz_erros(
    client, cookies, documents, error, status, path, method
):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    getattr(documents, method).side_effect = error
    assert client.post(f"/me/{path}").status_code == status


_SEM_FOTO = "Não foi possível emitir a carteirinha pois você não possui foto de perfil."


@pytest.mark.parametrize("path,method", DOCUMENT_DOWNLOADS)
def test_download_recusado_pelo_sigaa_retorna_422_com_motivo(
    client, cookies, documents, path, method
):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    getattr(documents, method).side_effect = DocumentUnavailable("Motivo do SIGAA")
    response = client.post(f"/me/{path}")
    assert response.status_code == 422
    assert response.json() == {
        "detail": "Não foi possível emitir o documento: Motivo do SIGAA"
    }


def test_carteirinha_sem_foto_explica_o_motivo(client, cookies, documents, restaurant):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    error = MissingProfilePhoto("Discente não possui foto")
    documents.get_student_card_pdf.side_effect = error
    restaurant.get_restaurant_credentials.side_effect = error
    for response in (client.post("/me/student-card"), client.get("/me/ru-token")):
        assert response.status_code == 422
        assert response.json() == {"detail": _SEM_FOTO}


@pytest.mark.parametrize(
    "path", ["student-card", "transcript", "enrollment-certificate"]
)
def test_openapi_documenta_download_documento(client, path):
    methods = client.get("/openapi.json").json()["paths"][f"/me/{path}"]
    assert "get" not in methods
    route = methods["post"]
    assert route["tags"] == ["Me"]
    assert {"401", "422", "502"} <= route["responses"].keys()
    assert route["responses"]["200"]["content"] == {
        "application/pdf": {"schema": {"type": "string", "format": "binary"}}
    }


@pytest.mark.parametrize("path,method", DOCUMENT_DOWNLOADS)
def test_download_documento_rejeita_get(client, documents, path, method):
    assert client.get(f"/me/{path}").status_code == 405
    getattr(documents, method).assert_not_awaited()


def test_atestado_gera_pdf_com_dados_da_emissao_sem_cache_ou_banco(
    client, cookies, documents, qstash
):
    client.app.dependency_overrides[get_sessionmaker] = lambda: pytest.fail(
        "Atestado não usa banco"
    )
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    for _ in range(2):
        response = client.post("/me/enrollment-certificate")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert (
            response.headers["content-disposition"]
            == 'attachment; filename="atestado-matricula.pdf"'
        )
        assert response.headers["cache-control"] == "no-store"
        assert ACCESS_COOKIE_NAME in response.cookies
        assert REFRESH_COOKIE_NAME in response.cookies
        reader = PdfReader(BytesIO(response.content))
        assert tuple(reader.pages[0].mediabox) == pytest.approx((0, 0, 594.96, 841.92))
        text = "\n".join(page.extract_text() for page in reader.pages)
        for expected in (
            "JOÃO DA CONCEIÇÃO",
            "251000000",
            "CÁLCULO 3",
            "20/10/2026 21:52",
            "012345abcd",
            "235M34",
        ):
            assert expected in text
        assert "08:00 - 08:55" in " ".join(text.split())
        assert text.count("MAT0027") == 2
        assert len(reader.pages[0].images) == 2
        assert "SIGAA | STI | Copyright" in text
        assert "ATIVIDADES MATRICULADAS:" not in text.upper()
        assert "versão PDF pelo Followw" not in text
    assert documents.get_enrollment_certificate.await_count == 2
    assert qstash.published == []


def test_atestado_pagina_nomes_longos_sem_interpretar_marcacao(documents):
    from api.modules.me.enrollment_certificate import render_enrollment_certificate

    certificate = documents.get_enrollment_certificate.return_value
    name = "JOÃO & <b>CONCEIÇÃO</b>"
    certificate = certificate.model_copy(
        update={
            "identification": tuple(
                (label, name if label == "Nome" else value)
                for label, value in certificate.identification
            ),
            "enrollments": tuple(
                (
                    f"MAT{i:04d}",
                    "DISCIPLINA COM NOME MUITO LONGO " * 5,
                    "01",
                    "MATRICULADO(A)",
                    "24T23",
                )
                for i in range(40)
            ),
        }
    )
    pdf = render_enrollment_certificate(certificate)
    pages = PdfReader(BytesIO(pdf)).pages
    text = "\n".join(page.extract_text() for page in pages)
    assert len(pages) > 1
    assert name in text
    assert all(f"MAT{i:04d}" in text for i in range(40))
    assert "012345abcd" in text
    assert "SIGAA | STI | Copyright" in text
    for number, page in enumerate(pages, 1):
        assert f"{number}/{len(pages)}" in page.extract_text().splitlines()
        assert (
            "Sistema Integrado de Gestão de Atividades Acadêmicas"
            in page.extract_text()
        )


@pytest.mark.parametrize("quantidade", [9, 10, 11, 12, 13])
def test_atestado_mantem_autenticacao_e_rodape_na_mesma_pagina(documents, quantidade):
    from api.modules.me.enrollment_certificate import render_enrollment_certificate

    certificate = documents.get_enrollment_certificate.return_value
    certificate = certificate.model_copy(
        update={
            "enrollments": certificate.enrollments * quantidade,
            "schedule": (certificate.schedule[0], *certificate.schedule[1:] * 10),
            "footer": (
                "SIGAA | Secretaria de Tecnologia da Informação - STI - (61) 3107-0102 | "
                "Copyright © 2006-2026 - UFRN - app14.sigaa14"
            ),
        }
    )
    pages = PdfReader(BytesIO(render_enrollment_certificate(certificate))).pages
    texts = [page.extract_text() for page in pages]
    closing_pages = [
        i
        for i, text in enumerate(texts)
        if "ATENÇÃO" in text or "app14.sigaa14" in text
    ]
    assert closing_pages == [len(pages) - 1]
    assert "ATENÇÃO" in texts[-1]
    assert "012345abcd" in texts[-1]
    assert "app14.sigaa14" in texts[-1]
    # Dez matrículas ainda cabem em uma página com a fonte alternativa.
    if quantidade != 10:
        assert len(pages) == (1 if quantidade == 9 else 2)
    for number, text in enumerate(texts, 1):
        assert f"{number}/{len(pages)}" in text.splitlines()


def test_atestado_mantem_colunas_e_separador_do_layout_de_impressao(documents):
    from api.modules.me.enrollment_certificate import render_enrollment_certificate

    certificate = documents.get_enrollment_certificate.return_value
    component = "PROJETO INTEGRADOR DE ENGENHARIA 1"
    schedule_row = certificate.schedule[1]
    certificate = certificate.model_copy(
        update={
            "enrollments": (
                (
                    "FGA0303",
                    component + "\nDOCENTE DE TESTE\nTipo: DISCIPLINA   Local: SALA 1",
                    "02",
                    "MATRICULADO(A)",
                    "24T45",
                ),
            ),
            "schedule": (
                certificate.schedule[0],
                schedule_row,
                ("",) * 8,
                tuple("FGA0146" if c == "MAT0027" else c for c in schedule_row),
            ),
        }
    )
    reader = PdfReader(BytesIO(render_enrollment_certificate(certificate)))
    positions = {}

    def locate(text, cm, tm, font, size):
        if size == 6.72 and text.strip() in {"MAT0027", "FGA0146"}:
            positions[text.strip()] = cm[5] + tm[5]

    text = reader.pages[0].extract_text(visitor_text=locate)
    assert len(reader.pages) == 1
    assert component in text.splitlines()
    assert "Turma" in [line.strip() for line in text.splitlines()]
    assert positions["MAT0027"] - positions["FGA0146"] == pytest.approx(26.25)


@pytest.mark.parametrize(
    "server", ["app14.sigaa14", "app18.sigaa18", "app26.sigaa26", "app28.sigaa28"]
)
def test_atestado_inclui_impressao_e_preserva_servidor_do_sigaa(documents, server):
    from api.modules.me.enrollment_certificate import render_enrollment_certificate

    certificate = documents.get_enrollment_certificate.return_value.model_copy(
        update={"footer": f"SIGAA | STI | Copyright © 2006-2026 - UFRN - {server}"}
    )
    printed_at = datetime(2026, 10, 21, 1, 26, tzinfo=UTC)
    pdf = render_enrollment_certificate(certificate, printed_at=printed_at)
    page = PdfReader(BytesIO(pdf)).pages[0]
    text = page.extract_text()
    assert "20/10/2026, 22:26" in text
    assert "20/10/2026 21:52" in text
    assert "Sistema Integrado de Gestão de Atividades Acadêmicas" in text
    assert "https://sigaa.unb.br/sigaa/portais/discente/discente.jsf" in text
    assert "discente.jsf#" not in text
    assert "1/1" in text.splitlines()
    assert server in text
    assert text.count(".sigaa") == 1
    assert certificate.footer.endswith(server)


def test_atestado_preserva_dimensoes_e_linha_de_base_da_impressao(documents):
    from api.modules.me.certificate_fonts import certificate_fonts
    from api.modules.me.enrollment_certificate import render_enrollment_certificate

    if certificate_fonts().small_caps is None:
        pytest.skip("As linhas de base de referência requerem a Verdana original.")
    certificate = documents.get_enrollment_certificate.return_value
    page = PdfReader(BytesIO(render_enrollment_certificate(certificate))).pages[0]
    positions = {}

    def locate(text, cm, tm, font, size):
        if text.strip() in {"MATRICULADO(A)", "DOCENTE DE TESTE", "Turma"}:
            positions[text.strip()] = (cm[4] + tm[4], cm[5] + tm[5])

    page.extract_text(visitor_text=locate)
    assert tuple(page.mediabox) == pytest.approx((0, 0, 594.96, 841.92))
    assert float(page.mediabox.top) - positions["MATRICULADO(A)"][1] == pytest.approx(
        209.25
    )
    assert positions["MATRICULADO(A)"][1] - positions["DOCENTE DE TESTE"][
        1
    ] == pytest.approx(7.5)


def test_atestado_inclui_monitoria_e_forma_de_participacao(client, cookies, documents):
    certificate = documents.get_enrollment_certificate.return_value
    documents.get_enrollment_certificate.return_value = certificate.model_copy(
        update={
            "activity_count": 1,
            "footer": "SIGAA | STI | app14.sigaa14",
            "enrollments": (
                *certificate.enrollments,
                (
                    "FGA0413",
                    (
                        "MONITORIA EM ORIENTAÇÃO A OBJETOS\nORIENTADOR(A): DOCENTE DE TESTE\n"
                        "Forma de Participação: ATIVIDADE DE ORIENTAÇÃO INDIVIDUAL"
                    ),
                    "--",
                    "MATRICULADO(A)",
                    "--",
                ),
            ),
        }
    )
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    response = client.post("/me/enrollment-certificate")
    assert response.status_code == 200
    page = PdfReader(BytesIO(response.content)).pages[0]
    labels = []

    def locate(text, cm, tm, font, size):
        if "Forma de Participação:" in text:
            labels.append((font["/BaseFont"], size))

    text = " ".join(page.extract_text(visitor_text=locate).split())
    assert "TURMAS MATRICULADAS: 1 ATIVIDADES MATRICULADAS: 1" in text.upper()
    assert "MONITORIA EM ORIENTAÇÃO A OBJETOS" in text
    assert "ORIENTADOR(A): DOCENTE DE TESTE" in text
    assert "Forma de Participação: ATIVIDADE DE ORIENTAÇÃO INDIVIDUAL" in text
    assert "app14.sigaa14" in text
    assert len(labels) == 1
    assert "Bold" in labels[0][0]
    assert labels[0][1] == pytest.approx(6.72)


@pytest.mark.parametrize(
    "code,component,schedule,x",
    [
        (
            "MAT0027",
            "FUNDAMENTOS DE ARQUITETURA DE COMPUTADORES",
            "35M5 35T1 (10/08/2026 - 14/12/2026)",
            98.63671,
        ),
        (
            "FGA0133",
            "MÉTODOS DE DESENVOLVIMENTO DE SOFTWARE",
            "46T23 (10/08/2026 - 14/12/2026)",
            98.27344,
        ),
    ],
)
def test_atestado_ajusta_colunas_ao_conteudo_como_o_sigaa(
    documents, code, component, schedule, x
):
    from api.modules.me.certificate_fonts import certificate_fonts
    from api.modules.me.enrollment_certificate import render_enrollment_certificate

    if certificate_fonts().small_caps is None:
        pytest.skip("As coordenadas de referência requerem a Verdana original.")
    certificate = documents.get_enrollment_certificate.return_value.model_copy(
        update={"enrollments": ((code, component, "01", "MATRICULADO(A)", schedule),)}
    )
    page = PdfReader(BytesIO(render_enrollment_certificate(certificate))).pages[0]
    positions = []

    def locate(text, cm, tm, font, size):
        if text.strip().startswith(component.split()[0]):
            positions.append(cm[4] + tm[4])

    page.extract_text(visitor_text=locate)
    assert positions == pytest.approx([x], abs=0.03)


@pytest.mark.parametrize(
    "local,deslocamento",
    [
        ("FCTE - S1 / MOCAP", 2.23828125),
        ("FCTE - LABORATÓRIO DE SOFTWARE E SISTEMAS DISTRIBUÍDOS", 46.72265625),
    ],
)
def test_atestado_mede_negritos_e_preenchimentos_do_local(
    documents, local, deslocamento
):
    from api.modules.me.certificate_fonts import certificate_fonts
    from api.modules.me.enrollment_certificate import render_enrollment_certificate

    if certificate_fonts().small_caps is None:
        pytest.skip("As coordenadas de referência requerem a Verdana original.")
    positions = []

    def locate(text, cm, tm, font, size):
        if text.strip() == "Turma":
            positions.append(cm[4] + tm[4])

    for location in ("SALA 1", local):
        certificate = documents.get_enrollment_certificate.return_value.model_copy(
            update={
                "enrollments": (
                    (
                        "MAT0027",
                        f"CÁLCULO 3\nDOCENTE DE TESTE\nTipo: DISCIPLINA   Local: {location}",
                        "01",
                        "MATRICULADO(A)",
                        "24T23 (10/08/2026 - 14/12/2026)",
                    ),
                ),
            }
        )
        page = PdfReader(BytesIO(render_enrollment_certificate(certificate))).pages[0]
        text = page.extract_text(visitor_text=locate)
        assert location in " ".join(text.split())
    # Referências medidas no Chromium com o HTML e os espaços do SIGAA.
    assert len(positions) == 2
    assert positions[1] - positions[0] == pytest.approx(deslocamento, abs=0.03)


@pytest.mark.parametrize(
    "codigo,x_texto",
    [("012345abcd", 123), ("1111111111", 122.21484375)],
)
def test_atestado_centraliza_autenticacao_na_grade_css(documents, codigo, x_texto):
    from api.modules.me.certificate_fonts import certificate_fonts
    from api.modules.me.enrollment_certificate import render_enrollment_certificate

    if certificate_fonts().small_caps is None:
        pytest.skip("As coordenadas de referência requerem a Verdana original.")
    certificate = documents.get_enrollment_certificate.return_value
    certificate = certificate.model_copy(
        update={
            "authentication": certificate.authentication.replace("012345abcd", codigo)
        }
    )
    page = PdfReader(BytesIO(render_enrollment_certificate(certificate))).pages[0]
    positions = {}

    def locate(text, cm, tm, font, size):
        for prefix in ("Para verificar", "informando"):
            if text.strip().startswith(prefix):
                positions[prefix] = cm[4] + tm[4]

    assert codigo in page.extract_text(visitor_text=locate)
    assert positions == pytest.approx(
        {
            "Para verificar": 82.46484375,
            "informando": x_texto,
        },
        abs=0.001,
    )


def test_atestado_aplica_kerning_da_verdana_no_texto_e_na_medida(documents):
    from reportlab.pdfbase import pdfmetrics

    from api.modules.me.certificate_fonts import certificate_fonts
    from api.modules.me.enrollment_certificate import render_enrollment_certificate

    fonts = certificate_fonts()
    if fonts.small_caps is None:
        pytest.skip("O kerning de referência requer a Verdana original instalada.")
    certificate = documents.get_enrollment_certificate.return_value
    enrollment = certificate.enrollments[0]
    certificate = certificate.model_copy(
        update={
            "enrollments": (
                (
                    enrollment[0],
                    "CÁLCULO 3\nTATIANE DA SILVA EVANGELISTA",
                    *enrollment[2:],
                ),
            ),
        }
    )
    page = PdfReader(BytesIO(render_enrollment_certificate(certificate))).pages[0]
    assert "TATIANE DA SILVA EVANGELISTA" in page.extract_text()
    assert pdfmetrics.stringWidth(
        "TATIANE DA SILVA EVANGELISTA", fonts.family, 6.72
    ) == pytest.approx(112.6682, abs=0.001)
    adjustments = [
        float(value)
        for operands, operator in page.get_contents().operations
        if operator == b"TJ"
        for value in operands[0]
        if isinstance(value, (int, float))
    ]
    assert any(value == pytest.approx(58.59375, abs=0.0001) for value in adjustments)


def test_atestado_incorpora_arial_original_na_faixa_de_impressao(documents):
    from api.modules.me.certificate_fonts import certificate_fonts
    from api.modules.me.enrollment_certificate import render_enrollment_certificate

    if certificate_fonts().print_family != "UnbPrintArial":
        pytest.skip("A faixa original requer Arial instalada junto à Verdana.")
    page = PdfReader(
        BytesIO(
            render_enrollment_certificate(
                documents.get_enrollment_certificate.return_value
            )
        )
    ).pages[0]
    used = []

    def locate(text, cm, tm, font, size):
        if "Sistema Integrado de Gestão de Atividades Acadêmicas" in text:
            used.append((font["/BaseFont"], size))

    page.extract_text(visitor_text=locate)
    assert len(used) == 1
    assert "ArialMT" in used[0][0]
    assert used[0][1] == pytest.approx(7.995)
    assert any(
        "ArialMT" in str(font.get_object()["/BaseFont"])
        and "/FontFile2" in font.get_object()["/FontDescriptor"]
        for font in page["/Resources"]["/Font"].values()
        if "/FontDescriptor" in font.get_object()
    )


@pytest.mark.parametrize("hour,minute,x", [(3, 50, 245.2734375), (4, 11, 244.98046875)])
def test_atestado_posiciona_faixas_conforme_a_largura_do_horario(
    documents, hour, minute, x
):
    from api.modules.me.certificate_fonts import certificate_fonts
    from api.modules.me.enrollment_certificate import render_enrollment_certificate

    if certificate_fonts().print_family != "UnbPrintArial":
        pytest.skip("As faixas de referência requerem a Arial original.")
    pdf = render_enrollment_certificate(
        documents.get_enrollment_certificate.return_value,
        printed_at=datetime(2026, 10, 23, hour, minute, tzinfo=UTC),
    )
    positions = {}

    def locate(text, cm, tm, font, size):
        value = text.strip()
        if size == 7.995 and (value.startswith("Sistema Integrado") or value == "1/1"):
            positions.setdefault(value, []).append((cm[4] + tm[4], cm[5] + tm[5]))

    PdfReader(BytesIO(pdf)).pages[0].extract_text(visitor_text=locate)
    assert positions["Sistema Integrado de Gestão de Atividades Acadêmicas"][0][
        0
    ] == pytest.approx(x, abs=0.0001)
    assert positions["1/1"][0] == pytest.approx((560.0625, 16.17), abs=0.0001)


def test_atestado_preserva_espaco_em_negrito_apos_periodo_letivo(documents):
    from api.modules.me.certificate_fonts import certificate_fonts
    from api.modules.me.enrollment_certificate import render_enrollment_certificate

    if certificate_fonts().small_caps is None:
        pytest.skip("A posição de referência requer a Verdana original.")
    page = PdfReader(
        BytesIO(
            render_enrollment_certificate(
                documents.get_enrollment_certificate.return_value
            )
        )
    ).pages[0]
    prefixes = []

    def locate(text, cm, tm, font, size):
        if text.startswith("2026.2"):
            prefixes.append((text, font["/BaseFont"]))

    page.extract_text(visitor_text=locate)
    assert len(prefixes) == 1
    assert prefixes[0][0] == "2026.2 "
    assert "Verdana-Bold" in prefixes[0][1]


def test_avanco_css_nao_adiciona_subpixel_por_imprecisao_numerica():
    from api.modules.me.certificate_fonts import css_advance

    assert css_advance(35.76562500000001) == 35.765625
    assert css_advance(18.8934375) == 18.90234375


def test_atestado_pinta_bordas_dos_titulos_nas_coordenadas_css(documents):
    from api.modules.me.enrollment_certificate import render_enrollment_certificate

    page = PdfReader(
        BytesIO(
            render_enrollment_certificate(
                documents.get_enrollment_certificate.return_value
            )
        )
    ).pages[0]
    start = None
    lines = []

    def locate(operator, operands, cm, tm):
        nonlocal start
        if operator == b"m":
            start = (float(operands[0]) + cm[4], float(operands[1]) + cm[5])
        elif operator == b"l" and start is not None:
            end = (float(operands[0]) + cm[4], float(operands[1]) + cm[5])
            if abs(start[1] - end[1]) < 0.0001:
                lines.append((start[0], end[0]))

    page.extract_text(visitor_operand_before=locate)
    assert (58.5, 538.5) in lines
    assert (65.25, 531) in lines


def test_atestado_centraliza_codigos_entre_as_linhas_do_horario(documents):
    from api.modules.me.enrollment_certificate import render_enrollment_certificate

    certificate = documents.get_enrollment_certificate.return_value
    page = PdfReader(BytesIO(render_enrollment_certificate(certificate))).pages[0]
    baselines = {}

    def locate(text, cm, tm, font, size):
        if size == 6.72 and text.strip() in {"08:00 -", "08:55", "MAT0027"}:
            baselines[text.strip()] = cm[5] + tm[5]

    page.extract_text(visitor_text=locate)
    assert baselines["08:00 -"] > baselines["MAT0027"] > baselines["08:55"]


def test_atestado_alinha_local_com_a_impressao_do_sigaa(documents):
    from api.modules.me.certificate_fonts import certificate_fonts
    from api.modules.me.enrollment_certificate import render_enrollment_certificate

    certificate = documents.get_enrollment_certificate.return_value
    page = PdfReader(BytesIO(render_enrollment_certificate(certificate))).pages[0]
    positions = {}

    def locate(text, cm, tm, font, size):
        if text.strip().startswith(("Tipo:", "Local:")):
            positions[text.strip().split(":")[0]] = cm[4] + tm[4]

    page.extract_text(visitor_text=locate)
    assert positions["Local"] - positions["Tipo"] == pytest.approx(75.25, abs=0.05)
    if certificate_fonts().small_caps:
        assert positions["Local"] - positions["Tipo"] == pytest.approx(
            75.24609375, abs=0.0001
        )


def test_atestado_usa_verdana_original_em_todos_os_i_maiusculos(documents):
    from api.modules.me.certificate_fonts import certificate_fonts
    from api.modules.me.enrollment_certificate import render_enrollment_certificate

    if certificate_fonts().small_caps is None:
        pytest.skip("A integração com Verdana requer a fonte original instalada.")
    certificate = documents.get_enrollment_certificate.return_value
    course = "INTEGRALIZAÇÃO I II III IV - DIURNO"
    certificate = certificate.model_copy(
        update={
            "identification": tuple(
                (key, course if key == "Curso" else value)
                for key, value in certificate.identification
            ),
        }
    )
    page = PdfReader(BytesIO(render_enrollment_certificate(certificate))).pages[0]
    fonts = {
        str(value.get_object()["/BaseFont"])
        for value in page["/Resources"]["/Font"].values()
    }
    assert course in page.extract_text()
    assert any("Verdana-Bold" in name for name in fonts)
    assert any("SmallCaps" in name for name in fonts)
    assert not any("FollowwSans" in name for name in fonts)


def test_atestado_continua_funcional_sem_fontes_licenciadas(documents, monkeypatch):
    from api.modules.me import enrollment_certificate
    from api.modules.me.certificate_fonts import _register_fonts

    monkeypatch.setattr(
        enrollment_certificate, "certificate_fonts", lambda _: _register_fonts(None)
    )
    pdf = enrollment_certificate.render_enrollment_certificate(
        documents.get_enrollment_certificate.return_value
    )
    page = PdfReader(BytesIO(pdf)).pages[0]
    assert "JOÃO DA CONCEIÇÃO" in page.extract_text()
    assert "012345abcd" in page.extract_text()


@pytest.mark.parametrize(
    "path,method",
    [
        ("statement", "get_restaurant_statement"),
        ("token", "get_restaurant_credentials"),
    ],
)
def test_dados_privados_sem_banco_fila_ou_cache(
    client, cookies, restaurant, qstash, path, method
):
    def banco_proibido():
        pytest.fail("Dados privados do RU não devem usar banco")

    client.app.dependency_overrides[get_sessionmaker] = banco_proibido
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    response = client.get(f"/me/ru-{path}")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    if path == "statement":
        assert response.json()["balance"] == "12.50"
        assert response.json()["group"] == 2
        assert len(response.json()["entries"]) == 2
        restaurant.get_restaurant_statement.return_value = RestaurantStatement()
        assert client.get(f"/me/ru-{path}").json() == {
            "balance": None,
            "group": None,
            "entries": [],
        }
    else:
        assert response.json() == {"token": "TOKEN-TESTE", "valid_until": "2027-03-01"}
        restaurant.get_restaurant_credentials.return_value = RestaurantCredentials(
            token="NOVO", valid_until=date(2027, 4, 1)
        )
        assert client.get(f"/me/ru-{path}").json()["token"] == "NOVO"
    assert getattr(restaurant, method).await_count == 2
    assert qstash.published == []


@pytest.mark.parametrize("group", [1, 2, 3, 4])
def test_extrato_repassa_grupo_saldo_e_movimentos_do_client(
    client, cookies, restaurant, group
):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    restaurant.get_restaurant_statement.return_value = RestaurantStatement(
        balance=Decimal("-1.50"),
        group=group,
        entries=(
            _entry("Grupo 2 Almoço", "6.10", day=20),
            _entry(f"Grupo {group} Jantar", "6.10", day=24),
            _entry("Saldo", "-1.50", day=25),
            _entry("Saldo", "100.00", day=20),
        ),
    )
    response = client.get("/me/ru-statement")
    assert response.status_code == 200
    assert response.json()["group"] == group
    assert response.json()["balance"] == "-1.50"
    assert len(response.json()["entries"]) == 4


def test_extrato_sem_saldo_ou_grupo_nao_presume_valores(client, cookies, restaurant):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    restaurant.get_restaurant_statement.return_value = RestaurantStatement(
        entries=(_entry("Compra de créditos", "20.00"),),
    )
    response = client.get("/me/ru-statement")
    assert response.json()["balance"] is None
    assert response.json()["group"] is None


def test_refresh_do_extrato_abre_sessao_nova_para_obter_saldo_atual(
    client, cookies, sigaa, qstash, monkeypatch
):
    sigaa.valid_tokens.add("app14~VIVO")
    client.cookies.update(cookies(access="app14~VIVO", refresh=CREDENCIAIS))
    opened = set()
    balances = {}
    amount = "49,50"

    def dashboard(request):
        token = SimpleCookie(request.headers["cookie"])["JSESSIONID"].value
        assert token in sigaa.valid_tokens
        balance = balances.setdefault(token, amount)
        if request.method == "POST":
            assert token not in opened
            opened.add(token)
        if token in opened:
            return httpx.Response(
                200,
                text=f"""
                <h4>Extrato no Restaurante Universitário</h4><table>
                <tr><td>25/09/2026 22:15</td><td>Saldo</td><td>{balance}</td></tr>
                <tr><td>25/09/2026 12:00</td><td>Grupo 3 Almoço</td><td>-R$ 4,50</td></tr>
                <tr><td>18/09/2026 22:15</td><td>Saldo Anterior</td><td>49,50</td></tr>
                </table>
            """,
            )
        return httpx.Response(
            200,
            text="""
            <form id="formExibirExtrato" name="formExibirExtrato"
                action="/sigaa/portais/discente/discente.jsf">
              <input type="hidden" name="formExibirExtrato" value="formExibirExtrato">
              <input type="hidden" name="javax.faces.ViewState" value="VS1">
              <a onclick="jsfcljs(document.getElementById('formExibirExtrato'),
                {'formExibirExtrato:botao':'formExibirExtrato:botao'},'');">
                Mostrar Extrato</a>
            </form>
        """,
        )

    original = sigaa._sigaa
    monkeypatch.setattr(
        sigaa,
        "_sigaa",
        lambda request: (
            dashboard(request)
            if request.url.path == "/sigaa/portais/discente/discente.jsf"
            else original(request)
        ),
    )
    assert client.get("/me/ru-statement").json()["balance"] == "49.50"
    amount = "51,00"
    assert client.get("/me/ru-statement").json()["balance"] == "49.50"
    assert sigaa.logins == 0

    response = client.get("/me/ru-statement", headers=NO_CACHE)

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["balance"] == "51.00"
    assert response.json()["group"] == 3
    assert len(response.json()["entries"]) == 3
    assert response.json()["entries"][1]["amount"] == "-4.50"
    assert "set-cookie" not in response.headers
    assert (sigaa.logins, sigaa.logouts) == (1, 1)
    assert sigaa.valid_tokens == {"app14~VIVO"}
    assert client.get("/me/ru-statement").json()["balance"] == "49.50"
    assert qstash.published == []


@pytest.mark.parametrize("access", [None, "app14~VIVO"])
@pytest.mark.parametrize("error", [None, SigaaParseError("layout mudou")])
def test_refresh_do_extrato_fecha_client_e_sessao_mesmo_em_falha(
    client, cookies, restaurant, stub_sigaa, qstash, access, error
):
    def banco_proibido():
        pytest.fail("Refresh do RU não deve usar banco")

    client.app.dependency_overrides[get_sessionmaker] = banco_proibido
    client.cookies.update(cookies(access=access, refresh=CREDENCIAIS))
    restaurant.get_restaurant_statement.side_effect = error

    response = client.get("/me/ru-statement", headers=NO_CACHE)

    assert response.status_code == (502 if error else 200)
    assert "set-cookie" not in response.headers
    stub_sigaa.created.assert_called_once()
    assert stub_sigaa.created.call_args.kwargs["session_token"] is None
    assert stub_sigaa.created.call_args.kwargs["credentials"] == CREDENCIAIS
    stub_sigaa.authenticate.assert_awaited_once()
    stub_sigaa.logout.assert_awaited_once()
    stub_sigaa.aclose.assert_awaited_once()
    restaurant.get_restaurant_statement.assert_awaited_once()
    assert qstash.published == []


def test_refresh_do_extrato_com_login_recusado_fecha_client_e_limpa_cookies(
    client, cookies, restaurant, stub_sigaa, ler_cookies
):
    client.cookies.update(cookies(access="app14~VIVO", refresh=CREDENCIAIS))
    stub_sigaa.authenticate.side_effect = AuthenticationFailed()

    response = client.get("/me/ru-statement", headers=NO_CACHE)

    assert response.status_code == 401
    expired = ler_cookies(response)
    for name in (ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME):
        assert expired[name].value == ""
        assert expired[name]["max-age"] == "0"
    stub_sigaa.aclose.assert_awaited_once()
    stub_sigaa.logout.assert_not_awaited()
    restaurant.get_restaurant_statement.assert_not_awaited()


@pytest.mark.parametrize("path", ["statement", "token"])
def test_dados_privados_exigem_login(client, stub_sigaa, restaurant, path):
    assert client.get(f"/me/ru-{path}").status_code == 401
    stub_sigaa.created.assert_not_called()


@pytest.mark.parametrize(
    "path,method",
    [
        ("statement", "get_restaurant_statement"),
        ("token", "get_restaurant_credentials"),
    ],
)
@pytest.mark.parametrize(
    "error,status",
    [
        (AuthenticationFailed(), 401),
        (SessionExpired(), 502),
        (SigaaParseError("layout mudou"), 502),
        (httpx.ReadTimeout("fora"), 502),
    ],
)
def test_erros_do_sigaa_sao_traduzidos(
    client, cookies, restaurant, path, method, error, status
):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    getattr(restaurant, method).side_effect = error
    assert client.get(f"/me/ru-{path}").status_code == status


def test_openapi_documenta_dados_privados_do_restaurante(client):
    schema = client.get("/openapi.json").json()
    paths = schema["paths"]
    for path in ("statement", "token"):
        assert paths[f"/me/ru-{path}"]["get"]["tags"] == ["Me"]
        assert {"401", "502"} <= paths[f"/me/ru-{path}"]["get"]["responses"].keys()
    assert "422" in paths["/me/ru-token"]["get"]["responses"]
    assert {"balance", "group", "entries"} <= schema["components"]["schemas"][
        "RestaurantStatement"
    ]["properties"].keys()
    assert schema["components"]["schemas"]["RestaurantStatement"]["properties"][
        "group"
    ]["anyOf"][0]["enum"] == [1, 2, 3, 4]


def test_configuracoes_aceitam_display_name_no_limite(client, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    nome = "a" * 24

    response = client.patch("/me/settings", json={"displayName": nome})

    assert response.status_code == 200
    assert response.json() == {"displayName": nome}
    assert client.get("/me/settings").json() == response.json()


def test_patch_sem_campos_preserva_as_configuracoes(client, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    client.patch("/me/settings", json={"displayName": "Ana"})

    response = client.patch("/me/settings", json={})

    assert response.json() == {"displayName": "Ana"}


@pytest.mark.parametrize(
    "body",
    [
        {"displayName": "a" * 25},
        {"displayName": ""},
        {"displayName": "   "},
        # A setting saiu: quem ainda a mandar recebe 422.
        {"defaultRuCampus": "Gama"},
        {"theme": "dark"},
    ],
)
def test_configuracoes_rejeitam_input_invalido(client, cookies, body):
    client.cookies.update(cookies(refresh=CREDENCIAIS))

    response = client.patch("/me/settings", json=body)

    assert response.status_code == 422
    assert client.get("/me/settings").json() == {"displayName": None}


def test_configuracoes_removem_espacos_do_display_name(client, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))

    response = client.patch("/me/settings", json={"displayName": "  Ana  "})

    assert response.json()["displayName"] == "Ana"


def test_configuracoes_sobrevivem_ao_sync_criando_o_usuario_ao_mesmo_tempo(
    client, cookies, monkeypatch
):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    client.patch("/me/settings", json={"displayName": "Ana"})
    original = UserRepository.get_by_registration
    calls = 0

    # Simula o sync do perfil gravando o usuário entre a leitura e o insert.
    async def get_by_registration(self, registration):
        nonlocal calls
        calls += 1
        return None if calls == 1 else await original(self, registration)

    monkeypatch.setattr(UserRepository, "get_by_registration", get_by_registration)

    response = client.patch("/me/settings", json={"displayName": "Bia"})

    assert response.status_code == 200
    assert response.json() == {"displayName": "Bia"}


AGORA = datetime(2026, 9, 22, tzinfo=UTC)
PERFIL_LIDO = UserProfile(
    name="NOME DISCENTE",
    registration="251000000",
    photo=None,
    bio="Bio.",
    unit="FCTE",
    course="ENGENHARIA DE SOFTWARE",
    shift=None,
    entry_semester="2025.1",
    integralization=35,
    workload=CurriculumWorkload(
        total=3525,
        pending_mandatory=2175,
        pending_optional=420,
        pending_complementary=0,
    ),
    ira=3.9,
    mp=4.1,
    level=SigaaUserLevel.GRADUACAO,
)


@pytest.mark.parametrize(
    "registration", ["251000000", "251000001", "inexistente", "' OR 1=1 --"]
)
async def test_repository_busca_somente_a_matricula_pedida(
    async_database, registration
):
    async with async_database() as session:
        session.add_all(
            User(
                name=f"Discente {index}",
                registration=f"25100000{index}",
                level=UserLevel.GRADUACAO,
            )
            for index in range(2)
        )
        await session.commit()

        result = await UserRepository(session).get_by_registration(registration)

    assert (result.registration if result else None) == (
        registration if registration.startswith("25100000") else None
    )


async def test_perfil_cria_usuario_com_data_de_sync(async_database):
    async with async_database() as session:
        await UserRepository(session).save_profile(PERFIL_LIDO, AGORA)
        await session.commit()

    async with async_database() as session:
        user = await UserRepository(session).get_by_registration("251000000")

    assert user is not None
    assert (user.name, user.ira, user.level) == (
        "NOME DISCENTE",
        3.9,
        UserLevel.GRADUACAO,
    )
    assert user.workload == PERFIL_LIDO.workload.model_dump()
    assert user.entry_semester == "2025.1"
    assert user.profile_synced_at is not None


async def test_perfil_assume_o_usuario_sombra_da_mesma_matricula(async_database):
    async with async_database() as session:
        session.add(
            User(
                name="NOME DA LISTA",
                registration="251000000",
                person_id=42,
                email="discente@example.org",
            )
        )
        await session.commit()

        await UserRepository(session).save_profile(PERFIL_LIDO, AGORA)
        await session.commit()

    async with async_database() as session:
        users = list(await session.scalars(select(User)))

    assert len(users) == 1
    assert users[0].name == "NOME DISCENTE"
    # O perfil não traz esses campos: o que a lista de participantes trouxe fica.
    assert (users[0].person_id, users[0].email) == (42, "discente@example.org")


async def test_settings_retorna_vazio_quando_usuario_nao_tem_configuracoes(
    async_database,
):
    async with async_database() as session:
        settings = await UserRepository(session).get_settings("251000000")
        assert settings == {}


async def test_settings_salva_e_sobrescreve_preferencias(async_database):
    async with async_database() as session:
        repo = UserRepository(session)
        updated = await repo.update_settings(
            "251000000", {"displayName": "Discente Teste"}
        )
        assert updated == {"displayName": "Discente Teste"}
        await session.commit()

    async with async_database() as session:
        repo = UserRepository(session)
        updated = await repo.update_settings("251000000", {"displayName": "Outro"})
        assert updated == {"displayName": "Outro"}
        await session.commit()

    async with async_database() as session:
        repo = UserRepository(session)
        settings = await repo.get_settings("251000000")
        assert settings == {"displayName": "Outro"}
