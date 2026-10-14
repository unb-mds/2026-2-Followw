from bs4 import Tag

from ..exceptions import SigaaParseError, SigaaSearchError
from ..models import Unit
from ..utils.parsing import clean_text, lookup_key

_AMBIGUOUS_SAMPLE = 3


def parse_units(form: Tag, field: str) -> list[Unit]:
    select = form.find("select", attrs={"name": field})
    if not isinstance(select, Tag):
        raise SigaaParseError(f"Select `{field}` de unidades não encontrado na busca.")
    return [
        Unit(id=int(value), name=clean_text(option))
        for option in select.find_all("option")
        if (value := str(option.get("value") or "")).isdigit() and int(value) > 0
    ]


def resolve_unit(units: list[Unit], wanted: Unit | int | str) -> int:
    if isinstance(wanted, Unit):
        return wanted.id
    if isinstance(wanted, int):
        return wanted
    if wanted.isdigit():
        return int(wanted)
    needle = lookup_key(wanted)
    matches = [unit for unit in units if needle in lookup_key(unit.name)]
    if not matches:
        raise SigaaSearchError(f"Nenhuma unidade casa com `{wanted}`.")
    if len(matches) > 1:
        names = ", ".join(unit.name for unit in matches[:_AMBIGUOUS_SAMPLE])
        rest = len(matches) - _AMBIGUOUS_SAMPLE
        raise SigaaSearchError(
            f"`{wanted}` casa com {len(matches)} unidades: {names}"
            + (f" e mais {rest}." if rest > 0 else ".")
        )
    return matches[0].id
