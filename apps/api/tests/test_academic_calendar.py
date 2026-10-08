from datetime import UTC, date, datetime

import pytest

from api.academic_calendar import (
    departure_status,
    member_status,
    members_closed,
    members_frozen,
)
from api.db.enums import ClassroomGrade, ClassroomStatus


@pytest.mark.parametrize(
    ("dia", "encerrada"), [(date(2026, 12, 21), False), (date(2026, 12, 22), True)]
)
def test_participantes_encerram_tres_dias_depois_do_fim_do_semestre(
    hoje, dia, encerrada
):
    hoje(dia)

    assert members_closed("2026.2") is encerrada


@pytest.mark.parametrize(
    ("synced_at", "congelada"),
    [
        (datetime(2026, 12, 18, tzinfo=UTC), False),
        # 21/12 às 23h em Brasília: ainda na tolerância.
        (datetime(2026, 12, 22, 2, tzinfo=UTC), False),
        (datetime(2026, 12, 22, 3, tzinfo=UTC), True),
        # O SQLite devolve sem fuso, em UTC.
        (datetime(2026, 12, 22, 3, tzinfo=UTC).replace(tzinfo=None), True),
    ],
)
def test_participantes_congelam_no_primeiro_sync_depois_da_tolerancia(
    hoje, synced_at, congelada
):
    hoje(date(2026, 12, 30))

    assert members_frozen("2026.2", synced_at) is congelada


def test_semestre_fora_do_calendario_usa_a_ordem_dos_semestres():
    assert members_frozen("2025.2", datetime(2025, 1, 1, tzinfo=UTC))
    assert member_status("2025.2") == ClassroomStatus.CONCLUIDO
    assert departure_status("2025.2") == ClassroomStatus.TRANCADO
    assert not members_closed("2030.1")
    assert member_status("2030.1") == ClassroomStatus.CURSANDO
    assert departure_status("2030.1") == ClassroomStatus.REMOVIDO


def test_mencao_diz_se_o_aluno_foi_aprovado():
    aprovadas = {grade for grade in ClassroomGrade if grade.approved}

    assert aprovadas == {ClassroomGrade.SS, ClassroomGrade.MS, ClassroomGrade.MM}
