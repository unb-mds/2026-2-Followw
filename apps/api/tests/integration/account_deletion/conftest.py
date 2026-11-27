from datetime import UTC, date, datetime
from types import SimpleNamespace

import pytest
from sigaa_client import Credentials, Grade, PostType

from api.db.enums import ClassroomRole, ClassroomStatus, LessonStatus, UserLevel
from api.db.models import (
    Classroom,
    ClassroomParticipant,
    ClassroomPostRead,
    ClassroomPosts,
    Course,
    Curriculum,
    Lesson,
    LessonAttendance,
    Subject,
    User,
    UserCompletedSubject,
)


@pytest.fixture
def conta(client, cookies, database, stub_sigaa):
    now = datetime.now(UTC)
    with database.begin() as session:
        course = Course(name="Engenharia", unit_id=673)
        session.add(course)
        session.flush()
        matrix = Curriculum(
            course_id=course.id,
            sigaa_id=1,
            code="1",
            valid_from="2026.1",
            created_year=2026,
            active=True,
            matrix="Fluxo",
        )
        session.add(matrix)
        session.flush()
        user = User(
            name="Estudante",
            registration="251000000",
            old_registration="241000000",
            photo="https://foto.test/eu.png",
            email="eu@example.test",
            course_id=course.id,
            bio="Minha bio",
            curriculum_id=matrix.id,
            entry_semester="2026.1",
            integralization=40,
            workload={"mandatory": 30},
            ira=4,
            mp=4.2,
            level=UserLevel.GRADUACAO,
            registered_at=now,
            profile_synced_at=now,
            classrooms_synced_at=now,
            grades_synced_at=now,
            dashboard_synced_at=now,
            transcript_synced_at=now,
            settings={"displayName": "Apelido"},
        )
        peer = User(name="Colega", registration="251000001", ira=3, mp=3.5)
        session.add_all([user, peer, Subject(code="CIC0001", name="Compiladores")])
        session.flush()
        classrooms = [
            Classroom(subject_code="CIC0001", number=number, semester="2026.2")
            for number in ("01", "02")
        ]
        session.add_all(classrooms)
        session.flush()
        shared = ClassroomParticipant(
            user_id=user.id,
            classroom_id=classrooms[0].id,
            role=ClassroomRole.ALUNO,
            status=ClassroomStatus.CURSANDO,
            grade=Grade.MS,
            member=True,
            current=True,
            front_end_id="AAA",
            frequency_synced_at=now,
        )
        own = ClassroomParticipant(
            user_id=user.id,
            classroom_id=classrooms[1].id,
            role=ClassroomRole.ALUNO,
            grade=Grade.SS,
            member=False,
            front_end_id="BBB",
        )
        colleague = ClassroomParticipant(
            user_id=peer.id,
            classroom_id=classrooms[0].id,
            role=ClassroomRole.ALUNO,
            grade=Grade.MM,
            member=True,
            front_end_id="CCC",
        )
        session.add_all([shared, own, colleague])
        session.flush()
        lesson = Lesson(
            classroom_id=classrooms[0].id, occurred_on=date(2026, 9, 20), scheduled=True
        )
        post = ClassroomPosts(
            classroom_id=classrooms[0].id,
            source_id="news:1",
            title="Aviso",
            type=PostType.NEWS,
        )
        session.add_all([lesson, post])
        session.flush()
        session.add_all(
            [
                LessonAttendance(
                    classroom_participant_id=link.id,
                    lesson_id=lesson.id,
                    status=LessonStatus.PRESENTE,
                    marked=True,
                )
                for link in (shared, colleague)
            ]
        )
        session.add_all(
            [
                ClassroomPostRead(user_id=link.id, post_id=post.id)
                for link in (user, peer)
            ]
        )
        session.add_all(
            [
                UserCompletedSubject(user_id=link.id, subject_code="CIC0001")
                for link in (user, peer)
            ]
        )
        ids = SimpleNamespace(
            user=user.id,
            peer=peer.id,
            shared=shared.id,
            own=own.id,
            colleague=colleague.id,
            classrooms=[c.id for c in classrooms],
            lesson=lesson.id,
            post=post.id,
            matrix=matrix.id,
            course=course.id,
        )
    client.cookies.update(
        cookies(refresh=Credentials(registration="251000000", password="senha123"))
    )
    return ids


@pytest.fixture
def applications(client, conta, cookies):
    owner_cookie = dict(client.cookies)
    body = {
        "name": "Agenda",
        "confidential": True,
        "redirect_uris": ["https://agenda.test/callback"],
    }
    own = client.post("/oauth/clients", json=body).json()
    client.cookies.clear()
    client.cookies.update(
        cookies(refresh=Credentials(registration="251000001", password="senha123"))
    )
    other = client.post("/oauth/clients", json={**body, "name": "Calendário"}).json()
    client.cookies.clear()
    client.cookies.update(owner_cookie)
    return own, other
