from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from uuid import UUID

from sigaa_client import lookup_key
from sqlalchemy import delete, func, insert, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import ClassroomProfessor, Professor
from api.db.search import lookup_sql


@dataclass(frozen=True)
class SeenProfessor:
    """Um docente como aparece numa turma: pelo seed só o nome, pelos participantes o resto."""

    name: str
    email: str | None = None
    person_id: int | None = None
    photo: str | None = None
    unit_id: int | None = None


class _Index:
    """Docentes por `idPessoa`, email e nome; no empate fica o primeiro."""

    def __init__(self) -> None:
        self._person_ids: dict[int, Professor] = {}
        self._emails: dict[str, Professor] = {}
        self._names: dict[str, Professor] = {}

    def add(self, professor: Professor) -> None:
        if professor.person_id is not None:
            self._person_ids.setdefault(professor.person_id, professor)
        if professor.email:
            self._emails.setdefault(professor.email.lower(), professor)
        self._names.setdefault(lookup_key(professor.name), professor)

    def find(self, seen: SeenProfessor) -> Professor | None:
        if seen.person_id is not None and seen.person_id in self._person_ids:
            return self._person_ids[seen.person_id]
        if seen.email and seen.email.lower() in self._emails:
            return self._emails[seen.email.lower()]
        return self._names.get(lookup_key(seen.name))


async def save_professors(
    session: AsyncSession, seen: Sequence[SeenProfessor]
) -> list[Professor]:
    """O docente de cada visto, na mesma ordem, criando sem `siape` quem não casar."""
    wanted = [item for item in seen if item.name.strip()]
    if not wanted:
        return []
    person_ids = {item.person_id for item in wanted if item.person_id is not None}
    emails = {item.email.lower() for item in wanted if item.email}
    conditions = [lookup_sql(Professor.name).in_({lookup_key(i.name) for i in wanted})]
    if person_ids:
        conditions.append(Professor.person_id.in_(person_ids))
    if emails:
        conditions.append(func.lower(Professor.email).in_(emails))
    index = _Index()
    # O catálogo vem antes dos criados pelas turmas.
    for professor in await session.scalars(
        select(Professor)
        .where(or_(*conditions))
        .order_by(Professor.siape.is_(None), Professor.siape, Professor.created_at)
    ):
        index.add(professor)

    professors = []
    for item in wanted:
        professor = index.find(item)
        if professor is None:
            professor = Professor(name=item.name.strip())
            session.add(professor)
        _complete(professor, item)
        index.add(professor)
        professors.append(professor)
    await session.flush()
    return professors


def _complete(professor: Professor, seen: SeenProfessor) -> None:
    # O catálogo é mais confiável: a turma só completa o que falta nele.
    catalog = professor.siape is not None
    if professor.person_id is None:
        professor.person_id = seen.person_id
    for field in ("photo", "email", "unit_id"):
        value = getattr(seen, field)
        if value is not None and (not catalog or getattr(professor, field) is None):
            setattr(professor, field, value)


async def save_classroom_professors(
    session: AsyncSession, professors: Mapping[UUID, Sequence[Professor]]
) -> None:
    """Troca os docentes de cada turma: a última fonte a gravar vence."""
    if not professors:
        return
    await session.execute(
        delete(ClassroomProfessor).where(
            ClassroomProfessor.classroom_id.in_(professors)
        )
    )
    rows = [
        {"classroom_id": classroom_id, "professor_id": professor_id}
        for classroom_id, items in professors.items()
        for professor_id in dict.fromkeys(item.id for item in items)
    ]
    if rows:
        await session.execute(insert(ClassroomProfessor), rows)
