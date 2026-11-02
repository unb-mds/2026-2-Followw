from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from api.db.models import Professor
from api.db.pagination import paginate
from api.db.search import contains_all_terms


class ProfessorRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list(
        self,
        q: str | None,
        unit_id: int | None,
        semester: str | None,
        page: int,
        page_size: int,
    ) -> tuple[list[Professor], int]:
        # Os vistos só nas turmas, sem siape, não têm perfil público.
        conditions = [Professor.siape.is_not(None)]
        if q is not None:
            conditions.append(contains_all_terms(Professor.name, q))
        if unit_id is not None:
            conditions.append(Professor.unit_id == unit_id)
        if semester is not None:
            conditions.append(Professor.disciplines.contains([{"semester": semester}]))
        return await paginate(
            self._session,
            select(Professor)
            .options(
                load_only(
                    Professor.siape,
                    Professor.name,
                    Professor.unit_id,
                    Professor.photo,
                )
            )
            .where(*conditions)
            .order_by(Professor.name, Professor.siape),
            page,
            page_size,
        )

    async def get(self, siape: int) -> Professor | None:
        return await self._session.scalar(
            select(Professor).where(Professor.siape == siape)
        )
