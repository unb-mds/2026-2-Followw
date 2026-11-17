from urllib.parse import urljoin, urlsplit

import httpx
from bs4 import BeautifulSoup, Tag

from ..config import DASHBOARD_PATH, PORTAL_PATH, PROFILE_EDIT_PATH, SIGAA_BASE_URL
from ..exceptions import SigaaParseError
from ..utils.jsf import build_submit, link_params, read_viewstate
from ..utils.parsing import photo_url
from .session import Session

_BIO = "descricaoPessoal"
_PASSWORD = "senha"
_PHOTO = "alterarFoto"
_CONFIRMATION = "inputHiddenOpcaoExibir"
_PASSWORD_ONLY = "2"
_RESET = "checkBoxReprovacoesNoMesmoComponenteConsideradas"
_SUCCESS = "Perfil atualizado com sucesso!"


async def _read(session: Session) -> Tag:
    page = await session.get(PROFILE_EDIT_PATH)
    return _form(page.text)


def _form(html: str) -> Tag:
    soup = BeautifulSoup(html, "lxml")
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
    payload[_CONFIRMATION] = _PASSWORD_ONLY
    payload.pop(_RESET, None)
    payload.pop(_PHOTO, None)
    payload["tipoenviofoto"] = "on"
    return payload


def _confirmed(html: str) -> bool:
    soup = BeautifulSoup(html, "lxml")
    notices = soup.select(
        "#painel-erros ul.info li, #painel-erros .info, .mensagem-sucesso, ul.info li"
    )
    return any(
        _SUCCESS in item.get_text() or "sucesso" in item.get_text().lower()
        for item in notices
    )


async def _post(
    session: Session, payload: dict[str, str], photo: bytes | None
) -> httpx.Response:
    files = [(name, (None, value)) for name, value in payload.items()]
    if photo is not None:
        files.append((_PHOTO, ("perfil.jpg", photo, "image/jpeg")))
    return await session.post(
        PROFILE_EDIT_PATH,
        files=files,
        follow_redirects=False,
        allow_redirect_response=True,
    )


async def _confirm(session: Session, response: httpx.Response) -> bool:
    if response.is_redirect:
        raw_target = response.headers.get("location", "")
        target = urljoin(SIGAA_BASE_URL, raw_target)
        path = urlsplit(target).path
        if path in {DASHBOARD_PATH, PORTAL_PATH, PROFILE_EDIT_PATH}:
            response = await session.get(path)
        else:
            raise SigaaParseError("Redirecionamento inesperado após editar perfil.")
    error_node = BeautifulSoup(response.text, "lxml").select_one(
        ".erros, .erro, .errors, #painel-erros ul.erros"
    )
    if error_node:
        detail = error_node.get_text(strip=True)
        raise SigaaParseError(
            f"O SIGAA recusou a alteração do perfil: {detail}"
            if detail
            else "O SIGAA recusou a alteração do perfil."
        )
    return _confirmed(response.text)


async def _remove_photo(session: Session, form: Tag, password: str, bio: str) -> None:
    link = form.find("a", id="btnExcluirFoto")
    params = link_params(link) if isinstance(link, Tag) else {}
    if set(params) != {"btnExcluirFoto", "idFotoRemovida"}:
        raise SigaaParseError("Ação de remoção de foto ausente.")
    payload = _payload(form, password, bio)
    button = form.find("input", attrs={"type": "submit", "value": "Gravar perfil"})
    payload.pop(str(button["name"]))
    payload.update(params)
    response = await _post(session, payload, None)
    if response.is_redirect:
        raise SigaaParseError("O SIGAA não abriu a remoção da foto.")
    # A exclusão fica só na resposta; persiste ao gravar o perfil a partir dela.
    staged = _form(response.text)
    if _photo(staged) is not None:
        raise SigaaParseError("O SIGAA não confirmou a remoção da foto.")
    saved = await _post(session, _payload(staged, password, bio), None)
    if not await _confirm(session, saved):
        raise SigaaParseError(
            "O SIGAA não confirmou a remoção da foto; "
            "releia o perfil antes de tentar novamente."
        )


async def update_profile(
    session: Session,
    *,
    password: str,
    bio: str | None = None,
    photo: bytes | None = None,
    remove_photo: bool = False,
) -> tuple[str | None, str | None]:
    if remove_photo and (photo is not None or bio is not None):
        raise ValueError("A remoção da foto deve ser uma operação separada.")
    form = await _read(session)
    previous_photo = _photo(form)
    original_bio = form.find("textarea", attrs={"name": _BIO}).get_text()
    if remove_photo:
        if previous_photo is None:
            return None, original_bio or None
        await _remove_photo(session, form, password, original_bio)
        return None, original_bio or None
    elif photo is not None or bio is not None:
        target_bio = original_bio if bio is None else bio
        payload = _payload(form, password, target_bio)
        response = await _post(session, payload, photo)
        confirmed = await _confirm(session, response)
        current = await _read(session)
        current_photo = _photo(current)
        saved_bio = current.find("textarea", attrs={"name": _BIO}).get_text()
        photo_changed = photo is not None and current_photo != previous_photo
        bio_changed = bio is not None and saved_bio == bio
        if not (confirmed or photo_changed or bio_changed):
            raise SigaaParseError(
                "O SIGAA não confirmou a atualização do perfil; "
                "releia o perfil antes de tentar novamente."
            )
        return current_photo, saved_bio or None
    else:
        return previous_photo, original_bio or None

    current = await _read(session)
    current_photo = _photo(current)
    if remove_photo and current_photo is not None:
        raise SigaaParseError("O SIGAA não confirmou a remoção da foto.")
    saved_bio = current.find("textarea", attrs={"name": _BIO}).get_text()
    return current_photo, saved_bio or None
