class SigaaError(Exception):
    """Base de todos os erros do pacote."""


class AuthenticationFailed(SigaaError):
    """O CAS rejeitou as credenciais."""


class SessionExpired(SigaaError):
    """A sessão morreu e a operação não pôde ser recuperada."""


class SessionRenewed(SessionExpired):
    """A sessão foi renovada; o resource precisa reconstruir a operação JSF."""


class SigaaParseError(SigaaError):
    """O HTML não tem a estrutura esperada — provável mudança de layout."""


class ClassroomNotFound(SigaaError):
    """A turma não está no histórico do usuário."""


class NewsNotFound(SigaaError):
    """A notícia não está na listagem da turma solicitada."""


class SigaaSearchError(SigaaError):
    """O SIGAA recusou os filtros da busca e disse o porquê."""
