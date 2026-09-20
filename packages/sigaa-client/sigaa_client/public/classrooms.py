import re
import unicodedata

from bs4 import BeautifulSoup, Tag

from ..config import PUBLIC_CLASSROOMS_PATH
from ..exceptions import SessionExpired, SigaaParseError, SigaaSearchError
from ..models import PublicClassroom, Subject, Teacher, TeachingLevel, Unit
from ..utils.jsf import build_submit, link_params, read_form
from ..utils.parsing import (
    clean_text,
    schedule_code,
    split_location,
    visible_text,
)
from .session import PublicSession

FORM_ID = "formTurma"
SEARCH_BUTTON = "Buscar"

LEVEL_FIELD = "formTurma:inputNivel"
UNIT_FIELD = "formTurma:inputDepto"
YEAR_FIELD = "formTurma:inputAno"
PERIOD_FIELD = "formTurma:inputPeriodo"

_COLUMNS = 8
_AMBIGUOUS_SAMPLE = 3
_ROW_CLASSES = frozenset({"linhaPar", "linhaImpar"})
_TEACHER_RE = re.compile(r"^(.+?)(?:\s*\((\d+)h\))?$")
# A mensagem de "nada encontrado" chega no mesmo bloco dos erros de verdade.
_NO_RESULTS = "nao foram encontrados resultados"


class PublicClassrooms:
    """Busca pública de turmas (`public/turmas/listar.jsf`), sem login."""

    def __init__(self, session: PublicSession) -> None:
        self._session = session

    async def list_units(self, contains: str | None = None) -> list[Unit]:
        """As unidades que o filtro obrigatório da busca aceita.

        `contains` peneira pelo nome ignorando acento e caixa — são mais de 200.
        """
        form = read_form(await self._session.open(PUBLIC_CLASSROOMS_PATH), FORM_ID)
        units = _units(form)
        if contains is None:
            return units

        needle = _fold(contains)
        return [unit for unit in units if needle in _fold(unit.name)]

    async def search(
        self,
        unit: Unit | int | str,
        *,
        level: TeachingLevel | None = None,
        year: int | None = None,
        period: int | None = None,
    ) -> list[PublicClassroom]:
        """Turmas ofertadas por uma unidade — o SIGAA não lista todas de uma vez.

        `unit` aceita o `Unit`, o id numérico ou um pedaço do nome (`"gama"`),
        resolvido contra a própria página da busca. `level` é opcional; sem
        `year`/`period` vale o semestre que o form já vem preenchido.
        """
        soup = await self._search(unit, level, year, period)
        return [] if _no_results(soup) else _parse_results(soup)

    async def _search(
        self,
        unit: Unit | int | str,
        level: TeachingLevel | None,
        year: int | None,
        period: int | None,
    ) -> BeautifulSoup:
        try:
            return await self._submit(unit, level, year, period)
        except SessionExpired:
            # A sessão morreu entre abrir o form e enviá-lo: o `ViewState` da
            # mão não serve mais, então refaz o caminho inteiro uma vez.
            await self._session.restart()
            return await self._submit(unit, level, year, period)

    async def _submit(
        self,
        unit: Unit | int | str,
        level: TeachingLevel | None,
        year: int | None,
        period: int | None,
    ) -> BeautifulSoup:
        form = read_form(await self._session.open(PUBLIC_CLASSROOMS_PATH), FORM_ID)

        # O select de unidades vem no mesmo form, então resolver pelo nome é de graça.
        values = {UNIT_FIELD: str(_resolve_unit(_units(form), unit))}
        if level is not None:
            values[LEVEL_FIELD] = level.value
        if year is not None:
            values[YEAR_FIELD] = str(year)
        if period is not None:
            values[PERIOD_FIELD] = str(period)

        action, payload = build_submit(form, values, SEARCH_BUTTON)
        return await self._session.submit(action, payload)


def _units(form: Tag) -> list[Unit]:
    select = form.find("select", attrs={"name": UNIT_FIELD})
    if not isinstance(select, Tag):
        raise SigaaParseError("Select de unidades não encontrado no form da busca.")

    units = []
    for option in select.find_all("option"):
        value = str(option.get("value") or "")
        if value.isdigit() and int(value) > 0:
            units.append(Unit(id=int(value), name=clean_text(option)))
    return units


def _resolve_unit(units: list[Unit], wanted: Unit | int | str) -> int:
    if isinstance(wanted, Unit):
        return wanted.id
    if isinstance(wanted, int):
        return wanted
    if wanted.isdigit():
        return int(wanted)

    needle = _fold(wanted)
    matches = [unit for unit in units if needle in _fold(unit.name)]
    if not matches:
        raise SigaaSearchError(f"Nenhuma unidade casa com `{wanted}`.")
    if len(matches) > 1:
        names = ", ".join(unit.name for unit in matches[:_AMBIGUOUS_SAMPLE])
        rest = len(matches) - _AMBIGUOUS_SAMPLE
        raise SigaaSearchError(
            f"`{wanted}` casa com {len(matches)} unidades: {names}"
            + (f" e mais {rest}." if rest > 0 else ".")
        )
    return matches[0].id


def _no_results(soup: BeautifulSoup) -> bool:
    messages = [clean_text(item) for item in soup.select("ul.erros li")]
    if not messages:
        return False
    if any(_NO_RESULTS in _fold(message) for message in messages):
        return True
    raise SigaaSearchError(" ".join(messages))


def _parse_results(soup: BeautifulSoup) -> list[PublicClassroom]:
    table = soup.find("table", class_="listagem")
    if not isinstance(table, Tag):
        raise SigaaParseError("Tabela de turmas não veio no resultado da busca.")

    classrooms: list[PublicClassroom] = []
    subject: Subject | None = None

    for row in table.find_all("tr"):
        classes = set(row.get("class") or [])
        if "agrupador" in classes:
            subject = _subject(row)
        elif subject is not None and classes & _ROW_CLASSES:
            classrooms.append(_classroom(row, subject))

    return classrooms


def _subject(row: Tag) -> Subject:
    """A linha `agrupador` traz o componente das turmas listadas abaixo dela."""
    title = row.find("span", class_="tituloDisciplina")
    if not isinstance(title, Tag):
        raise SigaaParseError("Linha de componente curricular sem título.")

    code, _, name = clean_text(title).partition(" - ")
    anchor = row.find("a")
    sigaa_id = link_params(anchor).get("id", "") if isinstance(anchor, Tag) else ""
    return Subject(
        code=code.strip() or None,
        sigaa_id=int(sigaa_id) if sigaa_id.isdigit() else None,
        name=name.strip() or code.strip(),
    )


def _classroom(row: Tag, subject: Subject) -> PublicClassroom:
    cells = row.find_all("td", recursive=False)
    if len(cells) < _COLUMNS:
        raise SigaaParseError("Linha de turma com menos colunas que o esperado.")

    teachers = _teachers(cells[2])
    unity, room = split_location(clean_text(cells[7]))
    hours = sum(teacher.hours or 0 for teacher in teachers)

    return PublicClassroom(
        number=clean_text(cells[0]),
        semester=clean_text(cells[1]),
        schedule=schedule_code(visible_text(cells[3])),
        schedule_description=_description(cells[3]),
        room=room,
        vacancies=_count(cells[5]),
        occupied=_count(cells[6]),
        teachers=teachers,
        # A CH do componente é a soma das horas dos docentes: quando são dois,
        # o SIGAA divide a carga da turma entre eles.
        subject=subject.model_copy(update={"hours": hours or None, "unity": unity}),
    )


def _teachers(cell: Tag) -> tuple[Teacher, ...]:
    """Um docente por linha, no formato `NOME (60h)`."""
    teachers = []
    for line in cell.stripped_strings:
        match = _TEACHER_RE.match(" ".join(line.split()))
        if match is None:
            continue
        hours = match.group(2)
        teachers.append(
            Teacher(name=match.group(1), hours=int(hours) if hours else None)
        )
    return tuple(teachers)


def _description(cell: Tag) -> str | None:
    """O balão de ajuda do horário traz a versão legível do código."""
    popup = cell.select_one(".popUp")
    return clean_text(popup) if isinstance(popup, Tag) else None


def _count(cell: Tag) -> int | None:
    value = clean_text(cell)
    return int(value) if value.isdigit() else None


def _fold(value: str) -> str:
    """Compara sem acento e sem caixa — `gama` acha `CAMPUS UNB GAMA: ...`."""
    normalized = unicodedata.normalize("NFKD", value.casefold())
    return "".join(char for char in normalized if not unicodedata.combining(char))
