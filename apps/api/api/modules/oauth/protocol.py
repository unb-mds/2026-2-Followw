from fastapi import Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from pydantic import BaseModel

PRIVATE_HEADERS = {"Cache-Control": "no-store", "Pragma": "no-cache"}


class OAuthProblem(BaseModel):
    error: str


class OAuthError(ValueError):
    def __init__(self, code: str, status: int = 400) -> None:
        super().__init__(code)
        self.code = code
        self.status = status


class ProtocolRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def handle(request: Request) -> Response:
            try:
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
