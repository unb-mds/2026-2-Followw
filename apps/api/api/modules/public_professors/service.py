from typing import Annotated

from fastapi import Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sigaa_client import ProfessorDegree, ProfessorDiscipline
from sigaa_client.config import PUBLIC_PROFESSOR_PROFILE_PATH, SIGAA_BASE_URL
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.main import DatabaseDep
from api.db.models import Professor, Subject
from api.db.units import find_unit
from api.modules.public_professors.repository import ProfessorRepository
from api.schemas import UnitRef


class ProfessorItem(BaseModel):
    model_config = ConfigDict(frozen=True)

    siape: int
    name: str
    unit: UnitRef
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
        unit=UnitRef.model_validate(professor.unit),
        photo=professor.photo,
        url=f"{SIGAA_BASE_URL}{PUBLIC_PROFESSOR_PROFILE_PATH}?siape={professor.siape}",
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
            codes = {
                d["code"] if isinstance(d, dict) else d.code
                for d in (professor.disciplines or [])
                if (isinstance(d, dict) and "code" in d) or hasattr(d, "code")
            }
            subject_names: dict[str, str] = {}
            if codes:
                result = await session.execute(
                    select(Subject.code, Subject.name).where(Subject.code.in_(codes))
                )
                subject_names = dict(result.all())
            return professor, subject_names

        professor, subject_names = await self._db.read(load)
        if professor is None:
            raise HTTPException(404, "Docente não encontrado.")

        disciplines = [
            ProfessorDiscipline(
                semester=d["semester"] if isinstance(d, dict) else d.semester,
                code=d["code"] if isinstance(d, dict) else d.code,
                occurrences=(
                    d.get("occurrences", 1)
                    if isinstance(d, dict)
                    else getattr(d, "occurrences", 1)
                ),
                name=subject_names.get(d["code"] if isinstance(d, dict) else d.code),
            )
            for d in (professor.disciplines or [])
        ]

        return ProfessorDetails(
            **_item(professor).model_dump(),
            description=professor.description,
            education=professor.education or [],
            interests=professor.interests,
            lattes=professor.lattes,
            email=professor.email,
            disciplines=disciplines,
        )


ProfessorServiceDep = Annotated[ProfessorService, Depends()]
