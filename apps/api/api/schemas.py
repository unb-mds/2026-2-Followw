from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from api.db.models import Course, Professor, Unit

# Número que cabe na coluna vira o id; o resto é sigla ou nome, nunca só dígitos.
UnitFilter = Annotated[
    Annotated[int, Field(gt=0, le=2**31 - 1)]
    | Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"[^0-9]")],
    Field(union_mode="left_to_right"),
]


class UnitRef(BaseModel):
    """Unidade acadêmica: `id` do SIGAA, `code` a sigla (ex.: FCTE)."""

    model_config = ConfigDict(frozen=True, from_attributes=True)

    id: int
    code: str | None
    name: str


def unit_ref(unit: Unit | None) -> UnitRef | None:
    return UnitRef.model_validate(unit) if unit else None


class CourseRef(BaseModel):
    model_config = ConfigDict(frozen=True, from_attributes=True)

    id: int
    name: str
    shift: str | None


def course_ref(course: Course | None) -> CourseRef | None:
    return CourseRef.model_validate(course) if course else None


class UserSubject(BaseModel):
    """O componente como o cache guarda, pelo código."""

    model_config = ConfigDict(frozen=True)

    code: str
    name: str
    hours: int | None = None
    unit: UnitRef | None = None


class ProfessorRef(BaseModel):
    """Docente de uma turma; `siape` nulo quando está fora do catálogo."""

    model_config = ConfigDict(frozen=True, from_attributes=True)

    siape: int | None
    name: str
    photo: str | None
    email: str | None


def professor_refs(professors: list[Professor]) -> tuple[ProfessorRef, ...]:
    return tuple(ProfessorRef.model_validate(professor) for professor in professors)


class ClassroomOffer(BaseModel):
    """Docentes da turma e vagas como o último seed as gravou."""

    professors: tuple[ProfessorRef, ...] = ()
    vacancies: int | None = Field(
        default=None, description="Vagas na coleta do seed, não em tempo real."
    )
    occupied: int | None = Field(
        default=None, description="Ocupação na coleta do seed, não em tempo real."
    )
