import httpx
import pytest

from sigaa_client import (
    InstitutionalEvaluationRejected,
    InstitutionalEvaluationWriteUnconfirmed,
    SigaaClient,
    SigaaParseError,
)
from sigaa_client.config import (
    DASHBOARD_PATH,
    INSTITUTIONAL_EVALUATION_QUESTIONNAIRE_PATH,
)

from .fakes import INTRO, LINHA, LISTAGEM, MENU, QUESTIONARIO


class SigaaAvaliacao:
    def __init__(self, result: str = "", *, timeout: bool = False) -> None:
        self.result = result
        self.timeout = timeout
        self.questionnaire = QUESTIONARIO
        self.posts: list[dict[str, str]] = []
        self.opens = 0
        self.on_write = None

    def __call__(self, request: httpx.Request) -> httpx.Response:
        match request.method, request.url.path:
            case "GET", path if path == DASHBOARD_PATH:
                return httpx.Response(200, text=MENU)
            case "POST", path if path == DASHBOARD_PATH:
                return httpx.Response(200, text=LISTAGEM.format(rows=LINHA))
            case "POST", "/sigaa/avaliacao/calendario/lista.jsf":
                return httpx.Response(200, text=INTRO)
            case "POST", "/sigaa/avaliacao/introDiscente.jsf":
                self.opens += 1
                return httpx.Response(200, text=self.questionnaire)
            case "POST", path if path == INSTITUTIONAL_EVALUATION_QUESTIONNAIRE_PATH:
                self.posts.append(dict(httpx.QueryParams(request.content.decode())))
                if self.timeout:
                    raise httpx.ReadTimeout("tempo esgotado", request=request)
                if self.on_write:
                    self.questionnaire = self.on_write(self.questionnaire)
                return httpx.Response(200, text=self.result)
            case _:
                pytest.fail(f"Request inesperado para {request.url.path}")

    def client(self) -> SigaaClient:
        return SigaaClient(session_token="tok", transport=httpx.MockTransport(self))


async def test_salva_e_reabre_rascunho_preservando_campos_nao_editados():
    sigaa = SigaaAvaliacao()
    sigaa.on_write = lambda html: (
        html.replace("<option selected>10", "<option>10")
        .replace(
            '<option value="-1">N/A</option>',
            '<option value="-1" selected>N/A</option>',
            1,
        )
        .replace('value="9" selected', 'value="9"')
        .replace(
            '<textarea name="form:comment"></textarea>',
            '<textarea name="form:comment">Novo comentário</textarea>',
        )
    )
    async with sigaa.client() as client:
        saved = await client.institutional_evaluations.save_draft(
            123, {"p_1_10": "-1", "p_1_20": None, "form:comment": "Novo comentário"}
        )
    assert sigaa.opens == 2
    assert sigaa.posts == [
        {
            "form": "form",
            "aba": "1",
            "javax.faces.ViewState": "VS-quiz",
            "form:salvar": "form:salvar",
            "p_1_10": "-1",
            "p_1_20": "",
            "p_1_21": "",
            "opcao_tmd_20": "20",
            "obs_tmd_20": "Texto de rascunho",
            "form:comment": "Novo comentário",
        }
    ]
    assert saved.targets[0].questions[0].answer == "-1"
    assert saved.targets[1].questions[0].answer is None
    assert saved.comments[1].text == "Novo comentário"


async def test_finaliza_rascunho_com_postback_proprio_e_retorna_confirmacao():
    sigaa = SigaaAvaliacao('<ul class="info"><li>Avaliação finalizada.</li></ul>')
    async with sigaa.client() as client:
        confirmation = await client.institutional_evaluations.submit_evaluation(123)
    assert confirmation == "Avaliação finalizada."
    assert sigaa.opens == 1
    assert len(sigaa.posts) == 1
    assert sigaa.posts[0]["form:finalizar"] == "form:finalizar"
    assert sigaa.posts[0]["p_1_10"] == "10"
    assert sigaa.posts[0]["p_1_20"] == "9"
    assert sigaa.posts[0]["obs_tmd_20"] == "Texto de rascunho"
    assert "form:salvar" not in sigaa.posts[0]


@pytest.mark.parametrize(
    ("answers", "message"),
    [
        ({"p_1_10": "99"}, "Opção inválida"),
        ({"opcao_tmd_20": "Carlos"}, "Opção inválida"),
        ({"javax.faces.ViewState": "outro"}, "ausente do questionário"),
        ({"form:comment": "a" * 601}, "até 600 caracteres"),
    ],
)
async def test_resposta_invalida_nao_envia_a_avaliacao(answers, message):
    sigaa = SigaaAvaliacao()
    async with sigaa.client() as client:
        with pytest.raises(ValueError, match=message):
            await client.institutional_evaluations.save_draft(123, answers)
    assert sigaa.posts == []


async def test_finalizacao_recusada_repassa_o_motivo_do_sigaa():
    sigaa = SigaaAvaliacao('<ul class="erros"><li>Há perguntas sem resposta.</li></ul>')
    async with sigaa.client() as client:
        with pytest.raises(
            InstitutionalEvaluationRejected, match="perguntas sem resposta"
        ):
            await client.institutional_evaluations.submit_evaluation(
                123, {"p_1_21": "10"}
            )
    assert sigaa.posts[0]["p_1_21"] == "10"


@pytest.mark.parametrize("timeout", [False, True])
async def test_finalizacao_sem_confirmacao_nao_repete_o_envio(timeout):
    sigaa = SigaaAvaliacao(timeout=timeout)
    async with sigaa.client() as client:
        with pytest.raises(InstitutionalEvaluationWriteUnconfirmed):
            await client.institutional_evaluations.submit_evaluation(123)
    assert len(sigaa.posts) == 1


async def test_confirmacao_de_rascunho_nao_confirma_finalizacao():
    sigaa = SigaaAvaliacao('<ul class="info"><li>Rascunho salvo com sucesso.</li></ul>')
    async with sigaa.client() as client:
        with pytest.raises(InstitutionalEvaluationWriteUnconfirmed):
            await client.institutional_evaluations.submit_evaluation(123)
    assert len(sigaa.posts) == 1


async def test_rascunho_sem_alteracoes_persistidas_gera_erro_de_confirmacao():
    sigaa = SigaaAvaliacao('<ul class="sucesso"><li>Avaliação salva.</li></ul>')
    async with sigaa.client() as client:
        with pytest.raises(
            InstitutionalEvaluationWriteUnconfirmed, match="rascunho reaberto"
        ):
            await client.institutional_evaluations.save_draft(123, {"p_1_10": "-1"})


async def test_formulario_com_destino_externo_nao_envia_respostas():
    sigaa = SigaaAvaliacao()
    sigaa.questionnaire = QUESTIONARIO.replace(
        INSTITUTIONAL_EVALUATION_QUESTIONNAIRE_PATH, "https://example.test/avaliacao"
    )
    async with sigaa.client() as client:
        with pytest.raises(SigaaParseError, match="Destino inesperado"):
            await client.institutional_evaluations.submit_evaluation(123)
    assert sigaa.posts == []
