from uuid import UUID

from sqlalchemy import ColumnElement, exists, func, literal_column, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, undefer

from api.db.models import Classroom, ClassroomProfessor, Professor, Subject
from api.db.search import all_terms, contains_term


def _matches_query(q: str, semester: str | None) -> ColumnElement[bool]:
    def match(term: str) -> ColumnElement[bool]:
        conditions: list[ColumnElement[bool]] = [
            Subject.code.contains(term.upper(), autoescape=True),
            contains_term(Subject.name, term),
        ]
        if semester is not None:
            conditions.append(
                exists(
                    select(1)
                    .select_from(Classroom)
                    .join(ClassroomProfessor)
                    .join(Professor)
                    .where(
                        Classroom.subject_code == Subject.code,
                        Classroom.semester == semester,
                        contains_term(Professor.name, term),
                    )
                )
            )
        return or_(*conditions)

    return all_terms(q, match)


class SubjectCatalogRepository:
    """Componentes e turmas gravados pelo seed e pelo sync."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def classroom_professors(
        self, code: str, semester: str, number: str
    ) -> list[UUID] | None:
        classroom = await self._session.scalar(
            select(Classroom).where(
                Classroom.subject_code == code,
                Classroom.semester == semester,
                Classroom.number == number,
            )
        )
        if classroom is None:
            return None
        return [professor.id for professor in classroom.professors]

    async def historical_statistics(
        self, code: str, before: str
    ) -> list[tuple[str, list[UUID], list[dict[str, object]]]]:
        classrooms = await self._session.scalars(
            select(Classroom)
            .options(undefer(Classroom.statistics))
            .where(
                Classroom.subject_code == code,
                Classroom.semester < before,
                Classroom.statistics.is_not(None),
                Classroom.statistics != [],
            )
            .order_by(Classroom.semester.desc(), Classroom.number)
        )
        return [
            (
                classroom.semester,
                [professor.id for professor in classroom.professors],
                classroom.statistics or [],
            )
            for classroom in classrooms
        ]

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
        prerequisite = func.jsonb_array_elements_text(
            func.jsonb_path_query_array(
                Subject.prerequisites, literal_column("'$[*][*]'")
            )
        ).column_valued("prerequisite")
        rows = await self._session.execute(
            select(prerequisite, Subject.code, Subject.name)
            .where(
                Subject.prerequisites.is_not(None),
                prerequisite.in_(codes),
                prerequisite != Subject.code,
            )
            .distinct()
            .order_by(Subject.name, Subject.code)
        )
        result: dict[str, list[tuple[str, str]]] = {}
        for req, code, name in rows:
            result.setdefault(req, []).append((code, name))
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
        q: str | None = None,
        code: str | None = None,
        codes: set[str] | None = None,
        unit_id: int | None = None,
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
        if unit_id is not None:
            query = query.where(Subject.unit_id == unit_id)
        if q is not None:
            query = query.where(_matches_query(q, semester))
        # Sem semestre não há turma gravada, então o filtro não tira nada.
        offered = selectinload(Subject.classrooms)
        if semester is not None:
            offered = selectinload(
                Subject.classrooms.and_(Classroom.semester == semester)
            )
        return list(await self._session.scalars(query.options(offered)))
