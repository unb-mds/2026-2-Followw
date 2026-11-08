from io import BytesIO

from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_PHOTO_BYTES = 4 * 1024 * 1024
MAX_PHOTO_PIXELS = 16_000_000


def normalize_photo(content: bytes) -> bytes:
    if len(content) > MAX_PHOTO_BYTES:
        raise HTTPException(413, "A foto enviada deve ter até 4 MiB.")
    try:
        with Image.open(BytesIO(content)) as source:
            if source.format not in {"JPEG", "PNG"}:
                raise ValueError("Formato inválido")
            if source.width * source.height > MAX_PHOTO_PIXELS:
                raise ValueError("Dimensões excessivas")
            image = ImageOps.exif_transpose(source).convert("RGB")
            image = ImageOps.fit(image, (800, 1000))
            output = BytesIO()
            image.save(output, format="JPEG", quality=90)
            return output.getvalue()
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
    ) as error:
        raise HTTPException(
            422, "Envie uma imagem JPEG ou PNG válida, de até 16 milhões de pixels."
        ) from error
