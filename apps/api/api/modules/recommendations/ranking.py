from collections import defaultdict
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from api.modules.public_courses.service import in_force, revision

_KIND_ORDER = {"required": 0, "optional": 1, "complementary": 2}
_SHIFTS = {"DIURNO": "D", "NOTURNO": "N"}
type Rules = list[list[str]] | None


class Model(BaseModel):
    model_config = ConfigDict(frozen=True, from_attributes=True)


class CatalogSubject(Model):
    code: str
    hours: int | None
    unity_id: int | None
    prerequisites: Rules
    corequisites: Rules


class CurriculumInfo(Model):
    id: UUID
    sigaa_id: int
    code: str
    valid_from: str
    shift: str | None


class Component(Model):
    subject_code: str
    kind: Literal["required", "optional", "complementary"]
    period: int | None


type ReasonCode = Literal[
    "required",
    "target_period",
    "overdue",
    "same_unity",
    "chain_length",
    "chain_width",
    "hours",
]


class Reason(Model):
    code: ReasonCode
    points: int
    # Quantidade medida nos critérios acumulativos: semestres, matérias ou horas.
    value: int | None = None


class Recommendation(Model):
    code: str
    score: int
    reasons: list[Reason]


def normalize(code: str) -> str:
    return code.strip().upper()


def satisfies(rules: Rules, approved: set[str]) -> bool:
    return not rules or any(
        all(normalize(code) in approved for code in group) for group in rules
    )


def select_curriculum(
    options: list[CurriculumInfo], entry: str, shift: str | None
) -> CurriculumInfo | None:
    """A matriz vigente no semestre de entrada, do turno do curso."""
    shift = _SHIFTS.get(shift, shift)
    if shift:
        options = [c for c in options if c.shift == shift] or [
            c for c in options if c.shift is None
        ]
    return max(in_force(options, entry), key=revision, default=None)


def components_by_code(components: list[Component]) -> dict[str, Component]:
    grouped: dict[str, list[Component]] = defaultdict(list)
    for component in components:
        grouped[normalize(component.subject_code)].append(component)
    result = {}
    for code, items in grouped.items():
        kind = min((c.kind for c in items), key=_KIND_ORDER.get)
        periods = [
            c.period
            for c in items
            if c.kind == "required" and c.period and c.period > 0
        ]
        period = (
            min(periods)
            if kind == "required" and periods
            else 0
            if kind == "optional"
            else None
        )
        result[code] = Component(subject_code=code, kind=kind, period=period)
    return result


def target_period(
    components: dict[str, Component], done: set[str], enrolled: set[str]
) -> int | None:
    """O período do próximo semestre no fluxo de obrigatórias."""
    required = {
        code: c.period
        for code, c in components.items()
        if c.kind == "required" and c.period and c.period > 0
    }
    if not required:
        return None
    current = sorted(period for code, period in required.items() if code in enrolled)
    if current:
        return current[(len(current) - 1) // 2] + 1
    periods: dict[int, set[str]] = defaultdict(set)
    for code, period in required.items():
        periods[period].add(code)
    for period, codes in sorted(periods.items()):
        if len(codes & done) * 2 < len(codes):
            return period
    pending = [p for p, codes in periods.items() if codes - done]
    return max(pending) if pending else max(periods) + 1


def subject_kind(
    curriculum: dict[str, Component], code: str
) -> Literal["mandatory", "optional", "free"]:
    """O tipo da matéria na matriz; complementares contam como optativas."""
    component = curriculum.get(normalize(code))
    if component is None:
        return "free"
    return "mandatory" if component.kind == "required" else "optional"


def dependency_graph(pending: dict[str, CatalogSubject]) -> dict[str, set[str]]:
    """Para cada código, as pendentes que o têm como pré-requisito."""
    graph: dict[str, set[str]] = defaultdict(set)
    for code, subject in pending.items():
        for group in subject.prerequisites or []:
            for reference in group:
                if normalize(reference) != code:
                    graph[normalize(reference)].add(code)
    return graph


def chain_length(
    code: str, graph: dict[str, set[str]], memo: dict[str, int] | None = None
) -> int:
    """Semestres da cadeia mais longa que depende de `code`, sem contá-lo."""
    memo = {} if memo is None else memo
    if code not in memo:
        memo[code] = 0  # Interrompe ciclos de pré-requisitos.
        memo[code] = max(
            (1 + chain_length(child, graph, memo) for child in graph.get(code, ())),
            default=0,
        )
    return memo[code]


def descendants(code: str, graph: dict[str, set[str]]) -> set[str]:
    found: set[str] = set()
    stack = [code]
    while stack:
        for child in graph.get(stack.pop(), ()):
            if child not in found and child != code:
                found.add(child)
                stack.append(child)
    return found


def rank(
    *,
    catalog: dict[str, CatalogSubject],
    offered: set[str],
    curriculum: dict[str, Component],
    completed: set[str],
    enrolled: set[str],
    unity_id: int | None,
) -> list[Recommendation]:
    """As ofertadas que o aluno pode cursar, da mais à menos prioritária.

    A recomendação é para o próximo semestre: as em andamento contam como concluídas.
    Fora da matriz é módulo livre, então sem matriz nada é recomendado.
    """
    done = completed | enrolled
    target = target_period(curriculum, done, enrolled)
    dependents = dependency_graph(
        {
            code: catalog[code]
            for code, component in curriculum.items()
            if code in catalog and code not in done and component.kind == "required"
        }
    )
    lengths: dict[str, int] = {}
    ranked = []
    for code in offered:
        subject, component = catalog[code], curriculum.get(code)
        if (
            component is None
            or code in done
            or not satisfies(subject.prerequisites, done)
            or not satisfies(subject.corequisites, done)
        ):
            continue
        period = component.period
        required = component.kind == "required"
        values = {
            "chain_length": chain_length(code, dependents, lengths) if required else 0,
            "chain_width": len(descendants(code, dependents)) if required else 0,
            "hours": subject.hours or 0,
        }
        points = {
            "required": 50 if required else 0,
            "target_period": 25 if required and target and period == target else 0,
            "overdue": 15 if required and target and period and period < target else 0,
            "same_unity": 5
            if unity_id is not None and subject.unity_id == unity_id
            else 0,
            "chain_length": 10 * values["chain_length"],
            "chain_width": 5 * values["chain_width"],
            "hours": values["hours"] // 15,
        }
        score = sum(points.values())
        order = (
            -score,
            not required,
            period if period and period > 0 else float("inf"),
            code,
        )
        reasons = sorted(
            (
                Reason(code=k, points=v, value=values.get(k))
                for k, v in points.items()
                if v
            ),
            key=lambda reason: -reason.points,
        )
        ranked.append((order, Recommendation(code=code, score=score, reasons=reasons)))
    return [recommendation for _, recommendation in sorted(ranked)]
