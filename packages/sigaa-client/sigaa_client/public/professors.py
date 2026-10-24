"""Busca e perfis públicos de docentes do SIGAA."""

from collections import Counter
from urllib.parse import parse_qs, urljoin, urlparse

from bs4 import BeautifulSoup, Tag

from ..config import (
    PUBLIC_PROFESSOR_DISCIPLINES_PATH,
    PUBLIC_PROFESSOR_PROFILE_PATH,
    PUBLIC_PROFESSORS_PATH,
    SIGAA_BASE_URL,
)
from ..exceptions import SessionExpired, SigaaParseError, SigaaSearchError
from ..models import Professor, ProfessorDiscipline, ProfessorProfile, Unit
from ..utils.jsf import build_submit, read_form
from ..utils.parsing import clean_text, lookup_key, photo_url
from .session import PublicSession
from .units import parse_units, resolve_unit

FORM_ID = "form"
NAME_FIELD = "form:nome"
DEPARTMENT_FIELD = "form:departamento"
SEARCH_BUTTON = "Buscar"
_NO_RESULTS = "nenhum docente foi encontrado"


class PublicProfessors:
    def __init__(self, session: PublicSession) -> None:
        self._session = session

    async def list_departments(self) -> list[Unit]:
        form = read_form(await self._session.open(PUBLIC_PROFESSORS_PATH), FORM_ID)
        return parse_units(form, DEPARTMENT_FIELD)

    async def search(
        self, department: Unit | int | str | None = None, *, name: str | None = None
    ) -> list[Professor]:
        if department is None and not (name or "").strip():
            raise SigaaSearchError("Informe o departamento ou o nome do docente.")
        if name is not None and name.strip() and len(name.strip()) < 4:
            raise SigaaSearchError(
                "O nome do docente precisa ter ao menos 4 caracteres."
            )
        try:
            page, units = await self._search(department, name)
        except SessionExpired:
            await self._session.restart()
            page, units = await self._search(department, name)
        return _parse_results(page, units)

    async def get_profile(self, professor: Professor) -> ProfessorProfile:
        # shortcut: o SIGAA troca o docente em sessões compartilhadas; serializar se houver chamadas paralelas.
        profile = await self._session.open(
            f"{PUBLIC_PROFESSOR_PROFILE_PATH}?siape={professor.siape}"
        )
        disciplines = await self._session.open(
            f"{PUBLIC_PROFESSOR_DISCIPLINES_PATH}?siape={professor.siape}"
        )
        return _parse_profile(profile, professor).model_copy(
            update={"disciplines": _parse_disciplines(disciplines)}
        )

    async def _search(
        self, department: Unit | int | str | None, name: str | None
    ) -> tuple[BeautifulSoup, list[Unit]]:
        form = read_form(await self._session.open(PUBLIC_PROFESSORS_PATH), FORM_ID)
        units = parse_units(form, DEPARTMENT_FIELD)
        values = {NAME_FIELD: (name or "").strip()}
        if department is not None:
            values[DEPARTMENT_FIELD] = str(resolve_unit(units, department))
        action, payload = build_submit(form, values, SEARCH_BUTTON)
        return await self._session.submit(action, payload), units


def _parse_results(page: BeautifulSoup, units: list[Unit]) -> list[Professor]:
    messages = [clean_text(item) for item in page.select("ul.erros li")]
    if any(_NO_RESULTS in lookup_key(message) for message in messages):
        return []
    if messages:
        raise SigaaSearchError(" ".join(messages))
    table = page.select_one("table.listagem")
    if not isinstance(table, Tag):
        raise SigaaParseError("Tabela de docentes ausente no resultado da busca.")
    professors = []
    for row in table.select("tr"):
        name = row.select_one("span.nome")
        if not isinstance(name, Tag):
            continue
        department_name = row.select_one("span.departamento")
        anchor = row.select_one("span.pagina a[href]")
        if not isinstance(department_name, Tag) or not isinstance(anchor, Tag):
            raise SigaaParseError("Docente sem departamento ou link público na busca.")
        url = urljoin(SIGAA_BASE_URL, str(anchor["href"]))
        parsed = urlparse(url)
        if (
            parsed.netloc != urlparse(SIGAA_BASE_URL).netloc
            or parsed.path != PUBLIC_PROFESSOR_PROFILE_PATH
        ):
            raise SigaaParseError("Link público do docente fora do portal do SIGAA.")
        siape = parse_qs(parsed.query).get("siape", [""])[0]
        if not siape.isdigit():
            raise SigaaParseError("Link público do docente sem siape numérico.")
        image = row.select_one("td.foto img[src]")
        photo = photo_url(str(image["src"])) if isinstance(image, Tag) else None
        if photo is not None and urlparse(photo).scheme not in ("http", "https"):
            photo = None
        unit_name = clean_text(department_name)
        key = lookup_key(unit_name)
        matches = [
            unit
            for unit in units
            if (candidate := lookup_key(unit.name)) == key
            or candidate.startswith(f"{key} - ")
        ]
        if len(matches) != 1:
            raise SigaaParseError(
                f"Departamento `{unit_name}` não corresponde a uma única opção da busca."
            )
        professors.append(
            Professor(
                siape=int(siape),
                name=clean_text(name),
                department=matches[0],
                photo=photo,
                url=url,
            )
        )
    if not professors:
        raise SigaaParseError("Tabela de docentes sem linhas reconhecidas.")
    return professors


def _field(section: Tag, label: str) -> Tag | None:
    for item in section.select("dl"):
        title = item.find("dt")
        if isinstance(title, Tag) and lookup_key(clean_text(title)).startswith(label):
            value = item.find("dd")
            return value if isinstance(value, Tag) else None
    return None


def _optional_text(cell: Tag | None) -> str | None:
    if cell is None:
        return None
    value = clean_text(cell)
    if lookup_key(value) in {
        "nao informado",
        "nao informada",
        "nao informados",
        "nao informadas",
        "link nao informado",
    }:
        return None
    return value or None


def _parse_profile(page: BeautifulSoup, professor: Professor) -> ProfessorProfile:
    header = page.select_one("#left h3")
    profile = page.select_one("#perfil-docente")
    contact = page.select_one("#contato")
    if not isinstance(header, Tag) or not isinstance(profile, Tag):
        raise SigaaParseError("Cabeçalho ou perfil ausente na página do docente.")
    if lookup_key(clean_text(header)) != lookup_key(professor.name):
        raise SigaaParseError(
            f"Perfil de `{clean_text(header)}` onde se esperava `{professor.name}`."
        )
    lattes_cell = _field(profile, "curriculo lattes")
    lattes_anchor = lattes_cell.find("a", href=True) if lattes_cell else None
    lattes = (
        urljoin(SIGAA_BASE_URL, str(lattes_anchor["href"]))
        if isinstance(lattes_anchor, Tag)
        else None
    )
    if lattes is not None and urlparse(lattes).scheme not in ("http", "https"):
        lattes = None
    email = (
        _optional_text(_field(contact, "endereco eletronico"))
        if isinstance(contact, Tag)
        else None
    )
    if email is not None:
        domain = email.rsplit("@", 1)[-1].lower()
        if "@" not in email or (domain != "unb.br" and not domain.endswith(".unb.br")):
            email = None
    return ProfessorProfile(
        **professor.model_dump(),
        description=_optional_text(_field(profile, "descricao pessoal")),
        education=_optional_text(_field(profile, "formacao academica/profissional")),
        interests=_optional_text(_field(profile, "areas de interesse")),
        lattes=lattes,
        email=email,
    )


def _parse_disciplines(page: BeautifulSoup) -> tuple[ProfessorDiscipline, ...]:
    section = page.select_one("#turmas-graduacao")
    if not isinstance(section, Tag):
        raise SigaaParseError("Aba de disciplinas de graduação ausente no perfil.")
    table = section.select_one("table.listagem")
    if not isinstance(table, Tag):
        if section.select_one("p.vazio"):
            return ()
        raise SigaaParseError("Tabela de disciplinas de graduação ausente.")
    found: Counter[tuple[str, str]] = Counter()
    semester = None
    for row in table.select("tr"):
        period = row.select_one("td.anoPeriodo")
        if isinstance(period, Tag):
            semester = clean_text(period)
            continue
        code = row.select_one("td.codigo")
        if isinstance(code, Tag):
            if semester is None:
                raise SigaaParseError("Disciplina de graduação sem semestre.")
            value = clean_text(code)
            if not value:
                raise SigaaParseError("Disciplina de graduação sem código.")
            found[(semester, value)] += 1
    return tuple(
        ProfessorDiscipline(semester=semester, code=code, occurrences=count)
        for (semester, code), count in sorted(found.items(), reverse=True)
    )
