from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

RuCampus = Literal["Darcy", "Gama", "Ceilandia", "Planaltina", "Fazenda"]
RuMeal = Literal["breakfast", "lunch", "dinner", "all"]
ScheduleView = Literal["day", "week"]
Theme = Literal["system", "light", "dark"]


class UserSettings(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    display_name: str | None = Field(default=None, alias="displayName")
    default_ru_campus: RuCampus | None = Field(default=None, alias="defaultRuCampus")
    default_ru_meal: RuMeal | None = Field(default=None, alias="defaultRuMeal")
    hide_ru_balance: bool | None = Field(default=None, alias="hideRuBalance")
    schedule_view: ScheduleView | None = Field(default=None, alias="scheduleView")
    compact_mode: bool | None = Field(default=None, alias="compactMode")
    theme: Theme | None = Field(default=None, alias="theme")


class UserSettingsPatch(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    display_name: str | None = Field(default=None, alias="displayName")
    default_ru_campus: RuCampus | None = Field(default=None, alias="defaultRuCampus")
    default_ru_meal: RuMeal | None = Field(default=None, alias="defaultRuMeal")
    hide_ru_balance: bool | None = Field(default=None, alias="hideRuBalance")
    schedule_view: ScheduleView | None = Field(default=None, alias="scheduleView")
    compact_mode: bool | None = Field(default=None, alias="compactMode")
    theme: Theme | None = Field(default=None, alias="theme")
