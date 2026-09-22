"""Leitura de PDFs devolvidos pelo SIGAA"""

from io import BytesIO

import zxingcpp
from pypdf import PdfReader

from ..exceptions import SigaaParseError


def extract_text(pdf: bytes) -> str:
    try:
        return "\n".join(page.extract_text() for page in PdfReader(BytesIO(pdf)).pages)
    except Exception as error:
        raise SigaaParseError("PDF do SIGAA não pôde ser lido.") from error


def find_qr_code(pdf: bytes) -> str | None:
    try:
        for page in PdfReader(BytesIO(pdf)).pages:
            for image in page.images:
                for barcode in zxingcpp.read_barcodes(image.image.convert("L")):
                    if barcode.format == zxingcpp.BarcodeFormat.QRCode:
                        return barcode.text
        return None
    except Exception as error:
        raise SigaaParseError("PDF do SIGAA não pôde ser lido.") from error
