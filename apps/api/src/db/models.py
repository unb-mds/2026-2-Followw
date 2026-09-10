import uuid

from sqlalchemy import Enum as SAEnum
from sqlalchemy import ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from src.db.enums import ClassroomRole, ClassroomStatus, UserLevel


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "users"

    name: Mapped[str] = mapped_column()
    registration: Mapped[str] = mapped_column(unique=True)
    photo: Mapped[str | None] = mapped_column()
    email: Mapped[str] = mapped_column(unique=True)
    bio: Mapped[str | None] = mapped_column(Text)
    unity: Mapped[str] = mapped_column()
    course: Mapped[str] = mapped_column()
    integralization: Mapped[int | None] = mapped_column()
    level: Mapped[UserLevel] = mapped_column(
        SAEnum(
            UserLevel, name="user_level", values_callable=lambda e: [m.value for m in e]
        )
    )

    classroom_links: Mapped[list[ClassroomUser]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Subject(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "subjects"

    name: Mapped[str] = mapped_column()
    hours: Mapped[int] = mapped_column()
    unity: Mapped[str] = mapped_column()

    classrooms: Mapped[list[Classroom]] = relationship(back_populates="subject")


class Classroom(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "classrooms"

    number: Mapped[str] = mapped_column()
    schedule: Mapped[str] = mapped_column()
    room: Mapped[str | None] = mapped_column()
    subject_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("subjects.id"))

    subject: Mapped[Subject] = relationship(back_populates="classrooms")
    user_links: Mapped[list[ClassroomUser]] = relationship(
        back_populates="classroom", cascade="all, delete-orphan"
    )


class ClassroomUser(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "user_classrooms"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "classroom_id", "semester", name="uq_user_classroom_semester"
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE")
    )
    classroom_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("classrooms.id", ondelete="CASCADE")
    )
    role: Mapped[ClassroomRole] = mapped_column(
        SAEnum(
            ClassroomRole,
            name="classroom_role",
            values_callable=lambda e: [m.value for m in e],
        )
    )
    semester: Mapped[str] = mapped_column()
    status: Mapped[ClassroomStatus] = mapped_column(
        SAEnum(
            ClassroomStatus,
            name="classroom_status",
            values_callable=lambda e: [m.value for m in e],
        )
    )

    user: Mapped[User] = relationship(back_populates="classroom_links")
    classroom: Mapped[Classroom] = relationship(back_populates="user_links")
