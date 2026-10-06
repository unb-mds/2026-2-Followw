from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

RuCampus = Literal["Darcy", "Gama", "Ceilandia", "Planaltina", "Fazenda"]
DisplayName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=24)
]


class UserSettings(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    display_name: str | None = Field(default=None, alias="displayName")
    default_ru_campus: RuCampus | None = Field(default=None, alias="defaultRuCampus")


class UserSettingsPatch(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    display_name: DisplayName | None = Field(default=None, alias="displayName")
    default_ru_campus: RuCampus | None = Field(default=None, alias="defaultRuCampus")
