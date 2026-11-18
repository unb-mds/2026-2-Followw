import re
from io import BytesIO

from PIL import Image

from ..exceptions import SigaaParseError

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


def legend_percentages(png: bytes) -> tuple[float, ...]:
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
