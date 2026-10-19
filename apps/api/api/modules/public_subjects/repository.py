from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.db.models import Classroom, Subject, Unity


class SubjectCatalogRepository:
    """Componentes e turmas gravados pelo seed e pelo sync."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_unities(self) -> list[Unity]:
        return list(await self._session.scalars(select(Unity).order_by(Unity.id)))

    async def subject_names(self, codes: set[str]) -> dict[str, str]:
        if not codes:
            return {}
        return dict(
            (
                await self._session.execute(
                    select(Subject.code, Subject.name).where(Subject.code.in_(codes))
                )
            ).all()
        )

    async def unlocked_subjects(
        self, codes: set[str]
    ) -> dict[str, list[tuple[str, str]]]:
        if not codes:
            return {}
        result: dict[str, list[tuple[str, str]]] = {}
        rows = await self._session.execute(
            select(Subject.code, Subject.name, Subject.prerequisites)
            .where(Subject.prerequisites.is_not(None))
            .order_by(Subject.name, Subject.code)
        )
        for code, name, requirements in rows:
            required = {
                item.strip().upper() for group in requirements or [] for item in group
            }
            for prerequisite in codes & required:
                if prerequisite != code:
                    result.setdefault(prerequisite, []).append((code, name))
        return result

    async def offered_subject_codes(
        self, codes: set[str], semester: str | None
    ) -> set[str]:
        if not codes:
            return set()
        semester = semester or await self._session.scalar(
            select(func.max(Classroom.semester))
        )
        return set(
            await self._session.scalars(
                select(Classroom.subject_code)
                .where(
                    Classroom.subject_code.in_(codes), Classroom.semester == semester
                )
                .distinct()
            )
        )

    async def list_subjects(
        self,
        *,
        code: str | None = None,
        codes: set[str] | None = None,
        unity_id: int | None = None,
        semester: str | None = None,
    ) -> list[Subject]:
        """Cada componente com as turmas de `semester` (o mais recente gravado, se omitido)."""
        semester = semester or await self._session.scalar(
            select(func.max(Classroom.semester))
        )
        query = select(Subject).order_by(Subject.code)
        if code is not None:
            query = query.where(Subject.code == code)
        if codes is not None:
            query = query.where(Subject.code.in_(codes))
        if unity_id is not None:
            query = query.where(Subject.unity_id == unity_id)
        # Sem semestre não há turma gravada, então o filtro não tira nada.
        offered = selectinload(Subject.classrooms)
        if semester is not None:
            offered = selectinload(
                Subject.classrooms.and_(Classroom.semester == semester)
            )
        return list(await self._session.scalars(query.options(offered)))
