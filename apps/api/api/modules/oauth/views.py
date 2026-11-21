from typing import Annotated

from fastapi import Depends, Request, Response
from fastapi.responses import JSONResponse

from api.modules.classrooms.frequency import ClassroomFrequencyResult
from api.modules.classrooms.posts import ClassroomNews, LatestNewsFeed
from api.modules.classrooms.service import ParticipantClassroom
from api.modules.classrooms.week import LessonDay
from api.modules.me.profile import UserProfile
from api.modules.oauth.scopes import Scope


class OAuthView:
    def __init__(self, request: Request, response: Response):
        self.request = request
        self.response = response

    @property
    def scopes(self) -> frozenset[Scope] | None:
        return (
            self.request.state.oauth_scopes
            if "authorization" in self.request.headers
            else None
        )

    def profile(self, value: UserProfile) -> UserProfile | JSONResponse:
        if self.scopes is None:
            return value
        fields = {"name", "registration", "photo", "course"}
        if Scope.GRADES in self.scopes:
            fields.update(("ira", "mp"))
        return self._json(value.model_dump(mode="json", include=fields))

    def lessons(self, days: list[LessonDay]) -> list[LessonDay] | JSONResponse:
        if self.scopes is None or Scope.FREQUENCY in self.scopes:
            return days
        exclude = {"lessons": {"__all__": {"status", "marked"}}}
        return self._json(
            [day.model_dump(mode="json", exclude=exclude) for day in days]
        )

    def classrooms(
        self, rows: list[ParticipantClassroom]
    ) -> list[ParticipantClassroom] | JSONResponse:
        if self.scopes is None or Scope.GRADES in self.scopes:
            return rows
        return self._json(
            [row.model_dump(mode="json", exclude={"grade"}) for row in rows]
        )

    def _classroom_fields(self, classroom: ParticipantClassroom) -> dict:
        if Scope.CLASSROOMS not in self.scopes:
            return classroom.model_dump(mode="json", include={"id", "sigaa_id"})
        exclude = set() if Scope.GRADES in self.scopes else {"grade"}
        return classroom.model_dump(mode="json", exclude=exclude)

    def _item(self, item: ClassroomFrequencyResult | ClassroomNews) -> dict:
        return {
            **item.model_dump(mode="json", exclude={"classroom"}),
            "classroom": self._classroom_fields(item.classroom),
        }

    def frequencies(
        self, rows: list[ClassroomFrequencyResult]
    ) -> list[ClassroomFrequencyResult] | JSONResponse:
        if self.scopes is None:
            return rows
        return self._json([self._item(row) for row in rows])

    def news(self, feed: LatestNewsFeed) -> LatestNewsFeed | JSONResponse:
        if self.scopes is None:
            return feed
        return self._json(
            {
                "updating": feed.updating,
                "items": [self._item(item) for item in feed.items],
            }
        )

    def _json(self, data) -> JSONResponse:
        return JSONResponse(data, headers=dict(self.response.headers))


OAuthViewDep = Annotated[OAuthView, Depends()]
