from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sigaa_client import (
    Internship,
    InternshipAttachment,
    InternshipCourse,
    InternshipGrantor,
    InternshipNotFound,
    InternshipSummary,
    InternshipTransportAllowance,
)

from .helpers import CREDENCIAIS

SUMMARY_MEU_CURSO = InternshipSummary(
    reference="listagem_meu_curso:0:abc123hash",
    title="Desenvolvedor Python Júnior",
    vacancies=2,
    stipend=Decimal("1500.00"),
    published_until=datetime(2026, 12, 1, 18, 0, tzinfo=UTC),
)

SUMMARY_OUTROS_CURSOS = InternshipSummary(
    reference="listagem_outros_cursos:0:def456hash",
    title="Estágio em Gestão Pública",
    vacancies=1,
    stipend=None,
    published_until=datetime(2026, 11, 20, 23, 59, tzinfo=UTC),
)

DETAIL_MEU_CURSO = Internship(
    title="Desenvolvedor Python Júnior",
    vacancies=2,
    stipend=Decimal("1500.00"),
    transport_allowance=InternshipTransportAllowance(
        amount=Decimal("10.00"),
        period="dia",
    ),
    published_from=datetime(2026, 11, 1, 8, 0, tzinfo=UTC),
    published_until=datetime(2026, 12, 1, 18, 0, tzinfo=UTC),
    sigaa_enrollment=True,
    attachment=InternshipAttachment(
        name="edital_estagio.pdf",
        url="https://sigaa.unb.br/documentos/edital.pdf",
    ),
    grantor=InternshipGrantor(
        agreement_type="Convênio Direto",
        cnpj="00.000.000/0001-91",
        name="Empresa Tech DF",
        responsibles=("João Silva",),
    ),
    courses=(
        InternshipCourse(
            name="ENGENHARIA DE SOFTWARE",
            unit="FCTE",
            degree="Bacharelado",
        ),
    ),
    description="Atuação em desenvolvimento web com FastAPI e Python.",
)


@pytest.fixture
def internships(stub_sigaa):
    stub_sigaa.internships = SimpleNamespace(
        list_internships=AsyncMock(
            return_value=[SUMMARY_MEU_CURSO, SUMMARY_OUTROS_CURSOS]
        ),
        get_internship=AsyncMock(return_value=DETAIL_MEU_CURSO),
    )
    return stub_sigaa.internships


def test_listar_estagios_autenticado_retorna_itens_na_ordem_e_com_is_my_course(
    api, cookies, internships
):
    api.cookies.update(cookies(refresh=CREDENCIAIS))
    response = api.get("/me/internships")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2

    assert data[0]["reference"] == SUMMARY_MEU_CURSO.reference
    assert data[0]["title"] == "Desenvolvedor Python Júnior"
    assert data[0]["vacancies"] == 2
    assert data[0]["stipend"] == "1500.00"
    assert data[0]["is_my_course"] is True

    assert data[1]["reference"] == SUMMARY_OUTROS_CURSOS.reference
    assert data[1]["title"] == "Estágio em Gestão Pública"
    assert data[1]["vacancies"] == 1
    assert data[1]["stipend"] is None
    assert data[1]["is_my_course"] is False

    assert response.headers["cache-control"] == "no-store"
    internships.list_internships.assert_awaited_once()


def test_filtrar_estagios_por_termo_de_busca_case_e_accent_insensitive(
    api, cookies, internships
):
    api.cookies.update(cookies(refresh=CREDENCIAIS))

    # Busca com "python"
    res1 = api.get("/me/internships", params={"q": "python"})
    assert res1.status_code == 200
    data1 = res1.json()
    assert len(data1) == 1
    assert data1[0]["title"] == "Desenvolvedor Python Júnior"

    # Busca com "desenvolvedor junior" (sem acento)
    res2 = api.get("/me/internships", params={"q": "desenvolvedor junior"})
    assert res2.status_code == 200
    data2 = res2.json()
    assert len(data2) == 1
    assert data2[0]["title"] == "Desenvolvedor Python Júnior"

    # Busca com "gestao" (sem acento casando com "Gestão")
    res3 = api.get("/me/internships", params={"q": "gestao"})
    assert res3.status_code == 200
    data3 = res3.json()
    assert len(data3) == 1
    assert data3[0]["title"] == "Estágio em Gestão Pública"


def test_busca_estagios_sem_correspondencia_retorna_vazio(api, cookies, internships):
    api.cookies.update(cookies(refresh=CREDENCIAIS))
    response = api.get("/me/internships", params={"q": "engenharia civil"})

    assert response.status_code == 200
    assert response.json() == []


def test_obter_detalhe_estagio_com_sucesso(api, cookies, internships):
    api.cookies.update(cookies(refresh=CREDENCIAIS))
    ref = SUMMARY_MEU_CURSO.reference
    response = api.get(f"/me/internships/{ref}")

    assert response.status_code == 200
    data = response.json()
    assert data["reference"] == ref
    assert data["title"] == "Desenvolvedor Python Júnior"
    assert data["vacancies"] == 2
    assert data["stipend"] == "1500.00"
    assert data["transport_allowance"] == {"amount": "10.00", "period": "dia"}
    assert data["sigaa_enrollment"] is True
    assert data["grantor"]["name"] == "Empresa Tech DF"
    assert data["grantor"]["cnpj"] == "00.000.000/0001-91"
    assert len(data["courses"]) == 1
    assert data["courses"][0]["name"] == "ENGENHARIA DE SOFTWARE"
    assert data["description"] == "Atuação em desenvolvimento web com FastAPI e Python."
    assert data["is_my_course"] is True
    assert response.headers["cache-control"] == "no-store"

    internships.get_internship.assert_awaited_once_with(ref)


def test_obter_detalhe_estagio_nao_encontrado_retorna_404(api, cookies, internships):
    api.cookies.update(cookies(refresh=CREDENCIAIS))
    internships.get_internship.side_effect = InternshipNotFound("Oferta não encontrada")

    response = api.get("/me/internships/listagem_meu_curso:999:inexistente")
    assert response.status_code == 404
    assert response.json() == {"detail": "Internship not found"}


def test_estagios_sem_autenticacao_retorna_401(api):
    res_list = api.get("/me/internships")
    assert res_list.status_code == 401

    res_detail = api.get("/me/internships/listagem_meu_curso:0:abc")
    assert res_detail.status_code == 401
