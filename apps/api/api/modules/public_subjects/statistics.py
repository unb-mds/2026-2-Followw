from collections import defaultdict
from typing import Annotated

from fastapi import Depends, HTTPException
from pydantic import BaseModel
from sigaa_client import StatisticsShare
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.main import DatabaseDep
from api.modules.public_subjects.repository import SubjectCatalogRepository


class StatisticsPeriod(BaseModel):
    semester: str | None
    classrooms: int
    shares: list[StatisticsShare]


class SubjectStatistics(BaseModel):
    overall: StatisticsPeriod
    semesters: list[StatisticsPeriod]


def _average(
    semester: str | None, samples: list[list[StatisticsShare]]
) -> StatisticsPeriod:
    totals = defaultdict(float)
    for sample in samples:
        for share in sample:
            totals[share.situation] += share.percentage
    return StatisticsPeriod(
        semester=semester,
        classrooms=len(samples),
        shares=[
            StatisticsShare(
                situation=situation, percentage=round(total / len(samples), 2)
            )
            for situation, total in totals.items()
        ],
    )


class SubjectStatisticsService:
    def __init__(self, db: DatabaseDep) -> None:
        self._db = db

    async def get(self, code: str, semester: str, number: str) -> SubjectStatistics:
        async def load(session: AsyncSession) -> SubjectStatistics:
            repository = SubjectCatalogRepository(session)
            current = await repository.classroom_professors(code, semester, number)
            if current is None:
                raise HTTPException(404, "Turma não encontrada.")
            professors = set(current)
            groups: dict[str, list[list[StatisticsShare]]] = defaultdict(list)
            if professors:
                for (
                    period,
                    previous,
                    statistics,
                ) in await repository.historical_statistics(code, semester):
                    if statistics and professors == set(previous):
                        groups[period].append(
                            [
                                StatisticsShare.model_validate(item)
                                for item in statistics
                            ]
                        )
            return SubjectStatistics(
                overall=_average(
                    None, [sample for samples in groups.values() for sample in samples]
                ),
                semesters=[
                    _average(period, samples) for period, samples in groups.items()
                ],
            )

        return await self._db.read(load)


SubjectStatisticsServiceDep = Annotated[SubjectStatisticsService, Depends()]
