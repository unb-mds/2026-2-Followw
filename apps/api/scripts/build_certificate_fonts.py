"""uv run --no-sync --with fonttools python apps/api/scripts/build_certificate_fonts.py"""

import json
from pathlib import Path

import reportlab
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont


def _add_i_bars(font):
    glyph = font["glyf"]["I"]
    advance, _ = font["hmtx"].metrics["I"]
    stem = glyph.xMax - glyph.xMin
    outer = round(advance * 0.115)
    left, right = round((advance - stem) / 2), round((advance + stem) / 2)
    bottom, top = glyph.yMin, glyph.yMax
    bar = round(stem * 0.7)
    points = [
        (outer, top),
        (advance - outer, top),
        (advance - outer, top - bar),
        (right, top - bar),
        (right, bottom + bar),
        (advance - outer, bottom + bar),
        (advance - outer, bottom),
        (outer, bottom),
        (outer, bottom + bar),
        (left, bottom + bar),
        (left, top - bar),
        (outer, top - bar),
    ]
    pen = TTGlyphPen(None)
    pen.moveTo(points[0])
    for point in points[1:]:
        pen.lineTo(point)
    pen.closePath()
    font["glyf"]["I"] = pen.glyph()
    font["hmtx"].metrics["I"] = (advance, outer)


def main():
    assets = Path(__file__).parents[1] / "api/modules/me/assets"
    source = Path(reportlab.__file__).parent / "fonts"
    advances = json.loads((assets / "verdana-advances.json").read_text())
    for weight, filename, style, target in (
        ("regular", "Vera.ttf", "Regular", "followw-sans.ttf"),
        ("bold", "VeraBd.ttf", "Bold", "followw-sans-bold.ttf"),
    ):
        font = TTFont(source / filename, recalcTimestamp=False)
        units = font["head"].unitsPerEm
        for code, glyph in font.getBestCmap().items():
            if (advance := advances[weight].get(str(code))) is not None:
                _, bearing = font["hmtx"].metrics[glyph]
                font["hmtx"].metrics[glyph] = (round(advance * units / 1000), bearing)
        _add_i_bars(font)
        names = {
            1: "Followw Sans",
            2: style,
            3: f"Followw Sans {style} 1.1",
            4: f"Followw Sans {style}",
            6: f"FollowwSans-{style}",
            16: "Followw Sans",
            17: style,
        }
        for record in font["name"].names:
            if record.nameID in names:
                record.string = names[record.nameID].encode(record.getEncoding())
        font.save(assets / target)
    (assets / "FONT-LICENSE.txt").write_bytes(
        (source / "bitstream-vera-license.txt").read_bytes()
    )


if __name__ == "__main__":
    main()
