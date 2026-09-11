from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel

from src.core.config import settings
from src.utils.security import (
    ACCESS_TOKEN_COOKIE_NAME,
    REFRESH_TOKEN_COOKIE_NAME,
    create_access_token,
    create_refresh_token,
)

router = APIRouter()


class SigaaLoginRequest(BaseModel):
    registration: str
    password: str


@router.post("/sigaa")
def sigaa_login(request: SigaaLoginRequest, response: Response):
    access_token = None  # sigaa_login(request.registration, request.password)

    if access_token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    access_jwt = create_access_token(
        {"sub": request.registration, "access_token": access_token}
    )
    refresh_jwt = create_refresh_token(
        {
            "sub": request.registration,
            "registration": request.registration,
            "password": request.password,
        }
    )

    response.set_cookie(
        key=ACCESS_TOKEN_COOKIE_NAME,
        value=access_jwt,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=settings.access_token_expire_minutes * 60,
    )
    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE_NAME,
        value=refresh_jwt,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=settings.refresh_token_expire_minutes * 60,
    )

    return {"message": "Login successful"}
