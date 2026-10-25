from sigaa_client import lookup_key
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from api.db.models import Professor
from api.db.search import lookup_sql


class ProfessorRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list(
        self,
        q: str | None,
        unity_id: int | None,
        semester: str | None,
        page: int,
        page_size: int,
    ) -> tuple[list[Professor], int]:
        conditions = []
        if q is not None:
            conditions.append(
                lookup_sql(Professor.name).contains(lookup_key(q), autoescape=True)
            )
        if unity_id is not None:
            conditions.append(Professor.unity_id == unity_id)
        if semester is not None:
            conditions.append(Professor.disciplines.contains([{"semester": semester}]))
        total = await self._session.scalar(
            select(func.count()).select_from(Professor).where(*conditions)
        )
        if (page - 1) * page_size >= (total or 0):
            return [], total or 0
        professors = list(
            await self._session.scalars(
                select(Professor)
                .options(
                    load_only(
                        Professor.siape,
                        Professor.name,
                        Professor.unity_id,
                        Professor.photo,
                    )
                )
                .where(*conditions)
                .order_by(Professor.name, Professor.siape)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return professors, total or 0

    async def get(self, siape: int) -> Professor | None:
        return await self._session.scalar(
            select(Professor).where(Professor.siape == siape)
        )
