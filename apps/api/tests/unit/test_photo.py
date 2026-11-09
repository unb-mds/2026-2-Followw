from io import BytesIO

import pytest
from fastapi import HTTPException
from PIL import Image

from api.modules.me.photo import MAX_PHOTO_BYTES, normalize_photo


def test_normaliza_foto_e_remove_metadados():
    output = BytesIO()
    source = Image.new("RGB", (100, 100))
    exif = Image.Exif()
    exif[270] = "dados privados"
    source.save(output, format="JPEG", exif=exif)
    with Image.open(BytesIO(normalize_photo(output.getvalue()))) as image:
        assert image.size == (800, 1000)
        assert not image.getexif()


@pytest.mark.parametrize(
    "content", [b"<svg></svg>", b"foto falsa", b"\x89PNG\r\n\x1a\n"]
)
def test_recusa_arquivo_invalido(content):
    with pytest.raises(HTTPException) as error:
        normalize_photo(content)
    assert error.value.status_code == 422


def test_limite_da_foto_e_inclusivo():
    output = BytesIO()
    Image.new("RGB", (20, 20)).save(output, format="PNG")
    photo = output.getvalue().ljust(MAX_PHOTO_BYTES, b"\0")
    assert normalize_photo(photo).startswith(b"\xff\xd8")
    with pytest.raises(HTTPException) as error:
        normalize_photo(photo + b"\0")
    assert error.value.status_code == 413
