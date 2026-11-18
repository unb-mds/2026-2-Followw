from io import BytesIO
from unittest.mock import AsyncMock

import pytest
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from sigaa_client import SigaaParseError
from sigaa_client.private.documents import Documents


def _pdf(*pages):
    writer = PdfWriter()
    for lines in pages:
        page = writer.add_blank_page(width=750, height=842)
        page[NameObject("/Resources")] = DictionaryObject(
            {
                NameObject("/Font"): DictionaryObject(
                    {
                        NameObject("/F1"): DictionaryObject(
                            {
                                NameObject("/Type"): NameObject("/Font"),
                                NameObject("/Subtype"): NameObject("/Type1"),
                                NameObject("/BaseFont"): NameObject("/Helvetica"),
                                NameObject("/Encoding"): NameObject("/WinAnsiEncoding"),
                            }
                        )
                    }
                )
            }
        )
        content = DecodedStreamObject()
        content.set_data(
            (
                "BT /F1 10 Tf 35 800 Td 16 TL\n"
                + "\n".join(f"<{line.encode('cp1252').hex()}> Tj T*" for line in lines)
                + "\nET"
            ).encode("ascii")
        )
        page.replace_contents(content)
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


async def test_le_matriz_e_componentes_cumpridos_em_multiplas_paginas(monkeypatch):
    pdf = _pdf(
        [
            "Matrícula: 251000000",
            "Currículo: 100/-2 - 2024.1",
            "Componentes Curriculares Cursados/Cursando",
            "2024.1 * MAT0001 Álgebra 60 01 80,0 MM APR",
            "-- # MAT0002 Geometria 60 -- -- -- CUMP",
            "2024.2 MAT0001 Álgebra 60 01 20,0 SR REPF",
            "2024.2 MAT0003 Cálculo 60 01 80,0 -- MATR",
        ],
        [
            "Componentes Curriculares Cursados/Cursando",
            "MAT0004 Estatística 60 -- -- -- DISP",
            "MAT0005 Lógica 60 -- -- -- CUMP",
            "Legenda",
            "Componentes Curriculares Obrigatórios Pendentes: 1",
            "MAT0006 MATÉRIA PENDENTE 60h",
            "Equivalências:",
            "Cumpriu MAT0005 - LÓGICA (60h) através de",
            "MAT0001 - ÁLGEBRA (60h)",
            "Observações:",
            "Cumpriu MAT0006 - PENDENTE através de MAT0001 em uma simulação.",
        ],
    )
    monkeypatch.setattr(Documents, "get_transcript_pdf", AsyncMock(return_value=pdf))

    result = await Documents(AsyncMock()).get_transcript()

    assert result.registration == "251000000"
    assert result.curriculum_code == "100/-2"
    assert result.completed == {
        "MAT0001": "approved",
        "MAT0002": "credit",
        "MAT0004": "waived",
        "MAT0005": "equivalence",
    }


async def test_rejeita_pdf_sem_estrutura_do_historico(monkeypatch):
    monkeypatch.setattr(
        Documents,
        "get_transcript_pdf",
        AsyncMock(return_value=_pdf(["Outro documento"])),
    )
    with pytest.raises(SigaaParseError, match="histórico acadêmico"):
        await Documents(AsyncMock()).get_transcript()
