import datetime as dt
import uuid
from dataclasses import dataclass
from datetime import datetime

from sigaa_client import FrequencyStatus, Grade, PostType
from sqlalchemy import (
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    SmallInteger,
    Text,
    UniqueConstraint,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from api.db.enums import ClassroomRole, ClassroomStatus, LessonStatus, UserLevel

type Requirements = list[list[str]]


def _enum(enum: type, name: str) -> SAEnum:
    return SAEnum(enum, name=name, values_callable=lambda e: [m.value for m in e])


class Unity(Base, TimestampMixin):
    """Unidade acadêmica: o `id` é o do SIGAA e o `code` a sigla (ex.: FCTE)."""

    __tablename__ = "unities"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    code: Mapped[str | None] = mapped_column(unique=True)
    name: Mapped[str] = mapped_column()


class Course(Base, TimestampMixin):
    """Curso de uma unidade; `sigaa_id` é nulo nos criados pelo sync, fora da lista do SIGAA."""

    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(primary_key=True)
    sigaa_id: Mapped[int | None] = mapped_column(unique=True)
    name: Mapped[str] = mapped_column()
    shift: Mapped[str | None] = mapped_column()
    unity_id: Mapped[int] = mapped_column(ForeignKey("unities.id"))

    unity: Mapped[Unity] = relationship(lazy="joined")


# Um só curso criado pelo sync por nome e unidade, mesmo com dois syncs ao mesmo tempo.
COURSE_WITHOUT_SIGAA_ID = Course.sigaa_id.is_(None)
Index(
    "uq_course_without_sigaa_id",
    Course.unity_id,
    Course.name,
    unique=True,
    postgresql_where=COURSE_WITHOUT_SIGAA_ID,
)


class Curriculum(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "curricula"
    __table_args__ = (
        UniqueConstraint("course_id", "sigaa_id", name="uq_curriculum_course_sigaa"),
        Index("ix_curriculum_course_valid_from", "course_id", "valid_from"),
    )

    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"))
    sigaa_id: Mapped[int] = mapped_column()
    code: Mapped[str] = mapped_column()
    valid_from: Mapped[str] = mapped_column()
    created_year: Mapped[int] = mapped_column(SmallInteger)
    active: Mapped[bool] = mapped_column()
    shift: Mapped[str | None] = mapped_column()
    matrix: Mapped[str] = mapped_column()

    course: Mapped[Course] = relationship()


class CurriculumComponent(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "curriculum_components"
    __table_args__ = (
        UniqueConstraint(
            "curriculum_id",
            "subject_code",
            "kind",
            "period",
            name="uq_curriculum_component",
        ),
        Index("ix_curriculum_component_period", "curriculum_id", "period"),
    )

    curriculum_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("curricula.id"))
    subject_code: Mapped[str] = mapped_column()
    period: Mapped[int | None] = mapped_column(SmallInteger)
    kind: Mapped[str] = mapped_column()


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "users"

    name: Mapped[str] = mapped_column()
    registration: Mapped[str | None] = mapped_column(unique=True)
    # Quem troca de curso segue logando no CAS com a matrícula antiga.
    old_registration: Mapped[str | None] = mapped_column(unique=True)
    # `idPessoa` do SIGAA: único identificador dos docentes na lista de participantes.
    person_id: Mapped[int | None] = mapped_column(unique=True)
    photo: Mapped[str | None] = mapped_column()
    email: Mapped[str | None] = mapped_column()
    bio: Mapped[str | None] = mapped_column(Text)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"))
    # Matriz estimada no sync do perfil; só zera se o curso mudar.
    curriculum_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("curricula.id", ondelete="SET NULL")
    )
    entry_semester: Mapped[str | None] = mapped_column()
    integralization: Mapped[int | None] = mapped_column(SmallInteger)
    workload: Mapped[dict[str, int] | None] = mapped_column(JSONB)
    ira: Mapped[float | None] = mapped_column()
    mp: Mapped[float | None] = mapped_column()
    level: Mapped[UserLevel | None] = mapped_column(_enum(UserLevel, "user_level"))
    registered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    profile_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    classrooms_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    # Do relatório com as menções de todos os semestres; zera com turma nova na lista.
    grades_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    settings: Mapped[dict[str, object]] = mapped_column(JSONB, default=dict)

    course: Mapped[Course | None] = relationship(lazy="joined")
    classroom_links: Mapped[list[ClassroomParticipant]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Professor(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "professors"

    siape: Mapped[int] = mapped_column(unique=True)
    name: Mapped[str] = mapped_column()
    unity_id: Mapped[int] = mapped_column(ForeignKey("unities.id"))
    photo: Mapped[str | None] = mapped_column()
    description: Mapped[str | None] = mapped_column(Text)
    education: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB)
    interests: Mapped[str | None] = mapped_column(Text)
    lattes: Mapped[str | None] = mapped_column()
    email: Mapped[str | None] = mapped_column()
    disciplines: Mapped[list[dict[str, object]]] = mapped_column(JSONB, default=list)

    unity: Mapped[Unity] = relationship(lazy="joined")


# Docentes chegam sem matrícula nem `idPessoa`: aí o email é a identidade.
USER_WITHOUT_IDS = User.registration.is_(None) & User.person_id.is_(None)
Index(
    "uq_user_email_without_ids",
    User.email,
    unique=True,
    postgresql_where=USER_WITHOUT_IDS,
)


class Subject(Base, TimestampMixin):
    __tablename__ = "subjects"

    code: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column()
    hours: Mapped[int | None] = mapped_column(SmallInteger)
    unity_id: Mapped[int | None] = mapped_column(ForeignKey("unities.id"))
    # Expressões em OU de Es: `[["A", "B"], ["C"]]` é `(A E B) OU C`.
    prerequisites: Mapped[Requirements | None] = mapped_column(JSONB)
    corequisites: Mapped[Requirements | None] = mapped_column(JSONB)
    equivalences: Mapped[Requirements | None] = mapped_column(JSONB)

    unity: Mapped[Unity | None] = relationship(lazy="joined")
    classrooms: Mapped[list[Classroom]] = relationship(back_populates="subject")


class Classroom(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "classrooms"
    __table_args__ = (
        UniqueConstraint(
            "subject_code", "number", "semester", name="uq_classroom_subject_number"
        ),
    )

    sigaa_id: Mapped[int | None] = mapped_column()
    number: Mapped[str] = mapped_column()
    semester: Mapped[str] = mapped_column()
    schedule: Mapped[str | None] = mapped_column()
    room: Mapped[str | None] = mapped_column()
    # Docentes, vagas e ocupação vêm da busca pública, pelo seed.
    professors: Mapped[list[str]] = mapped_column(JSONB, default=list)
    vacancies: Mapped[int | None] = mapped_column(SmallInteger)
    occupied: Mapped[int | None] = mapped_column(SmallInteger)
    enrollment_requests: Mapped[int | None] = mapped_column(SmallInteger)
    reenrollment_requests: Mapped[int | None] = mapped_column(SmallInteger)
    subject_code: Mapped[str] = mapped_column(ForeignKey("subjects.code"))
    members_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    posts_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    statistics: Mapped[list[dict[str, object]] | None] = mapped_column(
        JSONB, deferred=True
    )
    statistics_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    # As aulas pelo horário e calendário são criadas uma vez, no sync de um aluno.
    lessons_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # "Andamento das Aulas", lido na frequência de qualquer aluno da turma.
    progress_taught: Mapped[int | None] = mapped_column(SmallInteger)
    progress_total: Mapped[int | None] = mapped_column(SmallInteger)
    progress_percentage: Mapped[int | None] = mapped_column(SmallInteger)

    subject: Mapped[Subject] = relationship(back_populates="classrooms")
    participant_links: Mapped[list[ClassroomParticipant]] = relationship(
        back_populates="classroom", cascade="all, delete-orphan"
    )


class ClassroomParticipant(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "classroom_participants"
    __table_args__ = (
        UniqueConstraint("user_id", "classroom_id", name="uq_classroom_participant"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE")
    )
    classroom_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("classrooms.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[ClassroomRole] = mapped_column(_enum(ClassroomRole, "classroom_role"))
    status: Mapped[ClassroomStatus | None] = mapped_column(
        _enum(ClassroomStatus, "classroom_status")
    )
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    grade: Mapped[Grade | None] = mapped_column(_enum(Grade, "classroom_grade"))
    # `frontEndIdTurma` visto pelo próprio usuário: só existe nos vínculos que
    # vieram da lista de turmas dele, não da lista de participantes.
    front_end_id: Mapped[str | None] = mapped_column()
    current: Mapped[bool] = mapped_column(default=False)
    # Aparece na lista de participantes da turma.
    member: Mapped[bool] = mapped_column(default=False)
    # O resumo da tela de frequência do SIGAA; as aulas ficam em `lesson_attendances`.
    frequency_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    frequency_status: Mapped[FrequencyStatus | None] = mapped_column(
        _enum(FrequencyStatus, "frequency_status")
    )

    user: Mapped[User] = relationship(back_populates="classroom_links")
    classroom: Mapped[Classroom] = relationship(back_populates="participant_links")


@dataclass(frozen=True)
class OwnLink:
    """Um vínculo da lista de turmas do próprio usuário: o SIGAA abre a turma pelo `front_end_id`."""

    row: ClassroomParticipant
    front_end_id: str

    @classmethod
    def of(cls, row: ClassroomParticipant) -> OwnLink:
        assert row.front_end_id is not None, "vínculo fora da lista do usuário"
        return cls(row, row.front_end_id)


class Lesson(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Uma aula da turma, prevista pelo horário e calendário ou publicada pelo SIGAA."""

    __tablename__ = "lessons"
    __table_args__ = (
        # Uma só aula sem horário por dia.
        UniqueConstraint(
            "classroom_id",
            "occurred_on",
            "start_time",
            name="uq_lesson",
            postgresql_nulls_not_distinct=True,
        ),
    )

    classroom_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("classrooms.id", ondelete="CASCADE")
    )
    occurred_on: Mapped[dt.date] = mapped_column()
    # Horário de Brasília; vazio só na aula que o SIGAA publicou numa turma sem horário.
    start_time: Mapped[dt.time | None] = mapped_column()
    end_time: Mapped[dt.time | None] = mapped_column()
    # Está no plano; as demais o SIGAA publicou fora dele (ex.: reposição).
    scheduled: Mapped[bool] = mapped_column()


class LessonAttendance(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """A situação do aluno na aula: a chamada do SIGAA ou, sem ela, a que ele marcou."""

    __tablename__ = "lesson_attendances"
    __table_args__ = (
        UniqueConstraint(
            "classroom_participant_id", "lesson_id", name="uq_lesson_attendance"
        ),
    )

    classroom_participant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("classroom_participants.id", ondelete="CASCADE")
    )
    lesson_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lessons.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[LessonStatus] = mapped_column(_enum(LessonStatus, "lesson_status"))
    marked: Mapped[bool] = mapped_column()
    # Horas-aula de falta pela chamada do SIGAA; a falta marcada conta a aula toda.
    absences: Mapped[int | None] = mapped_column(SmallInteger)


class ClassroomPosts(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "classroom_posts"
    __table_args__ = (
        UniqueConstraint("classroom_id", "source_id", name="uq_classroom_post_source"),
        ForeignKeyConstraint(
            ["classroom_id", "topic_id"],
            ["classroom_posts.classroom_id", "classroom_posts.source_id"],
        ),
    )

    classroom_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("classrooms.id", ondelete="CASCADE")
    )
    source_id: Mapped[str] = mapped_column()
    type: Mapped[PostType] = mapped_column(_enum(PostType, "post_type"))
    sigaa_id: Mapped[str | None] = mapped_column()
    topic_id: Mapped[str | None] = mapped_column()
    title: Mapped[str] = mapped_column()
    published_on: Mapped[dt.date | None] = mapped_column()
    published_at: Mapped[datetime | None] = mapped_column()
    starts_on: Mapped[dt.date | None] = mapped_column()
    ends_on: Mapped[dt.date | None] = mapped_column()
    starts_at: Mapped[datetime | None] = mapped_column()
    time_label: Mapped[str | None] = mapped_column()
    url: Mapped[str | None] = mapped_column()
    content: Mapped[str | None] = mapped_column(Text)
    attachments: Mapped[list[dict[str, str]]] = mapped_column(JSONB, default=list)
    content_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RestaurantMenu(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "restaurant_menus"
    __table_args__ = (
        UniqueConstraint("campus", "date", name="uq_restaurant_menu_campus_date"),
    )

    campus: Mapped[str] = mapped_column()
    date: Mapped[dt.date] = mapped_column()
    breakfast: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB)
    lunch: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB)
    dinner: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
