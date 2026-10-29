from pydantic import BaseModel, ConfigDict

from api.modules.public_professors.service import ProfessorItem
from api.modules.public_subjects.service import CatalogSubject


class SearchResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    professors: list[ProfessorItem]
    subjects: list[CatalogSubject]
