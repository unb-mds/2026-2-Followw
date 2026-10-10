from collections import defaultdict
from collections.abc import Collection

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import Course
from api.db.unities import unity_ids

DEFAULT_SHIFT = "DIURNO"


async def course_ids(
    session: AsyncSession,
    pairs: Collection[tuple[str | None, str | None]],
    shift: str | None = None,
) -> dict[tuple[str, str], int]:
    """Os ids dos cursos por (nome, código da unidade), criando os que faltam; o `shift` desempata."""
    wanted = {(name, unity) for name, unity in pairs if name and unity}
    unities = await unity_ids(session, {unity for _, unity in wanted})
    keys = {
        (name, unities[unity]): (name, unity)
        for name, unity in wanted
        if unity in unities
    }
    if not keys:
        return {}

    found: dict[tuple[str, int], list[Course]] = defaultdict(list)
    for course in await session.scalars(
        select(Course)
        .where(
            Course.unity_id.in_({unity_id for _, unity_id in keys}),
            Course.name.in_({name for name, _ in keys}),
        )
        .order_by(Course.id)
    ):
        found[(course.name, course.unity_id)].append(course)

    for key in keys:
        if not found[key]:
            name, unity_id = key
            course = Course(name=name, unity_id=unity_id)
            session.add(course)
            found[key].append(course)
    await session.flush()

    return {pair: _pick(found[key], shift).id for key, pair in keys.items()}


def _pick(courses: list[Course], shift: str | None) -> Course:
    for wanted in (shift, DEFAULT_SHIFT):
        for course in courses:
            if course.shift == wanted:
                return course
    return courses[0]
