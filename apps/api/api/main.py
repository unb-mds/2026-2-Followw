import logging
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import HTMLResponse

from api.core.config import settings
from api.errors import EXCEPTION_HANDLERS
from api.logger import RequestLoggingMiddleware
from api.modules.auth.router import router as auth_router
from api.modules.classrooms.router import router as classrooms_router
from api.modules.lessons.router import router as lessons_router
from api.modules.me.router import router as me_router
from api.modules.me.upload_guard import ProfileUploadGuard
from api.modules.oauth.authorization_router import router as authorization_router
from api.modules.oauth.cors import FollowwCORS
from api.modules.oauth.management_router import router as oauth_management_router
from api.modules.oauth.router import router as oauth_router
from api.modules.oauth.scopes import PERMISSIONS
from api.modules.posts.router import router as posts_router
from api.modules.public_classrooms.router import router as public_classrooms_router
from api.modules.public_courses.router import router as public_courses_router
from api.modules.public_professors.router import router as public_professors_router
from api.modules.public_restaurant.router import router as public_restaurant_router
from api.modules.public_search.router import router as public_search_router
from api.modules.public_subjects.router import router as public_subjects_router
from api.rate_limit import RateLimitMiddleware
from api.sync.router import router as jobs_router

# desativa logs "HTTP Request: ..." que o httpx emite pra cada chamada ao SIGAA
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

tags_metadata = [
    {
        "name": "Auth",
        "description": "Login no SIGAA e sessão por cookies.",
    },
    {
        "name": "Classrooms",
        "description": "Turmas, participantes, frequência e resultados acadêmicos.",
    },
    {
        "name": "Lessons",
        "description": "Aulas da semana com a situação do aluno.",
    },
    {
        "name": "Me",
        "description": "Perfil, configurações, documentos e acesso ao RU.",
    },
    {
        "name": "Public Classrooms",
        "x-displayName": "Classrooms",
        "description": "Turmas e unidades do SIGAA.",
    },
    {
        "name": "Public Courses",
        "x-displayName": "Courses",
        "description": "Cursos e currículos por ingresso.",
    },
    {
        "name": "Public Professors",
        "x-displayName": "Professors",
        "description": "Catálogo de docentes.",
    },
    {
        "name": "Public Restaurant",
        "x-displayName": "Restaurant",
        "description": "Cardápio do RU.",
    },
    {
        "name": "Public Search",
        "x-displayName": "Search",
        "description": "Busca de matérias, cursos e docentes.",
    },
    {
        "name": "Public Subjects",
        "x-displayName": "Subjects",
        "description": "Matérias de graduação e suas turmas.",
    },
    {
        "name": "Posts",
        "description": "Notícias e avaliações das turmas.",
    },
]

app = FastAPI(
    title="Followw UnB API",
    description=(
        "API independente e open-source para consultar dados do SIGAA e de outros "
        "sistemas da UnB. O acesso usa cookies do Followw ou um token OAuth com escopos."
    ),
    version="0.1.0",
    root_path="/api",
    docs_url=None,
    redoc_url=None,
    openapi_tags=tags_metadata,
    exception_handlers=EXCEPTION_HANDLERS,
)


def custom_openapi() -> dict[str, Any]:
    if app.openapi_schema is None:
        app.openapi_schema = get_openapi(
            title=app.title,
            version=app.version,
            openapi_version=app.openapi_version,
            description=app.description,
            routes=app.routes,
            tags=app.openapi_tags,
            servers=[{"url": app.root_path}],
        )
        app.openapi_schema["x-oauth-scopes"] = PERMISSIONS
        app.openapi_schema["components"]["securitySchemes"] = {
            "OAuthBearer": {"type": "http", "scheme": "bearer"},
            "FollowwCookie": {
                "type": "apiKey",
                "in": "cookie",
                "name": "refresh_token",
            },
        }
        app.openapi_schema["x-tagGroups"] = [
            {
                "name": "Public",
                "tags": [
                    "Public Classrooms",
                    "Public Courses",
                    "Public Professors",
                    "Public Restaurant",
                    "Public Search",
                    "Public Subjects",
                ],
            },
            {
                "name": "SIGAA",
                "tags": ["Auth", "Classrooms", "Lessons", "Me", "Posts"],
            },
        ]
    return app.openapi_schema


app.openapi = custom_openapi


@app.get("/docs", include_in_schema=False)
async def mintlify_docs() -> HTMLResponse:
    return HTMLResponse(
        f"""
        <!doctype html>
        <html lang="pt-BR">
          <head>
            <title>{app.title} — Documentação</title>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <meta http-equiv="refresh" content="0; url={settings.docs_url}" />
            <link rel="canonical" href="{settings.docs_url}" />
          </head>
          <body>
            <p>Redirecionando para a <a href="{settings.docs_url}">documentação no Mintlify</a>...</p>
          </body>
        </html>
        """
    )


if settings.environment == "production":
    app.add_middleware(HTTPSRedirectMiddleware)

app.add_middleware(ProfileUploadGuard)
app.add_middleware(RateLimitMiddleware)

app.add_middleware(FollowwCORS, origins=settings.cors_origins)

app.add_middleware(RequestLoggingMiddleware)

app.include_router(auth_router, prefix="/auth", tags=["Auth"])
app.include_router(oauth_router, prefix="/oauth", tags=["Auth"])
app.include_router(authorization_router, prefix="/oauth", tags=["Auth"])
app.include_router(oauth_management_router, prefix="/oauth", tags=["Auth"])
app.include_router(classrooms_router, prefix="/classrooms", tags=["Classrooms"])
app.include_router(
    public_classrooms_router, prefix="/public/classrooms", tags=["Public Classrooms"]
)
app.include_router(
    public_courses_router, prefix="/public/courses", tags=["Public Courses"]
)
app.include_router(
    public_professors_router, prefix="/public/professors", tags=["Public Professors"]
)
app.include_router(
    public_restaurant_router, prefix="/public/restaurant", tags=["Public Restaurant"]
)
app.include_router(
    public_search_router, prefix="/public/search", tags=["Public Search"]
)
app.include_router(
    public_subjects_router, prefix="/public/subjects", tags=["Public Subjects"]
)
app.include_router(lessons_router, prefix="/lessons", tags=["Lessons"])
app.include_router(me_router, prefix="/me", tags=["Me"])
app.include_router(posts_router, prefix="/posts", tags=["Posts"])
app.include_router(jobs_router, prefix="/jobs", tags=["Jobs"])
