from sigaa_client import lookup_key
from sqlalchemy import ColumnElement, cast, exists, func, literal_column, or_, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.db.enums import ClassroomRole
from api.db.models import Classroom, ClassroomParticipant, Subject, User
from api.db.search import lookup_sql


def _professors() -> ColumnElement[list[str]]:
    members = (
        select(func.jsonb_agg(User.name))
        .select_from(ClassroomParticipant)
        .join(User, User.id == ClassroomParticipant.user_id)
        .where(
            ClassroomParticipant.classroom_id == Classroom.id,
            ClassroomParticipant.role == ClassroomRole.PROFESSOR,
            ClassroomParticipant.member.is_(True),
        )
        .correlate(Classroom)
        .scalar_subquery()
    )
    # O seed informa docentes só da oferta; turmas históricas usam os participantes.
    empty = cast([], JSONB)
    return func.coalesce(func.nullif(Classroom.professors, empty), members, empty)


def _matches_query(q: str, semester: str | None) -> ColumnElement[bool]:
    needle = lookup_key(q)
    conditions: list[ColumnElement[bool]] = [
        Subject.code.contains(needle.upper(), autoescape=True),
        lookup_sql(Subject.name).contains(needle, autoescape=True),
    ]
    if semester is not None:
        professor = func.jsonb_array_elements_text(Classroom.professors).column_valued(
            "professor"
        )
        conditions.append(
            exists(
                select(1)
                .select_from(Classroom)
                .where(
                    Classroom.subject_code == Subject.code,
                    Classroom.semester == semester,
                    exists(
                        select(1).where(
                            lookup_sql(professor).contains(needle, autoescape=True)
                        )
                    ),
                )
            )
        )
    return or_(*conditions)


class SubjectCatalogRepository:
    """Componentes e turmas gravados pelo seed e pelo sync."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def classroom_professors(
        self, code: str, semester: str, number: str
    ) -> list[str] | None:
        return await self._session.scalar(
            select(_professors())
            .select_from(Classroom)
            .where(
                Classroom.subject_code == code,
                Classroom.semester == semester,
                Classroom.number == number,
            )
        )

    async def historical_statistics(
        self, code: str, before: str
    ) -> list[tuple[str, list[str], list[dict[str, object]]]]:
        rows = (
            await self._session.execute(
                select(Classroom.semester, _professors(), Classroom.statistics)
                .where(
                    Classroom.subject_code == code,
                    Classroom.semester < before,
                    Classroom.statistics.is_not(None),
                    Classroom.statistics != [],
                )
                .order_by(Classroom.semester.desc(), Classroom.number)
            )
        ).all()
        return [
            (semester, professors, statistics)
            for semester, professors, statistics in rows
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
