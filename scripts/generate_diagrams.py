import urllib.error
import urllib.request
import zlib
from pathlib import Path

PLANTUML_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_"


def encode_plantuml(text: str) -> str:
    zlibbed = zlib.compress(text.encode("utf-8"), 9)
    compressed = zlibbed[2:-4]
    result: list[str] = []

    for i in range(0, len(compressed), 3):
        b1 = compressed[i]
        b2 = compressed[i + 1] if i + 1 < len(compressed) else 0
        b3 = compressed[i + 2] if i + 2 < len(compressed) else 0

        c1 = b1 >> 2
        c2 = ((b1 & 0x3) << 4) | (b2 >> 4)
        c3 = ((b2 & 0xF) << 2) | (b3 >> 6)
        c4 = b3 & 0x3F

        result.append(PLANTUML_CHARS[c1 & 0x3F])
        result.append(PLANTUML_CHARS[c2 & 0x3F])
        result.append(PLANTUML_CHARS[c3 & 0x3F])
        result.append(PLANTUML_CHARS[c4 & 0x3F])

    return "".join(result)


def render_diagrams(
    diagrams_dir: Path | None = None, assets_dir: Path | None = None
) -> None:
    root = Path(__file__).resolve().parent.parent
    diagrams_path = diagrams_dir or (root / "docs" / "diagrams")
    assets_path = assets_dir or (root / "docs" / "assets")

    if not diagrams_path.exists():
        print(f"Diretorio nao encontrado: {diagrams_path}")
        return

    assets_path.mkdir(parents=True, exist_ok=True)
    puml_files = sorted(diagrams_path.glob("*.puml"))

    if not puml_files:
        print(f"Nenhum arquivo .puml encontrado em {diagrams_path}")
        return

    print(f"Compilando {len(puml_files)} diagrama(s) PlantUML...")

    for puml_file in puml_files:
        content = puml_file.read_text(encoding="utf-8")
        encoded = encode_plantuml(content)
        url = f"http://www.plantuml.com/plantuml/svg/{encoded}"

        req = urllib.request.Request(
            url, headers={"User-Agent": "Followw-PlantUML-Generator/1.0"}
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                svg_data = resp.read()

            out_file = assets_path / f"{puml_file.stem}.svg"
            out_file.write_bytes(svg_data)
            print(f"[OK] {puml_file.name} -> {out_file.name}")
        except (urllib.error.URLError, TimeoutError, OSError) as err:
            print(f"[ERRO] Falha ao compilar {puml_file.name}: {err}")


if __name__ == "__main__":
    render_diagrams()
