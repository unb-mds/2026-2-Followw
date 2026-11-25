from api.db.models import Classroom, ClassroomProfessor, Professor

from .helpers import CATALOG_URL


def test_tipo_docente_e_horario_precisam_casar_na_mesma_turma(scene):
    scene.subject("ADM0002", offer=False)
    with scene.db.begin() as session:
        professor = Professor(name="HONORATO")
        session.add(professor)
        session.flush()
        for number, schedule, occupied, teach in (
            ("01", "7M12", 20, True),
            ("02", "7M12", 15, False),
            ("03", "2M12", 15, True),
        ):
            classroom = Classroom(
                subject_code="ADM0002",
                number=number,
                semester="2026.2",
                schedule=schedule,
                vacancies=20,
                occupied=occupied,
            )
            session.add(classroom)
            session.flush()
            if teach:
                session.add(
                    ClassroomProfessor(
                        classroom_id=classroom.id, professor_id=professor.id
                    )
                )

    response = scene.client.get(
        CATALOG_URL, params={"q": "Honorato", "days": "5", "kind": "optional"}
    )
    assert response.status_code == 200, response.text
    (subject,) = response.json()["items"]
    assert [room["number"] for room in subject["classrooms"]] == ["01"]
