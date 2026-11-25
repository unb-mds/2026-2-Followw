from fastapi import Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from pydantic import BaseModel

PRIVATE_HEADERS = {"Cache-Control": "no-store", "Pragma": "no-cache"}
_FORM = "application/x-www-form-urlencoded"
# Os demais parâmetros são ignorados (RFC 6749, 3.2); só estes não podem se repetir.
_PARAMETERS = (
    "response_type",
    "client_id",
    "client_secret",
    "redirect_uri",
    "scope",
    "state",
    "code_challenge",
    "code_challenge_method",
    "grant_type",
    "code",
    "code_verifier",
    "refresh_token",
)


class OAuthProblem(BaseModel):
    error: str


class OAuthError(ValueError):
    """Erro do protocolo, respondido como `{"error": code}`."""

    code = "invalid_request"
    status = 400


class InvalidScope(OAuthError):
    code = "invalid_scope"


async def _reject_repeated(request: Request) -> None:
    sources = [request.query_params]
    if request.headers.get("content-type", "").startswith(_FORM):
        sources.append(await request.form())
    for params in sources:
        if any(len(params.getlist(name)) > 1 for name in _PARAMETERS):
            raise OAuthError("Parâmetros do OAuth não podem se repetir.")


class ProtocolRoute(APIRoute):
    """Rotas do protocolo: erros no formato da RFC 6749 e respostas sem cache."""

    def get_route_handler(self):
        handler = super().get_route_handler()

        async def handle(request: Request) -> Response:
            try:
                await _reject_repeated(request)
                response = await handler(request)
            except RequestValidationError:
                response = JSONResponse({"error": "invalid_request"}, status_code=400)
            except OAuthError as error:
                response = JSONResponse({"error": error.code}, status_code=error.status)
                if error.status == 401:
                    response.headers["WWW-Authenticate"] = 'Basic realm="Followw OAuth"'
            response.headers.update(PRIVATE_HEADERS)
            return response

        return handle
