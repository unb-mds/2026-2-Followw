import pytest
from sigaa_client import Classroom, Subject

from .helpers import CREDENTIALS, PLAN


@pytest.fixture
def teaching_sigaa(stub_sigaa):
    stub_sigaa.classrooms.list_classrooms.return_value = [
        Classroom(
            id="AAA",
            sigaa_id=123,
            number="02",
            semester="2026.2",
            current=True,
            subject=Subject(code="FGA0108", name="MATEMÁTICA DISCRETA 2"),
        )
    ]
    stub_sigaa.classrooms.get_classroom_teaching_plan.return_value = PLAN
    return stub_sigaa


@pytest.fixture
def logged(client, cookies, teaching_sigaa):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    return client
