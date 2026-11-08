from typing import Annotated, Literal

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    Response,
    UploadFile,
)
from sigaa_client import RestaurantCredentials, RestaurantStatement
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile as MultipartFile

from api.cache import CacheControl, NoStore
from api.db.main import DatabaseDep
from api.errors import SIGAA_ERRORS
from api.modules.me.edit import check_profile_origin, edit_profile
from api.modules.me.photo import MAX_PHOTO_BYTES, normalize_photo
from api.modules.me.profile import (
    MAX_PROFILE_BIO_LENGTH,
    ProfileServiceDep,
    UserProfile,
)
from api.modules.me.settings import (
    UserSettings,
    UserSettingsPatch,
    read_settings,
    save_settings,
)
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
    response_model=UserProfile,
    summary="Consultar o perfil do usuário autenticado",
    responses=SIGAA_ERRORS,
)
async def get_me(service: ProfileServiceDep) -> UserProfile:
    return await service.get_profile()


@router.get(
    "/ru-statement",
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
    description="Lê o QR code da carteirinha no SIGAA a cada acesso, sem persistência. Retorna token e valid_until; a validade informa mês/ano e o scraper representa o mês pelo dia 1.",
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
    return _document_download(pdf, "carteirinha.pdf", response)


@router.post(
    "/transcript",
    response_class=Response,
    summary="Baixar o histórico acadêmico em PDF",
    responses=_PDF_RESPONSES,
    dependencies=[NoStore],
)
async def get_transcript(client: SigaaClientDep, response: Response) -> Response:
    pdf = await client.documents.get_transcript_pdf()
    return _document_download(pdf, "historico.pdf", response)


def _document_download(content: bytes, filename: str, response: Response) -> Response:
    download = Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
    download.raw_headers.extend(response.raw_headers)
    return download


@router.get(
    "/settings",
    response_model=UserSettings,
    summary="Consultar as configurações pessoais do usuário",
    responses=SIGAA_ERRORS,
    dependencies=[NoStore],
)
async def get_settings(connection: SigaaConnectionDep, db: DatabaseDep) -> UserSettings:
    return await read_settings(db, connection.registration)


@router.patch(
    "/settings",
    response_model=UserSettings,
    summary="Atualizar as configurações pessoais do usuário",
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
    response_model=UserProfile,
    summary="Atualizar foto ou bio no SIGAA",
    description=(
        "Omita a bio para preservá-la ou envie uma string vazia para limpá-la. "
        "A remoção da foto deve ser feita em uma requisição separada. "
        "Para substituir, envie um único JPEG ou PNG de até 4 MiB."
    ),
    dependencies=[NoStore, Depends(check_profile_origin)],
    responses={
        **SIGAA_ERRORS,
        413: {"description": "A foto enviada deve ter até 4 MiB."},
    },
)
async def update_profile(
    request: Request,
    photo_action: Annotated[Literal["keep", "replace", "remove"], Form()],
    connection: SigaaConnectionDep,
    db: DatabaseDep,
    bio: Annotated[str | None, Form(max_length=MAX_PROFILE_BIO_LENGTH)] = None,
    photo: Annotated[UploadFile | None, File()] = None,
) -> UserProfile:
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
    return await edit_profile(
        connection, db, bio=bio, photo=content, remove_photo=photo_action == "remove"
    )
