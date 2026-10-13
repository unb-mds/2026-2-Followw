import pytest

from api.search import normalize_search


@pytest.mark.parametrize(
    "value,expected",
    [
        ("  COMPILAÇÃO\tDE\nPROGRAMAS ", "compilacao de programas"),
        ("Straße", "strasse"),
        ("FGA0003", "fga0003"),
        (" \t", ""),
        ("", ""),
    ],
)
def test_normalize_search(value, expected):
    assert normalize_search(value) == expected
