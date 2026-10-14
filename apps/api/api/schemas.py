from pydantic import BaseModel, ConfigDict, Field


class UserSubject(BaseModel):
    """O componente como o cache guarda, pelo código."""

    model_config = ConfigDict(frozen=True)

    code: str
    name: str
    hours: int | None = None
    unity: str | None = None


class ClassroomOffer(BaseModel):
    """Docentes e vagas da turma, como o último seed os gravou."""

    professors: tuple[str, ...] = ()
    vacancies: int | None = Field(
        default=None, description="Vagas na coleta do seed, não em tempo real."
    )
    occupied: int | None = Field(
        default=None, description="Ocupação na coleta do seed, não em tempo real."
    )
