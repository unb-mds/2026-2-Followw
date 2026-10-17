"""Inferência e ranking v2: somente fontes carregadas, sem banco ou rede."""

import re
from collections import defaultdict
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from api.modules.public_courses.service import _revision
from api.schemas import ClassroomOffer

_SEMESTER = re.compile(r"([0-9]{4})\.([0-9])")
_KIND_ORDER = {"required": 0, "optional": 1, "complementary": 2}
type Rules = list[list[str]] | None


class Model(BaseModel):
    model_config = ConfigDict(frozen=True, from_attributes=True)


class SubjectInfo(Model):
    code: str
    name: str
    hours: int | None
    unity_id: int | None
    unity: str | None


class CatalogSubject(SubjectInfo):
    catalog_complete: bool
    prerequisites: Rules
    corequisites: Rules
    equivalences: Rules

    @property
    def complete(self) -> bool:
        return bool(
            self.catalog_complete
            and self.code.strip()
            and self.name.strip()
            and self.hours
            and self.hours > 0
            and self.unity_id is not None
            and self.unity_id > 0
            and self.unity is not None
        )


class Offer(Model, ClassroomOffer):
    id: UUID
    sigaa_id: int | None
    number: str
    semester: str
    schedule: str | None
    room: str | None
    professors: tuple[str, ...] | None
    availability: Literal["available", "full", "unknown"]
    is_locked: bool


class CurriculumInfo(Model):
    id: UUID
    sigaa_id: int
    code: str
    valid_from: str
    shift: str | None
    matrix: str


class Component(Model):
    subject_code: str
    kind: Literal["required", "optional", "complementary"]
    period: int | None


class HistoryEntry(Model):
    code: str
    semester: str
    approved: bool
    enrolled: bool
    classroom_id: UUID
    grade_synced_at: datetime | None
    freshness: Literal["fresh", "stale", "frozen"]


class History(Model):
    sources: tuple[str, ...] = ("profile", "own_student_classrooms", "grades")
    profile_synced_at: datetime
    classrooms_synced_at: datetime
    profile_freshness: str
    classrooms_freshness: str
    grades: list[HistoryEntry]


class Context(Model):
    offer_semester: str | None
    offer_method: str = "latest_listed_snapshot"
    course_id: int | None
    unity_id: int | None
    curriculum: CurriculumInfo | None
    curriculum_selection: Literal["estimated"] = "estimated"
    curriculum_method: str
    history_reference: str | None
    history_reference_method: str = "earliest_own_student_semester"
    period: int | None
    period_method: str
    target_period: int | None = None


class Reason(Model):
    code: Literal[
        "target_period",
        "same_unity",
        "required",
        "unlocks",
        "overdue",
        "optional",
        "equivalent",
    ]
    points: int


class Equivalent(Model):
    code: str
    name: str


class Badge(Model):
    code: Literal["equivalent"] = "equivalent"
    text: str


class Recommendation(Model):
    subject: SubjectInfo
    kind: str | None
    period: int | None
    score: int
    reasons: list[Reason]
    unlocked_subject_codes: list[str]
    equivalent_to: list[Equivalent]
    badges: list[Badge]
    classrooms: list[Offer]


class Warning(Model):
    code: str
    message: str


class Diagnostics(Model):
    offered_subjects: int
    offered_classrooms: int
    excluded: dict[str, int]
    context_state: Literal["estimated", "reduced", "offer_unavailable"]


class Recommendations(Model):
    score_version: Literal["v2"] = "v2"
    total: int
    items: list[Recommendation]
    context: Context
    history: History
    diagnostics: Diagnostics
    warnings: list[Warning]


def semester(value: str) -> tuple[int, int] | None:
    match = _SEMESTER.fullmatch(value)
    return (int(match[1]), int(match[2])) if match else None


def normalize(code: str) -> str:
    return code.strip().upper()


def satisfies(rules: Rules, approved: set[str]) -> bool:
    return not rules or any(
        all(normalize(code) in approved for code in group) for group in rules
    )


def select_curriculum(
    options: list[CurriculumInfo],
    offer: str | None,
    reference: str | None,
    shift: str | None,
) -> tuple[CurriculumInfo | None, str]:
    target = semester(offer) if offer else None
    eligible = [
        c
        for c in options
        if target and semester(c.valid_from) and semester(c.valid_from) <= target
    ]
    shift = {"DIURNO": "D", "NOTURNO": "N", "MATUTINO": "D", "VESPERTINO": "D"}.get(
        shift, shift
    )
    if shift:
        eligible = [c for c in eligible if c.shift == shift] or [
            c for c in eligible if c.shift is None
        ]
    if not eligible:
        return None, "unavailable"
    previous = [
        c
        for c in eligible
        if reference and semester(c.valid_from) <= semester(reference)
    ]
    if previous:
        valid_from = max(semester(c.valid_from) for c in previous)
        method = "history_reference"
    elif reference:
        valid_from = min(semester(c.valid_from) for c in eligible)
        method = "earliest_eligible_fallback"
    else:
        valid_from = max(semester(c.valid_from) for c in eligible)
        method = "latest_without_history"
    return max(
        (c for c in eligible if semester(c.valid_from) == valid_from), key=_revision
    ), method


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


def infer_period(
    components: dict[str, Component], approved: set[str], enrolled: set[str]
) -> tuple[int | None, str]:
    required = {
        code: c.period
        for code, c in components.items()
        if c.kind == "required" and c.period and c.period > 0
    }
    if not required:
        return None, "unavailable"
    current = sorted(period for code, period in required.items() if code in enrolled)
    if current:
        return current[(len(current) - 1) // 2], "enrolled_lower_median"
    periods: dict[int, set[str]] = defaultdict(set)
    for code, period in required.items():
        periods[period].add(code)
    for period, codes in sorted(periods.items()):
        if len(codes & approved) * 2 < len(codes):
            return period, "first_below_half"
    pending = [p for p, codes in periods.items() if codes - approved]
    if pending:
        return max(pending), "last_pending"
    return max(periods) + 1, "required_flow_completed"


def rank(
    *,
    context: Context,
    history: History,
    catalog: dict[str, CatalogSubject],
    offers: dict[str, list[Offer]],
    components: list[Component],
    limit: int,
) -> Recommendations:
    completed = {normalize(e.code) for e in history.grades if e.approved}
    prior = (
        {
            normalize(e.code)
            for e in history.grades
            if e.approved and semester(e.semester) < semester(context.offer_semester)
        }
        if context.offer_semester
        else set()
    )
    enrolled = {
        normalize(e.code)
        for e in history.grades
        if e.enrolled and e.semester == context.offer_semester
    } - completed
    curriculum = components_by_code(components)
    period, method = infer_period(curriculum, prior, enrolled)
    target_period = period + 1 if method == "enrolled_lower_median" else period
    context = context.model_copy(
        update={
            "period": period,
            "period_method": method,
            "target_period": target_period,
        }
    )
    pending = {
        code: catalog[code]
        for code in curriculum
        if code in catalog
        and catalog[code].complete
        and code not in completed | enrolled
    }
    prerequisite_index: dict[str, set[str]] = defaultdict(set)
    equivalence_index: dict[str, set[str]] = defaultdict(set)
    for code, subject in pending.items():
        for rules, index in (
            (subject.prerequisites, prerequisite_index),
            (subject.equivalences, equivalence_index),
        ):
            for group in rules or []:
                for reference in group:
                    index[normalize(reference)].add(code)
    excluded = dict.fromkeys(
        (
            "catalog_incomplete",
            "completed",
            "enrolled",
            "prerequisites",
            "corequisites",
            "curriculum_unavailable",
            "free_module",
        ),
        0,
    )
    items = []
    for code, classrooms in offers.items():
        subject = catalog.get(code)
        reason = (
            "catalog_incomplete"
            if subject is None or not subject.complete
            else "completed"
            if code in completed
            else "enrolled"
            if code in enrolled
            else "prerequisites"
            if not satisfies(subject.prerequisites, prior)
            else "corequisites"
            if not satisfies(subject.corequisites, prior)
            else None
        )
        if reason:
            excluded[reason] += 1
            continue
        after = prior | {code}
        unlocked = sorted(
            y
            for y in prerequisite_index[code] - {code}
            if not satisfies(pending[y].prerequisites, prior)
            and satisfies(pending[y].prerequisites, after)
            and satisfies(pending[y].corequisites, after)
        )
        equivalent = [
            Equivalent(code=y, name=pending[y].name)
            for y in sorted(equivalence_index[code] - {code})
            if curriculum[y].kind == "required"
            and not satisfies(pending[y].equivalences, prior)
            and satisfies(pending[y].equivalences, after)
        ]
        component = curriculum.get(code)
        kind = component.kind if component else None
        if context.curriculum is None:
            excluded["curriculum_unavailable"] += 1
            continue
        if component is None and not equivalent:
            excluded["free_module"] += 1
            continue
        suggested = component.period if component else None
        required = kind == "required"
        points = {
            "target_period": 40
            if required and target_period and suggested == target_period
            else 0,
            "same_unity": 30
            if context.unity_id is not None and subject.unity_id == context.unity_id
            else 0,
            "required": 50 if required else 0,
            "unlocks": 5 * min(len(unlocked), 4),
            "overdue": 15
            if required and period and suggested and 0 < suggested < period
            else 0,
            "optional": 5 if kind == "optional" else 0,
            "equivalent": 10 if equivalent else 0,
        }
        reasons = [
            Reason(code=key, points=value) for key, value in points.items() if value
        ]
        items.append(
            Recommendation(
                subject=SubjectInfo.model_validate(subject),
                kind=kind,
                period=suggested,
                score=sum(points.values()),
                reasons=reasons,
                unlocked_subject_codes=unlocked,
                equivalent_to=equivalent,
                badges=[
                    Badge(text=f"Equivalente a {e.code} — {e.name}") for e in equivalent
                ],
                classrooms=sorted(classrooms, key=lambda c: (c.number, str(c.id))),
            )
        )
    items.sort(
        key=lambda i: (
            -i.score,
            i.kind != "required",
            i.period if i.period and i.period > 0 else float("inf"),
            i.subject.code,
        )
    )
    warnings = [
        Warning(
            code="estimated_context",
            message="Matriz e período são estimativas pelo perfil, histórico disponível e fluxo curricular; não são vínculo oficial nem ingresso confirmado.",
        ),
        Warning(
            code="offer_snapshot",
            message="Oferta e lotação são da última coleta carregada, não em tempo real. Horário e sala podem vir de sincronizações anteriores.",
        ),
        Warning(
            code="partial_academic_history",
            message="O histórico de turmas não contém todas as dispensas e integralizações oficiais; requisitos cadastrados não garantem autorização de matrícula.",
        ),
        Warning(
            code="equivalences_score_only",
            message="Equivalências direcionais servem somente ao score e selo; não satisfazem requisitos nem comprovam integralização oficial.",
        ),
    ]
    if not context.curriculum:
        warnings.append(
            Warning(
                code="curriculum_unavailable",
                message="Sem matriz utilizável; recomendações suspensas por não ser possível distinguir módulo livre.",
            )
        )
    if context.course_id is None or context.unity_id is None:
        warnings.append(
            Warning(
                code="course_unavailable",
                message="Curso/unidade não identificados; sem bônus de unidade.",
            )
        )
    if context.curriculum_method == "earliest_eligible_fallback":
        warnings.append(
            Warning(
                code="curriculum_history_fallback",
                message="O histórico começa antes das vigências disponíveis; usada a mais antiga elegível.",
            )
        )
    if period is None:
        warnings.append(
            Warning(
                code="period_unavailable",
                message="Sem obrigatórias com período conhecido; bônus de período desativados.",
            )
        )
    if method == "required_flow_completed":
        warnings.append(
            Warning(
                code="required_flow_completed",
                message="Todas as obrigatórias do fluxo possuem aprovação anterior no histórico disponível.",
            )
        )
    stale = (
        history.profile_freshness == "stale"
        or history.classrooms_freshness == "stale"
        or any(e.freshness == "stale" for e in history.grades)
    )
    if stale:
        warnings.append(
            Warning(
                code="stale_history",
                message="Parte do contexto usa cache vencido permitido pela política de sincronização.",
            )
        )
    if context.offer_semester is None:
        warnings.append(
            Warning(
                code="offer_unavailable",
                message="Nenhum snapshot de oferta válido carregado.",
            )
        )
    state = (
        "offer_unavailable"
        if context.offer_semester is None
        else "reduced"
        if context.curriculum is None or period is None or context.unity_id is None
        else "estimated"
    )
    return Recommendations(
        total=len(items),
        items=items[:limit],
        context=context,
        history=history,
        diagnostics=Diagnostics(
            offered_subjects=len(offers),
            offered_classrooms=sum(map(len, offers.values())),
            excluded=excluded,
            context_state=state,
        ),
        warnings=warnings,
    )
