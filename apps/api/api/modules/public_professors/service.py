import json
from typing import Annotated

from fastapi import Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sigaa_client import ProfessorDegree, ProfessorDiscipline
from sigaa_client.config import PUBLIC_PROFESSOR_PROFILE_PATH, SIGAA_BASE_URL

from api.db.main import DatabaseDep
from api.db.models import Professor
from api.modules.public_professors.repository import ProfessorRepository


class ProfessorItem(BaseModel):
    model_config = ConfigDict(frozen=True)

    siape: int
    name: str
    unity_id: int
    unity_name: str
    photo: str | None
    url: str


class ProfessorDetails(ProfessorItem):
    description: str | None
    education: list[ProfessorDegree] = Field(
        description="Titulações do currículo público do SIGAA, com os campos originais de curso, instituição e anos."
    )
    interests: str | None
    lattes: str | None
    email: str | None
    disciplines: list[ProfessorDiscipline]


class ProfessorPage(BaseModel):
    items: list[ProfessorItem]
    total: int
    page: int
    page_size: int


def _item(professor: Professor) -> ProfessorItem:
    return ProfessorItem(
        siape=professor.siape,
        name=professor.name,
        unity_id=professor.unity_id,
        unity_name=professor.unity.name,
        photo=professor.photo,
        url=f"{SIGAA_BASE_URL}{PUBLIC_PROFESSOR_PROFILE_PATH}?siape={professor.siape}",
    )


class ProfessorService:
    def __init__(self, db: DatabaseDep) -> None:
        self._db = db

    async def list(
        self,
        q: str | None,
        unity_id: int | None,
        semester: str | None,
        page: int,
        page_size: int,
    ) -> ProfessorPage:
        professors, total = await self._db.read(
            lambda session: ProfessorRepository(session).list(
                q, unity_id, semester, page, page_size
            )
        )
        return ProfessorPage(
            items=[_item(professor) for professor in professors],
            total=total,
            page=page,
            page_size=page_size,
        )

    async def get(self, siape: int) -> ProfessorDetails:
        professor = await self._db.read(
            lambda session: ProfessorRepository(session).get(siape)
        )
        if professor is None:
            raise HTTPException(404, "Docente não encontrado.")
        return ProfessorDetails(
            **_item(professor).model_dump(),
            description=professor.description,
            education=json.loads(professor.education) if professor.education else [],
            interests=professor.interests,
            lattes=professor.lattes,
            email=professor.email,
            disciplines=professor.disciplines,
        )


ProfessorServiceDep = Annotated[ProfessorService, Depends()]
