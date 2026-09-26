import datetime as dt
import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Text, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from api.db.enums import ClassroomRole, ClassroomStatus, StudentSituation, UserLevel


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
    ira: Mapped[float | None] = mapped_column()
    mp: Mapped[float | None] = mapped_column()
    level: Mapped[UserLevel | None] = mapped_column(_enum(UserLevel, "user_level"))
    profile_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    classrooms_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )

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


class Subject(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "subjects"

    code: Mapped[str | None] = mapped_column(unique=True)
    sigaa_id: Mapped[int | None] = mapped_column()
    name: Mapped[str] = mapped_column()
    hours: Mapped[int | None] = mapped_column()
    unity: Mapped[str | None] = mapped_column()

    classrooms: Mapped[list[Classroom]] = relationship(back_populates="subject")


class Classroom(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "classrooms"
    __table_args__ = (
        UniqueConstraint(
            "subject_id", "number", "semester", name="uq_classroom_subject_number"
        ),
    )

    sigaa_id: Mapped[int | None] = mapped_column()
    number: Mapped[str] = mapped_column()
    semester: Mapped[str] = mapped_column()
    schedule: Mapped[str | None] = mapped_column()
    room: Mapped[str | None] = mapped_column()
    subject_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("subjects.id"))
    members_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    statistics_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )

    subject: Mapped[Subject] = relationship(back_populates="classrooms")
    user_links: Mapped[list[ClassroomUser]] = relationship(
        back_populates="classroom", cascade="all, delete-orphan"
    )
    statistics: Mapped[list[ClassroomStatistic]] = relationship(
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
    # `frontEndIdTurma` visto pelo próprio usuário: só existe nos vínculos que
    # vieram da lista de turmas dele, não da lista de participantes.
    front_end_id: Mapped[str | None] = mapped_column()
    current: Mapped[bool] = mapped_column(default=False)
    # Aparece na lista de participantes da turma.
    member: Mapped[bool] = mapped_column(default=False)

    user: Mapped[User] = relationship(back_populates="classroom_links")
    classroom: Mapped[Classroom] = relationship(back_populates="user_links")


class ClassroomStatistic(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "classroom_statistics"
    __table_args__ = (
        UniqueConstraint(
            "classroom_id", "situation", name="uq_classroom_statistic_situation"
        ),
    )

    classroom_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("classrooms.id", ondelete="CASCADE")
    )
    situation: Mapped[StudentSituation] = mapped_column(
        _enum(StudentSituation, "student_situation")
    )
    percentage: Mapped[float] = mapped_column()

    classroom: Mapped[Classroom] = relationship(back_populates="statistics")


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
