from datetime import date
from unittest.mock import AsyncMock

import pytest

from .helpers import (
    CREDENCIAIS,
    CURRENT,
    FREQUENCY,
    NOT_REGISTERED,
    OLD,
    SCHEDULED,
    SECOND,
)


@pytest.fixture
def account(stub_sigaa):
    stub_sigaa.classrooms.list_classrooms.return_value = [SECOND, OLD, CURRENT]
    stub_sigaa.classrooms.get_classroom_frequency = AsyncMock(return_value=FREQUENCY)
    return stub_sigaa


@pytest.fixture
def scheduled(account):
    """Só a turma atual, com horário e sem chamada no SIGAA."""
    account.classrooms.list_classrooms.return_value = [SCHEDULED]
    account.classrooms.get_classroom_frequency.return_value = NOT_REGISTERED
    return account


@pytest.fixture
def logged(client, cookies):
    client.cookies.update(cookies(access="tok", refresh=CREDENCIAIS))
    return client


@pytest.fixture
def depois_da_aula(hoje):
    hoje(date(2026, 9, 25))
