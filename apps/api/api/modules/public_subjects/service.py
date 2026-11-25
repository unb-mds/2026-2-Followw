from typing import Annotated

from fastapi import Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.main import DatabaseDep
from api.db.models import Subject
from api.db.units import find_unit_id
from api.modules.me.repository import UserRepository
from api.modules.public_subjects.filters import SubjectFilters
from api.modules.public_subjects.repository import (
    SUBJECTS_PAGE_SIZE,
    UNRANKED_SUBJECT_PRIORITY,
    SubjectCatalogRepository,
    SubjectCriteria,
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
    SubjectKind,
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

    async def recommendations(
        self, sync: Sync, *, available: bool = False
    ) -> list[CatalogSubject]:
        ranking = await RecommendationService(sync).recommend()
        return await self._db.read(
            lambda session: _recommended(session, ranking, available)
        )

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
    students = RecommendationRepository(session)
    user = (
        await UserRepository(session).get_by_registration(registration)
        if registration
        else None
    )
    curriculum = (
        await students.components(user.curriculum_id)
        if user and user.curriculum_id
        else None
    )
    semester = filters.semester or await repository.latest_semester()
    q, schedules = _text_and_schedules(filters)
    codes, excluded = _kind_scope(curriculum, filters.kind)
    criteria = SubjectCriteria(
        semester=semester,
        q=q,
        code=filters.code,
        codes=codes,
        excluded_codes=excluded,
        unit_id=await find_unit_id(session, filters.unit),
        hours=filters.hours or (),
        schedules=schedules,
        offered=filters.offered,
        available=filters.available,
        done=await students.done(user.id) if filters.available and user else None,
        priority=_curriculum_priority(curriculum),
    )
    subjects, total = await repository.page_subjects(criteria, filters.page)
    return SubjectPage(
        items=await _catalog(session, curriculum, subjects, semester),
        total=total,
        page=filters.page,
    )


def _text_and_schedules(
    filters: SubjectFilters,
) -> tuple[str | None, list[ScheduleSearch]]:
    """Um código de horário do SIGAA em `q` vira busca por horário."""
    schedules: list[ScheduleSearch] = []
    if schedule := filters.schedule():
        schedules.append(schedule)
    if filters.q is not None and (code := parse_schedule_code(filters.q)):
        return None, [*schedules, code]
    return filters.q, schedules


def _kind_scope(
    curriculum: dict[str, Component] | None, kinds: list[SubjectKind] | None
) -> tuple[set[str] | None, set[str]]:
    """Os códigos a incluir e a excluir; livres são as matérias fora da matriz."""
    if not kinds:
        return None, set()
    if curriculum is None:
        raise HTTPException(404, "Matriz curricular do aluno não encontrada.")
    selected = {code for code in curriculum if subject_kind(curriculum, code) in kinds}
    if "free" in kinds:
        return None, curriculum.keys() - selected
    return selected, set()


def _curriculum_priority(
    curriculum: dict[str, Component] | None,
) -> dict[str, int] | None:
    """Obrigatórias, depois optativas e por fim as demais."""
    if not curriculum:
        return None
    return {
        code: _CURRICULUM_PRIORITY.get(
            subject_kind(curriculum, code), UNRANKED_SUBJECT_PRIORITY
        )
        for code in curriculum
    }


async def _recommended(
    session: AsyncSession, ranking: Ranking, available: bool
) -> list[CatalogSubject]:
    """As recomendadas; o ranking já cuida dos requisitos, `available` só tira as cheias."""
    if not ranking.items:
        return []
    repository = SubjectCatalogRepository(session)
    order = {item.code: index for index, item in enumerate(ranking.items)}
    semester = ranking.semester or await repository.latest_semester()
    subjects = await repository.list_subjects(
        SubjectCriteria(
            semester=semester,
            codes=set(order),
            offered=True,
            available=available,
        )
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
    names = await repository.subject_names(codes)
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
