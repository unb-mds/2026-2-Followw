import enum


class UserLevel(str, enum.Enum):
    GRADUACAO = "Graduação"
    POS_GRADUACAO = "Pós-graduação"
    MESTRADO = "Mestrado"


class ClassroomRole(str, enum.Enum):
    ALUNO = "aluno"
    PROFESSOR = "professor"
    MONITOR = "monitor"


class ClassroomStatus(str, enum.Enum):
    CURSANDO = "cursando"
    REMOVIDO = "removido"
    TRANCADO = "trancado"
    CONCLUIDO = "concluido"
