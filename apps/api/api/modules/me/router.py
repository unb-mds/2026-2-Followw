from typing import Annotated, Literal

from fastapi import (
    APIRouter,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
)
from sigaa_client import RestaurantCredentials, RestaurantStatement
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile as MultipartFile

from api.cache import CacheControl, NoStore
from api.db.main import DatabaseDep
from api.downloads import attachment
from api.errors import SIGAA_ERRORS
from api.modules.me.edit import edit_profile
from api.modules.me.internships import (
    InternshipDetail,
    InternshipItem,
    filter_internships,
)
from api.modules.me.photo import MAX_PHOTO_BYTES, normalize_photo
from api.modules.me.profile import ProfileServiceDep, UserProfile
from api.modules.me.repository import MAX_PROFILE_BIO_LENGTH
from api.modules.me.settings import (
    UserSettings,
    UserSettingsPatch,
    read_settings,
    save_settings,
)
from api.modules.oauth.redaction import json_response
from api.modules.oauth.scopes import Scope, oauth
from api.rate_limit import limit_profile_edits
from api.sigaa import SigaaClientDep, SigaaConnection, SigaaConnectionDep

router = APIRouter()
_DOCUMENT_ERRORS = {
    **SIGAA_ERRORS,
    422: {"description": "O SIGAA recusou emitir o documento (ex.: perfil sem foto)."},
}
_PDF_RESPONSES = {
    **_DOCUMENT_ERRORS,
    200: {
        "content": {
            "application/pdf": {"schema": {"type": "string", "format": "binary"}}
        }
    },
}


@router.get(
    "",
    openapi_extra=oauth(Scope.PROFILE),
    response_model=UserProfile,
    summary="Consultar perfil do usuário",
    description="Com OAuth, retorna nome, matrícula, foto e curso. grades:read acrescenta IRA e MP.",
    responses=SIGAA_ERRORS,
)
async def get_me(
    service: ProfileServiceDep, response: Response
) -> UserProfile | Response:
    profile = await service.get_profile()
    if isinstance(profile, UserProfile):
        return profile
    return json_response(profile, response)


@router.get(
    "/ru-statement",
    openapi_extra=oauth(Scope.RU),
    response_model=RestaurantStatement,
    summary="Consultar extrato, saldo e grupo do RU",
    responses=SIGAA_ERRORS,
    dependencies=[NoStore],
)
async def get_statement(
    request: Request, connection: SigaaConnectionDep
) -> RestaurantStatement:
    if not CacheControl.parse(request.headers.get("Cache-Control")).no_cache:
        client = await connection.client()
        return await client.restaurant.get_restaurant_statement()

    fresh = SigaaConnection(connection.credentials)
    try:
        client = await fresh.client()
        return await client.restaurant.get_restaurant_statement()
    finally:
        await fresh.aclose(logout=True)


@router.get(
    "/ru-token",
    response_model=RestaurantCredentials,
    summary="Consultar o token da carteirinha estudantil",
    description="Token do QR code da carteirinha. A validade representa mês e ano, com o dia fixado em 1.",
    responses=_DOCUMENT_ERRORS,
    dependencies=[NoStore],
)
async def get_token(client: SigaaClientDep) -> RestaurantCredentials:
    return await client.restaurant.get_restaurant_credentials()


@router.post(
    "/student-card",
    response_class=Response,
    summary="Baixar a carteirinha estudantil em PDF",
    responses=_PDF_RESPONSES,
    dependencies=[NoStore],
)
async def get_student_card(client: SigaaClientDep, response: Response) -> Response:
    pdf = await client.documents.get_student_card_pdf()
    return attachment(pdf, "carteirinha.pdf", "application/pdf", response)


@router.post(
    "/transcript",
    openapi_extra=oauth(Scope.TRANSCRIPT),
    response_class=Response,
    summary="Baixar o histórico acadêmico em PDF",
    responses=_PDF_RESPONSES,
    dependencies=[NoStore],
)
async def get_transcript(client: SigaaClientDep, response: Response) -> Response:
    pdf = await client.documents.get_transcript_pdf()
    return attachment(pdf, "historico.pdf", "application/pdf", response)


@router.get(
    "/settings",
    response_model=UserSettings,
    summary="Consultar configurações do usuário",
    responses=SIGAA_ERRORS,
    dependencies=[NoStore],
)
async def get_settings(connection: SigaaConnectionDep, db: DatabaseDep) -> UserSettings:
    return await read_settings(db, connection.registration)


@router.patch(
    "/settings",
    response_model=UserSettings,
    summary="Atualizar configurações do usuário",
    responses=SIGAA_ERRORS,
)
async def update_settings(
    body: UserSettingsPatch,
    connection: SigaaConnectionDep,
    db: DatabaseDep,
) -> UserSettings:
    return await save_settings(db, connection.registration, body)


@router.patch(
    "/profile",
    openapi_extra=oauth(Scope.PROFILE_WRITE),
    response_model=UserProfile,
    summary="Atualizar foto ou bio no SIGAA",
    description=(
        "Omita a bio para preservá-la ou envie uma string vazia para limpá-la. "
        "A remoção da foto deve ser feita em uma requisição separada. "
        "Para substituir, envie um único JPEG ou PNG de até 4 MB. Com OAuth, a resposta segue os escopos de leitura do perfil."
    ),
    dependencies=[NoStore],
    responses={
        **SIGAA_ERRORS,
        413: {"description": "A foto enviada deve ter até 4 MB."},
    },
)
async def update_profile(
    request: Request,
    response: Response,
    photo_action: Annotated[Literal["keep", "replace", "remove"], Form()],
    connection: SigaaConnectionDep,
    db: DatabaseDep,
    bio: Annotated[str | None, Form()] = None,
    photo: Annotated[UploadFile | None, File()] = None,
) -> UserProfile | Response:
    form = await request.form()
    if len(form.getlist("photo")) > 1 or any(
        name != "photo" and isinstance(value, MultipartFile)
        for name, value in form.multi_items()
    ):
        raise HTTPException(422, "Envie somente um arquivo no campo photo.")
    if (photo_action == "replace") != (photo is not None):
        raise HTTPException(422, "Envie uma foto somente ao selecionar substituição.")
    if "bio" in form and bio is None:
        bio = ""
    if bio is not None:
        # multipart converte \n em \r\n; conta como o usuário digitou
        bio = bio.replace("\r\n", "\n")
        if len(bio) > MAX_PROFILE_BIO_LENGTH:
            raise HTTPException(
                422, f"A bio deve ter até {MAX_PROFILE_BIO_LENGTH} caracteres."
            )
    if photo_action == "remove" and bio is not None:
        raise HTTPException(
            422, "Remova a foto e edite a bio em requisições separadas."
        )
    if photo_action == "keep" and bio is None:
        raise HTTPException(422, "Informe uma alteração no perfil.")
    await limit_profile_edits(connection.registration)
    content = None
    if photo is not None:
        raw = await photo.read(MAX_PHOTO_BYTES + 1)
        content = await run_in_threadpool(normalize_photo, raw)
    profile = await edit_profile(
        connection, db, bio=bio, photo=content, remove_photo=photo_action == "remove"
    )
    if isinstance(profile, UserProfile):
        return profile
    return json_response(profile, response)


@router.get(
    "/internships",
    openapi_extra=oauth(Scope.INTERNSHIPS),
    response_model=list[InternshipItem],
    summary="Listar e buscar ofertas de estágio",
    description="Lista as ofertas de estágio disponíveis no mural do SIGAA. As vagas do curso do aluno vêm primeiro, seguidas pelas demais.",
    responses=SIGAA_ERRORS,
    dependencies=[NoStore],
)
async def list_internships(
    client: SigaaClientDep,
    q: Annotated[
        str | None,
        Query(
            description="Termo para filtrar ofertas de estágio pelo título.",
            max_length=100,
        ),
    ] = None,
) -> list[InternshipItem]:
    summaries = await client.internships.list_internships()
    return filter_internships(summaries, q)


@router.get(
    "/internships/{reference:path}",
    openapi_extra=oauth(Scope.INTERNSHIPS),
    response_model=InternshipDetail,
    summary="Consultar detalhes de uma oferta de estágio",
    description="Abre os dados completos da vaga a partir da referência obtida no mural.",
    responses={
        **SIGAA_ERRORS,
        404: {"description": "Oferta de estágio não encontrada ou mural alterado."},
    },
    dependencies=[NoStore],
)
async def get_internship(
    reference: str,
    client: SigaaClientDep,
) -> InternshipDetail:
    detail = await client.internships.get_internship(reference)
    return InternshipDetail.from_internship(detail, reference)
