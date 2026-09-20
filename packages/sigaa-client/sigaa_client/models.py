import enum
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, SecretStr


class Credentials(BaseModel):
    model_config = ConfigDict(frozen=True)

    registration: str
    password: SecretStr


class UserLevel(str, enum.Enum):
    GRADUACAO = "Graduação"
    POS_GRADUACAO = "Pós-graduação"
    MESTRADO = "Mestrado"


class RestaurantStatementEntry(BaseModel):
    model_config = ConfigDict(frozen=True)

    occurred_at: datetime
    description: str
    amount: Decimal


class UserProfile(BaseModel):
    model_config = ConfigDict(frozen=True)

    name: str
    registration: str
    photo: str | None
    email: str | None = None
    bio: str | None
    unity: str
    course: str
    integralization: int | None
    level: UserLevel


class ClassroomRole(str, enum.Enum):
    ALUNO = "aluno"
    PROFESSOR = "professor"
    MONITOR = "monitor"


class Subject(BaseModel):
    """Componente curricular, nos campos da tabela `subjects`."""

    model_config = ConfigDict(frozen=True)

    code: str | None = None
    sigaa_id: int | None = None
    name: str
    hours: int | None = None
    unity: str | None = None


class Classroom(BaseModel):
    """Turma, nos campos da tabela `classrooms`.

    `id` é o `frontEndIdTurma` do SIGAA — o único identificador presente tanto
    nas turmas do semestre quanto no histórico. `sigaa_id` é o id numérico
    interno, que só o portal do semestre expõe.
    """

    model_config = ConfigDict(frozen=True)

    id: str
    sigaa_id: int | None = None
    number: str
    semester: str
    schedule: str | None = None
    room: str | None = None
    subject: Subject


class ClassroomMember(BaseModel):
    """Participante de uma turma, nos campos da tabela `users` que a tela expõe."""

    model_config = ConfigDict(frozen=True)

    name: str
    role: ClassroomRole
    registration: str | None = None
    photo: str | None = None
    email: str | None = None
    course: str | None = None
    unity: str | None = None
    person_id: int | None = None


class TeachingLevel(str, enum.Enum):
    """Nível de ensino do filtro da busca pública — o valor é o código do SIGAA."""

    FORMACAO_COMPLEMENTAR = "F"
    GRADUACAO = "G"
    LATO_SENSU = "L"
    RESIDENCIA = "R"
    STRICTO_SENSU = "S"
    MESTRADO = "E"
    DOUTORADO = "D"


class Unit(BaseModel):
    """Unidade acadêmica ofertante — o filtro obrigatório da busca pública."""

    model_config = ConfigDict(frozen=True)

    id: int
    name: str


class Teacher(BaseModel):
    """Docente de uma turma. `hours` é a carga horária dele naquela turma."""

    model_config = ConfigDict(frozen=True)

    name: str
    hours: int | None = None


class PublicClassroom(BaseModel):
    """Turma da busca pública.

    Não tem `id`: a área pública não expõe o `frontEndIdTurma`, então a
    identidade aqui é a chave natural `(subject.code, number, semester)`.
    """

    model_config = ConfigDict(frozen=True)

    number: str
    semester: str
    schedule: str | None = None
    schedule_description: str | None = None
    room: str | None = None
    vacancies: int | None = None
    occupied: int | None = None
    teachers: tuple[Teacher, ...] = ()
    subject: Subject
