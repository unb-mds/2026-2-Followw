from api.db.models import Classroom, ClassroomProfessor, Professor, Subject, Unit


def test_docente_e_dia_da_semana_precisam_casar_na_mesma_turma(client, database):
    with database.begin() as session:
        session.add_all(
            Subject(code=code, name="ADMINISTRAÇÃO", unit_id=673)
            for code in ("ADM0001", "ADM0002")
        )
        professor = Professor(name="HONORATO", unit_id=673)
        session.add(professor)
        session.flush()
        for code, number, schedule, teach in (
            ("ADM0001", "01", "2M12", True),
            ("ADM0001", "02", "7M12", False),
            ("ADM0002", "01", "7M12", True),
            ("ADM0002", "02", "7M12", False),
        ):
            classroom = Classroom(
                subject_code=code, number=number, semester="2026.2", schedule=schedule
            )
            session.add(classroom)
            session.flush()
            if teach:
                session.add(
                    ClassroomProfessor(
                        classroom_id=classroom.id, professor_id=professor.id
                    )
                )
    response = client.get(
        "/public/subjects", params={"q": "Honorato", "days": "5", "offered": True}
    )
    assert response.status_code == 200, response.text
    (subject,) = response.json()["items"]
    assert subject["code"] == "ADM0002"
    assert [room["number"] for room in subject["classrooms"]] == ["01"]


def test_busca_por_horario_composto_com_e_sem_filtro_de_unidade(client, database):
    with database.begin() as session:
        session.add(Unit(id=123, code="ADM", name="ADMINISTRAÇÃO"))
        session.flush()
        session.add_all(
            [
                Subject(code="ADM0002", name="ADMINISTRAÇÃO", unit_id=123, hours=60),
                Subject(code="FGA0100", name="ENGENHARIA", unit_id=673, hours=60),
            ]
        )
        session.flush()
        session.add_all(
            Classroom(
                subject_code=code, number=number, semester="2026.2", schedule=time
            )
            for code, number, time in (
                ("ADM0002", "01", "6T6 6N1"),
                ("ADM0002", "02", "6T6"),
                ("FGA0100", "01", "6N1 6T6"),
            )
        )

    params = {"q": "6T6 6N1"}
    search = client.get("/public/search", params=params)
    assert search.status_code == 200, search.text
    assert [s["code"] for s in search.json()["subjects"]["items"]] == [
        "ADM0002",
        "FGA0100",
    ]
    catalog = client.get(
        "/public/subjects", params={**params, "unit": "ADM", "hours": 60, "days": "4"}
    )
    assert catalog.status_code == 200, catalog.text
    (subject,) = catalog.json()["items"]
    assert subject["code"] == "ADM0002"
    assert [room["number"] for room in subject["classrooms"]] == ["01"]


def _schedules_catalog(database, schedules):
    with database.begin() as session:
        session.add_all(
            Subject(code=f"ADM{index:04d}", name="ADMINISTRAÇÃO", unit_id=673)
            for index, _ in enumerate(schedules, 1)
        )
        session.flush()
        session.add_all(
            Classroom(
                subject_code=f"ADM{index:04d}",
                number="01",
                semester="2026.2",
                schedule=schedule,
            )
            for index, schedule in enumerate(schedules, 1)
        )


def _codes(client, **params):
    response = client.get("/public/subjects", params=params)
    assert response.status_code == 200, response.text
    return [item["code"] for item in response.json()["items"]]


def test_dias_combinam_por_ou_e_o_horario_vale_no_dia_escolhido(client, database):
    _schedules_catalog(database, ["2M12", "4T23", "24T23", "6T6"])

    assert _codes(client, days="02") == ["ADM0001", "ADM0002", "ADM0003"]
    assert _codes(client, days="0") == ["ADM0001", "ADM0003"]
    assert _codes(client, days="0", start="14:00") == ["ADM0003"]
    assert _codes(client, days="4") == ["ADM0004"]


def test_horarios_de_inicio_combinam_por_ou(client, database):
    _schedules_catalog(database, ["2M12", "2M2", "2M34", "2N12"])

    assert _codes(client, start=["08:00", "08:55"]) == ["ADM0001", "ADM0002"]
    assert _codes(client, start=["10:00", "19:00"]) == ["ADM0003", "ADM0004"]
