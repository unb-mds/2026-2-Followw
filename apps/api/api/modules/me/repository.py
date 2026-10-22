from datetime import UTC, datetime

from sigaa_client import UserProfile
from sqlalchemy import delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.courses import course_ids
from api.db.enums import UserLevel
from api.db.models import ClassroomParticipant, Course, User
from api.modules.public_courses.repository import PublicCourseRepository
from api.modules.recommendations.ranking import CurriculumInfo, select_curriculum


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_registration(self, registration: str) -> User | None:
        return await self._session.scalar(
            select(User).where(
                or_(
                    User.registration == registration,
                    User.old_registration == registration,
                )
            )
        )

    async def register(self, registration: str) -> None:
        user = await self.get_by_registration(registration)
        now = datetime.now(UTC)
        if user is None:
            self._session.add(
                User(registration=registration, name="", registered_at=now)
            )
        else:
            await self._session.execute(
                update(User)
                .where(User.id == user.id, User.registered_at.is_(None))
                .values(registered_at=now)
            )
        await self._session.flush()

    async def save_profile(
        self, profile: UserProfile, synced_at: datetime, login: str | None = None
    ) -> User:
        """Grava o perfil na conta do `login`, assumindo o usuário sombra da matrícula."""
        login = login or profile.registration
        account = await self.get_by_registration(login)
        user = await self._session.scalar(
            select(User).where(User.registration == profile.registration)
        )
        if account is not None and account is not user:
            if user is not None:
                await self._absorb(account, user)
            user = account
        if user is None:
            user = User()
            self._session.add(user)

        user.registration = profile.registration
        if login != profile.registration:
            user.old_registration = login
        user.name = profile.name
        user.photo = profile.photo or user.photo
        user.email = profile.email or user.email
        user.bio = profile.bio
        pair = (profile.course, profile.unity)
        shift = profile.shift.value if profile.shift else None
        course_id = (await course_ids(self._session, [pair], shift)).get(pair)
        if course_id != user.course_id:
            user.curriculum_id = None
        user.course_id = course_id
        user.entry_semester = profile.entry_semester
        user.integralization = profile.integralization
        user.workload = profile.workload.model_dump() if profile.workload else None
        user.ira = profile.ira
        user.mp = profile.mp
        user.level = UserLevel(profile.level.value)
        user.profile_synced_at = synced_at
        await self._infer_curriculum(user)
        await self._session.flush()

        return user

    async def get_settings(self, registration: str) -> dict[str, object]:
        user = await self.get_by_registration(registration)
        if user is None or not user.settings:
            return {}
        return dict(user.settings)

    async def update_settings(
        self, registration: str, patch: dict[str, object]
    ) -> dict[str, object]:
        user = await self.get_by_registration(registration)
        if user is None:
            user = User(registration=registration, name="", settings={})
            self._session.add(user)
        current = dict(user.settings or {})
        current.update(patch)
        user.settings = current
        await self._session.flush()
        return user.settings

    async def _absorb(self, account: User, shadow: User) -> None:
        """Passa para a conta as turmas e ids do usuário sombra, que é apagado."""
        listed = select(ClassroomParticipant.classroom_id).where(
            ClassroomParticipant.user_id == shadow.id,
            ClassroomParticipant.member.is_(True),
        )
        await self._session.execute(
            update(ClassroomParticipant)
            .where(
                ClassroomParticipant.user_id == account.id,
                ClassroomParticipant.classroom_id.in_(listed),
            )
            .values(member=True)
            .execution_options(synchronize_session=False)
        )
        taken = select(ClassroomParticipant.classroom_id).where(
            ClassroomParticipant.user_id == account.id
        )
        await self._session.execute(
            update(ClassroomParticipant)
            .where(
                ClassroomParticipant.user_id == shadow.id,
                ClassroomParticipant.classroom_id.not_in(taken),
            )
            .values(user_id=account.id)
            .execution_options(synchronize_session=False)
        )
        person_id, email, photo = shadow.person_id, shadow.email, shadow.photo
        await self._session.execute(delete(User).where(User.id == shadow.id))
        await self._session.flush()
        account.person_id = account.person_id or person_id
        account.email = account.email or email
        account.photo = account.photo or photo

    async def _infer_curriculum(self, user: User) -> None:
        """Define a matriz pelo semestre de entrada, só enquanto ela ainda não existe."""
        if (
            user.curriculum_id is not None
            or user.course_id is None
            or user.entry_semester is None
        ):
            return
        course = await self._session.get(Course, user.course_id)
        assert course is not None
        options = [
            CurriculumInfo.model_validate(c)
            for c in await PublicCourseRepository(self._session).list_curricula(
                user.course_id
            )
        ]
        selected = select_curriculum(options, user.entry_semester, course.shift)
        user.curriculum_id = selected.id if selected else None
