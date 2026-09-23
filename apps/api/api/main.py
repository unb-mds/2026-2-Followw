import logging

from fastapi import FastAPI
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.responses import HTMLResponse

from api.core.config import settings
from api.modules.auth.main import router as auth_router
from api.modules.classrooms.main import router as classrooms_router
from api.modules.jobs.main import router as jobs_router
from api.modules.me.main import router as me_router

# desativa logs "HTTP Request: ..." que o httpx emite pra cada chamada ao SIGAA
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

app = FastAPI(
    title="Followw UnB API",
    description="API pública e client assíncrono para o SIGAA / ecossistema UnB.",
    version="0.1.0",
    docs_url=None,
    redoc_url=None,
)


@app.get("/docs", include_in_schema=False)
async def scalar_docs() -> HTMLResponse:
    return HTMLResponse(
        f"""
        <!doctype html>
        <html>
          <head>
            <title>{app.title} — Documentação</title>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <link rel="icon" type="image/svg+xml" href="https://scalar.com/favicon.svg" />
          </head>
          <body>
            <script
              id="api-reference"
              data-url="{app.openapi_url}"
              data-configuration='{{"theme":"purple","layout":"modern","darkMode":true}}'
            ></script>
            <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
          </body>
        </html>
        """
    )


if settings.environment == "production":
    app.add_middleware(HTTPSRedirectMiddleware)

app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(classrooms_router, prefix="/classrooms", tags=["classrooms"])
app.include_router(me_router, prefix="/me", tags=["me"])
app.include_router(jobs_router, prefix="/jobs", tags=["jobs"])
