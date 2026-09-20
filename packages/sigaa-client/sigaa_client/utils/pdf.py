"""Leitura de PDFs devolvidos pelo SIGAA"""

from io import BytesIO

import zxingcpp
from pypdf import PdfReader


def extract_text(pdf: bytes) -> str:
    return "\n".join(page.extract_text() for page in PdfReader(BytesIO(pdf)).pages)


def find_qr_code(pdf: bytes) -> str | None:
    for page in PdfReader(BytesIO(pdf)).pages:
        for image in page.images:
            for barcode in zxingcpp.read_barcodes(image.image.convert("L")):
                if barcode.format == zxingcpp.BarcodeFormat.QRCode:
                    return barcode.text
    return None
