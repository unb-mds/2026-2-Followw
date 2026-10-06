from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

RuCampus = Literal["Darcy", "Gama", "Ceilandia", "Planaltina", "Fazenda"]


class UserSettings(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    display_name: str | None = Field(default=None, alias="displayName")
    default_ru_campus: RuCampus | None = Field(default=None, alias="defaultRuCampus")


class UserSettingsPatch(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    display_name: str | None = Field(default=None, alias="displayName", max_length=24)
    default_ru_campus: RuCampus | None = Field(default=None, alias="defaultRuCampus")
