import enum
from datetime import date, datetime
from decimal import Decimal
from functools import cached_property
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr, computed_field


class EnrollmentCertificate(BaseModel):
    """Conteúdo de uma emissão do atestado, incluindo a grade preenchida pelo SIGAA."""

    model_config = ConfigDict(frozen=True)

    issued_at: str
    identification: tuple[tuple[str, str], ...]
    enrollment_headers: tuple[str, str, str, str, str]
    enrollments: tuple[tuple[str, str, str, str, str], ...]
    schedule: tuple[tuple[str, ...], ...]
    authentication: str
    footer: str


class CurriculumSummary(BaseModel):
    model_config = ConfigDict(frozen=True)

    sigaa_id: int = Field(gt=0)
    course_sigaa_id: int = Field(gt=0)
    code: str = Field(min_length=1)
    created_year: int = Field(ge=1900)
    active: bool
    shift: Literal["D", "N"] | None = None


class CurriculumPeriod(BaseModel):
    model_config = ConfigDict(frozen=True)

    period: int = Field(gt=0)
    required: tuple[str, ...]


class Curriculum(CurriculumSummary):
    valid_from: str = Field(pattern=r"^[0-9]{4}\.[0-9]$")
    matrix: str = Field(min_length=1)
    required_by_period: tuple[CurriculumPeriod, ...]
    optional: tuple[str, ...]
    complementary: tuple[str, ...] = ()


class Credentials(BaseModel):
    model_config = ConfigDict(frozen=True)

    registration: str
    password: SecretStr


class UserLevel(str, enum.Enum):
    GRADUACAO = "Graduação"
    POS_GRADUACAO = "Pós-graduação"
    MESTRADO = "Mestrado"


class CourseShift(str, enum.Enum):
    DIURNO = "DIURNO"
    NOTURNO = "NOTURNO"


class RestaurantStatementEntry(BaseModel):
    model_config = ConfigDict(frozen=True)

    occurred_at: datetime
    description: str
    amount: Decimal


class RestaurantStatement(BaseModel):
    model_config = ConfigDict(frozen=True)

    balance: Decimal | None = None
    group: Literal[1, 2, 3, 4] | None = None
    entries: tuple[RestaurantStatementEntry, ...] = ()


class RestaurantCredentials(BaseModel):
    model_config = ConfigDict(frozen=True)

    token: str
    valid_until: date


class CurriculumWorkload(BaseModel):
    """Carga horária do currículo e o que falta integralizar, em horas."""

    model_config = ConfigDict(frozen=True)

    total: int
    pending_mandatory: int
    pending_optional: int
    pending_complementary: int


class UserProfile(BaseModel):
    model_config = ConfigDict(frozen=True)

    name: str
    registration: str
    photo: str | None
    email: str | None = None
    bio: str | None
    unity: str
    course: str
    shift: CourseShift | None
    entry_semester: str | None
    integralization: int | None
    workload: CurriculumWorkload | None
    ira: float | None
    mp: float | None
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


class SubjectDetails(Subject):
    """Componente com os requisitos do SIGAA, como `( ( CIC0004 ) OU ( CIC0088 ) )`."""

    prerequisites: str | None = None
    corequisites: str | None = None
    equivalences: str | None = None


class Classroom(BaseModel):
    """Turma, nos campos da tabela `classrooms`.

    `id` é o `frontEndIdTurma` do SIGAA — o único identificador presente tanto
    nas turmas do semestre quanto no histórico. `sigaa_id` é o id numérico
    interno, que só o portal do semestre expõe. `current` marca as turmas que o
    portal lista como atuais.
    """

    model_config = ConfigDict(frozen=True)

    id: str
    sigaa_id: int | None = None
    number: str
    semester: str
    schedule: str | None = None
    room: str | None = None
    current: bool = False
    subject: Subject


class Grade(str, enum.Enum):
    SS = "SS"
    MS = "MS"
    MM = "MM"
    MI = "MI"
    II = "II"
    SR = "SR"

    @property
    def approved(self) -> bool:
        return self in (Grade.SS, Grade.MS, Grade.MM)


class ClassroomGrade(BaseModel):
    """O relatório de notas identifica a disciplina pelo código e semestre."""

    model_config = ConfigDict(frozen=True)

    subject_code: str
    semester: str
    grade: Grade | None = None


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


class AttendanceStatus(str, enum.Enum):
    PRESENTE = "presente"
    FALTA = "falta"
    NAO_REGISTRADA = "nao_registrada"


class FrequencyStatus(str, enum.Enum):
    """Quanto das entradas publicadas o docente já registrou."""

    NAO_REGISTRADA = "nao_registrada"
    PARCIALMENTE_REGISTRADA = "parcialmente_registrada"
    REGISTRADA = "registrada"


class AttendanceEntry(BaseModel):
    """Uma aula do mapa de frequências. `absences` é 0 fora da situação de falta."""

    model_config = ConfigDict(frozen=True)

    occurred_on: date
    status: AttendanceStatus
    absences: int = 0


class AttendanceSummary(BaseModel):
    """Contagens das entradas publicadas, sem presumir duração de cada aula."""

    model_config = ConfigDict(frozen=True)

    total_entries: int
    recorded_entries: int
    unrecorded_entries: int
    absence_entries: int
    total_absences: int


class ClassroomAttendance(BaseModel):
    """Mapa de frequências da turma, com os totais que o próprio SIGAA calcula.

    Totais e porcentagens são os valores exibidos pelo SIGAA; eles podem
    incluir aulas ainda não registradas. `summary` conta apenas as entradas
    publicadas, sem confundir quantidade de datas com carga horária.
    """

    model_config = ConfigDict(frozen=True)

    entries: tuple[AttendanceEntry, ...] = ()
    attended: int
    registered: int
    registered_percentage: int
    total: int
    total_percentage: int

    @computed_field
    @cached_property
    def summary(self) -> AttendanceSummary:
        unrecorded = sum(
            entry.status == AttendanceStatus.NAO_REGISTRADA for entry in self.entries
        )
        absent = [
            entry for entry in self.entries if entry.status == AttendanceStatus.FALTA
        ]
        return AttendanceSummary(
            total_entries=len(self.entries),
            recorded_entries=len(self.entries) - unrecorded,
            unrecorded_entries=unrecorded,
            absence_entries=len(absent),
            total_absences=sum(entry.absences for entry in absent),
        )


class StudentSituation(str, enum.Enum):
    """As situações do gráfico "Situação dos Discentes", na ordem da legenda."""

    APROVADO = "aprovado"
    REPROVADO = "reprovado"
    REPROVADO_POR_FALTAS = "reprovado_por_faltas"
    REPROVADO_POR_MEDIA_E_POR_FALTAS = "reprovado_por_media_e_por_faltas"
    APROVADO_POR_NOTA = "aprovado_por_nota"
    REPROVADO_POR_NOTA = "reprovado_por_nota"
    REPROVADO_POR_NOTA_E_FALTAS = "reprovado_por_nota_e_faltas"
    TRANCADO = "trancado"
    MATRICULADO = "matriculado"


class StatisticsShare(BaseModel):
    """Uma fatia do gráfico de estatísticas: a porcentagem dos discentes da turma.

    O SIGAA arredonda cada fatia em uma casa, então a soma pode fechar em 99.9
    ou 100.1. O gráfico não expõe a contagem de alunos, só a porcentagem.
    """

    model_config = ConfigDict(frozen=True)

    situation: StudentSituation
    percentage: float


class ClassroomProgress(BaseModel):
    """O "Andamento das Aulas" da turma virtual: quanto da CH já foi ministrada."""

    model_config = ConfigDict(frozen=True)

    taught: int
    total: int
    percentage: int


class ClassroomFrequency(BaseModel):
    """A tela de frequência da turma virtual.

    `frequency` é `None` quando o docente não lançou frequência — nesse caso o
    SIGAA ainda mostra totais na tela, mas eles são fictícios (100% de presença
    em toda a carga horária), então não são devolvidos.
    """

    model_config = ConfigDict(frozen=True)

    progress: ClassroomProgress
    frequency: ClassroomAttendance | None = None

    @computed_field
    @property
    def frequency_status(self) -> FrequencyStatus:
        if self.frequency is None or self.frequency.summary.recorded_entries == 0:
            return FrequencyStatus.NAO_REGISTRADA
        if self.frequency.summary.unrecorded_entries:
            return FrequencyStatus.PARCIALMENTE_REGISTRADA
        return FrequencyStatus.REGISTRADA


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


SubjectLevel = Literal[
    TeachingLevel.FORMACAO_COMPLEMENTAR,
    TeachingLevel.GRADUACAO,
    TeachingLevel.LATO_SENSU,
    TeachingLevel.RESIDENCIA,
    TeachingLevel.STRICTO_SENSU,
]


class SubjectType(str, enum.Enum):
    DISCIPLINA = "DISCIPLINA"
    ATIVIDADE = "ATIVIDADE"
    BLOCO = "BLOCO"
    MODULO = "MÓDULO"


class PublicSubject(Subject):
    sigaa_id: int
    code: str
    level: SubjectLevel
    type: SubjectType


class SubjectSearchMessage(BaseModel):
    model_config = ConfigDict(frozen=True)

    code: Literal["result_limit_exceeded", "no_results"]
    severity: Literal["warning", "info"]
    text: str


class SubjectSearchResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    items: tuple[PublicSubject, ...] = ()
    messages: tuple[SubjectSearchMessage, ...] = ()
    truncated: bool = False

    @computed_field
    @property
    def returned_count(self) -> int:
        return len(self.items)


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


class NewsAttachment(BaseModel):
    model_config = ConfigDict(frozen=True)

    name: str
    url: str


class News(BaseModel):
    """Hora, texto e anexos só vêm de `get_classroom_news`."""

    model_config = ConfigDict(frozen=True)

    id: int
    title: str
    published_on: date
    published_at: datetime | None = None
    content: str | None = None
    attachments: tuple[NewsAttachment, ...] = ()


class PostType(str, enum.Enum):
    NEWS = "news"
    TOPIC = "topic"
    MATERIAL = "material"
    ASSESSMENT = "assessment"


class ClassroomPost(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    type: PostType
    sigaa_id: str | None = None
    classroom_sigaa_id: int | None = None
    topic_id: str | None = None
    title: str
    content: str | None = None
    published_on: date | None = None
    published_at: datetime | None = None
    starts_on: date | None = None
    ends_on: date | None = None
    starts_at: datetime | None = None
    time_label: str | None = None
    url: str | None = None
    attachments: tuple[NewsAttachment, ...] = ()

    @classmethod
    def from_news(cls, news: News) -> ClassroomPost:
        return cls(
            id=f"news:{news.id}",
            type=PostType.NEWS,
            sigaa_id=str(news.id),
            **news.model_dump(exclude={"id"}),
        )


class DashboardPost(BaseModel):
    """Post recente da home: sem ID, o detalhe fica nos posts da turma."""

    model_config = ConfigDict(frozen=True)

    type: PostType
    classroom_sigaa_id: int | None = None
    title: str
    published_on: date | None = None
    starts_on: date | None = None
