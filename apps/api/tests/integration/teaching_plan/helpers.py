from datetime import date

from pydantic import SecretStr
from sigaa_client import (
    ClassroomTeachingPlan,
    Credentials,
    TeachingPlanAssessment,
    TeachingPlanReference,
    TeachingPlanScheduleEntry,
)

CREDENTIALS = Credentials(registration="251000000", password=SecretStr("senha123"))
PATH = "/classrooms/123/teaching-plan"
LOGIN = {
    "registration": CREDENTIALS.registration,
    "password": CREDENTIALS.password.get_secret_value(),
}
PLAN = ClassroomTeachingPlan(
    methodology="Aulas **práticas**.",
    assessment_procedures="Média das provas.",
    office_hours=None,
    schedule=(
        TeachingPlanScheduleEntry(
            start_date=date(2026, 8, 11),
            end_date=date(2026, 9, 17),
            description="Material A1",
        ),
    ),
    assessments=(
        TeachingPlanAssessment(date=date(2026, 10, 29), description="Avaliação A2"),
    ),
    basic_references=(
        TeachingPlanReference(material_type="Outros", description="Álgebra."),
    ),
    complementary_references=(),
)
