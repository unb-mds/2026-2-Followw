from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

from ..config import DASHBOARD_PATH, PROFILE_EDIT_PATH, SIGAA_BASE_URL
from ..exceptions import SigaaParseError
from ..utils.jsf import build_submit, link_params, read_viewstate
from ..utils.parsing import photo_url
from .session import Session

_BIO = "descricaoPessoal"
_PASSWORD = "senha"
_PHOTO = "alterarFoto"
_RESET = "checkBoxReprovacoesNoMesmoComponenteConsideradas"


async def _read(session: Session) -> Tag:
    page = await session.get(PROFILE_EDIT_PATH)
    soup = BeautifulSoup(page.text, "lxml")
    field = soup.find("textarea", attrs={"name": _BIO})
    form = field.find_parent("form") if field else None
    if not isinstance(form, Tag):
        raise SigaaParseError("Formulário de edição de perfil ausente.")
    action = urljoin(SIGAA_BASE_URL, str(form.get("action", "")))
    if action != SIGAA_BASE_URL + PROFILE_EDIT_PATH:
        raise SigaaParseError("Destino inesperado no formulário de perfil.")
    read_viewstate(form)
    return form


def _photo(form: Tag) -> str | None:
    image = form.find("img", id="fotoPerfil")
    if image is None or not image.get("src"):
        raise SigaaParseError("Imagem de perfil ausente na tela de edição.")
    return photo_url(str(image["src"]))


def _payload(form: Tag, password: str, bio: str) -> dict[str, str]:
    _, payload = build_submit(form, {_PASSWORD: password, _BIO: bio}, "Gravar perfil")
    for field in form.find_all("textarea"):
        if field.get("name") and field.get("name") != _BIO:
            payload[str(field["name"])] = field.get_text()
    payload.pop(_RESET, None)
    payload.pop(_PHOTO, None)
    payload["tipoenviofoto"] = "on"
    return payload


async def _send(session: Session, payload: dict[str, str], photo: bytes | None) -> None:
    files = [(name, (None, value)) for name, value in payload.items()]
    if photo is not None:
        files.append((_PHOTO, ("perfil.jpg", photo, "image/jpeg")))
    response = await session.post(
        PROFILE_EDIT_PATH,
        files=files,
        follow_redirects=False,
        allow_redirect_response=True,
    )
    if response.is_redirect:
        target = urljoin(SIGAA_BASE_URL, response.headers.get("location", ""))
        if target not in {
            SIGAA_BASE_URL + PROFILE_EDIT_PATH,
            SIGAA_BASE_URL + DASHBOARD_PATH,
        }:
            raise SigaaParseError("Redirecionamento inesperado após editar perfil.")
    else:
        soup = BeautifulSoup(response.text, "lxml")
        if soup.select_one(".erros, .erro, .errors"):
            raise SigaaParseError("O SIGAA recusou a alteração do perfil.")


async def update_profile(
    session: Session,
    *,
    password: str,
    bio: str,
    photo: bytes | None = None,
    remove_photo: bool = False,
) -> None:
    if photo is not None and remove_photo:
        raise ValueError("Escolha enviar ou remover a foto.")
    form = await _read(session)
    previous_photo = _photo(form)
    if remove_photo and previous_photo:
        link = form.find("a", id="btnExcluirFoto")
        params = link_params(link) if isinstance(link, Tag) else {}
        if set(params) != {"btnExcluirFoto", "idFotoRemovida"}:
            raise SigaaParseError("Ação de remoção de foto ausente.")
        original_bio = form.find("textarea", attrs={"name": _BIO}).get_text()
        payload = _payload(form, password, original_bio)
        button = form.find("input", attrs={"type": "submit", "value": "Gravar perfil"})
        payload.pop(str(button["name"]))
        payload.update(params)
        await _send(session, payload, None)
        form = await _read(session)
        if _photo(form):
            raise SigaaParseError("O SIGAA não confirmou a remoção da foto.")
    await _send(session, _payload(form, password, bio), photo)
    current = await _read(session)
    saved_bio = current.find("textarea", attrs={"name": _BIO}).get_text()
    if saved_bio.replace("\r\n", "\n") != bio.replace("\r\n", "\n"):
        raise SigaaParseError(
            "O SIGAA não confirmou a bio; releia o perfil antes de tentar novamente."
        )
    if photo is not None and (not _photo(current) or _photo(current) == previous_photo):
        raise SigaaParseError(
            "O SIGAA não confirmou a nova foto; releia o perfil antes de tentar novamente."
        )
