import re
from datetime import datetime
from decimal import Decimal
from hashlib import sha256
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup, Tag

from ..config import DASHBOARD_PATH, SIGAA_BASE_URL
from ..exceptions import InternshipNotFound, SessionRenewed, SigaaParseError
from ..models import (
    Internship,
    InternshipAttachment,
    InternshipCourse,
    InternshipGrantor,
    InternshipSummary,
    InternshipTransportAllowance,
)
from ..utils.jsf import (
    build_menu_action,
    build_postback,
    link_params,
    read_form,
    read_viewstate,
)
from ..utils.parsing import clean_text, parse_datetime, to_markdown
from .session import Session

_MENU_FORM = "menu:form_menu_discente"
_MENU_ACTION = (
    "menu_form_menu_discente_discente_menu:A]"
    "#{ ofertaEstagioMBean.listarOfertasDisponiveis }"
)
_TABLE_IDS = ("listagem_meu_curso", "listagem_outros_cursos")
_DETAIL_TITLE = "Visualizar Oferta de Estágio"
_MONEY_RE = re.compile(r"R\$\s*((?:\d{1,3}(?:\.\d{3})+|\d+),\d{2})")
_INTEGER_RE = re.compile(r"\d+")


class Internships:
    def __init__(self, session: Session) -> None:
        self._session = session

    async def list_internships(
        self, *, only_my_course: bool = False
    ) -> list[InternshipSummary]:
        try:
            page = await self._open_board(allow_renewal=True)
        except SessionRenewed:
            page = await self._open_board(allow_renewal=False)
        table_ids = _TABLE_IDS[:1] if only_my_course else _TABLE_IDS
        return [
            summary
            for table_id in table_ids
            for summary, _ in _parse_table(page, table_id)
        ]

    async def get_internship(self, reference: str) -> Internship:
        """Abre uma referência cujo resumo é único na tabela."""
        table_id, _, _ = reference.partition(":")
        if table_id not in _TABLE_IDS:
            raise InternshipNotFound("Referência de estágio inválida; liste novamente.")
        try:
            return await self._read_detail(reference, table_id, allow_renewal=True)
        except SessionRenewed:
            return await self._read_detail(reference, table_id, allow_renewal=False)

    async def _open_board(self, *, allow_renewal: bool) -> BeautifulSoup:
        response = await self._session.get(DASHBOARD_PATH, allow_renewal=allow_renewal)
        page = BeautifulSoup(response.text, "lxml")
        action, payload = build_menu_action(read_form(page, _MENU_FORM), _MENU_ACTION)
        response = await self._session.post(
            action, data=payload, allow_renewal=allow_renewal
        )
        return BeautifulSoup(response.text, "lxml")

    async def _read_detail(
        self, reference: str, table_id: str, *, allow_renewal: bool
    ) -> Internship:
        page = await self._open_board(allow_renewal=allow_renewal)
        items = _parse_table(page, table_id)
        match = next((item for item in items if item[0].reference == reference), None)
        if match is None:
            raise InternshipNotFound(
                "Referência de estágio ausente ou mural alterado; liste novamente."
            )
        summary, anchor = match
        key = _summary_key(summary)
        if sum(_summary_key(item) == key for item, _ in items) > 1:
            raise InternshipNotFound(
                "Referência de estágio ambígua: há ofertas com o mesmo resumo na tabela."
            )
        form = read_form(page, "form")
        action, payload = build_postback(
            form, link_params(anchor), read_viewstate(form)
        )
        response = await self._session.post(
            action, data=payload, allow_renewal=allow_renewal
        )
        detail = _parse_detail(BeautifulSoup(response.text, "lxml"))
        if _summary_key(detail) != key:
            raise SigaaParseError(
                "Detalhe da oferta de estágio diverge do resumo no mural."
            )
        return detail


def _summary_key(
    offer: InternshipSummary | Internship,
) -> tuple[str, int, Decimal | None, datetime]:
    return offer.title, offer.vacancies, offer.stipend, offer.published_until


def _parse_table(
    page: BeautifulSoup, table_id: str
) -> list[tuple[InternshipSummary, Tag]]:
    table = page.find("table", id=table_id)
    if not isinstance(table, Tag):
        raise SigaaParseError(f"Tabela `{table_id}` ausente no mural de estágios.")
    rows = table.select("tbody > tr")
    # shortcut: a posição só é verificável pelo texto até o SIGAA expor um ID.
    fingerprint = sha256(
        "\n".join(clean_text(row) for row in rows).encode()
    ).hexdigest()
    items = []
    for index, row in enumerate(rows):
        cells = row.find_all("td", recursive=False)
        anchor = row.find("a", title=_DETAIL_TITLE)
        if not isinstance(anchor, Tag) or len(cells) < 5 or not link_params(anchor):
            raise SigaaParseError(f"Oferta sem campos ou ação JSF em `{table_id}`.")
        title = clean_text(cells[0])
        if not title:
            raise SigaaParseError(f"Oferta sem título em `{table_id}`.")
        items.append(
            (
                InternshipSummary(
                    reference=f"{table_id}:{index}:{fingerprint}",
                    title=title,
                    vacancies=_integer(clean_text(cells[1])),
                    stipend=_money(clean_text(cells[2])),
                    published_until=parse_datetime(
                        clean_text(cells[3]),
                        "%d/%m/%Y %H:%M",
                        "do fim das inscrições no mural",
                    ),
                ),
                anchor,
            )
        )
    return items


def _integer(value: str) -> int:
    if not _INTEGER_RE.fullmatch(value):
        raise SigaaParseError(
            f"Número de vagas `{value}` inválido na oferta de estágio."
        )
    return int(value)


def _money(value: str) -> Decimal | None:
    if not value:
        return None
    match = _MONEY_RE.fullmatch(value)
    if match is None:
        raise SigaaParseError(
            f"Valor monetário `{value}` inválido na oferta de estágio."
        )
    return Decimal(match[1].replace(".", "").replace(",", "."))


def _transport(value: str) -> InternshipTransportAllowance | None:
    if not value:
        return None
    match = _MONEY_RE.match(value)
    if match is None:
        raise SigaaParseError(
            f"Auxílio transporte `{value}` inválido na oferta de estágio."
        )
    amount = _money(match[0])
    if amount == 0:
        return None
    period = value[match.end() :].strip()
    if not period:
        raise SigaaParseError("Auxílio transporte sem período na oferta de estágio.")
    return InternshipTransportAllowance(amount=amount, period=period)


def _parse_detail(page: BeautifulSoup) -> Internship:
    caption = page.find("caption", string="Dados da Oferta de Estágio")
    table = caption.find_parent("table") if caption else None
    if not isinstance(table, Tag):
        raise SigaaParseError(
            "Tabela de dados da oferta de estágio ausente no detalhe."
        )
    fields: dict[str, list[Tag]] = {}
    for row in table.find_all("tr"):
        if row.find_parent("table") is not table:
            continue
        cells = row.find_all(["th", "td"], recursive=False)
        for index, cell in enumerate(cells[:-1]):
            if cell.name == "th" and cells[index + 1].name == "td":
                fields.setdefault(clean_text(cell), []).append(cells[index + 1])

    def field(label: str, *, required: bool = True) -> Tag:
        values = fields.get(label)
        if not values or (required and not clean_text(values[0])):
            raise SigaaParseError(
                f"Campo `{label}` ausente no detalhe da oferta de estágio."
            )
        return values[0]

    enrollment = clean_text(field("Permitir inscrição via SIGAA:"))
    if enrollment not in ("Sim", "Não"):
        raise SigaaParseError("Inscrição via SIGAA inválida na oferta de estágio.")
    courses_table = table.find("table", class_="listagem")
    if not isinstance(courses_table, Tag):
        raise SigaaParseError("Tabela de cursos ausente na oferta de estágio.")
    courses = tuple(_course(clean_text(cell)) for cell in courses_table.find_all("td"))
    description_heading = table.find("td", string="Descrição detalhada da Oferta")
    description_row = (
        description_heading.find_parent("tr") if description_heading else None
    )
    description_row = (
        description_row.find_next_sibling("tr") if description_row else None
    )
    description = description_row.find("td") if description_row else None
    if not isinstance(description, Tag):
        raise SigaaParseError("Descrição ausente no detalhe da oferta de estágio.")
    return Internship(
        title=clean_text(field("Título:")),
        vacancies=_integer(clean_text(field("Número de Vagas:"))),
        stipend=_money(clean_text(field("Valor da Bolsa:", required=False))),
        transport_allowance=_transport(
            clean_text(field("Aux. Transporte:", required=False))
        ),
        published_from=parse_datetime(
            clean_text(field("Início da Publicação:")),
            "%d/%m/%Y %H:%M",
            "do início da publicação da oferta",
        ),
        published_until=parse_datetime(
            clean_text(field("Fim da Publicação:")),
            "%d/%m/%Y %H:%M",
            "do fim da publicação da oferta",
        ),
        sigaa_enrollment=enrollment == "Sim",
        attachment=_attachment(field("Arquivo:", required=False)),
        grantor=InternshipGrantor(
            agreement_type=clean_text(field("Tipo do Convênio:")),
            cnpj=clean_text(field("CNPJ:")),
            name=clean_text(field("Nome:")),
            responsibles=tuple(
                clean_text(cell) for cell in fields.get("Responsável:", [])
            ),
        ),
        courses=courses,
        description=to_markdown(BeautifulSoup(description.decode_contents(), "lxml")),
    )


def _course(value: str) -> InternshipCourse:
    name, slash, rest = value.rpartition("/")
    unit, separator, degree = rest.partition(" - ")
    if (
        not slash
        or not separator
        or not all(part.strip() for part in (name, unit, degree))
    ):
        raise SigaaParseError(f"Curso `{value}` inválido na oferta de estágio.")
    return InternshipCourse(name=name.strip(), unit=unit.strip(), degree=degree.strip())


def _attachment(cell: Tag) -> InternshipAttachment | None:
    anchor = cell.find("a")
    if not isinstance(anchor, Tag):
        if clean_text(cell):
            raise SigaaParseError("Arquivo de estágio sem link de download.")
        return None
    href = str(anchor.get("href") or "").strip()
    url = urljoin(SIGAA_BASE_URL, href)
    name = clean_text(anchor)
    if (
        not name
        or not href
        or href.startswith("#")
        or urlsplit(url).scheme not in ("https", "http")
    ):
        raise SigaaParseError("Arquivo de estágio sem nome ou URL de download válida.")
    return InternshipAttachment(name=name, url=url)
