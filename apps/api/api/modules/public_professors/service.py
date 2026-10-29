from typing import Annotated

from fastapi import Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sigaa_client import ProfessorDegree, ProfessorDiscipline
from sigaa_client.config import PUBLIC_PROFESSOR_PROFILE_PATH, SIGAA_BASE_URL
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.main import DatabaseDep
from api.db.models import Professor
from api.db.units import find_unit
from api.modules.public_professors.repository import ProfessorRepository
from api.modules.public_subjects.repository import SubjectCatalogRepository
from api.schemas import UnitRef


class ProfessorItem(BaseModel):
    model_config = ConfigDict(frozen=True)

    siape: int
    name: str
    unit: UnitRef
    photo: str | None
    url: str


class TaughtDiscipline(ProfessorDiscipline):
    name: str | None = Field(description="Nome do componente; nulo fora do catálogo.")


class ProfessorDetails(ProfessorItem):
    description: str | None
    education: list[ProfessorDegree] = Field(
        description="Titulações do currículo público do SIGAA, com os campos originais de curso, instituição e anos."
    )
    interests: str | None
    lattes: str | None
    email: str | None
    disciplines: list[TaughtDiscipline]


class ProfessorPage(BaseModel):
    items: list[ProfessorItem]
    total: int
    page: int
    page_size: int


def _item(professor: Professor) -> ProfessorItem:
    return ProfessorItem(
        siape=professor.siape,
        name=professor.name,
        unit=UnitRef.model_validate(professor.unit),
        photo=professor.photo,
        url=f"{SIGAA_BASE_URL}{PUBLIC_PROFESSOR_PROFILE_PATH}?siape={professor.siape}",
    )


def _details(professor: Professor, names: dict[str, str]) -> ProfessorDetails:
    return ProfessorDetails(
        **_item(professor).model_dump(),
        description=professor.description,
        education=professor.education or [],
        interests=professor.interests,
        lattes=professor.lattes,
        email=professor.email,
        disciplines=[
            TaughtDiscipline.model_validate({**item, "name": names.get(item["code"])})
            for item in professor.disciplines
        ],
    )


class ProfessorService:
    def __init__(self, db: DatabaseDep) -> None:
        self._db = db

    async def list(
        self,
        q: str | None,
        unit: int | str | None,
        semester: str | None,
        page: int,
        page_size: int,
    ) -> ProfessorPage:
        async def load(session: AsyncSession) -> tuple[list[Professor], int]:
            unit_id = (await find_unit(session, unit)).id if unit is not None else None
            return await ProfessorRepository(session).list(
                q, unit_id, semester, page, page_size
            )

        professors, total = await self._db.read(load)
        return ProfessorPage(
            items=[_item(professor) for professor in professors],
            total=total,
            page=page,
            page_size=page_size,
        )

    async def get(self, siape: int) -> ProfessorDetails:
        async def load(
            session: AsyncSession,
        ) -> tuple[Professor | None, dict[str, str]]:
            professor = await ProfessorRepository(session).get(siape)
            if professor is None:
                return None, {}
            codes = {str(item["code"]) for item in professor.disciplines}
            names = await SubjectCatalogRepository(session).subject_names(codes)
            return professor, names

        professor, names = await self._db.read(load)
        if professor is None:
            raise HTTPException(404, "Docente não encontrado.")
        return _details(professor, names)


ProfessorServiceDep = Annotated[ProfessorService, Depends()]
