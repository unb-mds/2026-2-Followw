import re
from datetime import datetime
from html import escape
from io import BytesIO
from math import floor
from pathlib import Path
from zoneinfo import ZoneInfo

from sigaa_client import EnrollmentCertificate
from sigaa_client.config import DASHBOARD_PATH, SIGAA_BASE_URL

from .certificate_fonts import certificate_fonts, css_advance

_LOWERCASE_RE = re.compile(r"[a-zà-öø-ÿ]+|[^a-zà-öø-ÿ]+")
_VALIDATION_RE = re.compile(r"https://\S+|\b[a-fA-F0-9]{10}\b")
_ASSETS = Path(__file__).with_name("assets")
# Dimensões A4 gravadas pelo Chromium no PDF de impressão do SIGAA.
_PRINT_A4 = (594.96, 841.92)


def _small_caps(text: str, size: float) -> str:
    return "".join(
        f'<font size="{size * 0.86}">{escape(part.upper())}</font>'
        if part.islower()
        else escape(part)
        for part in _LOWERCASE_RE.findall(text)
    )


def render_enrollment_certificate(
    certificate: EnrollmentCertificate,
    *,
    printed_at: datetime | None = None,
    font_directory: Path | None = None,
) -> bytes:
    """Reproduz o layout de impressão do SIGAA sem executar um navegador."""
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfgen.canvas import Canvas
    from reportlab.pdfgen.textobject import PDFTextObject
    from reportlab.platypus import (
        BaseDocTemplate,
        Frame,
        Image,
        KeepTogether,
        PageTemplate,
        Paragraph,
        Spacer,
        Table,
        TableStyle,
    )

    fonts = certificate_fonts(font_directory)

    class GridTable(Table):
        def _drawVLines(self, start, end, weight, color, count, space):
            positions = self._colpositions
            # Chromium pinta as bordas na grade de pixels CSS (0,75 pt).
            self._colpositions = [
                int((x + weight) / weight) * weight - weight for x in positions
            ]
            try:
                super()._drawVLines(start, end, weight, color, count, space)
            finally:
                self._colpositions = positions

        def _drawHLines(self, start, end, weight, color, count, space):
            positions = self._rowpositions
            # Bordas CSS ficam dentro da célula, em vez de centradas na divisão.
            self._rowpositions = [
                y + (-weight / 2 if i == 0 else weight / 2)
                for i, y in enumerate(positions)
            ]
            try:
                super()._drawHLines(start, end, weight, color, count, space)
            finally:
                self._rowpositions = positions

    def small_caps(text, style):
        if fonts.small_caps:
            return fonts.label(text, style)
        return Paragraph(_small_caps(text, style.fontSize), style)

    # O CSS original usa largura de 640 px e Verdana 11,2 px (0,75 pt por px).
    width = 480
    step = 0.75 / 64
    body = ParagraphStyle("body", fontName=fonts.family, fontSize=8.4, leading=9.75)
    centered = ParagraphStyle(
        "centered", parent=body, alignment=TA_CENTER, baselineShift=0.15
    )
    tiny = ParagraphStyle("tiny", parent=centered, fontSize=6.72, leading=8.25)
    detail_style = ParagraphStyle("detail", parent=tiny, alignment=TA_LEFT)
    code_style = ParagraphStyle(
        "code", parent=centered, fontSize=7.1325, leading=9, rightIndent=0.75
    )
    status_style = ParagraphStyle("status", parent=centered, rightIndent=0.75)
    bold = ParagraphStyle("bold", parent=body, fontName=fonts.family + "-Bold")
    title = ParagraphStyle(
        "title",
        parent=bold,
        fontSize=10.08,
        leading=12.3,
        alignment=TA_CENTER,
        baselineShift=0.02,
    )
    heading = ParagraphStyle(
        "heading",
        parent=bold,
        fontSize=9.24,
        leading=11.6,
        keepWithNext=True,
        leftIndent=-0.375,
        baselineShift=-0.28,
    )
    border = colors.HexColor("#bbbbbb")

    def p(text, style=body):
        return Paragraph(escape(text).replace("\n", "<br/>"), style)

    def table(
        rows, widths, commands=(), *, repeat=0, padding=0, heights=None, grid=False
    ):
        result = (GridTable if grid else Table)(
            rows,
            colWidths=widths,
            rowHeights=heights,
            repeatRows=repeat,
            hAlign="CENTER",
        )
        result.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("FONTSIZE", (0, 0), (-1, -1), body.fontSize),
                    ("LEADING", (0, 0), (-1, -1), body.leading),
                    ("LEFTPADDING", (0, 0), (-1, -1), padding),
                    ("RIGHTPADDING", (0, 0), (-1, -1), padding),
                    ("TOPPADDING", (0, 0), (-1, -1), padding),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), padding),
                    *commands,
                ]
            )
        )
        return result

    university = Image(str(_ASSETS / "unb.gif"), width=69.75, height=30)
    department = Image(str(_ASSETS / "sti.gif"), width=84.75, height=37.5)
    header_text = small_caps(
        "Universidade de Brasília\nSistema Integrado de Gestão de Atividades\nAcadêmicas",
        ParagraphStyle("header", parent=centered, fontName=fonts.family + "-Bold"),
    )
    header = table(
        [
            [
                [
                    university,
                    Spacer(1, -0.15),
                    p(
                        "Portal Discente",
                        ParagraphStyle(
                            "portal",
                            parent=centered,
                            fontName=fonts.family + "-Bold",
                            textColor=colors.HexColor("#003395"),
                            rightIndent=0.22,
                        ),
                    ),
                ],
                [
                    header_text,
                    Spacer(1, 9.75),
                    small_caps(f"Emitido em {certificate.issued_at}", centered),
                ],
                department,
            ]
        ],
        [112.5, 253.5, 113.25],
        [
            ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#6a6a6a")),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5.625),
            ("LEFTPADDING", (2, 0), (2, 0), 4.125),
        ],
        padding=4.875,
    )

    fields = dict(certificate.identification)
    identification = []
    spans = []
    for first, second in (("Período Letivo", "Nível"), ("Matrícula", "Vínculo")):
        identification.append(
            [
                p(first + ":"),
                Paragraph("<b>" + escape(fields[first]).replace(" ", " </b>", 1), body)
                if first == "Período Letivo" and " " in fields[first]
                else p(fields[first], bold),
                p(second + ":"),
                p(fields[second], bold),
            ]
        )
    for label, value in certificate.identification:
        if label in {"Período Letivo", "Nível", "Matrícula", "Vínculo"}:
            continue
        row = len(identification)
        identification.append([p(label + ":"), p(value, bold), "", ""])
        spans.append(("SPAN", (1, row), (3, row)))

    def description(text):
        name, _, rest = text.partition("\n")
        result = [p(name, bold)]
        if rest:
            result.append(Spacer(1, 0.18))
        for line in rest.splitlines():
            if "   Local:" in line and line.startswith("Tipo:"):
                prefix, location = line.split("   ", 1)
                label, value = prefix.split(":", 1)
                indent = (
                    css_advance(
                        pdfmetrics.stringWidth(
                            label + ":", bold.fontName, tiny.fontSize
                        )
                    )
                    + css_advance(
                        pdfmetrics.stringWidth(
                            value + " ", body.fontName, tiny.fontSize
                        )
                    )
                    + 11.25
                )
                prefix_markup = f"<b>{escape(label)}:</b>{escape(value)}"
                location_markup = "<b>Local:</b>" + escape(
                    location.removeprefix("Local:")
                )
                if (
                    indent
                    + pdfmetrics.stringWidth("Local:", bold.fontName, tiny.fontSize)
                    < 207.75
                ):
                    metadata_style = ParagraphStyle(
                        "metadata",
                        parent=detail_style,
                        firstLineIndent=indent,
                        bulletFontName=body.fontName,
                        bulletFontSize=tiny.fontSize,
                    )
                    result.append(
                        Paragraph(
                            f"<bullet>{prefix_markup}</bullet>{location_markup}",
                            metadata_style,
                        )
                    )
                else:
                    result.append(
                        Paragraph(
                            prefix_markup + "<br/>" + location_markup, detail_style
                        )
                    )
                continue
            details = escape(line).replace("   ", "&nbsp;" * 5)
            for label in ("Tipo:", "Local:", "Forma de Participação:"):
                details = details.replace(label, f"<b>{label}</b>")
            result.append(Paragraph(details, detail_style))
        return result

    def intrinsic_widths(text, font, size, padding):
        lines = text.splitlines() or [""]

        def measure(value):
            return pdfmetrics.stringWidth(value, font, size)

        return (
            max(map(measure, text.split()), default=0) + padding,
            max(map(measure, lines)) + padding,
        )

    def detail_widths(line):
        labels = ("Tipo:", "Local:")
        if not line.startswith(labels):
            return intrinsic_widths(line, body.fontName, tiny.fontSize, 3.75)
        minimum, maximum = 0, 0
        parts = line.split("   ")
        for i, part in enumerate(parts):
            label, separator, value = part.partition(":")
            label += separator
            words = [
                pdfmetrics.stringWidth(word, font, tiny.fontSize)
                for text, font in ((label, bold.fontName), (value, body.fontName))
                for word in text.split()
            ]
            # Cada span reserva 15 px; o espaço anterior ao Local pertence ao Tipo.
            words[-1] += 11.25
            minimum = max(minimum, *words)
            maximum += (
                css_advance(pdfmetrics.stringWidth(label, bold.fontName, tiny.fontSize))
                + css_advance(
                    pdfmetrics.stringWidth(
                        value + (" " if i < len(parts) - 1 else ""),
                        body.fontName,
                        tiny.fontSize,
                    )
                )
                + 11.25
            )
        return minimum + 3.75, maximum + 3.75

    minimum, maximum = [], []
    for column, label in enumerate(certificate.enrollment_headers):
        cells = [intrinsic_widths(label, bold.fontName, body.fontSize, 2.25)]
        for row in certificate.enrollments:
            if column == 1:
                cells.extend(
                    intrinsic_widths(line, bold.fontName, body.fontSize, 3.75)
                    if i == 0
                    else detail_widths(line)
                    for i, line in enumerate(row[1].splitlines())
                )
            else:
                cells.append(
                    intrinsic_widths(
                        row[column],
                        body.fontName,
                        body.fontSize if column == 3 else code_style.fontSize,
                        5.25,
                    )
                )
        minimum.append(css_advance(max(cell[0] for cell in cells)))
        maximum.append(css_advance(max(cell[1] for cell in cells)))
    available = width - 0.75
    if sum(minimum) < available < sum(maximum):
        fraction = (available - sum(minimum)) / (sum(maximum) - sum(minimum))
        column_widths = [lo + (hi - lo) * fraction for lo, hi in zip(minimum, maximum)]
    else:
        weights = minimum if sum(minimum) >= available else maximum
        column_widths = [value * available / sum(weights) for value in weights]
    column_widths = [int(value / step) * step for value in column_widths]
    column_widths[-1] = available - sum(column_widths[:-1])

    enrollments = [
        [
            p(
                label,
                ParagraphStyle(
                    "column",
                    parent=centered,
                    fontName=fonts.family + "-Bold",
                    rightIndent=0.75,
                    splitLongWords=False,
                ),
            )
            for label in certificate.enrollment_headers
        ]
    ]
    for code, text, number, status, schedule in certificate.enrollments:
        enrollments.append(
            [
                p(code, code_style),
                description(text),
                p(number, code_style),
                p(status, status_style),
                p(schedule, code_style),
            ]
        )

    grid_widths = [43.171875, *[62.296875] * 7]
    grid_style = ParagraphStyle("grid", parent=tiny, rightIndent=0.75)
    grid_heading = ParagraphStyle(
        "grid-heading",
        parent=grid_style,
        fontName=fonts.family + "-Bold",
        textColor=colors.HexColor("#aaaaaa"),
    )
    schedule = [
        [p(cell, grid_heading if i == 0 else grid_style) for cell in row]
        for i, row in enumerate(certificate.schedule)
    ]

    class AuthenticationParagraph(Paragraph):
        def draw(self):
            if fonts.small_caps is None or self.blPara.kind != 1:
                return super().draw()
            origin = self.canv._currentMatrix[4]
            spaces = [(line, line.extraSpace) for line in self.blPara.lines]
            try:
                for line, _ in spaces:
                    line_width = sum(
                        css_advance(
                            pdfmetrics.stringWidth(
                                frag.text, frag.fontName, frag.fontSize
                            )
                        )
                        for frag in line.words
                    )
                    available = floor(round(line.maxWidth / step, 9)) * step
                    # Chromium alinha a origem absoluta de cada linha na grade CSS.
                    x = origin + (available - line_width) / 2
                    x = floor(round(x / step, 9)) * step
                    line.extraSpace = 2 * (x - origin)
                return super().draw()
            finally:
                for line, space in spaces:
                    line.extraSpace = space

    authentication = []
    offset = 0
    for match in _VALIDATION_RE.finditer(certificate.authentication):
        authentication.append(
            escape(certificate.authentication[offset : match.start()])
        )
        authentication.append(f'<font color="#992222"><b>{escape(match[0])}</b></font>')
        offset = match.end()
    authentication.append(escape(certificate.authentication[offset:]))

    counts = f"Turmas Matriculadas: {len(certificate.enrollments) - certificate.activity_count}"
    if certificate.activity_count:
        counts += f"\nAtividades Matriculadas: {certificate.activity_count}"
    story = [
        Spacer(1, 0.375),
        header,
        Spacer(1, 10.565),
        table(
            [[small_caps("Atestado de Matrícula", title)]],
            [width],
            [
                ("LINEBELOW", (0, 0), (-1, -1), 0.75, border, 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0.385),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0.75),
            ],
        ),
        Spacer(1, 2.975),
        table(
            identification,
            [96, 214.125, 48.75, 121.125],
            [
                *spans,
                ("LEFTPADDING", (0, 0), (-1, -1), 1.125),
                ("TOPPADDING", (0, 0), (-1, -1), 1),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0.5),
            ],
            padding=0.75,
        ),
        Spacer(1, 12.63),
        small_caps(counts, ParagraphStyle("counts", parent=heading, leading=11.25)),
        Spacer(1, 2.77),
        table(
            enrollments,
            column_widths,
            [
                ("GRID", (0, 0), (-1, -1), 0.75, border),
                ("LEFTPADDING", (0, 0), (-1, -1), 1.5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 1.5),
                ("TOPPADDING", (0, 1), (-1, -1), 1.35),
                ("BOTTOMPADDING", (0, 1), (-1, -1), 2.22),
                ("TOPPADDING", (3, 1), (3, -1), 2.1),
                ("BOTTOMPADDING", (3, 1), (3, -1), 1.47),
                *[
                    command
                    for column in (0, 2, 4)
                    for command in (
                        ("TOPPADDING", (column, 1), (column, -1), 2.6175),
                        ("BOTTOMPADDING", (column, 1), (column, -1), 0.9525),
                    )
                ],
                ("TOPPADDING", (0, 0), (-1, 0), 1.35),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 1.65),
                ("LEFTPADDING", (0, 0), (-1, 0), 0.75),
                ("RIGHTPADDING", (0, 0), (-1, 0), 0.75),
            ],
            repeat=1,
            padding=1.875,
            grid=True,
        ),
        Spacer(1, 11.48),
        small_caps("Tabela de Horários:", heading),
        Spacer(1, 2.42),
        table(
            schedule,
            grid_widths,
            [
                ("GRID", (0, 0), (-1, -1), 0.75, border),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 1), (-1, -1), 1.155),
                ("BOTTOMPADDING", (0, 1), (-1, -1), 1.095),
                ("TOPPADDING", (0, 1), (0, -1), 0.78),
                ("BOTTOMPADDING", (0, 1), (0, -1), 1.47),
                ("TOPPADDING", (0, 0), (-1, 0), 1.53),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 1.47),
                *[
                    ("SPAN", (0, i), (-1, i))
                    for i, row in enumerate(certificate.schedule)
                    if not any(row)
                ],
            ],
            repeat=1,
            padding=1.125,
            heights=[7.5 if not any(row) else None for row in certificate.schedule],
            grid=True,
        ),
        KeepTogether(
            [
                Spacer(1, 7),
                table(
                    [
                        [
                            "",
                            p(
                                "ATENÇÃO",
                                ParagraphStyle(
                                    "attention",
                                    parent=centered,
                                    fontName=fonts.family + "-Bold",
                                    fontSize=9.24,
                                    leading=11.25,
                                ),
                            ),
                            "",
                        ]
                    ],
                    # A borda de 97% ocupa 621 px, entre recuos de 9 e 10 px.
                    [6.75, 465.75, 7.5],
                    [
                        ("LINEBELOW", (1, 0), (1, 0), 0.75, border, 0),
                        ("TOPPADDING", (0, 0), (-1, -1), 0.26),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.115),
                    ],
                ),
                Spacer(1, 2.225),
                table(
                    [[AuthenticationParagraph("".join(authentication), centered)]],
                    [width * 0.97],
                    [
                        ("TOPPADDING", (0, 0), (-1, -1), 0.25),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), -0.25),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 0.75),
                    ],
                ),
                Spacer(1, 12.775),
                table(
                    [
                        [
                            p(
                                certificate.footer,
                                ParagraphStyle(
                                    "footer", parent=centered, fontSize=7.8, leading=9
                                ),
                            )
                        ]
                    ],
                    [width - 0.75],
                    [
                        ("BOX", (0, 0), (-1, -1), 0.75, colors.black),
                        ("TOPPADDING", (0, 0), (-1, -1), 6.075),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 6.675),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 7.125),
                    ],
                    padding=6.375,
                ),
            ]
        ),
    ]
    stream = BytesIO()
    margin = 58.5
    document = BaseDocTemplate(
        stream,
        pagesize=_PRINT_A4,
        rightMargin=_PRINT_A4[0] - width - margin,
        leftMargin=margin,
        topMargin=28.5,
        bottomMargin=36,
        title="Atestado de Matrícula",
        author="Universidade de Brasília",
        creator="Followw UnB",
        pageCompression=1,
    )
    frame = Frame(
        margin,
        36,
        width,
        _PRINT_A4[1] - 64.5,
        leftPadding=0,
        rightPadding=0,
        topPadding=0,
        bottomPadding=0,
    )
    zone = ZoneInfo("America/Sao_Paulo")
    print_date = (printed_at or datetime.now(zone)).astimezone(zone)

    class PrintTextObject(PDFTextObject):
        def _formatText(self, text):
            font = pdfmetrics.getFont(self._fontname)
            kerning = getattr(font, "kerning", None)
            if kerning is None or fonts.small_caps is None:
                return super()._formatText(text)
            parts = []
            start = 0
            for i in range(len(text) - 1):
                adjustment = kerning.get(text[i : i + 2], 0)
                if adjustment:
                    parts.extend(
                        (
                            super()._formatText(text[start : i + 1]),
                            f"[{-adjustment:g}] TJ",
                        )
                    )
                    start = i + 1
            parts.append(super()._formatText(text[start:]))
            # Cada trecho inline reserva o avanço inteiro na grade CSS do Chromium.
            width = font.stringWidth(text, self._fontsize)
            adjustment = round((css_advance(width) - width) * 1000 / self._fontsize, 6)
            if adjustment:
                parts.append(f"[{-adjustment:.6f}] TJ")
            return " ".join(parts)

    class PrintCanvas(Canvas):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.printed_pages = []

        def beginText(self, x=0, y=0, direction=None):
            return PrintTextObject(self, x, y, direction=direction)

        def showPage(self):
            self.printed_pages.append(
                {
                    key: value
                    for key, value in self.__dict__.items()
                    if key != "printed_pages"
                }
            )
            self._startPage()

        def save(self):
            total = len(self.printed_pages)
            for state in self.printed_pages:
                self.__dict__.update(state)
                self.setFillColor(colors.black)
                self.setFont(fonts.print_family, 7.995)
                # A faixa usa o A4 a 300 DPI antes do recorte da caixa do PDF.
                print_width = int(595.2 / step) * step
                date_text = print_date.strftime("%d/%m/%Y, %H:%M")
                title_text = "Sistema Integrado de Gestão de Atividades Acadêmicas"

                def print_advance(text):
                    return css_advance(
                        pdfmetrics.stringWidth(text, fonts.print_family, 7.995)
                    )

                self.drawString(24, _PRINT_A4[1] - 22.5, date_text)
                self.drawString(
                    (
                        print_width
                        + print_advance(date_text)
                        + 30
                        - print_advance(title_text)
                    )
                    / 2,
                    _PRINT_A4[1] - 22.5,
                    title_text,
                )
                self.drawString(24, 16.17, f"{SIGAA_BASE_URL}{DASHBOARD_PATH}")
                page_parts = (str(self._pageNumber), "/", str(total))
                x = print_width - 24 - sum(map(print_advance, page_parts))
                page_number = self.beginText(x, 16.17)
                page_number.setFont(fonts.print_family, 7.995)
                for part in page_parts:
                    page_number.textOut(part)
                self.drawText(page_number)
                super().showPage()
            super().save()

    document.addPageTemplates(PageTemplate(id="atestado", frames=[frame]))
    document.build(story, canvasmaker=PrintCanvas)
    return stream.getvalue()
