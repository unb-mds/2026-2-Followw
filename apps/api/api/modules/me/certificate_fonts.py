import json
import os
from dataclasses import dataclass
from functools import lru_cache
from hashlib import sha256
from pathlib import Path

_ASSETS = Path(__file__).with_name("assets")


@dataclass(frozen=True)
class CertificateFonts:
    family: str
    small_caps: str | None
    kerning: dict[str, dict[str, float]]

    def label(self, text, style):
        from reportlab.lib.enums import TA_CENTER
        from reportlab.pdfbase.pdfmetrics import stringWidth
        from reportlab.platypus import Flowable

        weight = "bold" if style.fontName.endswith("-Bold") else "regular"
        name = self.small_caps + ("-Bold" if weight == "bold" else "")
        kerning = self.kerning[weight]

        class Label(Flowable):
            def __init__(self):
                super().__init__()
                self.style = style

            def wrap(self, width, height):
                self.width = width
                self.height = len(text.splitlines()) * style.leading
                return self.width, self.height

            def draw(self):
                self.canv.setFillColor(style.textColor)
                for line_number, line in enumerate(text.splitlines()):
                    width = stringWidth(line, name, style.fontSize) + sum(
                        kerning.get(line[i : i + 2], 0) * style.fontSize / 1000
                        for i in range(len(line) - 1)
                    )
                    x = (
                        (self.width + style.leftIndent - style.rightIndent - width) / 2
                        if style.alignment == TA_CENTER
                        else style.leftIndent
                    )
                    tx = self.canv.beginText(
                        x,
                        self.height
                        - style.fontSize
                        - line_number * style.leading
                        + getattr(style, "baselineShift", 0),
                    )
                    tx.setFont(name, style.fontSize)
                    for i, character in enumerate(line):
                        tx.textOut(character)
                        adjustment = kerning.get(line[i : i + 2], 0)
                        if adjustment:
                            # TJ mantém o kerning também na seleção e extração do texto.
                            tx._code.append(f"[{-adjustment:g}] TJ")
                    self.canv.drawText(tx)

        return Label()


def certificate_fonts(directory: Path | None = None) -> CertificateFonts:
    directory = directory or os.environ.get("SIGAA_PDF_FONT_DIR")
    if directory:
        return _register_fonts(Path(directory))
    windows = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
    if os.name == "nt" and (windows / "verdana.ttf").is_file():
        return _register_fonts(windows)
    return _register_fonts(None)


@lru_cache
def _register_fonts(directory: Path | None) -> CertificateFonts:
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    native = directory is not None
    family = "UnbVerdana" if native else "FollowwSans"
    caps_family = family + "Caps" if native else None
    metadata = {}
    if directory:
        metadata_path = directory / "verdana-smallcaps.json"
        if not metadata_path.is_file():
            metadata_path = _ASSETS / "verdana-smallcaps.json"
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    for weight, suffix in (("regular", ""), ("bold", "-Bold")):
        path = (
            directory / ("verdanab.ttf" if suffix else "verdana.ttf")
            if directory
            else _ASSETS / ("followw-sans-bold.ttf" if suffix else "followw-sans.ttf")
        )
        pdfmetrics.registerFont(TTFont(family + suffix, str(path)))
        if not native:
            continue
        reference = metadata.get(weight, {})
        if sha256(path.read_bytes()).hexdigest() != reference.get("sha256"):
            raise ValueError(
                "Gere verdana-smallcaps.json para esta versão da Verdana com "
                "apps/api/scripts/read_verdana_metrics.py."
            )
        caps = TTFont(caps_family + suffix, str(path))
        caps.face.name += b"-SmallCaps"
        for code, glyph in reference["glyphs"].items():
            caps.face.charToGlyph[int(code)] = glyph["id"]
            caps.face.charWidths[int(code)] = glyph["advance"]
        pdfmetrics.registerFont(caps)
    pdfmetrics.registerFontFamily(family, normal=family, bold=family + "-Bold")
    if caps_family:
        pdfmetrics.registerFontFamily(
            caps_family, normal=caps_family, bold=caps_family + "-Bold"
        )
    return CertificateFonts(
        family=family,
        small_caps=caps_family,
        kerning={weight: values["kerning"] for weight, values in metadata.items()},
    )
