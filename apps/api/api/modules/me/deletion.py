from datetime import UTC, datetime

from pydantic import BaseModel
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.main import Database
from api.db.models import (
    ClassroomParticipant,
    ClassroomPostRead,
    LessonAttendance,
    OAuthClient,
    OAuthGrant,
    UserCompletedSubject,
    UserDataDeletion,
)
from api.modules.me.repository import UserRepository


class AccountData(BaseModel):
    registration: str
    name: str | None
    applications: list[str]
    has_connected_applications: bool


async def account_data(db: Database, registration: str) -> AccountData:
    async def load(session: AsyncSession) -> AccountData:
        user = await UserRepository(session).get_by_registration(registration)
        applications = (
            list(
                await session.scalars(
                    select(OAuthClient.name)
                    .where(OAuthClient.owner_id == user.id)
                    .order_by(OAuthClient.name)
                )
            )
            if user
            else []
        )
        return AccountData(
            registration=registration,
            name=user.name or None if user else None,
            applications=applications,
            has_connected_applications=bool(
                user
                and await session.scalar(
                    select(
                        select(OAuthGrant.id)
                        .where(
                            OAuthGrant.user_id == user.id,
                            OAuthGrant.expires_at > datetime.now(UTC),
                        )
                        .exists()
                    )
                )
            ),
        )

    return await db.read(load)


async def delete_account_data(db: Database, registration: str) -> None:
    async def erase(session: AsyncSession) -> None:
        users = UserRepository(session)
        await users.register(registration)
        user = await users.get_by_registration(registration, for_update=True)
        assert user is not None
        deletion = await session.get(UserDataDeletion, user.id)
        if deletion is None:
            deletion = UserDataDeletion(user_id=user.id)
            session.add(deletion)
        deletion.deleted_at = datetime.now(UTC)

        links = select(ClassroomParticipant.id).where(
            ClassroomParticipant.user_id == user.id
        )
        await session.execute(
            delete(LessonAttendance).where(
                LessonAttendance.classroom_participant_id.in_(links)
            )
        )
        await session.execute(
            update(ClassroomParticipant)
            .where(ClassroomParticipant.user_id == user.id)
            .values(
                grade=None,
                front_end_id=None,
                current=False,
                frequency_synced_at=None,
                frequency_status=None,
            )
        )
        await session.execute(
            delete(ClassroomParticipant).where(
                ClassroomParticipant.user_id == user.id,
                ClassroomParticipant.member.is_(False),
            )
        )
        for model in (ClassroomPostRead, UserCompletedSubject, OAuthGrant):
            await session.execute(delete(model).where(model.user_id == user.id))
        await session.execute(
            delete(OAuthClient).where(OAuthClient.owner_id == user.id)
        )

        user.bio = user.curriculum_id = user.entry_semester = None
        user.integralization = user.workload = user.ira = user.mp = None
        user.level = user.registered_at = None
        user.profile_synced_at = user.classrooms_synced_at = None
        user.grades_synced_at = user.dashboard_synced_at = user.transcript_synced_at = (
            None
        )
        user.settings = {}

    await db.write(erase)
