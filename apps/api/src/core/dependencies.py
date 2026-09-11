from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Request, status

from src.utils.security import ACCESS_TOKEN_COOKIE_NAME, decode_token


def get_current_user(request: Request) -> dict:
    token = request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)

    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    try:
        return decode_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )


CurrentUser = Annotated[dict, Depends(get_current_user)]
