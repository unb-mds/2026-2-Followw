from datetime import datetime
from typing import Annotated

from fastapi import Depends
from sigaa_client import UserProfile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.enums import UserLevel
from api.db.main import get_db
from api.db.models import User


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_registration(self, registration: str) -> User | None:
        return await self._session.scalar(
            select(User).where(User.registration == registration)
        )

    async def save_profile(self, profile: UserProfile, synced_at: datetime) -> User:
        """Grava o perfil, assumindo o usuário sombra de mesma matrícula se houver."""
        user = await self.get_by_registration(profile.registration)
        if user is None:
            user = User(registration=profile.registration)
            self._session.add(user)

        user.name = profile.name
        user.photo = profile.photo or user.photo
        user.email = profile.email or user.email
        user.bio = profile.bio
        user.unity = profile.unity
        user.course = profile.course
        user.integralization = profile.integralization
        user.ira = profile.ira
        user.mp = profile.mp
        user.level = UserLevel(profile.level.value)
        user.profile_synced_at = synced_at
        await self._session.flush()

        return user


def get_user_repository(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> UserRepository:
    return UserRepository(session)


UserRepositoryDep = Annotated[UserRepository, Depends(get_user_repository)]
