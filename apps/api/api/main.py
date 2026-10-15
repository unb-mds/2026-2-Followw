import logging
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import HTMLResponse

from api.core.config import settings
from api.errors import EXCEPTION_HANDLERS
from api.logger import RequestLoggingMiddleware
from api.modules.auth.router import router as auth_router
from api.modules.classrooms.router import router as classrooms_router
from api.modules.me.router import router as me_router
from api.modules.posts.router import router as posts_router
from api.modules.public_classrooms.router import router as public_classrooms_router
from api.modules.public_courses.router import router as public_courses_router
from api.modules.public_restaurant.router import router as public_restaurant_router
from api.modules.public_subjects.router import router as public_subjects_router
from api.sync.router import router as jobs_router

# desativa logs "HTTP Request: ..." que o httpx emite pra cada chamada ao SIGAA
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

tags_metadata = [
    {
        "name": "Auth",
        "description": "Autenticação via SIGAA/CAS da UnB e gerenciamento de sessão stateless por cookies.",
    },
    {
        "name": "Classrooms",
        "description": "Turmas do semestre e histórico, participantes, frequência e estatísticas de aprovação.",
    },
    {
        "name": "Me",
        "description": "Perfil acadêmico, extrato/saldo do RU e carteirinha do estudante autenticado.",
    },
    {
        "name": "Public Classrooms",
        "x-displayName": "Classrooms",
        "description": "Busca pública de turmas e unidades do SIGAA, sem autenticação.",
    },
    {
        "name": "Public Courses",
        "x-displayName": "Courses",
        "description": "Cursos cadastrados e seus currículos por semestre de ingresso, sem autenticação.",
    },
    {
        "name": "Public Restaurant",
        "x-displayName": "Restaurant",
        "description": "Cardápio público do RU, sem autenticação.",
    },
    {
        "name": "Public Subjects",
        "x-displayName": "Subjects",
        "description": "Componentes curriculares de graduação e suas turmas, sem autenticação.",
    },
    {
        "name": "Posts",
        "description": "Notícias e avaliações recentes das turmas, consultadas diretamente na home do SIGAA.",
    },
]

app = FastAPI(
    title="Followw UnB API",
    description=(
        "Cliente alternativo e open-source para o ecossistema de sistemas da Universidade "
        "de Brasília (UnB). Agrega em uma experiência unificada e performática dados do "
        "SIGAA, Restaurante Universitário (RU) e calendário oficial, com autenticação "
        "stateless delegada ao CAS da UnB, credenciais cifradas em cookies JWE (AES-256-GCM), "
        "sincronização assíncrona inteligente e cache resiliente via Stale-While-Revalidate."
    ),
    version="0.1.0",
    # o front serve a API em /api; rotas sem o prefixo também respondem (subdomínio api., jobs)
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
        app.openapi_schema["x-tagGroups"] = [
            {
                "name": "Public",
                "tags": [
                    "Public Classrooms",
                    "Public Courses",
                    "Public Restaurant",
                    "Public Subjects",
                ],
            },
            {
                "name": "SIGAA",
                "tags": ["Auth", "Classrooms", "Me", "Posts"],
            },
        ]
    return app.openapi_schema


app.openapi = custom_openapi


@app.get("/docs", include_in_schema=False)
async def scalar_docs() -> HTMLResponse:
    return HTMLResponse(
        f"""
        <!doctype html>
        <html lang="pt-BR">
          <head>
            <title>{app.title} — Documentação</title>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <link rel="icon" type="image/svg+xml" href="https://scalar.com/favicon.svg" />
          </head>
          <body>
            <script
              id="api-reference"
              data-url="{app.root_path}{app.openapi_url}"
              data-configuration='{{"theme":"purple","layout":"modern","darkMode":true}}'
            ></script>
            <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
          </body>
        </html>
        """
    )


if settings.environment == "production":
    app.add_middleware(HTTPSRedirectMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Age"],
)

app.add_middleware(RequestLoggingMiddleware)

app.include_router(auth_router, prefix="/auth", tags=["Auth"])
app.include_router(classrooms_router, prefix="/classrooms", tags=["Classrooms"])
app.include_router(
    public_classrooms_router, prefix="/public/classrooms", tags=["Public Classrooms"]
)
app.include_router(
    public_courses_router, prefix="/public/courses", tags=["Public Courses"]
)
app.include_router(
    public_restaurant_router, prefix="/public/restaurant", tags=["Public Restaurant"]
)
app.include_router(
    public_subjects_router, prefix="/public/subjects", tags=["Public Subjects"]
)
app.include_router(me_router, prefix="/me", tags=["Me"])
app.include_router(posts_router, prefix="/posts", tags=["Posts"])
app.include_router(jobs_router, prefix="/jobs", tags=["Jobs"])
