from fastapi import FastAPI
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware

from api.core.config import settings
from api.modules.auth.main import router as auth_router
from api.modules.classrooms.main import router as classrooms_router
from api.modules.me.main import router as me_router

app = FastAPI()

if settings.environment == "production":
    app.add_middleware(HTTPSRedirectMiddleware)

app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(classrooms_router, prefix="/classrooms", tags=["classrooms"])
app.include_router(me_router, prefix="/me", tags=["me"])
