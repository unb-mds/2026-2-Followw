from typing import Annotated, Literal

from fastapi import Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sigaa_client import lookup_key
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.main import DatabaseDep
from api.db.models import Requirements, Subject, Unity
from api.modules.public_subjects.repository import SubjectCatalogRepository
from api.modules.recommendations.ranking import (
    Component,
    Reason,
    normalize,
    subject_kind,
)
from api.modules.recommendations.repository import RecommendationRepository
from api.modules.recommendations.service import Ranking, RecommendationService
from api.schemas import ClassroomOffer, UserSubject
from api.sync import Sync


class SubjectClassroom(ClassroomOffer):
    model_config = ConfigDict(frozen=True, from_attributes=True)

    sigaa_id: int | None = None
    number: str
    semester: str
    schedule: str | None = None
    room: str | None = None


class SubjectReference(BaseModel):
    code: str
    name: str


class SubjectRequirement(BaseModel):
    code: str
    subject: SubjectReference | None = None


type CatalogRequirements = list[list[SubjectRequirement]]


class SubjectRecommendation(BaseModel):
    """Score do ranking v3; a soma dos pontos dos motivos."""

    score: int
    reasons: list[Reason]


class CatalogSubject(UserSubject):
    """O componente com as turmas do semestre consultado e os requisitos."""

    # OU de Es: `[["A", "B"], ["C"]]` é `(A E B) OU C`; nulo quando desconhecido.
    prerequisites: CatalogRequirements | None = None
    corequisites: CatalogRequirements | None = None
    equivalences: CatalogRequirements | None = None
    unity_name: str | None = None
    classrooms: list[SubjectClassroom]
    # Tipo na matriz estimada de quem está logado; nulo sem login ou sem matriz.
    kind: Literal["mandatory", "optional", "free"] | None = None
    recommendation: SubjectRecommendation | None = None


class PublicSubjectService:
    def __init__(self, db: DatabaseDep) -> None:
        self._db = db

    async def search(
        self,
        q: str | None = None,
        *,
        code: str | None = None,
        unit: str | None = None,
        semester: str | None = None,
        sync: Sync | None = None,
    ) -> list[CatalogSubject]:
        registration = sync.registration if sync else None
        if q is None and code is None and unit is None:
            if sync is None:
                raise _invalid("Informe `q`, `code` ou `unit`.")
            ranking = await RecommendationService(sync).recommend()
            return await self._db.read(
                lambda session: _recommended(session, ranking, registration)
            )
        return await self._db.read(
            lambda session: _search(session, q, code, unit, semester, registration)
        )


async def _search(
    session: AsyncSession,
    q: str | None,
    code: str | None,
    unit: str | None,
    semester: str | None,
    registration: str | None,
) -> list[CatalogSubject]:
    repository = SubjectCatalogRepository(session)
    unity_id = None
    if unit is not None:
        unity_id = _resolve_unity(await repository.list_unities(), unit.strip())
    subjects = await repository.list_subjects(
        code=code.strip().upper() if code is not None else None,
        unity_id=unity_id,
        semester=semester,
    )
    needle = lookup_key(q or "")
    return await _catalog(
        session,
        registration,
        [
            subject
            for subject in subjects
            if any(
                needle in lookup_key(text)
                for text in (
                    subject.code,
                    subject.name,
                    *(p for c in subject.classrooms for p in c.professors),
                )
            )
        ],
    )


async def _recommended(
    session: AsyncSession, ranking: Ranking, registration: str | None
) -> list[CatalogSubject]:
    if not ranking.items:
        return []
    repository = SubjectCatalogRepository(session)
    order = {item.code: index for index, item in enumerate(ranking.items)}
    subjects = await repository.list_subjects(
        codes=set(order), semester=ranking.semester
    )
    subjects.sort(key=lambda subject: order[normalize(subject.code)])
    return [
        subject.model_copy(
            update={
                "recommendation": SubjectRecommendation.model_validate(
                    ranking.items[order[normalize(subject.code)]], from_attributes=True
                )
            }
        )
        for subject in await _catalog(session, registration, subjects)
    ]


async def _catalog(
    session: AsyncSession, registration: str | None, subjects: list[Subject]
) -> list[CatalogSubject]:
    curriculum: dict[str, Component] | None = None
    if registration is not None:
        curriculum = await RecommendationRepository(session).curriculum(registration)
    names = await SubjectCatalogRepository(session).subject_names(
        {
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
    )
    return [
        CatalogSubject(
            code=subject.code,
            name=subject.name,
            hours=subject.hours,
            unity=subject.unity.code if subject.unity else None,
            unity_name=subject.unity.name if subject.unity else None,
            prerequisites=_requirements(subject.prerequisites, names),
            corequisites=_requirements(subject.corequisites, names),
            equivalences=_requirements(subject.equivalences, names),
            classrooms=[
                SubjectClassroom.model_validate(classroom)
                for classroom in sorted(subject.classrooms, key=lambda c: c.number)
            ],
            kind=subject_kind(curriculum, subject.code)
            if curriculum is not None
            else None,
        )
        for subject in subjects
    ]


def _requirements(
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


def _resolve_unity(unities: list[Unity], wanted: str) -> int:
    for unity in unities:
        if wanted == str(unity.id) or wanted.upper() == unity.code:
            return unity.id
    raise _invalid(f"Unidade `{wanted}` não encontrada.")


def _invalid(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=detail
    )


PublicSubjectServiceDep = Annotated[PublicSubjectService, Depends()]
