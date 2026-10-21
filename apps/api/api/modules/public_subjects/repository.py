from sigaa_client import lookup_key
from sqlalchemy import ColumnElement, cast, exists, func, literal_column, or_, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from api.db.models import Classroom, Subject, Unity


def _lookup_sql(value: ColumnElement[str]) -> ColumnElement[str]:
    without_accents = func.regexp_replace(
        func.normalize(func.lower(value), literal_column("NFKD")),
        r"[\u0300-\u036f]+",
        "",
        "g",
    )
    return func.regexp_replace(func.btrim(without_accents), r"\s+", " ", "g")


def _has_offer(subject_code: ColumnElement[str], semester: str) -> ColumnElement[bool]:
    return exists(
        select(1).where(
            Classroom.subject_code == subject_code,
            Classroom.semester == semester,
        )
    )


def _matches_query(
    q: str, semester: str | None, unity_id: int | None
) -> ColumnElement[bool]:
    needle = lookup_key(q)
    conditions: list[ColumnElement[bool]] = [
        Subject.code.contains(needle.upper(), autoescape=True),
        _lookup_sql(Subject.name).contains(needle, autoescape=True),
    ]
    if semester is not None:
        professor = func.json_array_elements_text(Classroom.professors).column_valued(
            "professor"
        )
        conditions.append(
            exists(
                select(1)
                .select_from(Classroom)
                .where(
                    Classroom.subject_code == Subject.code,
                    Classroom.semester == semester,
                    _lookup_sql(professor).contains(needle, autoescape=True),
                )
            )
        )
        old = aliased(Subject)
        conditions.append(
            _has_offer(Subject.code, semester)
            & exists(
                select(1).where(
                    old.code == needle.upper(),
                    _lookup_sql(old.name) == _lookup_sql(Subject.name),
                    ~_has_offer(old.code, semester),
                    *((old.unity_id == unity_id,) if unity_id is not None else ()),
                )
            )
        )
    return or_(*conditions)


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
        prerequisite = func.jsonb_array_elements_text(
            func.jsonb_path_query_array(
                cast(Subject.prerequisites, JSONB), literal_column("'$[*][*]'")
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
        if q is not None:
            query = query.where(_matches_query(q, semester, unity_id))
        # Sem semestre não há turma gravada, então o filtro não tira nada.
        offered = selectinload(Subject.classrooms)
        if semester is not None:
            offered = selectinload(
                Subject.classrooms.and_(Classroom.semester == semester)
            )
        return list(await self._session.scalars(query.options(offered)))
