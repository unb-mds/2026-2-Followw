import csv
import importlib
from pathlib import Path

import pytest

from sigaa_client import SubjectDetails

SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"


@pytest.fixture
def catalog(monkeypatch):
    monkeypatch.syspath_prepend(str(SCRIPTS))
    return importlib.import_module("_catalog")


def test_le_referencias_de_turmas_matrizes_e_docentes(catalog, tmp_path):
    path = tmp_path / "references.csv"
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(
            file,
            ["subject_code", "subject_codes", "disciplines", "equivalences", "name"],
        )
        writer.writeheader()
        writer.writerow(
            {
                "subject_code": "MAT0025",
                "subject_codes": "OPT0001 EXT0001",
                "disciplines": '{"2026.2": {"mat0024": 2}, "2026.1": {"MAT0025": 1}}',
                "equivalences": "( MAT0025 E MAT0137 )",
                "name": "IGNORADO0001",
            }
        )
    # Requisitos só existem no CSV de componentes, que é o alvo da coleta.
    assert catalog.read_reference_codes([path]) == {
        "MAT0024",
        "MAT0025",
        "OPT0001",
        "EXT0001",
    }


def test_matrizes_de_cada_codigo_saem_sem_repetir_e_na_ordem_do_csv(catalog, tmp_path):
    path = tmp_path / "components.csv"
    path.write_text(
        "course_sigaa_id,curriculum_sigaa_id,kind,subject_codes\n"
        "414321,184,optional,MAT0024 MAT0025\n"
        "1,2,required,mat0024\n"
        "414321,184,required,MAT0024\n"
        "3,4,required,\n",
        encoding="utf-8",
    )
    assert catalog.read_curriculum_sources(path) == {
        "MAT0024": [(414321, 184), (1, 2)],
        "MAT0025": [(414321, 184)],
    }


def test_codigos_citados_nos_tres_requisitos(catalog):
    rows = [
        {
            "code": "FGA0001",
            "prerequisites": "( ( FGA0002 E MAT0025 ) OU ( FGA0001 ) )",
        },
        {"code": "FGA0002", "corequisites": "", "equivalences": None},
    ]
    assert catalog.referenced_codes(rows) == {"FGA0001", "FGA0002", "MAT0025"}


def test_linha_resolve_a_unidade_pelo_nome_sem_acento_nem_caixa(catalog, tmp_path):
    path = tmp_path / "units.csv"
    path.write_text(
        "id,code,name\n508,CIC,DEPTO CIÊNCIAS DA COMPUTAÇÃO - BRASÍLIA\n",
        encoding="utf-8",
    )
    unit_ids = catalog.read_unit_ids(path)
    subject = SubjectDetails(
        code="CIC0004",
        sigaa_id=1,
        name="APC",
        hours=90,
        unit="Depto Ciencias da Computacao - Brasilia",
        equivalences="( CIC0088 )",
    )
    assert catalog.subject_row(subject, unit_ids) == {
        "code": "CIC0004",
        "name": "APC",
        "hours": 90,
        "unit_id": 508,
        "prerequisites": None,
        "corequisites": None,
        "equivalences": "( CIC0088 )",
    }
    for unit in ("OUTRA", None):
        row = catalog.subject_row(subject.model_copy(update={"unit": unit}), unit_ids)
        assert row["unit_id"] is None


def test_csv_de_componentes_ausente_comeca_vazio_e_sem_colunas_e_barulhento(
    catalog, tmp_path
):
    path = tmp_path / "subjects.csv"
    assert catalog.read_rows(path) == []
    path.write_text("code,name\nFGA0001,BASE\n", encoding="utf-8")
    with pytest.raises(ValueError, match="sem as colunas"):
        catalog.read_rows(path)
    path.write_text(
        ",".join(catalog.COLUMNS) + "\nFGA0001,BASE,60,673,,,\n", encoding="utf-8"
    )
    assert catalog.read_rows(path)[0]["unit_id"] == "673"
