from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import ColumnElement, and_, exists, func, literal_column, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload, undefer

from api.db.models import Classroom, ClassroomProfessor, Professor, Subject
from api.db.search import all_terms, contains_term
from api.modules.public_subjects.schedule_search import ScheduleSearch


def _matches_query(q: str, semester: str | None) -> ColumnElement[bool]:
    source = aliased(Subject)

    def match(term: str) -> ColumnElement[bool]:
        conditions: list[ColumnElement[bool]] = [
            Subject.code.contains(term.upper(), autoescape=True),
            contains_term(Subject.name, term),
            # Equivalência direta nos dois sentidos: quem cita o termo e quem ele cita.
            Subject.equivalent_codes.has_key(term.upper()),
            Subject.code.in_(
                select(func.jsonb_array_elements_text(source.equivalent_codes)).where(
                    source.code == term.upper()
                )
            ),
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

    async def workloads(self) -> list[int]:
        hours = await self._session.scalars(
            select(Subject.hours)
            .where(Subject.hours > 0)
            .distinct()
            .order_by(Subject.hours)
        )
        return [value for value in hours if value is not None]

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

    async def latest_classroom_counts(self, codes: set[str]) -> dict[str, int]:
        if not codes:
            return {}
        latest = select(func.max(Classroom.semester)).scalar_subquery()
        rows = await self._session.execute(
            select(Classroom.subject_code, func.count())
            .where(Classroom.subject_code.in_(codes), Classroom.semester == latest)
            .group_by(Classroom.subject_code)
        )
        return {code: count for code, count in rows}

    async def list_subjects(
        self,
        *,
        q: str | None = None,
        code: str | None = None,
        codes: set[str] | None = None,
        unit_id: int | None = None,
        semester: str | None = None,
        schedules: Sequence[ScheduleSearch] = (),
        hours: int | None = None,
        exclude_required: set[str] | None = None,
    ) -> list[Subject]:
        """Cada componente com as turmas de `semester` (o mais recente gravado, se omitido)."""
        semester = semester or await self.latest_semester()
        query = select(Subject).order_by(Subject.code)
        if code is not None:
            query = query.where(Subject.code == code)
        if codes is not None:
            query = query.where(Subject.code.in_(codes))
        if unit_id is not None:
            query = query.where(Subject.unit_id == unit_id)
        if q is not None:
            query = query.where(_matches_query(q, semester))
        classrooms = Subject.classrooms
        if semester is not None:
            classrooms = classrooms.and_(Classroom.semester == semester)
        if hours is not None:
            query = query.where(Subject.hours == hours)
        offer_conditions = [Classroom.semester == semester]
        if exclude_required is not None:
            query = query.where(Subject.code.not_in(exclude_required))
            offer_conditions.append(
                and_(
                    or_(Classroom.vacancies.is_(None), Classroom.vacancies > 0),
                    or_(
                        Classroom.occupied.is_(None),
                        Classroom.vacancies.is_(None),
                        Classroom.occupied < Classroom.vacancies,
                    ),
                )
            )
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
                return []
            offer_conditions.append(Classroom.schedule.in_(matching))
        if schedules or exclude_required is not None or hours is not None:
            match = and_(*offer_conditions)
            query = query.where(Subject.classrooms.any(match))
            classrooms = classrooms.and_(match)
        return list(
            await self._session.scalars(query.options(selectinload(classrooms)))
        )
