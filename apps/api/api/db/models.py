import datetime as dt
import uuid
from dataclasses import dataclass
from datetime import datetime

from sigaa_client import FrequencyStatus, Grade
from sqlalchemy import JSON, DateTime, ForeignKey, Index, Text, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from api.db.enums import (
    ClassroomRole,
    ClassroomStatus,
    LessonMarkStatus,
    UserLevel,
)


def _enum(enum: type, name: str) -> SAEnum:
    return SAEnum(enum, name=name, values_callable=lambda e: [m.value for m in e])


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "users"

    name: Mapped[str] = mapped_column()
    registration: Mapped[str | None] = mapped_column(unique=True)
    # `idPessoa` do SIGAA: único identificador dos docentes na lista de participantes.
    person_id: Mapped[int | None] = mapped_column(unique=True)
    photo: Mapped[str | None] = mapped_column()
    email: Mapped[str | None] = mapped_column()
    bio: Mapped[str | None] = mapped_column(Text)
    unity: Mapped[str | None] = mapped_column()
    course: Mapped[str | None] = mapped_column()
    integralization: Mapped[int | None] = mapped_column()
    workload: Mapped[dict[str, int] | None] = mapped_column(JSON)
    ira: Mapped[float | None] = mapped_column()
    mp: Mapped[float | None] = mapped_column()
    level: Mapped[UserLevel | None] = mapped_column(_enum(UserLevel, "user_level"))
    profile_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    classrooms_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    settings: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)

    classroom_links: Mapped[list[ClassroomUser]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


# Docentes chegam sem matrícula nem `idPessoa`: aí o email é a identidade.
USER_WITHOUT_IDS = User.registration.is_(None) & User.person_id.is_(None)
Index(
    "uq_user_email_without_ids",
    User.email,
    unique=True,
    postgresql_where=USER_WITHOUT_IDS,
    sqlite_where=USER_WITHOUT_IDS,
)


class Subject(Base, TimestampMixin):
    __tablename__ = "subjects"

    code: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column()
    hours: Mapped[int | None] = mapped_column()
    unity: Mapped[str | None] = mapped_column()

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
    subject_code: Mapped[str] = mapped_column(ForeignKey("subjects.code"))
    members_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    news_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    statistics_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    # Andamento das aulas: é o mesmo para todos os alunos, vem com a frequência.
    progress: Mapped[dict[str, int] | None] = mapped_column(JSON)

    subject: Mapped[Subject] = relationship(back_populates="classrooms")
    user_links: Mapped[list[ClassroomUser]] = relationship(
        back_populates="classroom", cascade="all, delete-orphan"
    )
    statistics: Mapped[ClassroomStatistic | None] = relationship(
        back_populates="classroom", cascade="all, delete-orphan"
    )


class ClassroomUser(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "user_classrooms"
    __table_args__ = (
        UniqueConstraint("user_id", "classroom_id", name="uq_user_classroom"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE")
    )
    classroom_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("classrooms.id", ondelete="CASCADE")
    )
    role: Mapped[ClassroomRole] = mapped_column(_enum(ClassroomRole, "classroom_role"))
    status: Mapped[ClassroomStatus | None] = mapped_column(
        _enum(ClassroomStatus, "classroom_status")
    )
    grade: Mapped[Grade | None] = mapped_column(_enum(Grade, "classroom_grade"))
    grade_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # `frontEndIdTurma` visto pelo próprio usuário: só existe nos vínculos que
    # vieram da lista de turmas dele, não da lista de participantes.
    front_end_id: Mapped[str | None] = mapped_column()
    current: Mapped[bool] = mapped_column(default=False)
    # Aparece na lista de participantes da turma.
    member: Mapped[bool] = mapped_column(default=False)

    user: Mapped[User] = relationship(back_populates="classroom_links")
    classroom: Mapped[Classroom] = relationship(back_populates="user_links")
    frequency_cache: Mapped[ClassroomFrequencyCache | None] = relationship(
        cascade="all, delete-orphan", single_parent=True
    )
    lesson_marks: Mapped[list[LessonMark]] = relationship(cascade="all, delete-orphan")


@dataclass(frozen=True)
class OwnLink:
    """Um vínculo da lista de turmas do próprio usuário: o SIGAA abre a turma pelo `front_end_id`."""

    row: ClassroomUser
    front_end_id: str

    @classmethod
    def of(cls, row: ClassroomUser) -> OwnLink:
        assert row.front_end_id is not None, "vínculo fora da lista do usuário"
        return cls(row, row.front_end_id)


class ClassroomFrequencyCache(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "classroom_frequencies"

    user_classroom_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user_classrooms.id", ondelete="CASCADE"), unique=True
    )
    # `ClassroomAttendance` do SIGAA; `None` enquanto o docente não lança a frequência.
    frequency: Mapped[dict[str, object] | None] = mapped_column(JSON)
    frequency_status: Mapped[FrequencyStatus] = mapped_column(
        _enum(FrequencyStatus, "frequency_status")
    )
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class LessonMark(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Situação de uma aula marcada pelo aluno; a chamada do SIGAA prevalece sobre ela."""

    __tablename__ = "lesson_marks"
    __table_args__ = (
        UniqueConstraint(
            "user_classroom_id", "occurred_on", "position", name="uq_lesson_mark"
        ),
    )

    user_classroom_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user_classrooms.id", ondelete="CASCADE")
    )
    occurred_on: Mapped[dt.date] = mapped_column()
    # Ordem da aula entre as do mesmo dia.
    position: Mapped[int] = mapped_column()
    status: Mapped[LessonMarkStatus] = mapped_column(
        _enum(LessonMarkStatus, "lesson_mark_status")
    )


class ClassroomStatistic(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "classroom_statistics"

    classroom_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("classrooms.id", ondelete="CASCADE"), unique=True
    )
    data: Mapped[list[dict[str, object]]] = mapped_column(JSON)

    classroom: Mapped[Classroom] = relationship(back_populates="statistics")


class ClassroomNews(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "classroom_news"
    __table_args__ = (
        UniqueConstraint("classroom_id", "sigaa_id", name="uq_classroom_news_sigaa_id"),
    )

    classroom_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("classrooms.id", ondelete="CASCADE")
    )
    sigaa_id: Mapped[int] = mapped_column()
    title: Mapped[str] = mapped_column()
    published_on: Mapped[dt.date] = mapped_column()
    published_at: Mapped[datetime | None] = mapped_column()
    content: Mapped[str | None] = mapped_column(Text)
    attachments: Mapped[list[dict[str, str]]] = mapped_column(JSON, default=list)
    content_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RestaurantMenu(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "restaurant_menus"
    __table_args__ = (
        UniqueConstraint("campus", "date", name="uq_restaurant_menu_campus_date"),
    )

    campus: Mapped[str] = mapped_column()
    date: Mapped[dt.date] = mapped_column()
    breakfast: Mapped[list[dict[str, object]] | None] = mapped_column(JSON)
    lunch: Mapped[list[dict[str, object]] | None] = mapped_column(JSON)
    dinner: Mapped[list[dict[str, object]] | None] = mapped_column(JSON)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
