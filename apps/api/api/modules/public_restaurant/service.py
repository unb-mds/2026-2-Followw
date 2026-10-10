import logging
from datetime import UTC, date, datetime, timedelta, timezone
from typing import Annotated, Literal

import httpx
from fastapi import Depends, HTTPException, status
from pydantic import TypeAdapter, ValidationError
from sqlalchemy.exc import SQLAlchemyError
from unb_browser import Campus, DailyMenu, UnbBrowser, UnbBrowserError

from api.cache import NO_DIRECTIVES, CacheControl, is_stale
from api.db.main import SessionmakerDep
from api.modules.public_restaurant.repository import RestaurantRepository

log = logging.getLogger(__name__)
RESTAURANT_MENU_TTL = timedelta(days=5)
BRASILIA = timezone(timedelta(hours=-3))
_MENU = TypeAdapter(tuple[DailyMenu, ...])
Meal = Literal["breakfast", "lunch", "dinner"]


def today() -> date:
    return datetime.now(BRASILIA).date()


class RestaurantService:
    def __init__(
        self,
        sessionmaker: SessionmakerDep,
    ) -> None:
        self._sessionmaker = sessionmaker

    async def get_menu(
        self,
        campus: Campus,
        cache: CacheControl = NO_DIRECTIVES,
        *,
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
        if day is not None:
            start_date = end_date = day
        elif start_date is None and end_date is None:
            current = today()
            start_date = current - timedelta(days=current.weekday())
            end_date = start_date + timedelta(days=6)
        # Sem intervalo fechado, o limite que falta completa uma semana.
        elif end_date is None:
            end_date = start_date + timedelta(days=6)
        elif start_date is None:
            start_date = end_date - timedelta(days=6)
        days = await self._load_menu(campus, start_date, end_date, cache)
        if meal is None:
            return days
        return tuple(
            DailyMenu(date=item.date, **{meal: getattr(item, meal)}) for item in days
        )

    async def _load_menu(
        self, campus: Campus, start: date, end: date, cache: CacheControl
    ) -> tuple[DailyMenu, ...]:
        cached: tuple[DailyMenu, ...] = ()
        synced_at: datetime | None = None
        try:
            async with self._sessionmaker() as session:
                repository = RestaurantRepository(session)
                rows = await repository.get(campus, start, end)
                cached = _MENU.validate_python(rows, from_attributes=True)
                synced_at = await repository.synced_at(campus)
        except SQLAlchemyError, OSError, TimeoutError, ValidationError:
            log.warning("Não foi possível ler o cache do cardápio", exc_info=True)

        if (
            cached
            and synced_at is not None
            and (
                cache.only_if_cached
                or not (
                    is_stale(synced_at, RESTAURANT_MENU_TTL)
                    or cache.revalidate(synced_at)
                )
            )
        ):
            cache.served(synced_at)
            return cached
        if cache.only_if_cached:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Not cached"
            )

        try:
            async with UnbBrowser() as browser:
                days = await browser.restaurant.get_menu(campus)
        except (UnbBrowserError, httpx.HTTPError) as error:
            # Cache vencido de outras datas não serve: sem o intervalo pedido, 502.
            # Se foi o cliente quem pediu a revalidação, só o `stale-if-error` libera o cache.
            if (
                not cached
                or synced_at is None
                or (cache.revalidate(synced_at) and not cache.accepts_stale(synced_at))
            ):
                raise UnbBrowserError("Site do RU indisponível.") from error
            log.warning("RU indisponível, servindo cardápio vencido", exc_info=True)
            cache.served(synced_at)
            return cached

        now = datetime.now(UTC)
        cache.served(now)
        try:
            async with self._sessionmaker() as session:
                repository = RestaurantRepository(session)
                await repository.save(campus, days, now)
                await session.commit()
                rows = await repository.get(campus, start, end)
                return _MENU.validate_python(rows, from_attributes=True)
        except SQLAlchemyError, OSError, TimeoutError, ValidationError:
            log.warning("Não foi possível salvar o cache do cardápio", exc_info=True)
        # Revalida para marcar todos os campos como definidos, igual ao que vem do banco.
        return _MENU.validate_python(
            _MENU.dump_python(tuple(d for d in days if start <= d.date <= end))
        )


RestaurantServiceDep = Annotated[RestaurantService, Depends()]
