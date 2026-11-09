from datetime import UTC, datetime
from uuid import uuid4

from api.db.enums import ClassroomRole, ClassroomStatus, UserLevel
from api.db.models import (
    Classroom,
    ClassroomParticipant,
    Course,
    Curriculum,
    CurriculumComponent,
    Subject,
    Unit,
    User,
)

NOW = datetime.now(UTC)


URL = "/public/subjects"


class Scenario:
    def __init__(self, database, client):
        self.db = database
        self.client = client
        with database.begin() as session:
            session.add(Unit(id=99, code="OTHER", name="Outra unidade"))
            course = Course(name="ENGENHARIA DE SOFTWARE", shift="DIURNO", unit_id=673)
            session.add(course)
            session.flush()
            self.course_id = course.id
            user = User(
                name="Aluno",
                registration="251000000",
                level=UserLevel.GRADUACAO,
                course_id=course.id,
                entry_semester="2025.1",
                profile_synced_at=NOW,
                classrooms_synced_at=NOW,
                grades_synced_at=NOW,
            )
            session.add(user)
            session.flush()
            self.user_id = user.id
        self.matrix = self.curriculum()
        with database.begin() as session:
            session.get(User, self.user_id).curriculum_id = self.matrix

    def curriculum(
        self,
        *,
        code="100/1",
        valid_from="2020.1",
        shift="D",
        active=True,
        sigaa_id=None,
    ):
        with self.db.begin() as session:
            row = Curriculum(
                course_id=self.course_id,
                sigaa_id=sigaa_id or int(uuid4()) % 10000000,
                code=code,
                valid_from=valid_from,
                created_year=2000,
                active=active,
                shift=shift,
                matrix="Fluxo",
            )
            session.add(row)
            session.flush()
            return row.id

    def subject(self, code, *, offer=True, kind="optional", period=0, **fields):
        with self.db.begin() as session:
            row = Subject(
                code=code,
                name=fields.pop("name", code),
                hours=fields.pop("hours", 60),
                unit_id=fields.pop("unit_id", 673),
                **fields,
            )
            session.add(row)
            if offer:
                session.add(
                    Classroom(subject_code=code, number="01", semester="2026.2")
                )
        if kind:
            self.component(code, kind=kind, period=period)

    def user(self, **fields):
        with self.db.begin() as session:
            for name, value in fields.items():
                setattr(session.get(User, self.user_id), name, value)

    def component(self, code, *, kind="required", period=1, matrix=None):
        with self.db.begin() as session:
            session.add(
                CurriculumComponent(
                    curriculum_id=matrix or self.matrix,
                    subject_code=code,
                    kind=kind,
                    period=period,
                )
            )

    def history(
        self,
        code,
        *,
        grade=None,
        term="2026.1",
        enrolled=False,
        role=ClassroomRole.ALUNO,
        own=True,
        user_id=None,
        status=None,
    ):
        with self.db.begin() as session:
            if session.get(Subject, code) is None:
                session.add(Subject(code=code, name=code))
            classroom = Classroom(subject_code=code, number=str(uuid4()), semester=term)
            session.add(classroom)
            session.flush()
            row = ClassroomParticipant(
                user_id=user_id or self.user_id,
                classroom_id=classroom.id,
                front_end_id=str(uuid4()) if own else None,
                role=role,
                grade=grade,
                status=status
                or (
                    ClassroomStatus.CURSANDO if enrolled else ClassroomStatus.CONCLUIDO
                ),
                current=enrolled,
            )
            session.add(row)
            session.flush()
            return row.id

    def get(self, **kwargs):
        response = self.client.get(URL, **kwargs)
        assert response.status_code == 200, response.text
        assert response.headers["cache-control"] == "no-store"
        result = response.json()
        for item in result:
            assert set(item["recommendation"]) == {"reasons"}
            assert all(set(r) == {"code", "value"} for r in reasons(item))
        return result


def codes(result):
    return [i["code"] for i in result]


def reasons(item):
    return item["recommendation"]["reasons"]


def scores(items):
    return [(item.code, item.score) for item in items]


def points(items, code):
    item = next(item for item in items if item.code == code)
    return {reason.code: reason.points for reason in item.reasons}
