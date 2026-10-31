from collections.abc import Container, Iterable
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from api.db.models import Course, Professor, Requirements, Subject, Unit

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


class SubjectReference(BaseModel):
    code: str
    name: str


class SubjectRequirement(BaseModel):
    code: str
    subject: SubjectReference | None = None


type CatalogRequirements = list[list[SubjectRequirement]]


def named_requirements(
    requirements: Requirements | None, names: dict[str, str]
) -> CatalogRequirements | None:
    if requirements is None:
        return None
    return [
        [
            SubjectRequirement(
                code=code,
                subject=SubjectReference(code=code, name=names[code])
                if code in names
                else None,
            )
            for code in group
        ]
        for group in requirements
    ]


def normalize(code: str) -> str:
    return code.strip().upper()


class DisplayedRequirements(BaseModel):
    """Requisitos só para exibição; os completos continuam valendo na validação."""

    # Grupos inteiros na matriz ou, sem nenhum, os com turmas; nulo sem matriz.
    curriculum_prerequisites: CatalogRequirements | None = None
    curriculum_corequisites: CatalogRequirements | None = None
    # Só os grupos com turmas no semestre.
    offered_equivalences: CatalogRequirements | None = None


def displayed_requirements(
    subject: Subject,
    names: dict[str, str],
    curriculum: Container[str] | None,
    offered: set[str],
) -> dict[str, CatalogRequirements | None]:
    """Campos de `DisplayedRequirements`; `curriculum` e `offered` normalizados."""
    return {
        "curriculum_prerequisites": _curriculum_requirements(
            subject.prerequisites, names, curriculum, offered
        ),
        "curriculum_corequisites": _curriculum_requirements(
            subject.corequisites, names, curriculum, offered
        ),
        "offered_equivalences": _requirements_within(
            subject.equivalences, names, offered
        ),
    }


def _curriculum_requirements(
    requirements: Requirements | None,
    names: dict[str, str],
    curriculum: Container[str] | None,
    offered: set[str],
) -> CatalogRequirements | None:
    if not curriculum or requirements is None:
        return None
    return _requirements_within(
        requirements, names, curriculum
    ) or _requirements_within(requirements, names, offered)


def _requirements_within(
    requirements: Requirements | None, names: dict[str, str], codes: Container[str]
) -> CatalogRequirements | None:
    if requirements is None:
        return None
    return named_requirements(
        [
            group
            for group in requirements
            if group and all(normalize(code) in codes for code in group)
        ],
        names,
    )


def requirement_codes(subjects: Iterable[Subject]) -> set[str]:
    return {
        code
        for subject in subjects
        for requirements in (
            subject.prerequisites,
            subject.corequisites,
            subject.equivalences,
        )
        for group in requirements or []
        for code in group
    }


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
