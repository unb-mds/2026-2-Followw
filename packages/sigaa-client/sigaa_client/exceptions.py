from datetime import datetime


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


class ProfileReadFailedAfterEdit(SigaaError):
    """O formulário confirmou a edição, mas a leitura do painel falhou."""

    def __init__(
        self, *, photo: str | None, bio: str | None, confirmed_at: datetime
    ) -> None:
        super().__init__("O SIGAA confirmou a edição, mas o painel está indisponível.")
        self.photo = photo
        self.bio = bio
        self.confirmed_at = confirmed_at


class ClassroomNotFound(SigaaError):
    """A turma não está no histórico do usuário."""


class NewsNotFound(SigaaError):
    """A notícia não está na listagem da turma solicitada."""


class MaterialNotFound(SigaaError):
    """O arquivo não está nos tópicos da turma solicitada."""


class InternshipNotFound(SigaaError):
    """A referência da oferta está inválida, expirada ou ambígua no mural."""


class SigaaSearchError(SigaaError):
    """O SIGAA recusou os filtros da busca e disse o porquê."""


class DocumentUnavailable(SigaaError):
    """O SIGAA recusou emitir o documento e disse o porquê."""


class MissingProfilePhoto(DocumentUnavailable):
    """A carteirinha exige foto no perfil do SIGAA."""
