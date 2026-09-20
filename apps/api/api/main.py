from fastapi import FastAPI
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware

from api.core.config import settings
from api.modules.auth.main import router as auth_router

app = FastAPI()

if settings.environment == "production":
    app.add_middleware(HTTPSRedirectMiddleware)

app.include_router(auth_router, prefix="/auth", tags=["auth"])
