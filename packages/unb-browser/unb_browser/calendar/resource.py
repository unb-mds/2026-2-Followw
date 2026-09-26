import json
from functools import lru_cache
from importlib import resources

from .models import AcademicCalendar, SemesterCalendar


@lru_cache(maxsize=1)
def load_academic_calendar() -> AcademicCalendar:
    """Carrega o calendário acadêmico estático em memória a partir do JSON."""
    data_path = resources.files("unb_browser.calendar").joinpath("academic_calendar.json")
    with data_path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    return AcademicCalendar.model_validate(data)


class Calendar:
    """Resource de consulta ao calendário acadêmico oficial da UnB."""

    def __init__(self) -> None:
        self._calendar = load_academic_calendar()

    def get_calendar(self) -> AcademicCalendar:
        """Devolve o calendário acadêmico completo."""
        return self._calendar

    def get_semester(self, semester: str) -> SemesterCalendar | None:
        """Devolve os dados de um semestre específico (ex: '2026.1')."""
        return self._calendar.get_semester(semester)

    def list_semesters(self) -> tuple[SemesterCalendar, ...]:
        """Lista todos os semestres disponíveis."""
        return self._calendar.list_semesters()
