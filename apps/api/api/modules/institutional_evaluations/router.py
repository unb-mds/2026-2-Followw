from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import APIRouter, Path
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sigaa_client import (
    InstitutionalEvaluation,
    InstitutionalQuestionnaire,
    SigaaClient,
)

from api.cache import NoStore
from api.errors import SIGAA_ERRORS
from api.sigaa import SigaaClientDep, SigaaConnection, SigaaConnectionDep

router = APIRouter(dependencies=[NoStore])

EvaluationId = Annotated[int, Path(gt=0)]
AnswerField = Annotated[str, StringConstraints(min_length=1)]
_EVALUATION_ERRORS = {
    **SIGAA_ERRORS,
    404: {"description": "Avaliação indisponível para o discente."},
}
_WRITE_ERRORS = {
    **_EVALUATION_ERRORS,
    422: {"description": "Respostas inválidas ou gravação recusada pelo SIGAA."},
}


class EvaluationAnswers(BaseModel):
    model_config = ConfigDict(extra="forbid")

    answers: dict[AnswerField, str | None] = Field(default_factory=dict)


class EvaluationSubmission(BaseModel):
    confirmation: str


@asynccontextmanager
async def _evaluation_writer(connection: SigaaConnection) -> AsyncIterator[SigaaClient]:
    fresh = SigaaConnection(connection.credentials)
    try:
        yield await fresh.client()
    finally:
        await fresh.aclose(logout=True)


@router.get("", summary="Listar avaliações institucionais", responses=SIGAA_ERRORS)
async def list_evaluations(client: SigaaClientDep) -> list[InstitutionalEvaluation]:
    return await client.institutional_evaluations.list_evaluations()


@router.get(
    "/{evaluation_id}",
    summary="Consultar questionário e rascunho da avaliação institucional",
    responses=_EVALUATION_ERRORS,
)
async def get_questionnaire(
    evaluation_id: EvaluationId, client: SigaaClientDep
) -> InstitutionalQuestionnaire:
    return await client.institutional_evaluations.get_questionnaire(evaluation_id)


@router.patch(
    "/{evaluation_id}/draft",
    summary="Salvar rascunho da avaliação institucional",
    responses=_WRITE_ERRORS,
)
async def save_draft(
    evaluation_id: EvaluationId,
    body: EvaluationAnswers,
    connection: SigaaConnectionDep,
) -> InstitutionalQuestionnaire:
    async with _evaluation_writer(connection) as client:
        return await client.institutional_evaluations.save_draft(
            evaluation_id, body.answers
        )


@router.post(
    "/{evaluation_id}/submit",
    summary="Finalizar avaliação institucional",
    responses=_WRITE_ERRORS,
)
async def submit_evaluation(
    evaluation_id: EvaluationId,
    body: EvaluationAnswers,
    connection: SigaaConnectionDep,
) -> EvaluationSubmission:
    async with _evaluation_writer(connection) as client:
        confirmation = await client.institutional_evaluations.submit_evaluation(
            evaluation_id, body.answers
        )
    return EvaluationSubmission(confirmation=confirmation)
