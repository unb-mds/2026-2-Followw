from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sigaa_client import (
    RestaurantCredentials,
    RestaurantStatement,
)

from .helpers import (
    _entry,
)


@pytest.fixture
def documents(stub_sigaa):
    pdf = b"%PDF-1.7\n%teste\n%%EOF"
    stub_sigaa.documents = SimpleNamespace(
        get_student_card_pdf=AsyncMock(return_value=pdf),
        get_transcript_pdf=AsyncMock(return_value=pdf),
    )
    return stub_sigaa.documents


@pytest.fixture
def restaurant(stub_sigaa):
    stub_sigaa.restaurant = SimpleNamespace(
        get_restaurant_statement=AsyncMock(
            return_value=RestaurantStatement(
                balance=Decimal("12.50"),
                group=2,
                entries=(
                    _entry("Saldo", "12.50"),
                    _entry("Grupo 2 Almoço", "6.10"),
                ),
            )
        ),
        get_restaurant_credentials=AsyncMock(
            return_value=RestaurantCredentials(
                token="TOKEN-TESTE",
                valid_until=date(2027, 3, 1),
            )
        ),
    )
    return stub_sigaa.restaurant
