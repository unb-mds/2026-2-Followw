from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from unb_browser import Campus, DailyMenu

from api.db.models import RestaurantMenu


class RestaurantRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, campus: Campus) -> RestaurantMenu | None:
        return await self._session.scalar(
            select(RestaurantMenu).where(RestaurantMenu.campus == campus.value)
        )

    async def save(
        self, campus: Campus, days: tuple[DailyMenu, ...], synced_at: datetime
    ) -> None:
        menu = await self.get(campus)
        if menu is None:
            menu = RestaurantMenu(campus=campus.value)
            self._session.add(menu)
        menu.days = [day.model_dump(mode="json") for day in days]
        menu.synced_at = synced_at
        await self._session.flush()
