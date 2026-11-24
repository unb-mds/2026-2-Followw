from typing import Annotated

from fastapi import Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.main import DatabaseDep
from api.db.models import Subject
from api.db.units import find_unit_id
from api.modules.public_subjects.filters import SubjectFilters, SubjectKind
from api.modules.public_subjects.repository import (
    SUBJECTS_PAGE_SIZE,
    UNRANKED_SUBJECT_PRIORITY,
    SubjectCatalogRepository,
)
from api.modules.public_subjects.schedule_search import (
    ScheduleSearch,
    parse_schedule_code,
)
from api.modules.recommendations.ranking import (
    Component,
    ReasonCode,
    subject_kind,
)
from api.modules.recommendations.repository import RecommendationRepository
from api.modules.recommendations.service import Ranking, RecommendationService
from api.schemas import (
    CatalogRequirements,
    ClassroomOffer,
    DisplayedRequirements,
    SubjectReference,
    UserSubject,
    displayed_requirements,
    named_requirements,
    normalize,
    requirement_codes,
    unit_ref,
)
from api.sync import Sync

_CURRICULUM_PRIORITY = {"mandatory": 0, "optional": 1}


class SubjectClassroom(ClassroomOffer):
    model_config = ConfigDict(frozen=True, from_attributes=True)

    sigaa_id: int | None = None
    number: str
    semester: str
    schedule: str | None = None
    room: str | None = None


class SubjectReason(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: ReasonCode
    # Quantidade medida nos critérios acumulativos: semestres, matérias ou horas.
    value: int | None = None


class SubjectRecommendation(BaseModel):
    """Motivos da posição no ranking, do mais ao menos relevante."""

    reasons: list[SubjectReason]


class CatalogSubject(UserSubject, DisplayedRequirements):
    """O componente com as turmas do semestre consultado e os requisitos."""

    # OU de Es: `[["A", "B"], ["C"]]` é `(A E B) OU C`; nulo quando desconhecido.
    prerequisites: CatalogRequirements | None = None
    corequisites: CatalogRequirements | None = None
    equivalences: CatalogRequirements | None = None
    prerequisite_equivalences: dict[str, list[list[str]]] = Field(default_factory=dict)
    classrooms: list[SubjectClassroom]
    # Tipo na matriz estimada de quem está logado; nulo sem login ou sem matriz.
    kind: SubjectKind | None = None
    unlocks: list[SubjectReference] = Field(default_factory=list)
    curriculum_period: int | None = None
    recommendation: SubjectRecommendation | None = None


class SubjectPage(BaseModel):
    items: list[CatalogSubject]
    total: int
    page: int
    page_size: int = SUBJECTS_PAGE_SIZE


class PublicSubjectService:
    def __init__(self, db: DatabaseDep) -> None:
        self._db = db

    async def recommendations(self, sync: Sync) -> list[CatalogSubject]:
        ranking = await RecommendationService(sync).recommend()
        return await self._db.read(lambda session: _recommended(session, ranking))

    async def search(
        self, filters: SubjectFilters, sync: Sync | None = None
    ) -> SubjectPage:
        registration = sync.registration if sync else None
        return await self._db.read(
            lambda session: _search(session, filters, registration)
        )


async def _search(
    session: AsyncSession, filters: SubjectFilters, registration: str | None
) -> SubjectPage:
    repository = SubjectCatalogRepository(session)
    unit_id = await find_unit_id(session, filters.unit)
    semester = filters.semester or await repository.latest_semester()
    curriculum = None
    if registration is not None:
        curriculum = await RecommendationRepository(session).curriculum(registration)
    included = excluded = None
    if filters.kind:
        if curriculum is None:
            raise HTTPException(404, "Matriz curricular do aluno não encontrada.")
        selected = {
            code
            for code in curriculum
            if subject_kind(curriculum, code) in filters.kind
        }
        if "free" in filters.kind:
            excluded = curriculum.keys() - selected
        else:
            included = selected
    schedules: list[ScheduleSearch] = []
    if schedule := filters.schedule():
        schedules.append(schedule)
    q = filters.q
    if q is not None and (schedule_code := parse_schedule_code(q)) is not None:
        q = None
        schedules.append(schedule_code)
    priority = (
        {
            code: _CURRICULUM_PRIORITY.get(
                subject_kind(curriculum, code), UNRANKED_SUBJECT_PRIORITY
            )
            for code in curriculum
        }
        if curriculum
        else None
    )
    subjects, total = await repository.list_subjects(
        q=q,
        code=filters.code,
        unit_id=unit_id,
        semester=semester,
        schedules=schedules,
        hours=filters.hours or (),
        codes=included,
        excluded_codes=excluded,
        offered=filters.offered,
        priority=priority,
        page=filters.page,
    )
    return SubjectPage(
        items=await _catalog(session, curriculum, subjects, semester),
        total=total,
        page=filters.page,
    )


async def _recommended(session: AsyncSession, ranking: Ranking) -> list[CatalogSubject]:
    if not ranking.items:
        return []
    repository = SubjectCatalogRepository(session)
    order = {item.code: index for index, item in enumerate(ranking.items)}
    semester = ranking.semester or await repository.latest_semester()
    subjects, _ = await repository.list_subjects(
        codes=set(order), semester=semester, offered=True
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
        for subject in await _catalog(session, ranking.curriculum, subjects, semester)
    ]


async def _catalog(
    session: AsyncSession,
    curriculum: dict[str, Component] | None,
    subjects: list[Subject],
    semester: str | None,
) -> list[CatalogSubject]:
    repository = SubjectCatalogRepository(session)
    unlocks = await repository.unlocked_subjects(
        {subject.code for subject in subjects}, semester
    )
    codes = requirement_codes(subjects)
    references = await repository.subject_references(codes)
    names = {code: name for code, (name, _) in references.items()}
    equivalents = {code: groups for code, (_, groups) in references.items() if groups}
    offered = {
        normalize(code)
        for code in await repository.offered_subject_codes(codes, semester)
    }
    return [
        CatalogSubject(
            code=subject.code,
            name=subject.name,
            hours=subject.hours,
            unit=unit_ref(subject.unit),
            prerequisites=named_requirements(subject.prerequisites, names),
            prerequisite_equivalences={
                code: equivalents[code]
                for group in subject.prerequisites or []
                for code in map(normalize, group)
                if code in equivalents
            },
            corequisites=named_requirements(subject.corequisites, names),
            equivalences=named_requirements(subject.equivalences, names),
            **displayed_requirements(subject, names, curriculum, offered),
            classrooms=[
                SubjectClassroom.model_validate(classroom)
                for classroom in sorted(subject.classrooms, key=lambda c: c.number)
            ],
            unlocks=[
                SubjectReference(code=code, name=name)
                for code, name in unlocks.get(subject.code, [])
            ],
            curriculum_period=component.period
            if curriculum is not None
            and (component := curriculum.get(normalize(subject.code))) is not None
            and component.period is not None
            and component.period > 0
            else None,
            kind=subject_kind(curriculum, subject.code)
            if curriculum is not None
            else None,
        )
        for subject in subjects
    ]


PublicSubjectServiceDep = Annotated[PublicSubjectService, Depends()]
