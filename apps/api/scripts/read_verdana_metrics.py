"""uv run --no-sync --with fonttools python apps/api/scripts/read_verdana_metrics.py FONT_DIR OUTPUT"""

import argparse
import json
from hashlib import sha256
from pathlib import Path

from fontTools.ttLib import TTFont


def _kerning(font, glyphs):
    gpos = font["GPOS"].table
    features = {
        index
        for script in gpos.ScriptList.ScriptRecord
        if script.ScriptTag == "latn"
        for index in script.Script.DefaultLangSys.FeatureIndex
    }
    indices = {
        index
        for feature_index in features
        for feature in [gpos.FeatureList.FeatureRecord[feature_index]]
        if feature.FeatureTag == "kern"
        for index in feature.Feature.LookupListIndex
    }
    result = {}
    for index in indices:
        for subtable in gpos.LookupList.Lookup[index].SubTable:
            subtable = getattr(subtable, "ExtSubTable", subtable)
            coverage = {glyph: i for i, glyph in enumerate(subtable.Coverage.glyphs)}
            for first, first_glyph in glyphs.items():
                if first_glyph not in coverage:
                    continue
                for second, second_glyph in glyphs.items():
                    value = None
                    if subtable.Format == 1:
                        pairs = subtable.PairSet[coverage[first_glyph]].PairValueRecord
                        value = next(
                            (p.Value1 for p in pairs if p.SecondGlyph == second_glyph),
                            None,
                        )
                    elif subtable.Format == 2:
                        first_class = subtable.ClassDef1.classDefs.get(first_glyph, 0)
                        second_class = subtable.ClassDef2.classDefs.get(second_glyph, 0)
                        value = (
                            subtable.Class1Record[first_class]
                            .Class2Record[second_class]
                            .Value1
                        )
                    advance = getattr(value, "XAdvance", 0)
                    if advance:
                        pair = chr(first) + chr(second)
                        result[pair] = (
                            result.get(pair, 0)
                            + advance * 1000 / font["head"].unitsPerEm
                        )
    return result


def main():
    parser = argparse.ArgumentParser(description="Lê métricas, sem copiar fontes.")
    parser.add_argument("font_directory", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    result = {}
    for weight, filename in (("regular", "verdana.ttf"), ("bold", "verdanab.ttf")):
        path = args.font_directory / filename
        font = TTFont(path)
        substitutions = {}
        gsub = font["GSUB"].table
        for feature in gsub.FeatureList.FeatureRecord:
            if feature.FeatureTag == "smcp":
                for index in feature.Feature.LookupListIndex:
                    for subtable in gsub.LookupList.Lookup[index].SubTable:
                        substitutions.update(getattr(subtable, "mapping", {}))
        glyphs = {}
        caps_cmap = {}
        for code, source in font.getBestCmap().items():
            if code > 255:
                continue
            caps_cmap[code] = substitutions.get(source, source)
            if source not in substitutions:
                continue
            glyph = caps_cmap[code]
            glyphs[code] = {
                "id": font.getGlyphID(glyph),
                "advance": font["hmtx"].metrics[glyph][0]
                * 1000
                / font["head"].unitsPerEm,
            }
        if not glyphs:
            raise ValueError(f"{filename} não contém versaletes nativas.")
        result[weight] = {
            "sha256": sha256(path.read_bytes()).hexdigest(),
            "glyphs": glyphs,
            "kerning": _kerning(font, caps_cmap),
            "text_kerning": _kerning(
                font,
                {
                    code: glyph
                    for code, glyph in font.getBestCmap().items()
                    if code <= 255
                },
            ),
        }
    arial_path = args.font_directory / "arial.ttf"
    if arial_path.is_file():
        arial = TTFont(arial_path)
        result["regular"]["print_sha256"] = sha256(arial_path.read_bytes()).hexdigest()
        result["regular"]["print_kerning"] = _kerning(
            arial,
            {code: glyph for code, glyph in arial.getBestCmap().items() if code <= 255},
        )
    args.output.write_text(
        json.dumps(result, separators=(",", ":")) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
