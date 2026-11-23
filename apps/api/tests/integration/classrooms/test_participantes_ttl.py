from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import update

from api.db.models import Classroom as ClassroomModel

LOGIN = {"registration": "251000000", "password": "senha123"}


# 2026.2: a matrícula regular termina em 29/07 e a extraordinária em 14/08.
@pytest.mark.parametrize(
    ("dia", "horas", "revalida"),
    [
        (date(2026, 9, 22), 47, False),
        (date(2026, 9, 22), 49, True),
        (date(2026, 7, 29), 13, False),
        (date(2026, 7, 30), 11, False),
        (date(2026, 7, 30), 13, True),
        (date(2026, 8, 14), 13, True),
        (date(2026, 8, 15), 13, False),
    ],
)
def test_participantes_vencem_em_48h_ou_12h_durante_o_ajuste_da_matricula(
    client, sigaa, turmas, database, hoje, id_da_turma, dia, horas, revalida
):
    client.post("/auth/sigaa", json=LOGIN)
    with database() as session:
        session.execute(
            update(ClassroomModel).values(
                members_synced_at=datetime.now(UTC) - timedelta(hours=horas)
            )
        )
        session.commit()
    hoje(dia)
    lidas = turmas.classrooms.list_classroom_members.await_count

    assert client.get(f"/classrooms/{id_da_turma('AAA')}/members").status_code == 200

    assert turmas.classrooms.list_classroom_members.await_count == lidas + revalida
