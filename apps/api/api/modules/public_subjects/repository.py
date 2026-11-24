from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import ColumnElement, and_, case, func, literal_column, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload, undefer

from api.db.models import Classroom, Professor, Subject, Unit
from api.db.pagination import paginate
from api.db.search import all_terms, contains_term
from api.modules.public_subjects.filters import WorkloadFilter
from api.modules.public_subjects.schedule_search import ScheduleSearch

LONG_WORKLOAD = 90
SUBJECTS_PAGE_SIZE = 25
UNRANKED_SUBJECT_PRIORITY = 2


def _subject_term(term: str) -> ColumnElement[bool]:
    source = aliased(Subject)
    code = term.upper()
    return or_(
        Subject.code.contains(code, autoescape=True),
        contains_term(Subject.name, term),
        Subject.unit.has(
            or_(contains_term(Unit.code, term), contains_term(Unit.name, term))
        ),
        Subject.equivalent_codes.has_key(code),
        Subject.code.in_(
            select(func.jsonb_array_elements_text(source.equivalent_codes)).where(
                source.code == code
            )
        ),
    )


def _classroom_term(term: str) -> ColumnElement[bool]:
    return or_(
        Classroom.subject.has(_subject_term(term)),
        Classroom.professors.any(contains_term(Professor.name, term)),
    )


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
        references = await self.subject_references(codes)
        return {code: name for code, (name, _) in references.items()}

    async def subject_references(
        self, codes: set[str]
    ) -> dict[str, tuple[str, list[list[str]] | None]]:
        if not codes:
            return {}
        rows = await self._session.execute(
            select(Subject.code, Subject.name, Subject.equivalences).where(
                Subject.code.in_(codes)
            )
        )
        return {code: (name, equivalences) for code, name, equivalences in rows}

    async def latest_semester(self) -> str | None:
        return await self._session.scalar(select(func.max(Classroom.semester)))

    async def unlocked_subjects(
        self, codes: set[str], semester: str | None
    ) -> dict[str, list[tuple[str, str]]]:
        """Dependentes diretos com turma em `semester`; sem semestre, nenhum."""
        if not codes or semester is None:
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
                select(Classroom.id)
                .where(
                    Classroom.subject_code == Subject.code,
                    Classroom.semester == semester,
                )
                .exists(),
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
        semester = semester or await self.latest_semester()
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
        schedules: Sequence[ScheduleSearch] = (),
        hours: Sequence[WorkloadFilter] = (),
        excluded_codes: set[str] | None = None,
        offered: bool = False,
        priority: dict[str, int] | None = None,
        page: int | None = None,
    ) -> tuple[list[Subject], int]:
        """Cada componente com as turmas de `semester` (o mais recente gravado, se omitido)."""
        semester = semester or await self.latest_semester()
        query = select(Subject)
        if code is not None:
            query = query.where(Subject.code == code)
        if codes is not None:
            query = query.where(Subject.code.in_(codes))
        if unit_id is not None:
            query = query.where(Subject.unit_id == unit_id)
        if hours:
            query = query.where(
                or_(
                    *(
                        Subject.hours >= LONG_WORKLOAD
                        if value == "90+"
                        else Subject.hours == value
                        for value in hours
                    )
                )
            )
        if excluded_codes:
            query = query.where(Subject.code.not_in(excluded_codes))
        conditions = [Classroom.semester == semester]
        if schedules:
            stored_schedules = await self._session.scalars(
                select(Classroom.schedule)
                .where(Classroom.semester == semester, Classroom.schedule.is_not(None))
                .distinct()
            )
            matching = [
                value
                for value in stored_schedules
                if value and all(s.matches(value) for s in schedules)
            ]
            if not matching:
                return [], 0
            conditions.append(Classroom.schedule.in_(matching))
        if q is not None:
            conditions.append(all_terms(q, _classroom_term))
        matches = and_(*conditions)
        matching_offer = Subject.classrooms.any(matches)
        if offered or schedules or hours:
            query = query.where(matching_offer)
        elif q is not None:
            query = query.where(or_(all_terms(q, _subject_term), matching_offer))
        if priority:
            query = query.order_by(
                case(priority, value=Subject.code, else_=UNRANKED_SUBJECT_PRIORITY)
            )
        query = query.order_by(Subject.code).options(
            selectinload(Subject.classrooms.and_(matches))
        )
        if page is not None:
            return await paginate(self._session, query, page, SUBJECTS_PAGE_SIZE)
        subjects = list(await self._session.scalars(query))
        return subjects, len(subjects)
