from typing import Annotated

from fastapi import Depends
from pydantic import BaseModel

from api.modules.classrooms.frequency import ClassroomFrequencyResult
from api.modules.classrooms.posts import ClassroomNews, LatestNewsFeed
from api.modules.classrooms.service import ClassroomDetails, ParticipantClassroom
from api.modules.classrooms.week import LessonDay, ScheduledLesson
from api.modules.oauth.scopes import Scope
from api.sigaa import SigaaConnectionDep


class ClassroomRef(BaseModel):
    id: str
    sigaa_id: int | None


DayResponse = LessonDay | LessonDay[ScheduledLesson]
ClassroomResponse = ParticipantClassroom | ClassroomDetails
FrequencyResponse = (
    ClassroomFrequencyResult
    | ClassroomFrequencyResult[ClassroomDetails]
    | ClassroomFrequencyResult[ClassroomRef]
)
NewsResponse = (
    LatestNewsFeed
    | LatestNewsFeed[ClassroomNews[ClassroomDetails]]
    | LatestNewsFeed[ClassroomNews[ClassroomRef]]
)


class OAuthView:
    def __init__(self, connection: SigaaConnectionDep):
        self.scopes = connection.scopes

    def lessons(self, days: list[LessonDay]) -> list[DayResponse]:
        if self.scopes is None or Scope.FREQUENCY in self.scopes:
            return days
        return [
            LessonDay[ScheduledLesson].model_validate(day.model_dump()) for day in days
        ]

    @property
    def classroom_model(self):
        if self.scopes is None or Scope.GRADES in self.scopes:
            return ParticipantClassroom
        if Scope.CLASSROOMS in self.scopes:
            return ClassroomDetails
        return ClassroomRef

    def classrooms(self, rows: list[ParticipantClassroom]) -> list[ClassroomResponse]:
        if self.classroom_model is ParticipantClassroom:
            return rows
        return [ClassroomDetails.model_validate(row.model_dump()) for row in rows]

    def frequencies(
        self, rows: list[ClassroomFrequencyResult]
    ) -> list[FrequencyResponse]:
        classroom = self.classroom_model
        if classroom is ParticipantClassroom:
            return rows
        model = ClassroomFrequencyResult[classroom]
        return [model.model_validate(row.model_dump()) for row in rows]

    def news(self, feed: LatestNewsFeed) -> NewsResponse:
        classroom = self.classroom_model
        if classroom is ParticipantClassroom:
            return feed
        return LatestNewsFeed[ClassroomNews[classroom]].model_validate(
            feed.model_dump()
        )


OAuthViewDep = Annotated[OAuthView, Depends()]
