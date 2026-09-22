from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from api.db.base import Base
from api.db.enums import ClassroomRole, ClassroomStatus, UserLevel
from api.db.main import get_db
from api.db.models import Classroom, ClassroomUser, Subject, User
from api.repositories.classroom import ClassroomRepository, ClassroomRepositoryDep

USER_ID = UUID(int=1)
OTHER_USER_ID = UUID(int=2)


@pytest.fixture
def database():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    try:
        with Session(engine) as session:
            session.add_all(
                [
                    User(
                        id=user_id,
                        registration=str(user_id.int),
                        name="Discente",
                        email=f"discente{user_id.int}@example.org",
                        unity="FCTE",
                        course="SOFTWARE",
                        level=UserLevel.GRADUACAO,
                    )
                    for user_id in (USER_ID, OTHER_USER_ID)
                ]
            )
            subject = Subject(name="ESTRUTURAS DE DADOS 1", hours=60, unity="FCTE")
            classrooms = [
                Classroom(
                    id=UUID(int=10 + index),
                    number=f"0{index + 1}",
                    schedule="35M5",
                    subject=subject,
                )
                for index in range(3)
            ]
            session.add_all(classrooms)
            for user_id, classroom, semester in [
                (USER_ID, classrooms[0], "2025.2"),
                (USER_ID, classrooms[0], "2026.2"),
                (USER_ID, classrooms[1], "2026.2"),
                (OTHER_USER_ID, classrooms[1], "2026.2"),
                (OTHER_USER_ID, classrooms[2], "2026.2"),
            ]:
                session.add(
                    ClassroomUser(
                        user_id=user_id,
                        classroom=classroom,
                        semester=semester,
                        role=ClassroomRole.ALUNO,
                        status=ClassroomStatus.CURSANDO,
                    )
                )
            session.commit()
            session.expunge_all()
            yield session
    finally:
        engine.dispose()


@pytest.mark.parametrize(
    "user_id,semester,expected",
    [
        (USER_ID, None, ["01", "02"]),
        (USER_ID, "2025.2", ["01"]),
        (USER_ID, "2026.2", ["01", "02"]),
        (USER_ID, "2024.1", []),
        (OTHER_USER_ID, None, ["02", "03"]),
        (UUID(int=3), None, []),
    ],
)
async def test_repository_filtra_usuario_e_semestre_sem_duplicar(
    database, user_id, semester, expected
):
    session = AsyncMock(spec=AsyncSession)
    session.scalars.side_effect = database.scalars

    classrooms = await ClassroomRepository(session).list_by_user_id(
        user_id, semester=semester
    )
    database.expunge_all()

    assert [classroom.number for classroom in classrooms] == expected
    assert all(
        classroom.subject.name == "ESTRUTURAS DE DADOS 1" for classroom in classrooms
    )
    session.commit.assert_not_awaited()


def test_repository_aceita_sessao_injetada(probe_app):
    async def probe(repository: ClassroomRepositoryDep):
        return {"count": len(await repository.list_by_user_id(USER_ID))}

    session = AsyncMock(spec=AsyncSession)
    session.scalars.return_value = []

    async def fake_db():
        yield session

    client = probe_app(probe)
    client.app.dependency_overrides[get_db] = fake_db
    try:
        response = client.get("/probe")
        assert response.status_code == 200
        assert response.json() == {"count": 0}
        session.scalars.assert_awaited_once()
    finally:
        client.app.dependency_overrides.clear()
