import re
from datetime import datetime
from html import escape
from io import BytesIO
from pathlib import Path
from zoneinfo import ZoneInfo

from sigaa_client import EnrollmentCertificate
from sigaa_client.config import DASHBOARD_PATH, SIGAA_BASE_URL

from .certificate_fonts import certificate_fonts

_LOWERCASE_RE = re.compile(r"[a-zà-öø-ÿ]+|[^a-zà-öø-ÿ]+")
_VALIDATION_RE = re.compile(r"https://\S+|\b[a-fA-F0-9]{10}\b")
_FOOTER_SERVER_RE = re.compile(r"\bapp\d+\.sigaa\d+\b")
_ASSETS = Path(__file__).with_name("assets")


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
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfgen.canvas import Canvas
    from reportlab.platypus import (
        BaseDocTemplate,
        Frame,
        Image,
        PageTemplate,
        Paragraph,
        Spacer,
        Table,
        TableStyle,
    )

    fonts = certificate_fonts(font_directory)

    def small_caps(text, style):
        if fonts.small_caps:
            return fonts.label(text, style)
        return Paragraph(_small_caps(text, style.fontSize), style)

    # O CSS original usa largura de 640 px e Verdana 11,2 px (0,75 pt por px).
    width = 480
    body = ParagraphStyle("body", fontName=fonts.family, fontSize=8.4, leading=9.75)
    centered = ParagraphStyle(
        "centered", parent=body, alignment=TA_CENTER, baselineShift=0.15
    )
    tiny = ParagraphStyle("tiny", parent=centered, fontSize=6.72, leading=8.25)
    detail_style = ParagraphStyle("detail", parent=tiny, alignment=TA_LEFT)
    code_style = ParagraphStyle("code", parent=centered, fontSize=7.1325, leading=9)
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

    def table(rows, widths, commands=(), *, repeat=0, padding=0, heights=None):
        result = Table(
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
                    p(
                        "Portal Discente",
                        ParagraphStyle(
                            "portal",
                            parent=centered,
                            fontName=fonts.family + "-Bold",
                            textColor=colors.HexColor("#003395"),
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
                Paragraph("<b>" + escape(fields[first]).replace(" ", "</b> ", 1), body)
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
                    pdfmetrics.stringWidth(label + ":", bold.fontName, tiny.fontSize)
                    + pdfmetrics.stringWidth(value + " ", body.fontName, tiny.fontSize)
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
            for label in ("Tipo:", "Local:"):
                details = details.replace(label, f"<b>{label}</b>")
            result.append(Paragraph(details, detail_style))
        return result

    enrollments = [
        [
            p(
                label,
                ParagraphStyle(
                    "column", parent=centered, fontName=fonts.family + "-Bold"
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
                p(status, centered),
                p(schedule, code_style),
            ]
        )

    grid_widths = [42.75, *[62.25] * 6, 63]
    grid_heading = ParagraphStyle(
        "grid-heading",
        parent=tiny,
        fontName=fonts.family + "-Bold",
        textColor=colors.HexColor("#aaaaaa"),
    )
    schedule = [
        [p(cell, grid_heading if i == 0 else tiny) for cell in row]
        for i, row in enumerate(certificate.schedule)
    ]
    authentication = []
    offset = 0
    for match in _VALIDATION_RE.finditer(certificate.authentication):
        authentication.append(
            escape(certificate.authentication[offset : match.start()])
        )
        authentication.append(f'<font color="#992222"><b>{escape(match[0])}</b></font>')
        offset = match.end()
    authentication.append(escape(certificate.authentication[offset:]))

    story = [
        Spacer(1, 0.375),
        header,
        Spacer(1, 10.565),
        table(
            [[small_caps("Atestado de Matrícula", title)]],
            [width],
            [
                ("LINEBELOW", (0, 0), (-1, -1), 0.75, border),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0.375),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0.75),
            ],
        ),
        Spacer(1, 2.985),
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
        small_caps(f"Turmas Matriculadas: {len(certificate.enrollments)}", heading),
        Spacer(1, 2.42),
        table(
            enrollments,
            [38.25, 210.75, 32.25, 81, 117],
            [
                ("GRID", (0, 0), (-1, -1), 0.75, border),
                ("LEFTPADDING", (0, 0), (-1, -1), 1.5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 1.5),
                ("TOPPADDING", (0, 1), (-1, -1), 1.35),
                ("BOTTOMPADDING", (0, 1), (-1, -1), 2.22),
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
        ),
        Spacer(1, 11.5),
        small_caps("Tabela de Horários:", heading),
        Spacer(1, 2.4),
        table(
            schedule,
            grid_widths,
            [
                ("GRID", (0, 0), (-1, -1), 0.75, border),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 1), (0, -1), 0.75),
                ("BOTTOMPADDING", (0, 1), (0, -1), 1.5),
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
        ),
        Spacer(1, 7),
        table(
            [
                [
                    p(
                        "ATENÇÃO",
                        ParagraphStyle(
                            "attention",
                            parent=centered,
                            fontName=fonts.family + "-Bold",
                            fontSize=9.24,
                            leading=11.25,
                        ),
                    )
                ]
            ],
            [width * 0.97],
            [
                ("LINEBELOW", (0, 0), (-1, -1), 0.75, border),
                ("TOPPADDING", (0, 0), (-1, -1), 0.26),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1.24),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0.75),
            ],
        ),
        Spacer(1, 3.1),
        table(
            [[Paragraph("".join(authentication), centered)]],
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
                        _FOOTER_SERVER_RE.sub("app18.sigaa18", certificate.footer),
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
    stream = BytesIO()
    margin = 58.5
    document = BaseDocTemplate(
        stream,
        pagesize=A4,
        rightMargin=A4[0] - width - margin,
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
        A4[1] - 64.5,
        leftPadding=0,
        rightPadding=0,
        topPadding=0,
        bottomPadding=0,
    )
    zone = ZoneInfo("America/Sao_Paulo")
    print_date = (printed_at or datetime.now(zone)).astimezone(zone)

    class PrintCanvas(Canvas):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.printed_pages = []

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
                self.setFont("Helvetica", 7.995)
                self.drawString(
                    24, A4[1] - 22.5, print_date.strftime("%d/%m/%Y, %H:%M")
                )
                self.drawCentredString(
                    344.88,
                    A4[1] - 22.5,
                    "Sistema Integrado de Gestão de Atividades Acadêmicas",
                )
                self.drawString(24, 16.2, f"{SIGAA_BASE_URL}{DASHBOARD_PATH}#")
                self.drawRightString(A4[0] - 24, 16.2, f"{self._pageNumber}/{total}")
                super().showPage()
            super().save()

    document.addPageTemplates(PageTemplate(id="atestado", frames=[frame]))
    document.build(story, canvasmaker=PrintCanvas)
    return stream.getvalue()
