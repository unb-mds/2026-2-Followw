class UnbBrowserError(Exception):
    """Base de todos os erros do pacote."""


class UnbParseError(UnbBrowserError):
    """A página ou o PDF não tem a estrutura esperada — provável mudança de layout."""
