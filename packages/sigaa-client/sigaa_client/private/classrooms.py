import asyncio
import re
from collections.abc import Awaitable, Callable
from functools import partial
from io import BytesIO
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag
from PIL import Image

from ..config import (
    CLASSROOM_HOME_PATH,
    CLASSROOMS_PATH,
    DASHBOARD_PATH,
    PARTICIPANTS_PATH,
    PARTICIPANTS_TIMEOUT,
    SIGAA_BASE_URL,
)
from ..exceptions import (
    ClassroomNotFound,
    NewsNotFound,
    SessionExpired,
    SessionRenewed,
    SigaaParseError,
)
from ..models import (
    AttendanceEntry,
    AttendanceStatus,
    Classroom,
    ClassroomAttendance,
    ClassroomFrequency,
    ClassroomMember,
    ClassroomProgress,
    ClassroomRole,
    News,
    NewsAttachment,
    StatisticsShare,
    StudentSituation,
    Subject,
)
from ..utils.jsf import build_postback, link_params, read_form, read_viewstate
from ..utils.parsing import (
    clean_text,
    lookup_key,
    parse_datetime,
    schedule_code,
    split_course,
    split_location,
    to_markdown,
    visible_text,
)
from .session import Session

CLASSROOM_ID_FIELD = "frontEndIdTurma"
MENU_FORM_ID = "formMenu"
FREQUENCY_MENU_LABEL = "Frequência"
STATISTICS_MENU_LABEL = "Situação dos Discentes"
NEWS_MENU_LABEL = "Notícias"
NEWS_ID_FIELD = "id"
NEWS_DETAIL_LEGEND = "Visualização de Notícia"
PROGRESS_PANEL_LABEL = "Andamento das Aulas"

# O gráfico de situação não escreve os rótulos em lugar nenhum além da própria
# imagem — a legenda traz sempre estas situações, sempre nesta ordem.
SITUATIONS = (
    StudentSituation.APROVADO,
    StudentSituation.REPROVADO,
    StudentSituation.REPROVADO_POR_FALTAS,
    StudentSituation.REPROVADO_POR_MEDIA_E_POR_FALTAS,
    StudentSituation.APROVADO_POR_NOTA,
    StudentSituation.REPROVADO_POR_NOTA,
    StudentSituation.REPROVADO_POR_NOTA_E_FALTAS,
    StudentSituation.TRANCADO,
    StudentSituation.MATRICULADO,
)

# Uma tela da turma virtual, aberta com a turma já carregada na sessão.
OpenScreen = Callable[[Session, bool], Awaitable[str]]

# Outro client na mesma sessão do SIGAA pode trocar a turma no meio da leitura.
_SCREEN_ATTEMPTS = 3

_SEMESTER_RE = re.compile(r"^\d{4}\.\d$")
_ROW_ID_RE = re.compile(r"^linha_(\d+)$")
_HOURS_RE = re.compile(r"(\d+)")
_PERSON_ID_RE = re.compile(r"'idPessoa'\s*:\s*(\d+)")
_CONTEXT_RE = re.compile(r'var nomeTurma\s*=\s*"(.*?)";')
# `Turma: FGA0146 - ESTRUTURAS DE DADOS 1 (2026.2 - T01)`, dentro de um `<div>`.
_CONTEXT_CLASSROOM_RE = re.compile(
    r"Turma:\s*(?P<code>\w+).*\((?P<semester>\d{4}\.\d)\s*-\s*T?(?P<number>[\w-]+)\)"
)
_NUMBER_RE = re.compile(r"(\d+)")
_COUNTS_RE = re.compile(r"(\d+)\s*/\s*(\d+)")
_ABSENCES_RE = re.compile(r"(\d+)\s*Falta", re.IGNORECASE)
_NOT_LAUNCHED_RE = re.compile(r"frequência ainda não foi lançada", re.IGNORECASE)

_STATUSES = {
    "presente": AttendanceStatus.PRESENTE,
    "nao registrada": AttendanceStatus.NAO_REGISTRADA,
}


class Classrooms:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._context_lock = asyncio.Lock()

    async def list_classrooms(self) -> list[Classroom]:
        classrooms, dashboard = await asyncio.gather(
            self._get(CLASSROOMS_PATH), self._get(DASHBOARD_PATH)
        )
        history = _parse_history(classrooms)
        active = _parse_dashboard(dashboard)
        merged = [_merge(entry, active.get(key)) for key, entry in history.items()]
        return merged + [entry for key, entry in active.items() if key not in history]

    async def list_current_classrooms(self) -> list[Classroom]:
        """Só as turmas do portal: sem código e CH, mas com `sigaa_id`, numa request."""
        return list(_parse_dashboard(await self._get(DASHBOARD_PATH)).values())

    async def list_classroom_members(self, classroom_id: str) -> list[ClassroomMember]:
        page = await self._read_screen(classroom_id, _open_participants)
        soup = BeautifulSoup(page, "lxml")
        return [
            *_parse_members(soup, "Docentes", ClassroomRole.PROFESSOR),
            *_parse_members(soup, "Discentes", ClassroomRole.ALUNO),
        ]

    async def get_classroom_frequency(self, classroom_id: str) -> ClassroomFrequency:
        page = await self._read_screen(classroom_id, _open_frequency)
        return _parse_frequency(BeautifulSoup(page, "lxml"))

    async def get_classroom_statistics(
        self, classroom_id: str
    ) -> tuple[StatisticsShare, ...]:
        page = await self._read_screen(classroom_id, _open_statistics)
        # O gráfico já foi desenhado e tem URL própria: baixá-lo não depende
        # mais da turma que está aberta na sessão.
        chart = await self._session.get(_chart_source(BeautifulSoup(page, "lxml")))
        return _parse_statistics(chart.content)

    async def list_classroom_news(self, classroom_id: str) -> list[News]:
        page = await self._read_screen(classroom_id, _open_news)
        return _parse_news_list(BeautifulSoup(page, "lxml"))

    async def get_classroom_news(self, classroom_id: str, news_id: int) -> News:
        page = await self._read_screen(
            classroom_id, partial(_open_news_detail, news_id)
        )
        return _parse_news_detail(BeautifulSoup(page, "lxml"), news_id)

    async def _read_screen(self, classroom_id: str, open_screen: OpenScreen) -> str:
        # A troca de turma e a leitura da tela são uma operação única.
        async with self._context_lock:
            renewed = False
            for attempt in range(_SCREEN_ATTEMPTS):
                try:
                    expected = await self._enter_classroom(
                        classroom_id, allow_renewal=not renewed
                    )
                    page = await open_screen(self._session, not renewed)
                    _assert_context(page, expected)
                    return page
                except SessionRenewed:
                    renewed = True
                except _ContextSwitched:
                    if attempt == _SCREEN_ATTEMPTS - 1:
                        raise
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
            raise ClassroomNotFound(f"Turma `{classroom_id}` não está no histórico.")

        form = row[1].find_parent("form") or soup.find("form")
        if not isinstance(form, Tag):
            raise SigaaParseError("Form de acesso à turma não encontrado.")

        action, payload = build_postback(
            form, link_params(row[1]), read_viewstate(soup)
        )
        await self._session.post(action, data=payload, allow_renewal=allow_renewal)
        return _classroom(row[0], row[1], semester=row[2])


async def _open_participants(session: Session, allow_renewal: bool) -> str:
    response = await session.get(
        PARTICIPANTS_PATH,
        retry_on_renewal=False,
        allow_renewal=allow_renewal,
        timeout=PARTICIPANTS_TIMEOUT,
    )
    return response.text


async def _open_frequency(session: Session, allow_renewal: bool) -> str:
    return await _open_menu(session, FREQUENCY_MENU_LABEL, allow_renewal)


async def _open_statistics(session: Session, allow_renewal: bool) -> str:
    return await _open_menu(session, STATISTICS_MENU_LABEL, allow_renewal)


async def _open_news(session: Session, allow_renewal: bool) -> str:
    return await _open_menu(session, NEWS_MENU_LABEL, allow_renewal)


async def _open_news_detail(news_id: int, session: Session, allow_renewal: bool) -> str:
    page = await _open_news(session, allow_renewal)
    soup = BeautifulSoup(page, "lxml")
    anchor = next(
        (
            link
            for link in soup.select("table.listing a")
            if link_params(link).get(NEWS_ID_FIELD) == str(news_id)
        ),
        None,
    )
    form = anchor.find_parent("form") if anchor is not None else None
    # Sem a notícia, devolve a listagem: se a turma foi trocada, `_assert_context`
    # pega; se não, o parse da visualização acusa a notícia ausente.
    if anchor is None or not isinstance(form, Tag):
        return page

    action, payload = build_postback(form, link_params(anchor), read_viewstate(soup))
    response = await session.post(action, data=payload, allow_renewal=allow_renewal)
    return response.text


async def _open_menu(session: Session, label: str, allow_renewal: bool) -> str:
    """Essas telas só abrem pelo item do menu da turma — GET direto dá erro."""
    response = await session.get(
        CLASSROOM_HOME_PATH, retry_on_renewal=False, allow_renewal=allow_renewal
    )
    soup = BeautifulSoup(response.text, "lxml")
    anchor = next(
        (link for link in soup.find_all("a") if clean_text(link) == label), None
    )
    if not isinstance(anchor, Tag):
        raise SigaaParseError(f"Item `{label}` não encontrado no menu da turma.")

    action, payload = build_postback(
        read_form(soup, MENU_FORM_ID), link_params(anchor), read_viewstate(soup)
    )
    response = await session.post(action, data=payload, allow_renewal=allow_renewal)
    return response.text


def _news_fieldset(soup: BeautifulSoup, legend: str) -> Tag | None:
    heading = next(
        (tag for tag in soup.find_all("legend") if clean_text(tag) == legend), None
    )
    fieldset = heading.find_parent("fieldset") if heading is not None else None
    return fieldset if isinstance(fieldset, Tag) else None


def _parse_news_list(soup: BeautifulSoup) -> list[News]:
    fieldset = _news_fieldset(soup, NEWS_MENU_LABEL)
    if fieldset is None:
        raise SigaaParseError("Listagem de notícias não encontrada na turma.")

    table = fieldset.find("table", class_="listing")
    if not isinstance(table, Tag):
        return []

    news = []
    for row in table.select("tbody tr"):
        cells = row.find_all("td")
        anchor = row.find("a")
        news_id = link_params(anchor).get(NEWS_ID_FIELD) if anchor else None
        if len(cells) < 2 or news_id is None:
            raise SigaaParseError("Linha da listagem de notícias fora do formato.")

        news.append(
            News(
                id=int(news_id),
                title=clean_text(cells[0]),
                published_on=parse_datetime(
                    clean_text(cells[1]), "%d/%m/%Y", "da listagem de notícias"
                ).date(),
            )
        )
    return news


def _parse_news_detail(soup: BeautifulSoup, news_id: int) -> News:
    fieldset = _news_fieldset(soup, NEWS_DETAIL_LEGEND)
    if fieldset is None:
        if not any(item.id == news_id for item in _parse_news_list(soup)):
            raise NewsNotFound(f"Notícia `{news_id}` não encontrada na turma.")
        raise SigaaParseError(f"Notícia `{news_id}` não encontrada na turma.")

    fields: dict[str, Tag] = {}
    for item in fieldset.select("ul.form > li"):
        label = item.find("label")
        value = item.find("span")
        if isinstance(label, Tag) and isinstance(value, Tag):
            fields[clean_text(label).rstrip(":").lower()] = value

    title, published = fields.get("título"), fields.get("data")
    if title is None or published is None:
        raise SigaaParseError(f"Notícia `{news_id}` sem título ou data.")

    published_at = parse_datetime(clean_text(published), "%d/%m/%Y %H:%M", "da notícia")
    body = fieldset.select_one("td.conteudoNoticia > div")
    attachment = fields.get("anexo")
    return News(
        id=news_id,
        title=clean_text(title),
        published_on=published_at.date(),
        published_at=published_at,
        content=to_markdown(body) if body is not None else None,
        attachments=tuple(
            NewsAttachment(
                name=clean_text(link), url=urljoin(SIGAA_BASE_URL, str(link["href"]))
            )
            for link in (attachment.find_all("a", href=True) if attachment else [])
        ),
    )


def _chart_source(soup: BeautifulSoup) -> str:
    content = soup.find("div", id="conteudo")
    image = content.find("img") if isinstance(content, Tag) else None
    if not isinstance(image, Tag) or not image.get("src"):
        raise SigaaParseError("Gráfico de estatísticas não encontrado na turma.")
    return str(image["src"])


def _parse_statistics(chart: bytes) -> tuple[StatisticsShare, ...]:
    shares = _legend_percentages(chart)
    if len(shares) != len(SITUATIONS):
        raise SigaaParseError(
            f"A legenda do gráfico trouxe {len(shares)} situações, "
            f"e não as {len(SITUATIONS)} conhecidas."
        )
    return tuple(
        StatisticsShare(situation=situation, percentage=percentage)
        for situation, percentage in zip(SITUATIONS, shares, strict=True)
    )


def _parse_frequency(soup: BeautifulSoup) -> ClassroomFrequency:
    return ClassroomFrequency(
        progress=_parse_progress(soup), frequency=_parse_attendance(soup)
    )


def _parse_progress(soup: BeautifulSoup) -> ClassroomProgress:
    label = soup.find(string=re.compile(PROGRESS_PANEL_LABEL))
    panel = label.find_next("div", class_="rich-stglpanel-body") if label else None
    bar = panel.find("div", class_="progress-bar") if isinstance(panel, Tag) else None
    counts = _COUNTS_RE.search(clean_text(panel)) if isinstance(panel, Tag) else None
    percentage = _NUMBER_RE.search(clean_text(bar)) if isinstance(bar, Tag) else None
    if counts is None or percentage is None:
        raise SigaaParseError(f"`{PROGRESS_PANEL_LABEL}` não encontrado na turma.")

    return ClassroomProgress(
        taught=int(counts.group(1)),
        total=int(counts.group(2)),
        percentage=int(percentage.group(1)),
    )


def _parse_attendance(soup: BeautifulSoup) -> ClassroomAttendance | None:
    """`None` quando o docente ainda não lançou frequência nenhuma."""
    content = soup.find("div", id="conteudo")
    if not isinstance(content, Tag):
        raise SigaaParseError("Mapa de frequências não encontrado na turma.")
    if _NOT_LAUNCHED_RE.search(clean_text(content)):
        return None

    table = content.find("table", class_="listing")
    totals = content.find("div", class_="botoes-show")
    if not (isinstance(table, Tag) and isinstance(totals, Tag)):
        raise SigaaParseError("Mapa de frequências sem tabela ou totais.")

    return ClassroomAttendance(
        entries=_parse_entries(table),
        attended=_total(totals, "Presenças Registradas"),
        registered=_total(totals, "Número de Aulas com Registro"),
        registered_percentage=_total(
            totals, "Porcentagem de Frequência em relação as Aulas"
        ),
        total=_total(totals, "Número de Aulas definidas"),
        total_percentage=_total(totals, "Porcentagem de Frequência em relação a CH"),
    )


def _parse_entries(table: Tag) -> tuple[AttendanceEntry, ...]:
    entries = []
    for row in table.find_all("tr"):
        cells = row.find_all("td")
        if len(cells) == 2:
            entries.append(_entry(clean_text(cells[0]), clean_text(cells[1])))
    return tuple(entries)


def _entry(day: str, situation: str) -> AttendanceEntry:
    occurred_on = parse_datetime(day, "%d/%m/%Y", "do mapa de frequências").date()

    absences = _ABSENCES_RE.search(situation)
    if absences is not None:
        return AttendanceEntry(
            occurred_on=occurred_on,
            status=AttendanceStatus.FALTA,
            absences=int(absences.group(1)),
        )

    status = _STATUSES.get(lookup_key(situation))
    if status is None:
        raise SigaaParseError(
            f"Situação `{situation}` desconhecida no mapa de frequências."
        )
    return AttendanceEntry(occurred_on=occurred_on, status=status)


def _total(totals: Tag, label: str) -> int:
    """O valor vem solto depois do `<b>` do rótulo, sem elemento próprio."""
    key = lookup_key(label)
    for field in totals.find_all("b"):
        if not lookup_key(clean_text(field)).startswith(key):
            continue
        value = _NUMBER_RE.search(str(field.next_sibling or ""))
        if value is not None:
            return int(value.group(1))
    raise SigaaParseError(f"`{label}` não encontrado no mapa de frequências.")


class _ContextSwitched(SigaaParseError):
    """A sessão está em outra turma: alguém a trocou entre a entrada e a leitura."""


def _assert_context(page: str, expected: Classroom) -> None:
    """A turma da sessão pode não ser a que se pediu — o cabeçalho é a prova."""
    match = _CONTEXT_RE.search(page)
    if match is None:
        raise SigaaParseError("Página de participantes não declara a turma atual.")

    context = match.group(1)
    current = _CONTEXT_CLASSROOM_RE.search(context)
    if current is None:
        raise SigaaParseError(f"Cabeçalho da turma fora do formato: `{context}`.")
    if (
        current.group("code"),
        current.group("number"),
        current.group("semester"),
    ) != (expected.subject.code, expected.number, expected.semester):
        raise _ContextSwitched(
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
            current=True,
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
            "current": base.current or extra.current,
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


# --- Leitura do gráfico de estatísticas -------------------------------------
# Gráfico é só imagem; lemos os glifos da legenda por OCR de pixel em vez de
# medir o ângulo das fatias, que erra a casa decimal (96.46% vs 96.3% real).

_WHITE = (255, 255, 255)

# Abaixo disso o pixel é texto; o resto é fundo ou antialiasing.
_INK = 128
# Lado mínimo, em pixels, do quadradinho de cor que abre cada item da legenda.
_BULLET = 4
# Altura da linha de texto do item, contada a partir do centro do quadradinho.
_LINE = 9

_LEGEND_PERCENTAGE_RE = re.compile(r"\((\d+(?:\.\d+)?)%\)$")

# Cada glifo é a máscara de pixels escuros, linha a linha. Para regerar depois
# de uma mudança de fonte no SIGAA: recorte a legenda, binarize em `_INK` e
# separe os glifos pelas colunas vazias.
_GLYPHS = {
    "0": "..##../.#..#./#....#/#....#/#....#/#....#/#....#/.#..#./..##..",
    "1": "###../..#../..#../..#../..#../..#../..#../..#../#####",
    "2": ".###../#....#/.....#/.....#/....#./...#../..#.../.#..../######",
    "3": ".###../#....#/.....#/.....#/..###./.....#/.....#/.....#/.###..",
    "4": "...##./...##./..#.#./....#./.#..#./#...#./######/....#./....#.",
    "5": "#####./#...../#...../####../....#./.....#/.....#/....#./.###..",
    "6": "..###./.#..../....../#.##../#...../#....#/#....#/....../..##..",
    "7": "######/....../....#./....../...#../...#../..#.../..#.../.#....",
    "8": ".####./#....#/#....#/#....#/.####./#....#/#....#/#....#/.####.",
    "9": "..##../....../#....#/#....#/.....#/..##.#/....../....#./.###..",
    ".": "#/#",
    "%": ".##....#../#..#..#.../#..#..#.../#..#.#..../.##....##./"
    "....#.#..#/...#..#..#/...#..#..#/..#....##.",
    "(": ".#/../#./#./#./#./#./../.#",
    ")": "#./../.#/.#/.#/.#/.#/../#.",
}

_CHARS = {glyph: char for char, glyph in _GLYPHS.items()}


def _legend_percentages(png: bytes) -> tuple[float, ...]:
    """As porcentagens da legenda, na ordem em que o gráfico lista os itens."""
    image = Image.open(BytesIO(png)).convert("RGB")
    width, _ = image.size
    pixels = image.load()
    if pixels is None:
        raise SigaaParseError("Gráfico do SIGAA veio sem pixels.")

    top, bottom = _legend_band(image)
    items = _items(pixels, width, top, bottom)
    if not items:
        raise SigaaParseError("Legenda do gráfico não tem itens.")

    return tuple(
        _percentage(pixels, x0, x1, max(y - _LINE, top), min(y + _LINE, bottom))
        for x0, x1, y in items
    )


def _legend_band(image: Image.Image) -> tuple[int, int]:
    """A legenda é a última faixa de linhas com fundo branco da imagem."""
    width, height = image.size
    rows = image.convert("L").point(lambda level: level == 255 and 255).tobytes()

    band: tuple[int, int] | None = None
    growing: tuple[int, int] | None = None
    for y in range(height):
        if rows[y * width : (y + 1) * width].count(255) <= width // 2:
            growing = None
            continue
        growing = (y, y) if growing is None else (growing[0], y)
        band = growing

    if band is None:
        raise SigaaParseError("Gráfico do SIGAA veio sem a faixa da legenda.")
    return band


def _items(pixels, width: int, top: int, bottom: int) -> list[tuple[int, int, int]]:
    """Onde fica o texto de cada item: `(x inicial, x final, y do centro)`.

    Cada item começa por um quadradinho da cor da fatia, e o texto vai daí até
    o próximo quadradinho da mesma linha.
    """
    marks = _bullets(pixels, width, top, bottom)
    items = []
    for index, (start, end, y) in enumerate(marks):
        following = marks[index + 1] if index + 1 < len(marks) else None
        same_line = following is not None and abs(following[2] - y) <= _BULLET
        items.append((end + 2, following[0] - 2 if same_line else width, y))
    return items


def _bullets(pixels, width: int, top: int, bottom: int) -> list[tuple[int, int, int]]:
    blobs: list[list[int]] = []  # [x inicial, x final, y inicial, y final]
    for y in range(top, bottom + 1):
        for start, end, color in _runs(pixels, width, y):
            grown = next(
                (
                    blob
                    for blob in blobs
                    if blob[3] == y - 1 and blob[0] <= end and start <= blob[1]
                ),
                None,
            )
            if grown is None:
                blobs.append([start, end, y, y])
            else:
                grown[3] = y

    marks = [
        (blob[0], blob[1], (blob[2] + blob[3]) // 2)
        for blob in blobs
        if blob[3] - blob[2] + 1 >= _BULLET
    ]
    return sorted(marks, key=lambda mark: (mark[2], mark[0]))


def _runs(pixels, width: int, y: int) -> list[tuple[int, int, tuple[int, int, int]]]:
    """As sequências de pixels da mesma cor sólida na linha — o resto é texto."""
    runs = []
    start = 0
    for x in range(1, width + 1):
        if x < width and pixels[x, y] == pixels[start, y]:
            continue
        color = pixels[start, y]
        if x - start >= _BULLET and color != _WHITE and max(color) >= _INK:
            runs.append((start, x - 1, color))
        start = x
    return runs


def _percentage(pixels, x0: int, x1: int, y0: int, y1: int) -> float:
    """Lê o `(12.3%)` do fim do rótulo, da direita para a esquerda.

    Antes do número vem o nome da situação e depois dele pode vir a borda do
    quadro da legenda: a leitura começa no primeiro glifo conhecido e para no
    primeiro desconhecido.
    """
    label = ""
    for glyph in reversed(_glyphs(pixels, x0, x1, y0, y1)):
        char = _CHARS.get(glyph)
        if char is None and label:
            break
        if char is not None:
            label = char + label

    percentage = _LEGEND_PERCENTAGE_RE.search(label)
    if percentage is None:
        raise SigaaParseError(
            f"Item da legenda termina em `{label}`, não em uma porcentagem."
        )
    return float(percentage.group(1))


def _glyphs(pixels, x0: int, x1: int, y0: int, y1: int) -> list[str]:
    """Os glifos do trecho, separados pelas colunas sem pixel escuro."""
    ink = {
        (x, y) for x in range(x0, x1) for y in range(y0, y1) if max(pixels[x, y]) < _INK
    }
    columns = sorted({x for x, _ in ink})

    glyphs = []
    group: list[int] = []
    for x in [*columns, None]:
        if group and (x is None or x > group[-1] + 1):
            glyphs.append(_glyph(ink, group, y0, y1))
            group = []
        if x is not None:
            group.append(x)
    return glyphs


def _glyph(ink: set[tuple[int, int]], columns: list[int], y0: int, y1: int) -> str:
    rows = [y for y in range(y0, y1) if any((x, y) in ink for x in columns)]
    return "/".join(
        "".join("#" if (x, y) in ink else "." for x in columns)
        for y in range(rows[0], rows[-1] + 1)
    )
