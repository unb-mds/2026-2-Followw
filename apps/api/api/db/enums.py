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
    APROVADO = "aprovado"
    REPROVADO = "reprovado"
    TRANCADO = "trancado"


class StudentSituation(str, enum.Enum):
    APROVADO = "aprovado"
    REPROVADO = "reprovado"
    REPROVADO_POR_FALTAS = "reprovado_por_faltas"
    REPROVADO_POR_MEDIA_E_POR_FALTAS = "reprovado_por_media_e_por_faltas"
    APROVADO_POR_NOTA = "aprovado_por_nota"
    REPROVADO_POR_NOTA = "reprovado_por_nota"
    REPROVADO_POR_NOTA_E_FALTAS = "reprovado_por_nota_e_faltas"
    TRANCADO = "trancado"
    MATRICULADO = "matriculado"
