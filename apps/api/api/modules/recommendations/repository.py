from collections import defaultdict

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.enums import ClassroomRole, ClassroomStatus
from api.db.models import Classroom, CurriculumComponent, OwnLink, Subject
from api.modules.classrooms.repository import ClassroomRepository
from api.modules.classrooms.service import classrooms_freshness, grade_freshness
from api.modules.me.profile import profile_freshness
from api.modules.me.repository import UserRepository
from api.modules.public_courses.repository import PublicCourseRepository
from api.modules.recommendations.ranking import (
    CatalogSubject,
    Component,
    Context,
    CurriculumInfo,
    History,
    HistoryEntry,
    Offer,
    Recommendations,
    normalize,
    rank,
    select_curriculum,
    semester,
)


class RecommendationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def offer_semester(self) -> str | None:
        values = await self._session.scalars(
            select(Classroom.semester)
            .where(Classroom.listed_in_offer.is_(True))
            .distinct()
        )
        return max(
            (value for value in values if semester(value)), key=semester, default=None
        )

    async def student_links(
        self, registration: str, reference: str | None
    ) -> list[OwnLink]:
        user = await UserRepository(self._session).get_by_registration(registration)
        if user is None or reference is None:
            return []
        links = await ClassroomRepository(self._session).list_by_user_id(user.id)
        return [
            link
            for link in links
            if link.row.role == ClassroomRole.ALUNO
            and semester(link.row.classroom.semester)
            and semester(link.row.classroom.semester) <= semester(reference)
        ]

    async def recommendations(
        self, registration: str, reference: str | None, limit: int
    ) -> Recommendations:
        user = await UserRepository(self._session).get_by_registration(registration)
        assert user is not None and user.profile_synced_at and user.classrooms_synced_at
        links = await self.student_links(registration, reference)
        if any(link.row.grade_synced_at is None for link in links):
            raise HTTPException(
                503, "Histórico atualizado durante a consulta; tente novamente."
            )
        entries = [
            HistoryEntry(
                code=link.row.classroom.subject_code,
                semester=link.row.classroom.semester,
                approved=bool(link.row.grade and link.row.grade.approved),
                enrolled=link.row.status == ClassroomStatus.CURSANDO,
                classroom_id=link.row.classroom_id,
                grade_synced_at=link.row.grade_synced_at,
                freshness=grade_freshness(link, link.row.grade_synced_at).value,
            )
            for link in links
        ]
        entries.sort(key=lambda e: (semester(e.semester), e.code, str(e.classroom_id)))
        historical = min((e.semester for e in entries), key=semester, default=None)
        course = user.course
        public = PublicCourseRepository(self._session)
        options = (
            [
                CurriculumInfo.model_validate(c)
                for c in await public.list_curricula(course.id)
            ]
            if course
            else []
        )
        selected, method = select_curriculum(
            options, reference, historical, course.shift if course else None
        )
        components = []
        catalog = {}
        if selected:
            components = [
                Component.model_validate(c)
                for c in await self._session.scalars(
                    select(CurriculumComponent).where(
                        CurriculumComponent.curriculum_id == selected.id
                    )
                )
            ]
            codes = {normalize(c.subject_code) for c in components}
            for subject in await self._session.scalars(
                select(Subject).where(func.upper(func.trim(Subject.code)).in_(codes))
            ):
                catalog[normalize(subject.code)] = _subject(subject)
        offers = defaultdict(list)
        rows = (
            await self._session.execute(
                select(Classroom, Subject)
                .join(Subject, Subject.code == Classroom.subject_code)
                .where(
                    Classroom.listed_in_offer.is_(True), Classroom.semester == reference
                )
            )
            if reference
            else ()
        )
        for classroom, subject in rows:
            code = normalize(subject.code)
            catalog[code] = _subject(subject)
            known = classroom.vacancies is not None and classroom.occupied is not None
            availability = (
                ("available" if classroom.vacancies > classroom.occupied else "full")
                if known
                else "unknown"
            )
            offers[code].append(
                Offer(
                    id=classroom.id,
                    sigaa_id=classroom.sigaa_id,
                    number=classroom.number,
                    semester=classroom.semester,
                    schedule=classroom.schedule,
                    room=classroom.room,
                    professors=tuple(classroom.professors)
                    if classroom.professors
                    else None,
                    vacancies=classroom.vacancies,
                    occupied=classroom.occupied,
                    availability=availability,
                    is_locked=availability == "full",
                )
            )
        return rank(
            context=Context(
                offer_semester=reference,
                course_id=course.id if course else None,
                unity_id=course.unity_id if course and course.unity else None,
                curriculum=selected,
                curriculum_method=method,
                history_reference=historical,
                period=None,
                period_method="unavailable",
            ),
            history=History(
                profile_synced_at=user.profile_synced_at,
                classrooms_synced_at=user.classrooms_synced_at,
                profile_freshness=profile_freshness(user.profile_synced_at).value,
                classrooms_freshness=classrooms_freshness(
                    user.classrooms_synced_at
                ).value,
                grades=entries,
            ),
            catalog=catalog,
            offers=offers,
            components=components,
            limit=limit,
        )


def _subject(subject: Subject) -> CatalogSubject:
    return CatalogSubject(
        code=normalize(subject.code),
        name=subject.name,
        hours=subject.hours,
        unity_id=subject.unity_id,
        unity=(subject.unity.code or subject.unity.name) if subject.unity else None,
        catalog_complete=subject.catalog_complete,
        prerequisites=subject.prerequisites,
        corequisites=subject.corequisites,
        equivalences=subject.equivalences,
    )
