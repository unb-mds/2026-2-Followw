import asyncio
import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

from ..config import (
    CLASSROOMS_PATH,
    DASHBOARD_PATH,
    PARTICIPANTS_PATH,
    SIGAA_BASE_URL,
)
from ..exceptions import SessionExpired, SessionRenewed, SigaaParseError
from ..models import Classroom, ClassroomMember, ClassroomRole, Subject
from ..utils.jsf import build_postback, link_params, read_viewstate
from ..utils.parsing import (
    clean_text,
    schedule_code,
    split_course,
    split_location,
    visible_text,
)
from .session import Session

CLASSROOM_ID_FIELD = "frontEndIdTurma"

_SEMESTER_RE = re.compile(r"^\d{4}\.\d$")
_ROW_ID_RE = re.compile(r"^linha_(\d+)$")
_HOURS_RE = re.compile(r"(\d+)")
_PERSON_ID_RE = re.compile(r"'idPessoa'\s*:\s*(\d+)")
_CONTEXT_RE = re.compile(r'var nomeTurma\s*=\s*"(.*?)";')
_CONTEXT_NUMBER_RE = re.compile(r"\bturma\s*[:\-]?\s*([\w-]+)", re.IGNORECASE)
_CONTEXT_SEMESTER_RE = re.compile(r"\b\d{4}\.\d\b")
_CONTEXT_CODE_RE = re.compile(r"^\s*([\w]+)\s*-")


class Classrooms:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._context_lock = asyncio.Lock()

    async def list_classrooms(self) -> list[Classroom]:
        dashboard, classrooms = await asyncio.gather(
            self._get(DASHBOARD_PATH), self._get(CLASSROOMS_PATH)
        )
        active = _parse_dashboard(dashboard)
        history = _parse_history(classrooms)
        return [_merge(history.get(key), entry) for key, entry in active.items()]

    async def list_all_classrooms(self) -> list[Classroom]:
        classrooms, dashboard = await asyncio.gather(
            self._get(CLASSROOMS_PATH), self._get(DASHBOARD_PATH)
        )
        history = _parse_history(classrooms)
        active = _parse_dashboard(dashboard)
        return [_merge(entry, active.get(key)) for key, entry in history.items()]

    async def list_classroom_members(self, classroom_id: str) -> list[ClassroomMember]:
        # A troca de turma e a leitura dos participantes são uma operação única.
        async with self._context_lock:
            for attempt in range(2):
                try:
                    expected = await self._enter_classroom(
                        classroom_id, allow_renewal=attempt == 0
                    )
                    response = await self._session.get(
                        PARTICIPANTS_PATH,
                        retry_on_renewal=False,
                        allow_renewal=attempt == 0,
                    )
                    _assert_context(response.text, expected)
                    soup = BeautifulSoup(response.text, "lxml")
                    return [
                        *_parse_members(soup, "Docentes", ClassroomRole.PROFESSOR),
                        *_parse_members(soup, "Discentes", ClassroomRole.ALUNO),
                    ]
                except SessionRenewed:
                    continue
        raise SessionExpired("Não foi possível restaurar o contexto da turma.")

    async def _get(self, path: str) -> str:
        response = await self._session.get(path)
        return response.text

    async def _enter_classroom(
        self, classroom_id: str, *, allow_renewal: bool = True
    ) -> Classroom:
        """Faz o postback de "Acessar Turma Virtual", que troca a turma da sessão.

        O contexto da turma vive na sessão, não na URL — sem esse passo,
        `participantes.jsf` devolve a turma que estiver carregada.
        """
        # O ViewState morre a cada postback, então a listagem é relida aqui.
        response = await self._session.get(CLASSROOMS_PATH, allow_renewal=allow_renewal)
        soup = BeautifulSoup(response.text, "lxml")
        row = next(
            (
                row
                for row in _history_rows(soup)
                if link_params(row[1]).get(CLASSROOM_ID_FIELD) == classroom_id
            ),
            None,
        )
        if row is None:
            raise SigaaParseError(f"Turma `{classroom_id}` não está no histórico.")

        form = row[1].find_parent("form") or soup.find("form")
        if not isinstance(form, Tag):
            raise SigaaParseError("Form de acesso à turma não encontrado.")

        action, payload = build_postback(
            form, link_params(row[1]), read_viewstate(soup)
        )
        await self._session.post(action, data=payload, allow_renewal=allow_renewal)
        return _classroom(row[0], row[1], semester=row[2])


def _assert_context(page: str, expected: Classroom) -> None:
    """A turma da sessão pode não ser a que se pediu — o cabeçalho é a prova."""
    match = _CONTEXT_RE.search(page)
    if match is None:
        raise SigaaParseError("Página de participantes não declara a turma atual.")

    context = match.group(1)
    code = _CONTEXT_CODE_RE.search(context)
    number = _CONTEXT_NUMBER_RE.search(context)
    semester = _CONTEXT_SEMESTER_RE.search(context)
    if (
        code is None
        or number is None
        or semester is None
        or code.group(1) != expected.subject.code
        or number.group(1) != expected.number
        or semester.group() != expected.semester
    ):
        raise SigaaParseError(
            f"A sessão está na turma `{context}`, não em `{expected.id}`."
        )


def _history_rows(soup: BeautifulSoup) -> list[tuple[Tag, Tag, str]]:
    table = soup.find("table", class_="listagem")
    if not isinstance(table, Tag):
        raise SigaaParseError("Tabela de turmas não encontrada em `turmas.jsf`.")

    rows: list[tuple[Tag, Tag, str]] = []
    semester = ""
    for row in table.find_all("tr"):
        period = row.find("td", class_="periodo")
        if period is not None:
            semester = clean_text(period)
            continue
        link = row.find("a", title="Acessar Turma Virtual")
        if isinstance(link, Tag) and CLASSROOM_ID_FIELD in link_params(link):
            rows.append((row, link, semester))
    return rows


def _parse_history(html: str) -> dict[str, Classroom]:
    soup = BeautifulSoup(html, "lxml")
    return {
        link_params(link)[CLASSROOM_ID_FIELD]: _classroom(row, link, semester)
        for row, link, semester in _history_rows(soup)
    }


def _classroom(row: Tag, link: Tag, semester: str) -> Classroom:
    cells = row.find_all("td")
    if len(cells) < 4:
        raise SigaaParseError("Linha de turma com menos colunas que o esperado.")

    code, _, name = clean_text(cells[0]).partition(" - ")
    hours = _HOURS_RE.search(clean_text(cells[2]))
    return Classroom(
        id=link_params(link)[CLASSROOM_ID_FIELD],
        number=clean_text(cells[1]),
        semester=semester,
        schedule=schedule_code(clean_text(cells[3])),
        subject=Subject(
            code=code.strip() or None,
            name=name.strip() or code.strip(),
            hours=int(hours.group(1)) if hours else None,
        ),
    )


def _parse_dashboard(html: str) -> dict[str, Classroom]:
    soup = BeautifulSoup(html, "lxml")
    anchor = soup.select_one("form[id^=form_acessarTurmaVirtual]")
    if anchor is None:
        return {}

    table = anchor.find_parent("table")
    if not isinstance(table, Tag):
        return {}

    classrooms: dict[str, Classroom] = {}
    semester = ""
    pending: Classroom | None = None

    for row in table.find_all("tr"):
        cells = row.find_all("td")
        if len(cells) == 1 and _SEMESTER_RE.match(clean_text(cells[0])):
            semester = clean_text(cells[0])
            continue

        # O id numérico vem na `<tr>` vazia logo depois da linha da turma.
        row_id = next((_ROW_ID_RE.match(cell.get("id", "")) for cell in cells), None)
        if pending is not None and row_id is not None:
            classrooms[pending.id] = pending.model_copy(
                update={"sigaa_id": int(row_id.group(1))}
            )
            pending = None
            continue

        link = row.find("td", class_="descricao")
        if not isinstance(link, Tag):
            continue
        anchor = link.find("a")
        if not isinstance(anchor, Tag):
            continue
        params = link_params(anchor)
        if CLASSROOM_ID_FIELD not in params:
            continue

        if pending is not None:
            classrooms[pending.id] = pending

        unity, room = (
            split_location(clean_text(cells[1])) if len(cells) > 1 else (None, None)
        )
        pending = Classroom(
            id=params[CLASSROOM_ID_FIELD],
            number="",
            semester=semester,
            schedule=schedule_code(visible_text(cells[2])) if len(cells) > 2 else None,
            room=room,
            subject=Subject(name=clean_text(anchor), unity=unity),
        )

    if pending is not None:
        classrooms[pending.id] = pending
    return classrooms


def _merge(base: Classroom | None, extra: Classroom | None) -> Classroom:
    """Junta as duas telas: o histórico tem código e CH, o portal tem local."""
    if base is None:
        assert extra is not None
        return extra
    if extra is None:
        return base

    return base.model_copy(
        update={
            "sigaa_id": base.sigaa_id or extra.sigaa_id,
            "number": base.number or extra.number,
            "schedule": base.schedule or extra.schedule,
            "room": base.room or extra.room,
            "subject": base.subject.model_copy(
                update={
                    "unity": base.subject.unity or extra.subject.unity,
                    "hours": base.subject.hours or extra.subject.hours,
                }
            ),
        }
    )


def _parse_members(
    soup: BeautifulSoup, legend: str, role: ClassroomRole
) -> list[ClassroomMember]:
    heading = next(
        (
            tag
            for tag in soup.find_all("legend")
            if tag.get_text(strip=True).startswith(legend)
        ),
        None,
    )
    if heading is None:
        raise SigaaParseError(f"Lista de {legend.lower()} não encontrada na turma.")

    # O `</fieldset>` fecha antes da tabela (HTML malformado): só `find_next` serve.
    table = heading.find_next("table", class_="participantes")
    if not isinstance(table, Tag):
        raise SigaaParseError(f"Tabela de {legend.lower()} não encontrada na turma.")

    members = [
        _member(card, role) for card in table.find_all("td", attrs={"valign": "top"})
    ]
    return [member for member in members if member is not None]


def _member(card: Tag, role: ClassroomRole) -> ClassroomMember | None:
    name = card.find("strong")
    if not isinstance(name, Tag):
        return None

    fields = _member_fields(card)
    course, unity = split_course(fields.get("curso", ""))
    person_id = _PERSON_ID_RE.search(str(card))

    return ClassroomMember(
        name=clean_text(name),
        role=role,
        # Só discente tem matrícula: o "Usuário(a)" do docente é o CPF, que
        # este pacote não expõe.
        registration=fields.get("matrícula"),
        photo=_member_photo(card),
        email=fields.get("e-mail"),
        course=course or None,
        unity=unity or fields.get("departamento"),
        person_id=int(person_id.group(1)) if person_id else None,
    )


def _member_photo(card: Tag) -> str | None:
    """A foto mora na `<td>` anterior à do participante, fora do card."""
    cell = card.find_previous_sibling("td")
    image = cell.find("img") if isinstance(cell, Tag) else None
    if not isinstance(image, Tag):
        return None

    source = str(image.get("src") or "")
    if not source or "no_picture" in source:
        return None
    return urljoin(SIGAA_BASE_URL, source)


def _member_fields(card: Tag) -> dict[str, str]:
    """`Curso: <em>X</em>` vira `{"curso": "X"}` — o `<em>` marca cada valor."""
    fields: dict[str, str] = {}
    for value in card.find_all("em"):
        label = value.find_previous(string=re.compile(r":\s*$"))
        if label is None:
            continue
        key = label.strip().rstrip(":").strip().lower()
        if key:
            fields[key] = clean_text(value)
    return fields
