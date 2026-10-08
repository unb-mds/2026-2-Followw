from datetime import date, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from unb_browser import Campus, DailyMenu

from api.db.models import RestaurantMenu


class RestaurantRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, campus: Campus, start: date, end: date) -> list[RestaurantMenu]:
        return list(
            await self._session.scalars(
                select(RestaurantMenu)
                .where(
                    RestaurantMenu.campus == campus.value,
                    RestaurantMenu.date.between(start, end),
                )
                .order_by(RestaurantMenu.date)
            )
        )

    async def synced_at(self, campus: Campus) -> datetime | None:
        return await self._session.scalar(
            select(func.max(RestaurantMenu.synced_at)).where(
                RestaurantMenu.campus == campus.value
            )
        )

    async def save(
        self, campus: Campus, days: tuple[DailyMenu, ...], synced_at: datetime
    ) -> None:
        # Datas que saíram do cardápio publicado continuam guardadas.
        rows = {
            row.date: row
            for row in await self._session.scalars(
                select(RestaurantMenu).where(
                    RestaurantMenu.campus == campus.value,
                    RestaurantMenu.date.in_([day.date for day in days]),
                )
            )
        }
        for day in days:
            row = rows.get(day.date)
            if row is None:
                row = rows[day.date] = RestaurantMenu(
                    campus=campus.value, date=day.date
                )
                self._session.add(row)
            meals = day.model_dump(
                mode="json", include={"breakfast", "lunch", "dinner"}
            )
            for meal, sections in meals.items():
                setattr(row, meal, sections)
            row.synced_at = synced_at
        await self._session.flush()
