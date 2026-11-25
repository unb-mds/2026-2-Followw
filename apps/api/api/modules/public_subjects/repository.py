from collections.abc import Collection, Mapping, Sequence
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy import (
    ColumnElement,
    Select,
    and_,
    case,
    func,
    literal,
    literal_column,
    or_,
    select,
    true,
)
from sqlalchemy.dialects.postgresql import JSONB
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


@dataclass(frozen=True)
class SubjectCriteria:
    """Os filtros de matérias; as turmas são sempre as de `semester`."""

    semester: str | None
    q: str | None = None
    code: str | None = None
    codes: Collection[str] | None = None
    excluded_codes: Collection[str] = ()
    unit_id: int | None = None
    hours: Sequence[WorkloadFilter] = ()
    schedules: Sequence[ScheduleSearch] = ()
    offered: bool = False
    # Só turmas com vaga; com `done` (cumpridas ou em andamento), também os pré-requisitos.
    available: bool = False
    done: Collection[str] | None = None
    priority: Mapping[str, int] | None = None


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

    async def list_subjects(self, criteria: SubjectCriteria) -> list[Subject]:
        return list(await self._session.scalars(await self._query(criteria)))

    async def page_subjects(
        self, criteria: SubjectCriteria, page: int
    ) -> tuple[list[Subject], int]:
        query = await self._query(criteria)
        return await paginate(self._session, query, page, SUBJECTS_PAGE_SIZE)

    async def _query(self, criteria: SubjectCriteria) -> Select[tuple[Subject]]:
        """Cada componente com as turmas de `criteria.semester` que casam com a busca."""
        offer = [Classroom.semester == criteria.semester]
        if criteria.schedules:
            offer.append(
                Classroom.schedule.in_(
                    await self._matching_schedules(
                        criteria.semester, criteria.schedules
                    )
                )
            )
        if criteria.q is not None:
            offer.append(all_terms(criteria.q, _classroom_term))
        if criteria.available:
            offer.append(_has_seats())
        matches = and_(*offer)

        query = select(Subject).where(*_subject_conditions(criteria))
        if criteria.available and criteria.done is not None:
            covered = await self._covered(criteria.done)
            query = query.where(_prerequisites_within(covered))
        if criteria.offered or criteria.available or criteria.schedules:
            query = query.where(Subject.classrooms.any(matches))
        elif criteria.q is not None:
            query = query.where(
                or_(
                    all_terms(criteria.q, _subject_term),
                    Subject.classrooms.any(matches),
                )
            )
        if criteria.priority:
            query = query.order_by(
                case(
                    criteria.priority,
                    value=Subject.code,
                    else_=UNRANKED_SUBJECT_PRIORITY,
                )
            )
        return query.order_by(Subject.code).options(
            selectinload(Subject.classrooms.and_(matches))
        )

    async def _matching_schedules(
        self, semester: str | None, searches: Sequence[ScheduleSearch]
    ) -> list[str]:
        """Os horários gravados no semestre que atendem a todas as buscas."""
        stored = await self._session.scalars(
            select(Classroom.schedule)
            .where(Classroom.semester == semester, Classroom.schedule.is_not(None))
            .distinct()
        )
        return [
            value
            for value in stored
            if value and all(search.matches(value) for search in searches)
        ]

    async def _covered(self, done: Collection[str]) -> set[str]:
        """As cumpridas e as cobertas por um grupo inteiro de equivalências."""
        if not done:
            return set()
        done_json = literal(sorted(done), JSONB)
        group = func.jsonb_array_elements(_as_array(Subject.equivalences)).table_valued(
            "value"
        )
        equivalent = await self._session.scalars(
            select(Subject.code)
            .select_from(Subject)
            .join(group, true())
            .where(
                func.jsonb_array_length(group.c.value) > 0,
                group.c.value.op("<@")(done_json),
            )
            .distinct()
        )
        return {*done, *equivalent}


def _subject_conditions(criteria: SubjectCriteria) -> list[ColumnElement[bool]]:
    conditions: list[ColumnElement[bool]] = []
    if criteria.code is not None:
        conditions.append(Subject.code == criteria.code)
    if criteria.codes is not None:
        conditions.append(Subject.code.in_(criteria.codes))
    if criteria.excluded_codes:
        conditions.append(Subject.code.not_in(criteria.excluded_codes))
    if criteria.unit_id is not None:
        conditions.append(Subject.unit_id == criteria.unit_id)
    if criteria.hours:
        conditions.append(
            or_(
                *(
                    Subject.hours >= LONG_WORKLOAD
                    if value == "90+"
                    else Subject.hours == value
                    for value in criteria.hours
                )
            )
        )
    return conditions


def _as_array(column: ColumnElement[Any]) -> ColumnElement[Any]:
    """`[]` para `null`/escalar, que `jsonb_array_elements` não aceita."""
    return case(
        (func.jsonb_typeof(column) == "array", column),
        else_=literal([], JSONB),
    )


def _has_seats() -> ColumnElement[bool]:
    """Turma que não está cheia; sem os números do SIGAA, conta como aberta."""
    return or_(
        Classroom.vacancies.is_(None),
        Classroom.occupied.is_(None),
        and_(Classroom.vacancies > 0, Classroom.occupied < Classroom.vacancies),
    )


def _prerequisites_within(covered: set[str]) -> ColumnElement[bool]:
    """Sem pré-requisito ou com algum grupo inteiro em `covered`."""
    group = func.jsonb_array_elements(_as_array(Subject.prerequisites)).table_valued(
        "value"
    )
    return or_(
        Subject.prerequisites.is_(None),
        func.jsonb_array_length(_as_array(Subject.prerequisites)) == 0,
        select(1)
        .select_from(group)
        .where(group.c.value.op("<@")(literal(sorted(covered), JSONB)))
        .exists(),
    )
