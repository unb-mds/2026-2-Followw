import logging
from datetime import UTC, date, datetime, timedelta, timezone
from typing import Annotated, Literal

import httpx
from fastapi import Depends, HTTPException
from pydantic import TypeAdapter, ValidationError
from sigaa_client import RestaurantCredentials, RestaurantStatement
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from unb_browser import Campus, DailyMenu, UnbBrowserError

from api.db.main import get_sessionmaker
from api.dependencies.sigaa import SigaaClientDep
from api.dependencies.unb_browser import UnbBrowserDep
from api.repositories.restaurant import RestaurantRepository
from api.services.sync import is_stale

log = logging.getLogger(__name__)
MENU_TTL = timedelta(hours=24)
BRASILIA = timezone(timedelta(hours=-3))
_MENU = TypeAdapter(tuple[DailyMenu, ...])
Meal = Literal["breakfast", "lunch", "dinner"]


def today() -> date:
    return datetime.now(BRASILIA).date()


class RestaurantService:
    def __init__(
        self,
        browser: UnbBrowserDep,
        sessionmaker: Annotated[
            async_sessionmaker[AsyncSession], Depends(get_sessionmaker)
        ],
    ) -> None:
        self._browser = browser
        self._sessionmaker = sessionmaker

    async def get_menu(
        self,
        campus: Campus,
        *,
        refresh: bool = False,
        day: date | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
        meal: Meal | None = None,
    ) -> tuple[DailyMenu, ...]:
        if day is not None and (start_date is not None or end_date is not None):
            raise HTTPException(
                status_code=422, detail="Use date or start_date/end_date, not both"
            )
        if start_date is not None and end_date is not None and start_date > end_date:
            raise HTTPException(
                status_code=422, detail="start_date must not be after end_date"
            )
        if day is None and start_date is None and end_date is None:
            current = today()
            start_date = current - timedelta(days=current.weekday())
            end_date = start_date + timedelta(days=6)
        days = await self._load_menu(campus, refresh=refresh)
        return tuple(
            DailyMenu(date=item.date, **{meal: getattr(item, meal)})
            if meal is not None
            else item
            for item in days
            if (day is None or item.date == day)
            and (start_date is None or item.date >= start_date)
            and (end_date is None or item.date <= end_date)
        )

    async def _load_menu(
        self, campus: Campus, *, refresh: bool = False
    ) -> tuple[DailyMenu, ...]:
        cached: tuple[DailyMenu, ...] = ()
        if not refresh:
            try:
                async with self._sessionmaker() as session:
                    rows = await RestaurantRepository(session).get(campus)
                    cached = _MENU.validate_python(rows, from_attributes=True)
                    synced_at = max((row.synced_at for row in rows), default=None)
                    if synced_at is not None and not is_stale(synced_at, MENU_TTL):
                        return cached
            except SQLAlchemyError, OSError, TimeoutError, ValidationError:
                log.warning("Não foi possível ler o cache do cardápio", exc_info=True)

        try:
            browser = await self._browser.browser()
            days = await browser.restaurant.get_menu(campus)
        except UnbBrowserError, httpx.HTTPError:
            if not cached:
                raise
            log.warning("RU indisponível, servindo cardápio vencido", exc_info=True)
            return cached

        try:
            async with self._sessionmaker() as session:
                saved = await RestaurantRepository(session).save(
                    campus, days, datetime.now(UTC)
                )
                await session.commit()
                return _MENU.validate_python(saved, from_attributes=True)
        except SQLAlchemyError, OSError, TimeoutError, ValidationError:
            log.warning("Não foi possível salvar o cache do cardápio", exc_info=True)
        # Revalida para marcar todos os campos como definidos, igual ao que vem do banco.
        return _MENU.validate_python(_MENU.dump_python(days))


class RestaurantAccountService:
    def __init__(self, client: SigaaClientDep) -> None:
        self._client = client

    async def get_statement(self) -> RestaurantStatement:
        return await self._client.restaurant.get_restaurant_statement()

    async def get_token(self) -> RestaurantCredentials:
        return await self._client.restaurant.get_restaurant_credentials()


RestaurantServiceDep = Annotated[RestaurantService, Depends()]
RestaurantAccountServiceDep = Annotated[RestaurantAccountService, Depends()]
