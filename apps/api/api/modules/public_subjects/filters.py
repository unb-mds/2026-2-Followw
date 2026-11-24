from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, model_validator

from api.modules.public_classrooms.code import ClassroomCode
from api.modules.public_subjects.schedule_search import ScheduleFilter
from api.schemas import SearchText, UnitFilter

SubjectKind = Literal["mandatory", "optional", "free"]
type WorkloadFilter = Annotated[int, Field(gt=0, le=32767)] | Literal["90+"]
type ClockTime = Annotated[
    str, StringConstraints(pattern=r"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")
]


class SubjectFilters(BaseModel):
    q: SearchText | None = Field(
        None,
        description="Código, nome da matéria, docente, unidade ou horário do SIGAA. Códigos completos também buscam equivalências.",
    )
    code: ClassroomCode | None = Field(None, description="Código completo da matéria.")
    unit: UnitFilter | None = Field(
        None, description="ID ou sigla da unidade responsável."
    )
    days: str | None = Field(
        None,
        pattern=r"^[0-6]{1,7}$",
        description="Turmas com aula em algum destes dias, de segunda (0) a domingo (6).",
    )
    start: list[ClockTime] | None = Field(
        None, description="Turmas com aula começando em algum destes horários."
    )
    hours: list[WorkloadFilter] | None = Field(
        None,
        description="Cargas horárias exatas ou 90+ para cargas de 90 horas ou mais.",
    )
    kind: list[SubjectKind] | None = Field(
        None, description="Tipos da matéria na matriz do aluno autenticado."
    )
    semester: str | None = Field(
        None, pattern=r"^[0-9]{4}\.[0-9]$", description="Semestre das turmas."
    )
    offered: bool = Field(
        False, description="Somente matérias com turma no semestre, inclusive cheias."
    )
    page: int = Field(1, ge=1)

    @model_validator(mode="after")
    def _require_criteria(self) -> SubjectFilters:
        criteria = (
            self.q,
            self.code,
            self.unit,
            self.days,
            self.start,
            self.hours,
            self.kind,
            self.offered,
        )
        if not any(criteria):
            raise ValueError("Informe `q`, `code`, `unit` ou algum filtro.")
        return self

    def schedule(self) -> ScheduleFilter | None:
        if not (self.days or self.start):
            return None
        return ScheduleFilter.from_params(self.start or (), self.days or "")
