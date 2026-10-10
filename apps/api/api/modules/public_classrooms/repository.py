from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import Subject, Unity
from api.modules.public_classrooms.code import classroom_code_prefix


class UnitIndexRepository:
    """Qual unidade oferta cada prefixo de código, pelos componentes e unidades gravados."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def unit_ids(self, prefix: str) -> list[int]:
        rows = await self._session.execute(
            select(Subject.code, Subject.unity_id).where(
                Subject.code.like(f"{prefix}%"), Subject.unity_id.is_not(None)
            )
        )
        # `FCT%` também acha `FCTE0030`: o prefixo de verdade é o que antecede os números.
        return sorted(
            {
                unity_id
                for code, unity_id in rows
                if classroom_code_prefix(code) == prefix
            }
        )

    async def unit_names(self, ids: list[int]) -> dict[int, str]:
        rows = await self._session.execute(
            select(Unity.id, Unity.name).where(Unity.id.in_(ids))
        )
        return {id_: name for id_, name in rows}
