from collections.abc import Collection, Mapping, Sequence
from datetime import date, datetime
from uuid import UUID, uuid4

import sigaa_client
from sigaa_client import AttendanceStatus
from sqlalchemy import ColumnElement, delete, exists, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager, joinedload

from api import academic_calendar
from api.db.courses import course_ids
from api.db.enums import ClassroomRole, ClassroomStatus, LessonStatus
from api.db.models import (
    USER_WITHOUT_IDS,
    Classroom,
    ClassroomNews,
    ClassroomParticipant,
    ClassroomStatistic,
    Lesson,
    LessonAttendance,
    OwnLink,
    Subject,
    User,
)
from api.db.unities import unity_ids
from api.modules.classrooms.lessons import (
    FrequencySummary,
    Period,
    Timetable,
    lesson_order,
    positioned,
)

# Vínculo com turma e componente, no mesmo join que os filtros usam.
_OWN = (
    select(ClassroomParticipant)
    .join(ClassroomParticipant.classroom)
    .join(Classroom.subject)
    .options(
        contains_eager(ClassroomParticipant.classroom).contains_eager(Classroom.subject)
    )
)
# Só quem ainda está na turma ganha o motivo de uma saída.
_ENROLLED = (None, ClassroomStatus.CURSANDO)


class ClassroomRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._lessons = LessonRepository(session)

    async def list_by_user_id(self, user_id: UUID) -> list[OwnLink]:
        """Vínculos da lista de turmas do próprio usuário, com turma e componente."""
        rows = await self._session.scalars(
            _OWN.where(
                ClassroomParticipant.user_id == user_id,
                ClassroomParticipant.front_end_id.is_not(None),
            )
        )
        return [OwnLink.of(row) for row in rows]

    async def get(self, classroom_id: UUID) -> Classroom | None:
        return await self._session.get(Classroom, classroom_id)

    async def get_by_front_end_id(
        self, user_id: UUID, front_end_id: str
    ) -> OwnLink | None:
        return await self._own(
            ClassroomParticipant.user_id == user_id,
            ClassroomParticipant.front_end_id == front_end_id,
        )

    async def get_by_sigaa_id(self, user_id: UUID, sigaa_id: str) -> OwnLink | None:
        # Cabe no INTEGER da coluna; fora disso nem chega ao banco.
        if not sigaa_id.isdecimal() or int(sigaa_id) >= 2**31:
            return None
        return await self._own(
            ClassroomParticipant.user_id == user_id,
            ClassroomParticipant.front_end_id.is_not(None),
            Classroom.sigaa_id == int(sigaa_id),
        )

    async def save_grade(
        self,
        classroom_participant_id: UUID,
        grade: sigaa_client.Grade | None,
        synced_at: datetime,
    ) -> None:
        link = await self._session.get_one(
            ClassroomParticipant, classroom_participant_id
        )
        link.grade = grade
        link.grade_synced_at = synced_at
        await self._session.flush()

    async def save_classroom_participants(
        self,
        user: User,
        classrooms: Sequence[sigaa_client.Classroom],
        synced_at: datetime,
        *,
        refresh: bool = False,
    ) -> None:
        links = {
            link.classroom_id: link
            for link in await self._session.scalars(
                select(ClassroomParticipant)
                .where(ClassroomParticipant.user_id == user.id)
                .options(joinedload(ClassroomParticipant.classroom, innerjoin=True))
            )
        }
        keyed = [(key, item) for item in classrooms if (key := _classroom_key(item))]
        # O histórico tem dezenas de turmas: turmas e componentes vêm de uma vez.
        saved = await self._classrooms_by_key([key for key, _ in keyed])
        subjects = await self._subjects({key[0] for key, _ in keyed})
        unities = await unity_ids(
            self._session, {item.subject.unity for _, item in keyed}
        )
        seen: set[UUID] = set()
        current: list[Classroom] = []
        for key, item in keyed:
            classroom = saved.get(key)
            # Turma de semestre passado quase não muda: só é regravada num refresh.
            if classroom is None or item.current or refresh:
                classroom = saved[key] = await self._save_classroom(
                    key, item, classroom, subjects, unities
                )
            if item.current:
                current.append(classroom)
            link = links.get(classroom.id)
            if link is None:
                link = ClassroomParticipant(
                    user_id=user.id, classroom_id=classroom.id, role=ClassroomRole.ALUNO
                )
                self._session.add(link)
                links[classroom.id] = link
            link.front_end_id = item.id
            link.current = item.current
            if link.role == ClassroomRole.ALUNO:
                link.status = academic_calendar.member_status(classroom.semester)
            seen.add(classroom.id)

        # Vínculos que só vieram da lista de participantes não são desta listagem.
        for classroom_id, link in links.items():
            if link.front_end_id is None or classroom_id in seen:
                continue
            # Como na lista de participantes: a turma some da lista, mas o vínculo
            # fica com o motivo da saída.
            link.front_end_id = None
            link.current = False
            if link.role == ClassroomRole.ALUNO and link.status in _ENROLLED:
                link.status = academic_calendar.departure_status(
                    link.classroom.semester
                )
        # Turma de semestre passado fica só com as aulas que o SIGAA publicou.
        await self._lessons.plan(current, synced_at)
        user.classrooms_synced_at = synced_at
        await self._session.flush()

    async def list_members(self, classroom_id: UUID) -> list[ClassroomParticipant]:
        return await self._links(classroom_id, ClassroomParticipant.member.is_(True))

    async def save_members(
        self,
        classroom_id: UUID,
        members: Sequence[sigaa_client.ClassroomMember],
        synced_at: datetime,
    ) -> None:
        classroom = await self._session.get_one(Classroom, classroom_id)
        links = {link.user_id: link for link in await self._links(classroom_id)}
        known = [link.user for link in links.values()]
        # Turma grande tem milhares de participantes: os usuários vêm de uma vez.
        users = await self._member_users(members)
        courses = await course_ids(
            self._session, {(m.course, m.unity) for m in members}
        )
        present = academic_calendar.member_status(classroom.semester)
        seen: set[UUID] = set()
        for member in members:
            user = self._save_member(member, users, known, courses)
            link = links.get(user.id)
            if link is None:
                link = ClassroomParticipant(user_id=user.id, classroom_id=classroom_id)
                self._session.add(link)
                links[user.id] = link
            link.role = ClassroomRole(member.role.value)
            link.status = present if link.role == ClassroomRole.ALUNO else None
            link.member = True
            seen.add(user.id)

        departed = academic_calendar.departure_status(classroom.semester)
        for user_id, link in links.items():
            if user_id in seen:
                continue
            link.member = False
            if link.role == ClassroomRole.ALUNO:
                # Aluno que sumiu fica com o motivo; quem já saiu mantém o seu.
                if link.status in _ENROLLED:
                    link.status = departed
            # O vínculo da lista de turmas do próprio usuário não é desta listagem.
            elif link.front_end_id is None:
                await self._session.delete(link)
        classroom.members_synced_at = synced_at
        await self._session.flush()

    async def get_statistics(self, classroom_id: UUID) -> ClassroomStatistic | None:
        return await self._session.scalar(
            select(ClassroomStatistic).where(
                ClassroomStatistic.classroom_id == classroom_id
            )
        )

    async def save_statistics(
        self,
        classroom_id: UUID,
        shares: Sequence[sigaa_client.StatisticsShare],
        synced_at: datetime,
    ) -> None:
        cached = await self.get_statistics(classroom_id)
        if cached is None:
            cached = ClassroomStatistic(classroom_id=classroom_id)
            self._session.add(cached)
        cached.data = [share.model_dump(mode="json") for share in shares]
        classroom = await self._session.get_one(Classroom, classroom_id)
        classroom.statistics_synced_at = synced_at
        await self._session.flush()

    async def _own(self, *where: ColumnElement[bool]) -> OwnLink | None:
        row = await self._session.scalar(_OWN.where(*where))
        return OwnLink.of(row) if row is not None else None

    async def _links(
        self, classroom_id: UUID, *where: ColumnElement[bool]
    ) -> list[ClassroomParticipant]:
        return list(
            await self._session.scalars(
                select(ClassroomParticipant)
                .where(ClassroomParticipant.classroom_id == classroom_id, *where)
                .options(joinedload(ClassroomParticipant.user, innerjoin=True))
            )
        )

    async def _classrooms_by_key(
        self, keys: Sequence[_ClassroomKey]
    ) -> dict[_ClassroomKey, Classroom]:
        if not keys:
            return {}
        rows = await self._session.scalars(
            select(Classroom).where(
                tuple_(
                    Classroom.subject_code, Classroom.number, Classroom.semester
                ).in_(keys)
            )
        )
        return {(row.subject_code, row.number, row.semester): row for row in rows}

    async def _subjects(self, codes: Collection[str]) -> dict[str, Subject]:
        if not codes:
            return {}
        rows = await self._session.scalars(
            select(Subject).where(Subject.code.in_(codes))
        )
        return {row.code: row for row in rows}

    def _save_subject(
        self,
        code: str,
        item: sigaa_client.Subject,
        subjects: dict[str, Subject],
        unities: Mapping[str, int],
    ) -> None:
        subject = subjects.get(code)
        if subject is None:
            subject = subjects[code] = Subject(code=code)
            self._session.add(subject)

        subject.name = item.name
        subject.hours = item.hours or subject.hours
        # A unidade ofertante do seed vale mais que o palpite pelo prefixo do local.
        subject.unity_id = subject.unity_id or unities.get(item.unity or "")

    async def _save_classroom(
        self,
        key: _ClassroomKey,
        item: sigaa_client.Classroom,
        classroom: Classroom | None,
        subjects: dict[str, Subject],
        unities: Mapping[str, int],
    ) -> Classroom:
        code, number, semester = key
        self._save_subject(code, item.subject, subjects, unities)
        if classroom is None:
            # O id vem antes do flush: o vínculo aponta para ele.
            classroom = Classroom(
                id=uuid4(), subject_code=code, number=number, semester=semester
            )
            self._session.add(classroom)

        # A turma é compartilhada: quem vê só o histórico não apaga a sala que o
        # portal de outro aluno trouxe.
        classroom.sigaa_id = item.sigaa_id or classroom.sigaa_id
        schedule = item.schedule or classroom.schedule
        if schedule != classroom.schedule:
            await self._lessons.reset(classroom)
        classroom.schedule = schedule
        classroom.room = item.room or classroom.room

        return classroom

    async def _member_users(
        self, members: Sequence[sigaa_client.ClassroomMember]
    ) -> _UserIndex:
        registrations = {m.registration for m in members if m.registration}
        person_ids = {m.person_id for m in members if m.person_id is not None}
        emails = {m.email for m in members if m.email}
        index = _UserIndex()
        for condition in (
            User.registration.in_(registrations),
            User.person_id.in_(person_ids),
            User.email.in_(emails) & USER_WITHOUT_IDS,
        ):
            for user in await self._session.scalars(select(User).where(condition)):
                index.add(user)
        return index

    def _save_member(
        self,
        member: sigaa_client.ClassroomMember,
        users: _UserIndex,
        known: Sequence[User],
        courses: Mapping[tuple[str, str], int],
    ) -> User:
        user = None
        if member.registration is not None:
            user = users.by_registration.get(member.registration)
        person_owner = None
        if member.person_id is not None and (user is None or user.person_id is None):
            person_owner = users.by_person_id.get(member.person_id)
            user = user or person_owner
        # Quem foi visto antes só pelo email ganha os ids quando eles aparecem.
        if user is None and member.email is not None:
            user = users.by_email.get(member.email)
        if user is None and member.email is None and _without_ids(member):
            # Sem id nem email, só dá para reconhecer quem já estava nesta turma.
            user = next((u for u in known if _anonymous(u, member.name)), None)
        if user is None:
            # O id é gerado aqui porque o vínculo precisa dele antes do flush.
            user = User(id=uuid4(), name=member.name)
            self._session.add(user)

        users.discard(user)
        # O perfil de quem já logou é mais confiável: só completa o que falta.
        shadow = user.profile_synced_at is None
        if shadow:
            user.name = member.name
        for field in ("photo", "email"):
            value = getattr(member, field)
            if value is not None and (shadow or getattr(user, field) is None):
                setattr(user, field, value)
        course_id = courses.get((member.course or "", member.unity or ""))
        if course_id is not None and (shadow or user.course_id is None):
            user.course_id = course_id
        user.registration = user.registration or member.registration
        # O `idPessoa` pode já ser de outro usuário, achado antes só por ele.
        if person_owner is None or person_owner is user:
            user.person_id = user.person_id or member.person_id
        users.add(user)

        return user


class LessonRepository:
    """As aulas da turma, criadas uma vez pelo horário e calendário."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def plan(
        self, classrooms: Collection[Classroom], created_at: datetime
    ) -> None:
        """Cria as aulas das turmas que ainda não as têm; as excluídas não voltam."""
        plans = {
            classroom.id: (classroom, planned)
            for classroom in classrooms
            if classroom.lessons_created_at is None
            and (
                planned := Timetable.parse(classroom.schedule).plan(
                    academic_calendar.class_days(classroom.semester)
                )
            )
        }
        if not plans:
            return
        # Aulas que o SIGAA publicou antes do plano entram nele.
        published = {
            (lesson.classroom_id, lesson.occurred_on, lesson.start_time): lesson
            for lesson in await self._session.scalars(
                select(Lesson).where(Lesson.classroom_id.in_(plans))
            )
        }
        for classroom, planned in plans.values():
            for day, period in planned:
                lesson = published.get((classroom.id, day, period.start))
                if lesson is None:
                    lesson = _new_lesson(classroom.id, day, period)
                    self._session.add(lesson)
                lesson.scheduled = True
            classroom.lessons_created_at = created_at

    async def reset(self, classroom: Classroom) -> None:
        """Apaga as aulas para um novo plano, se nenhuma tem a situação de um aluno."""
        if classroom.lessons_created_at is None:
            return
        lessons = select(Lesson.id).where(Lesson.classroom_id == classroom.id)
        if await self._session.scalar(
            select(exists().where(LessonAttendance.lesson_id.in_(lessons)))
        ):
            return
        await self._session.execute(
            delete(Lesson).where(Lesson.classroom_id == classroom.id)
        )
        classroom.lessons_created_at = None


class NewsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_by_classroom(self, classroom_id: UUID) -> list[ClassroomNews]:
        return list(
            await self._session.scalars(
                select(ClassroomNews)
                .where(ClassroomNews.classroom_id == classroom_id)
                .order_by(
                    ClassroomNews.published_on.desc(), ClassroomNews.sigaa_id.desc()
                )
            )
        )

    async def get(self, classroom_id: UUID, news_id: int) -> ClassroomNews | None:
        return await self._session.scalar(
            select(ClassroomNews).where(
                ClassroomNews.classroom_id == classroom_id,
                ClassroomNews.sigaa_id == news_id,
            )
        )

    async def save_list(
        self, classroom_id: UUID, news: Sequence[sigaa_client.News], synced_at: datetime
    ) -> None:
        existing = {
            item.sigaa_id: item for item in await self.list_by_classroom(classroom_id)
        }
        for item in news:
            assert item.id is not None
            cached = existing.get(item.id)
            if cached is None:
                cached = ClassroomNews(classroom_id=classroom_id, sigaa_id=item.id)
                self._session.add(cached)
                existing[item.id] = cached
            cached.title = item.title
            cached.published_on = item.published_on
        # A lista pode estar vazia; notícias antigas e seus conteúdos são preservados.
        classroom = await self._session.get_one(Classroom, classroom_id)
        classroom.news_synced_at = synced_at
        await self._session.flush()

    async def save_content(
        self, classroom_id: UUID, news: sigaa_client.News, synced_at: datetime
    ) -> None:
        assert news.id is not None
        cached = await self.get(classroom_id, news.id)
        if cached is None:
            cached = ClassroomNews(classroom_id=classroom_id, sigaa_id=news.id)
            self._session.add(cached)
        cached.title = news.title
        cached.published_on = news.published_on
        cached.published_at = news.published_at
        cached.content = news.content
        cached.attachments = [
            attachment.model_dump(mode="json") for attachment in news.attachments
        ]
        cached.content_synced_at = synced_at
        await self._session.flush()


class FrequencyRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_summary(
        self, classroom_participant_id: UUID
    ) -> tuple[FrequencySummary, datetime] | None:
        """O resumo da frequência do vínculo e quando foi sincronizado."""
        link = await self._session.get(ClassroomParticipant, classroom_participant_id)
        if link is None or link.frequency_synced_at is None:
            return None
        summary = FrequencySummary(
            progress=sigaa_client.ClassroomProgress(
                taught=link.progress_taught,
                total=link.progress_total,
                percentage=link.progress_percentage,
            ),
            frequency_status=link.frequency_status,
            attended=link.attended_hours,
            registered=link.registered_hours,
        )
        return summary, link.frequency_synced_at

    async def get_lesson(self, classroom_id: UUID, lesson_id: UUID) -> Lesson | None:
        lesson = await self._session.get(Lesson, lesson_id)
        return lesson if lesson and lesson.classroom_id == classroom_id else None

    async def list_lessons(
        self, participants: Collection[ClassroomParticipant]
    ) -> dict[UUID, list[tuple[Lesson, LessonAttendance | None]]]:
        """As aulas de cada turma com a situação do participante, inclusive das sem aula."""
        lessons: dict[UUID, list[tuple[Lesson, LessonAttendance | None]]] = {
            participant.classroom_id: [] for participant in participants
        }
        rows = await self._session.execute(
            select(Lesson, LessonAttendance)
            .outerjoin(
                LessonAttendance,
                (LessonAttendance.lesson_id == Lesson.id)
                & LessonAttendance.classroom_participant_id.in_(
                    [participant.id for participant in participants]
                ),
            )
            .where(Lesson.classroom_id.in_(lessons))
        )
        for lesson, attendance in rows:
            lessons[lesson.classroom_id].append((lesson, attendance))
        return lessons

    async def save(
        self,
        classroom_participant_id: UUID,
        frequency: sigaa_client.ClassroomFrequency,
        timetable: Timetable,
        synced_at: datetime,
    ) -> None:
        """Grava a chamada do SIGAA nas aulas da turma e o resumo do aluno."""
        link = await self._session.get_one(
            ClassroomParticipant, classroom_participant_id
        )
        attendance = frequency.frequency
        lessons = await self._lessons_by_day(link.classroom_id)
        entries = self._match(
            link.classroom_id,
            lessons,
            attendance.entries if attendance else (),
            timetable,
        )
        await self._save_attendances(
            link.id, [lesson for day in lessons.values() for lesson in day], entries
        )
        await self._drop_unpublished(lessons, entries)

        summary = FrequencySummary.of(frequency)
        link.frequency_status = summary.frequency_status
        link.progress_taught = summary.progress.taught
        link.progress_total = summary.progress.total
        link.progress_percentage = summary.progress.percentage
        link.attended_hours = summary.attended
        link.registered_hours = summary.registered
        link.frequency_synced_at = synced_at
        await self._session.flush()

    async def save_mark(
        self, participant_id: UUID, lesson_id: UUID, status: LessonStatus
    ) -> bool:
        """`False` se o SIGAA já registrou a aula: a chamada não é sobrescrita."""
        attendance = await self._attendance(participant_id, lesson_id)
        if attendance is None:
            attendance = LessonAttendance(
                classroom_participant_id=participant_id, lesson_id=lesson_id
            )
            self._session.add(attendance)
        elif not attendance.marked:
            return False
        attendance.status = status
        attendance.marked = True
        attendance.absences = None
        await self._session.flush()
        return True

    async def delete_mark(self, participant_id: UUID, lesson_id: UUID) -> None:
        await self._session.execute(
            delete(LessonAttendance).where(
                LessonAttendance.classroom_participant_id == participant_id,
                LessonAttendance.lesson_id == lesson_id,
                LessonAttendance.marked.is_(True),
            )
        )

    async def _attendance(
        self, participant_id: UUID, lesson_id: UUID
    ) -> LessonAttendance | None:
        return await self._session.scalar(
            select(LessonAttendance).where(
                LessonAttendance.classroom_participant_id == participant_id,
                LessonAttendance.lesson_id == lesson_id,
            )
        )

    async def _lessons_by_day(self, classroom_id: UUID) -> dict[date, list[Lesson]]:
        lessons: dict[date, list[Lesson]] = {}
        rows = await self._session.scalars(
            select(Lesson).where(Lesson.classroom_id == classroom_id)
        )
        for lesson in sorted(rows, key=lesson_order):
            lessons.setdefault(lesson.occurred_on, []).append(lesson)
        return lessons

    def _match(
        self,
        classroom_id: UUID,
        lessons: dict[date, list[Lesson]],
        entries: Sequence[sigaa_client.AttendanceEntry],
        timetable: Timetable,
    ) -> dict[UUID, sigaa_client.AttendanceEntry]:
        """Cada entrada do SIGAA vai para a aula na mesma ordem do dia; sem ela, uma nova."""
        matched: dict[UUID, sigaa_client.AttendanceEntry] = {}
        for (day, position), entry in positioned(entries):
            day_lessons = lessons.setdefault(day, [])
            if position >= len(day_lessons):
                period = timetable.period(day, position)
                # O horário já usado no dia fica para a aula do plano.
                if period and period.start in {
                    other.start_time for other in day_lessons
                }:
                    period = None
                # Uma só aula sem horário por dia: as demais entradas ficam de fora.
                if period is None and any(
                    other.start_time is None for other in day_lessons
                ):
                    continue
                lesson = _new_lesson(classroom_id, day, period, scheduled=False)
                self._session.add(lesson)
                day_lessons.append(lesson)
            matched[day_lessons[position].id] = entry
        return matched

    async def _drop_unpublished(
        self,
        lessons: Mapping[date, Sequence[Lesson]],
        entries: Mapping[UUID, sigaa_client.AttendanceEntry],
    ) -> None:
        """Aulas fora do plano que o SIGAA retirou e ninguém tem situação nelas."""
        dropped = [
            lesson.id
            for day in lessons.values()
            for lesson in day
            if not lesson.scheduled and lesson.id not in entries
        ]
        if not dropped:
            return
        await self._session.flush()
        await self._session.execute(
            delete(Lesson).where(
                Lesson.id.in_(dropped),
                ~exists().where(LessonAttendance.lesson_id == Lesson.id),
            )
        )

    async def _save_attendances(
        self,
        participant_id: UUID,
        lessons: Sequence[Lesson],
        entries: Mapping[UUID, sigaa_client.AttendanceEntry],
    ) -> None:
        """A chamada do SIGAA substitui a marcação; sem ela, só a marcação fica."""
        attendances = {
            attendance.lesson_id: attendance
            for attendance in await self._session.scalars(
                select(LessonAttendance).where(
                    LessonAttendance.classroom_participant_id == participant_id,
                    LessonAttendance.lesson_id.in_([lesson.id for lesson in lessons]),
                )
            )
        }
        stale: list[UUID] = []
        for lesson in lessons:
            entry = entries.get(lesson.id)
            attendance = attendances.get(lesson.id)
            if entry is None or entry.status is AttendanceStatus.NAO_REGISTRADA:
                if attendance is not None and not attendance.marked:
                    stale.append(attendance.id)
                continue
            if attendance is None:
                attendance = LessonAttendance(
                    classroom_participant_id=participant_id, lesson_id=lesson.id
                )
                self._session.add(attendance)
            attendance.status = LessonStatus(entry.status.value)
            attendance.marked = False
            attendance.absences = entry.absences
        if stale:
            await self._session.execute(
                delete(LessonAttendance).where(LessonAttendance.id.in_(stale))
            )


def _new_lesson(
    classroom_id: UUID, day: date, period: Period | None, *, scheduled: bool = True
) -> Lesson:
    # O id vem antes do flush: a chamada do SIGAA aponta para ele.
    return Lesson(
        id=uuid4(),
        classroom_id=classroom_id,
        occurred_on=day,
        start_time=period.start if period else None,
        end_time=period.end if period else None,
        scheduled=scheduled,
    )


# A turma pelo componente, número e semestre.
type _ClassroomKey = tuple[str, str, str]


def _classroom_key(item: sigaa_client.Classroom) -> _ClassroomKey | None:
    # Turma só do portal vem sem número nem código: gravá-la duplicaria a do histórico.
    if not item.number or item.subject.code is None:
        return None
    return item.subject.code, item.number, item.semester


class _UserIndex:
    """Usuários por identidade, espelhando as consultas que o banco responderia."""

    def __init__(self) -> None:
        self.by_registration: dict[str, User] = {}
        self.by_person_id: dict[int, User] = {}
        self.by_email: dict[str, User] = {}

    def _keys(self, user: User) -> list[tuple[dict, object]]:
        keys: list[tuple[dict, object]] = [
            (self.by_registration, user.registration),
            (self.by_person_id, user.person_id),
        ]
        if user.registration is None and user.person_id is None:
            keys.append((self.by_email, user.email))
        return [(index, key) for index, key in keys if key is not None]

    def add(self, user: User) -> None:
        for index, key in self._keys(user):
            index[key] = user

    def discard(self, user: User) -> None:
        for index, key in self._keys(user):
            if index.get(key) is user:
                del index[key]


def _without_ids(member: sigaa_client.ClassroomMember) -> bool:
    return member.registration is None and member.person_id is None


def _anonymous(user: User, name: str) -> bool:
    return (
        user.name == name
        and user.registration is None
        and user.person_id is None
        and user.email is None
    )
