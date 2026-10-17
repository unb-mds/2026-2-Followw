from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
import pytest
from sigaa_client import (
    Classroom as SigaaClassroom,
)
from sigaa_client import (
    ClassroomGrade,
    Credentials,
    Grade,
)
from sigaa_client import (
    Subject as SigaaSubject,
)
from sqlalchemy import select

from api.db.enums import ClassroomRole, ClassroomStatus, UserLevel
from api.db.models import (
    Classroom,
    ClassroomParticipant,
    Course,
    Curriculum,
    CurriculumComponent,
    Subject,
    Unity,
    User,
)

NOW = datetime.now(UTC)
URL = "/me/recommendations"


class Scenario:
    def __init__(self, database, client):
        self.db = database
        self.client = client
        with database.begin() as session:
            session.add(Unity(id=99, code="OTHER", name="Outra unidade"))
            course = Course(name="ENGENHARIA DE SOFTWARE", shift="DIURNO", unity_id=673)
            session.add(course)
            session.flush()
            self.course_id = course.id
            user = User(
                name="Aluno",
                registration="251000000",
                level=UserLevel.GRADUACAO,
                course_id=course.id,
                profile_synced_at=NOW,
                classrooms_synced_at=NOW,
            )
            session.add(user)
            session.flush()
            self.user_id = user.id
        self.matrix = self.curriculum()

    def curriculum(
        self,
        *,
        code="100/1",
        valid_from="2020.1",
        shift="D",
        active=True,
        sigaa_id=None,
    ):
        with self.db.begin() as session:
            row = Curriculum(
                course_id=self.course_id,
                sigaa_id=sigaa_id or int(uuid4()) % 10000000,
                code=code,
                valid_from=valid_from,
                created_year=2000,
                active=active,
                shift=shift,
                matrix="Fluxo",
            )
            session.add(row)
            session.flush()
            return row.id

    def subject(self, code, *, offer=True, kind="optional", period=0, **fields):
        with self.db.begin() as session:
            row = Subject(
                code=code,
                name=fields.pop("name", code),
                hours=fields.pop("hours", 60),
                unity_id=fields.pop("unity_id", 673),
                catalog_complete=fields.pop("catalog_complete", True),
                **fields,
            )
            session.add(row)
            if offer:
                session.add(
                    Classroom(
                        subject_code=code,
                        number="01",
                        semester="2026.2",
                        listed_in_offer=True,
                    )
                )
        if kind:
            self.component(code, kind=kind, period=period)

    def component(self, code, *, kind="required", period=1, matrix=None):
        with self.db.begin() as session:
            session.add(
                CurriculumComponent(
                    curriculum_id=matrix or self.matrix,
                    subject_code=code,
                    kind=kind,
                    period=period,
                )
            )

    def history(
        self,
        code,
        *,
        grade=None,
        term="2026.1",
        enrolled=False,
        role=ClassroomRole.ALUNO,
        own=True,
        user_id=None,
        synced=NOW,
        status=None,
    ):
        with self.db.begin() as session:
            if session.get(Subject, code) is None:
                session.add(Subject(code=code, name=code))
            classroom = Classroom(subject_code=code, number=str(uuid4()), semester=term)
            session.add(classroom)
            session.flush()
            row = ClassroomParticipant(
                user_id=user_id or self.user_id,
                classroom_id=classroom.id,
                front_end_id=str(uuid4()) if own else None,
                role=role,
                grade=grade,
                status=status
                or (
                    ClassroomStatus.CURSANDO if enrolled else ClassroomStatus.CONCLUIDO
                ),
                grade_synced_at=synced,
                current=enrolled,
            )
            session.add(row)
            session.flush()
            return row.id

    def get(self, **kwargs):
        response = self.client.get(URL, **kwargs)
        assert response.status_code == 200, response.text
        assert response.headers["cache-control"] == "no-store"
        result = response.json()
        for item in result["items"]:
            assert item["score"] == sum(r["points"] for r in item["reasons"])
        return result


@pytest.fixture
def scene(database, client, cookies, stub_sigaa):
    client.cookies.update(
        cookies(refresh=Credentials(registration="251000000", password="senha"))
    )
    return Scenario(database, client)


def codes(result):
    return [i["subject"]["code"] for i in result["items"]]


def test_authentication(client):
    assert client.get(URL).status_code == 401


@pytest.mark.parametrize(
    "query",
    ["limit=0", "limit=101", "limit=x", "semester=2026.1", "period=1", "course_id=1"],
)
def test_only_limit_is_accepted(scene, query):
    assert scene.client.get(URL + "?" + query).status_code == 422


def test_undergraduate_only(scene):
    with scene.db.begin() as session:
        session.get(User, scene.user_id).level = UserLevel.MESTRADO
    assert scene.client.get(URL).status_code == 422


def test_eligible_universe_default_limit_order_and_empty_history(scene):
    for n in range(12):
        scene.subject(f"X{n:02}", unity_id=99, kind="complementary")
    scene.component("MISSING", period=1)
    result = scene.get()
    assert result["total"] == 12
    assert codes(result) == [f"X{n:02}" for n in range(10)]
    assert codes(scene.get(params={"limit": 100})) == [f"X{n:02}" for n in range(12)]
    assert result["context"]["period"] == 1
    assert result["context"]["curriculum_method"] == "latest_without_history"
    assert result["history"]["grades"] == []
    assert all(
        i["score"] == 0 and i["kind"] == "complementary" for i in result["items"]
    )
    assert scene.get() == result


def test_catalog_validations_and_disjoint_exclusions(scene):
    scene.subject("OK")
    scene.subject("PARTIAL", catalog_complete=False)
    scene.subject("ZERO", hours=0)
    scene.subject("NO_HOURS", hours=None)
    scene.subject("NO_UNITY", unity_id=None)
    scene.subject("BAD_UNITY", unity_id=999999)
    scene.subject("NAME", name=" ")
    scene.subject("APPROVED")
    scene.history("APPROVED", grade=Grade.MM)
    scene.history("PARTIAL", grade=Grade.SS)
    scene.subject("ENROLLED")
    scene.history("ENROLLED", enrolled=True, term="2026.2")
    scene.subject("PRE", prerequisites=[["UNKNOWN"]], corequisites=[["OTHER"]])
    scene.subject("CO", prerequisites=[], corequisites=[["UNKNOWN"]])
    result = scene.get()
    assert codes(result) == ["OK"]
    assert result["diagnostics"]["excluded"] == {
        "catalog_incomplete": 6,
        "completed": 1,
        "enrolled": 1,
        "prerequisites": 1,
        "corequisites": 1,
        "curriculum_unavailable": 0,
        "free_module": 0,
    }
    assert result["total"] == 1


@pytest.mark.parametrize("grade", [Grade.SS, Grade.MS, Grade.MM])
def test_approved_grades_and_repetition(scene, grade):
    scene.subject("A")
    scene.subject("B", prerequisites=[["A"]])
    scene.history("A", grade=grade, term="2025.2")
    scene.history("A", grade=Grade.MI, term="2026.1")
    assert codes(scene.get()) == ["B"]


def test_target_future_invalid_history_and_removed_enrollments(scene):
    for code in ("TARGET", "FUTURE", "FAILED", "REMOVED", "LOCKED"):
        scene.subject(code)
    scene.subject("NEEDS_TARGET", prerequisites=[["TARGET"]])
    scene.subject("NEEDS_FUTURE", prerequisites=[["FUTURE"]])
    scene.history("TARGET", grade=Grade.MM, term="2026.2", enrolled=True)
    scene.history("FUTURE", grade=Grade.SS, term="2027.1")
    scene.history("FAILED", grade=Grade.MI)
    scene.history("REMOVED", term="2026.2", status=ClassroomStatus.REMOVIDO)
    scene.history("LOCKED", term="2026.2", status=ClassroomStatus.TRANCADO)
    scene.history("FAILED", grade=Grade.SS, term="invalid")
    result = scene.get()
    assert set(codes(result)) == {"FUTURE", "FAILED", "REMOVED", "LOCKED"}
    assert result["context"]["offer_semester"] == "2026.2"
    assert len(result["history"]["grades"]) == 4


def test_only_own_student_links_and_user_isolation(scene):
    scene.subject("A", prerequisites=[["B"]])
    scene.history("B", grade=Grade.SS, role=ClassroomRole.MONITOR)
    scene.history("B", grade=Grade.SS, role=ClassroomRole.PROFESSOR)
    scene.history("B", grade=Grade.SS, own=False)
    with scene.db.begin() as session:
        user = User(name="Outro", registration="other")
        session.add(user)
        session.flush()
        other = user.id
    scene.history("B", grade=Grade.SS, user_id=other)
    result = scene.get()
    assert result["items"] == []
    assert result["history"]["grades"] == []


def test_requirements_and_or_no_concurrent_or_equivalent_credit(scene):
    scene.history("A", grade=Grade.MM)
    scene.subject("PASS", prerequisites=[["A", "B"], ["A"]], corequisites=[["A"]])
    scene.subject("AND", prerequisites=[["A", "B"]])
    scene.subject("CURRENT", prerequisites=[["C"]])
    scene.subject("CO", corequisites=[["C"]])
    scene.subject("EQUIV", prerequisites=[["Y"]])
    scene.subject("Y", offer=False, equivalences=[["A"]])
    scene.history("C", enrolled=True, term="2026.2")
    assert codes(scene.get()) == ["PASS"]


@pytest.mark.parametrize(
    ("approved", "expected", "method"),
    [
        ([], 1, "first_below_half"),
        (["A"], 2, "first_below_half"),
        (["A", "C"], 2, "last_pending"),
        (["A", "B", "C"], 2, "last_pending"),
        (["A", "B", "C", "D"], 3, "required_flow_completed"),
    ],
)
def test_half_threshold_missing_catalog_and_completion(
    scene, approved, expected, method
):
    for code, period in (("A", 1), ("B", 1), ("C", 2), ("D", 2)):
        scene.component(code, period=period)
    scene.subject("OFFER")
    for code in approved:
        scene.history(code, grade=Grade.MM)
    result = scene.get()
    assert result["context"]["period"] == expected
    assert result["context"]["period_method"] == method


def test_enrolled_lower_median_and_normalized_duplicate_components(scene):
    for code, period in (("A", 2), ("B", 4), ("C", 4), ("D", 6)):
        scene.component(code, period=period)
        scene.history(code, enrolled=True, term="2026.2")
    scene.component(" a ", period=8)
    scene.component("A", kind="optional", period=0)
    scene.subject("OLD", kind="required", period=1)
    scene.component("OLD", kind="optional", period=0)
    result = scene.get()
    assert result["context"]["period"] == 4
    assert result["context"]["target_period"] == 5
    assert result["context"]["period_method"] == "enrolled_lower_median"
    item = result["items"][0]
    assert item["kind"] == "required" and item["period"] == 1
    assert {r["code"] for r in item["reasons"]} == {"same_unity", "required", "overdue"}


def test_curriculum_selection_shift_revision_and_history(scene):
    scene.subject("A")
    scene.curriculum(code="100/2", valid_from="2024.1", sigaa_id=12)
    selected = scene.curriculum(code="100/3", valid_from="2024.1", sigaa_id=13)
    scene.curriculum(code="100/3", valid_from="2024.1", sigaa_id=11)
    scene.curriculum(code="100/99", valid_from="2024.1", shift="N")
    scene.curriculum(code="100/99", valid_from="2024.1", active=False)
    scene.curriculum(code="100/99", valid_from="2027.1")
    scene.curriculum(code="100/4", valid_from="2026.1")
    scene.history("H", term="2025.1", grade=Grade.MI)
    result = scene.get()
    assert result["context"]["curriculum"]["id"] == str(selected)
    assert result["context"]["curriculum_selection"] == "estimated"
    assert result["context"]["history_reference"] == "2025.1"
    assert result["context"]["curriculum_method"] == "history_reference"


def test_old_history_fallback_and_unknown_shift_fallback(scene):
    scene.subject("A")
    scene.history("H", term="2010.1")
    with scene.db.begin() as session:
        session.get(Curriculum, scene.matrix).shift = "N"
    fallback = scene.curriculum(shift=None, valid_from="2024.1")
    result = scene.get()
    assert result["context"]["curriculum"]["id"] == str(fallback)
    assert result["context"]["curriculum_method"] == "earliest_eligible_fallback"


@pytest.mark.parametrize(
    "mode", ["future", "opposite_shift", "no_course", "no_required_period"]
)
def test_reduced_context(scene, mode):
    scene.subject("A", kind="required", period=None, equivalences=[["X"]])
    scene.subject("X")
    with scene.db.begin() as session:
        if mode == "no_course":
            session.get(User, scene.user_id).course_id = None
        elif mode != "no_required_period":
            row = session.get(Curriculum, scene.matrix)
            if mode == "future":
                row.valid_from = "2027.1"
            else:
                row.shift = "N"
    result = scene.get()
    assert result["context"]["period"] is None
    assert result["diagnostics"]["context_state"] == "reduced"
    if mode != "no_required_period":
        assert result["context"]["curriculum"] is None
        assert result["items"] == []
        assert result["diagnostics"]["excluded"]["curriculum_unavailable"] == 2


def test_incremental_unlock_and_cap(scene):
    scene.subject("X")
    scene.history("A", grade=Grade.MM)
    for n in range(6):
        scene.subject(
            f"Y{n}", offer=False, kind="required", period=2, prerequisites=[["X"]]
        )
    scene.subject(
        "AND", offer=False, kind="required", period=2, prerequisites=[["X", "B"]]
    )
    scene.subject(
        "OR", offer=False, kind="required", period=2, prerequisites=[["X"], ["A"]]
    )
    scene.subject(
        "TRANSITIVE", offer=False, kind="required", period=3, prerequisites=[["Y0"]]
    )
    scene.subject(
        "CO",
        offer=False,
        kind="required",
        period=2,
        prerequisites=[["X"]],
        corequisites=[["B"]],
    )
    scene.subject(
        "CO_X",
        offer=False,
        kind="required",
        period=2,
        prerequisites=[["X"]],
        corequisites=[["X"]],
    )
    scene.subject(
        "PARTIAL",
        offer=False,
        kind="required",
        period=2,
        prerequisites=[["X"]],
        catalog_complete=False,
    )
    result = scene.get()["items"][0]
    assert result["unlocked_subject_codes"] == ["CO_X", *[f"Y{n}" for n in range(6)]]
    assert next(r["points"] for r in result["reasons"] if r["code"] == "unlocks") == 20


def test_directional_equivalence_incremental_and_single_bonus(scene):
    scene.subject("X", kind=None, equivalences=[["WRONG_DIRECTION"]])
    scene.subject("WRONG_DIRECTION", kind=None)
    scene.history("A", grade=Grade.MM)
    for code, rules in (
        ("Y", [["X", "A"]]),
        ("Z", [["X"]]),
        ("AND", [["X", "B"]]),
        ("OR", [["X"], ["A"]]),
    ):
        scene.subject(code, offer=False, kind="required", period=1, equivalences=rules)
    scene.subject("DONE", offer=False, kind="required", period=1, equivalences=[["X"]])
    scene.history("DONE", grade=Grade.MM)
    scene.subject(
        "ONGOING", offer=False, kind="required", period=1, equivalences=[["X"]]
    )
    scene.history("ONGOING", term="2026.2", enrolled=True)
    result = scene.get()
    item = result["items"][0]
    assert item["subject"]["code"] == "X"
    assert item["score"] == 40 and item["kind"] is None and item["period"] is None
    assert item["equivalent_to"] == [
        {"code": "Y", "name": "Y"},
        {"code": "Z", "name": "Z"},
    ]
    assert item["badges"] == [
        {"code": "equivalent", "text": f"Equivalente a {c} — {c}"} for c in ("Y", "Z")
    ]
    assert len(result["items"]) == 1
    assert result["diagnostics"]["excluded"]["free_module"] == 1


@pytest.mark.parametrize(
    ("vacancies", "occupied", "availability"),
    [
        (10, 9, "available"),
        (10, 10, "full"),
        (10, 11, "full"),
        (None, 0, "unknown"),
        (10, None, "unknown"),
    ],
)
def test_classrooms_availability_and_unknown_operational_details(
    scene, vacancies, occupied, availability
):
    scene.subject("A")
    with scene.db.begin() as session:
        classroom = session.scalar(
            select(Classroom).where(Classroom.subject_code == "A")
        )
        classroom.vacancies, classroom.occupied = vacancies, occupied
        session.add(
            Classroom(
                subject_code="A", number="00", semester="2026.2", listed_in_offer=True
            )
        )
    result = scene.get()
    assert result["total"] == 1
    offers = result["items"][0]["classrooms"]
    assert [c["number"] for c in offers] == ["00", "01"]
    assert offers[1]["availability"] == availability
    assert offers[1]["is_locked"] == (availability == "full")
    assert offers[1]["schedule"] is None and offers[1]["room"] is None
    assert offers[1]["professors"] is None and offers[1]["sigaa_id"] is None


def test_unmarked_history_is_never_offer_fallback(scene):
    scene.subject("A", offer=False)
    scene.history("A", term="2099.2")
    result = scene.get()
    assert result["items"] == []
    assert result["context"]["offer_semester"] is None
    assert "offer_unavailable" in {w["code"] for w in result["warnings"]}


def test_score_examples_110_100_80(scene):
    for code, period, unlocks in (("ED", 3, 4), ("BD", 3, 2), ("CALC", 1, 3)):
        scene.subject(code, kind="required", period=period, unity_id=99)
        for n in range(unlocks):
            scene.subject(
                f"{code}{n}",
                offer=False,
                kind="required",
                period=3,
                prerequisites=[[code]],
            )
    scene.component("CURRENT", period=2)
    scene.history("CURRENT", enrolled=True, term="2026.2")
    result = scene.get()
    assert [(i["subject"]["code"], i["score"]) for i in result["items"]] == [
        ("ED", 110),
        ("BD", 100),
        ("CALC", 80),
    ]


def test_maximum_150_and_optional_complementary(scene):
    scene.subject("X", kind="required", period=1)
    scene.subject("OPT", kind="optional", period=9)
    scene.subject("COMP", kind="complementary", period=9)
    for n in range(4):
        scene.subject(
            f"Y{n}", offer=False, kind="required", period=2, prerequisites=[["X"]]
        )
    scene.subject("Z", offer=False, kind="required", period=2, equivalences=[["X"]])
    items = scene.get()["items"]
    assert [(i["score"], i["period"]) for i in items] == [(150, 1), (35, 0), (30, None)]


def test_missing_grades_sync_before_ranking(scene, stub_sigaa):
    scene.subject("A")
    scene.subject("B", prerequisites=[["A"]])
    scene.history("A", synced=None)
    stub_sigaa.classrooms.list_grades.return_value = [
        ClassroomGrade(subject_code="A", semester="2026.1", grade=Grade.MM)
    ]
    assert codes(scene.get()) == ["B"]
    stub_sigaa.classrooms.list_grades.assert_awaited_once()


def test_missing_history_differs_from_synced_empty(scene, stub_sigaa):
    scene.subject("A")
    scene.get()
    stub_sigaa.classrooms.list_classrooms.assert_not_awaited()
    with scene.db.begin() as session:
        session.get(User, scene.user_id).classrooms_synced_at = None
    scene.get()
    stub_sigaa.classrooms.list_classrooms.assert_awaited_once()


def test_only_cached_missing_history_and_origin_failure(scene, stub_sigaa):
    scene.subject("A")
    scene.history("B", synced=None)
    assert (
        scene.client.get(URL, headers={"Cache-Control": "only-if-cached"}).status_code
        == 504
    )
    stub_sigaa.classrooms.list_grades.side_effect = httpx.ConnectError("offline")
    assert scene.client.get(URL).status_code == 502


def test_stale_grades_swr_and_no_cache(scene, stub_sigaa, qstash):
    scene.subject("A")
    link_id = scene.history("A", term="2026.2", synced=NOW - timedelta(days=2))
    stub_sigaa.classrooms.list_grades.return_value = [
        ClassroomGrade(subject_code="A", semester="2026.2", grade=Grade.MM)
    ]
    first = scene.get()
    assert codes(first) == ["A"]
    assert "stale_history" in {w["code"] for w in first["warnings"]}
    assert any(
        step.task == "sync_grades" for job in qstash.jobs() for step in job.steps
    )
    assert scene.get()["items"] == []
    with scene.db.begin() as session:
        row = session.get(ClassroomParticipant, link_id)
        row.grade = None
        row.grade_synced_at = NOW
    # A revalidação das turmas precisa preservar o vínculo da fonte sintética.
    with scene.db() as session:
        row = session.get(ClassroomParticipant, link_id)
        classroom = session.get(Classroom, row.classroom_id)
        stub_sigaa.classrooms.list_classrooms.return_value = [
            SigaaClassroom(
                id=row.front_end_id,
                number=classroom.number,
                semester="2026.2",
                current=True,
                subject=SigaaSubject(code="A", name="A", hours=60),
            )
        ]
    assert scene.get(headers={"Cache-Control": "no-cache"})["items"] == []
    stub_sigaa.profile.get_profile.assert_awaited_once()
    stub_sigaa.classrooms.list_classrooms.assert_awaited_once()
    assert stub_sigaa.classrooms.list_grades.await_count == 2


def test_openapi_tag_and_contract(scene):
    schema = scene.client.get("/openapi.json").json()
    operation = schema["paths"][URL]["get"]
    assert operation["tags"] == ["Recommendations"]
    assert {p["name"] for p in operation["parameters"] if p["in"] == "query"} == {
        "limit"
    }
    assert any("Recommendations" in group["tags"] for group in schema["x-tagGroups"])


@pytest.mark.parametrize(
    ("changes", "expected"),
    [({}, True), ({"name": "Outro"}, False), ({"hours": 90}, False)],
)
def test_sync_preserves_only_unchanged_certified_fields(
    scene, stub_sigaa, changes, expected
):
    scene.subject("A")
    stub_sigaa.classrooms.list_classrooms.return_value = [
        SigaaClassroom(
            id="a",
            number="01",
            semester="2026.2",
            current=True,
            subject=SigaaSubject(code="A", **({"name": "A", "hours": 60} | changes)),
        )
    ]
    assert (
        scene.client.get(
            "/classrooms", headers={"Cache-Control": "no-cache"}
        ).status_code
        == 200
    )
    with scene.db() as session:
        assert session.get(Subject, "A").catalog_complete is expected
        assert session.scalar(select(Classroom)).listed_in_offer is True


def test_sync_partial_subjects_do_not_gain_certification_or_public_offer(
    scene, stub_sigaa
):
    stub_sigaa.classrooms.list_classrooms.return_value = [
        SigaaClassroom(
            id="a",
            number="01",
            semester="2026.2",
            current=True,
            subject=SigaaSubject(code="A", name="A", hours=60, unity="FCTE"),
        )
    ]
    assert (
        scene.client.get(
            "/classrooms", headers={"Cache-Control": "no-cache"}
        ).status_code
        == 200
    )
    with scene.db() as session:
        assert not session.get(Subject, "A").catalog_complete
        assert not session.scalar(select(Classroom)).listed_in_offer


def test_frozen_grades_are_not_revalidated(scene, stub_sigaa):
    scene.subject("A")
    scene.history("H", grade=Grade.MM, term="2020.1")
    scene.get(headers={"Cache-Control": "only-if-cached"})
    stub_sigaa.classrooms.list_grades.assert_not_awaited()
    assert scene.get()["history"]["grades"][0]["freshness"] == "frozen"


def test_profile_missing_sync_and_failures(scene, stub_sigaa):
    scene.subject("A")
    with scene.db.begin() as session:
        session.get(User, scene.user_id).profile_synced_at = None
    assert (
        scene.client.get(URL, headers={"Cache-Control": "only-if-cached"}).status_code
        == 504
    )
    scene.get()
    stub_sigaa.profile.get_profile.assert_awaited_once()


def test_ties_required_then_positive_period_then_code(scene):
    # Optativa com desbloqueios e equivalência empata com obrigatórias atrasadas.
    scene.subject("R", kind="required", period=1, unity_id=99)
    scene.subject("Z", kind="required", period=2, unity_id=99)
    scene.subject("A")
    for n in range(4):
        scene.subject(
            f"UNLOCK{n}", offer=False, kind="required", period=6, prerequisites=[["A"]]
        )
    scene.subject("EQUIV", offer=False, kind="required", period=6, equivalences=[["A"]])
    scene.component("CURRENT", period=4)
    scene.history("CURRENT", term="2026.2", enrolled=True)
    items = scene.get()["items"]
    assert [(i["subject"]["code"], i["score"]) for i in items] == [
        ("R", 65),
        ("Z", 65),
        ("A", 65),
    ]


def test_latest_marked_offer_and_invalid_semesters(scene):
    scene.subject("A")
    scene.subject("OLD", offer=False)
    with scene.db.begin() as session:
        session.add(
            Classroom(
                subject_code="OLD", number="01", semester="2025.2", listed_in_offer=True
            )
        )
        session.add(
            Classroom(
                subject_code="OLD",
                number="01",
                semester="invalid",
                listed_in_offer=True,
            )
        )
    assert codes(scene.get()) == ["A"]


def test_equivalence_candidate_must_satisfy_own_rules_and_does_not_propagate(scene):
    scene.subject("X", prerequisites=[["MISSING"]])
    scene.subject("A")
    scene.subject("Y", offer=False, kind="required", period=1, equivalences=[["X"]])
    scene.subject("X_ALIAS", offer=False, equivalences=[["A"]])
    scene.subject(
        "Z", offer=False, kind="required", period=1, equivalences=[["X_ALIAS"]]
    )
    (item,) = scene.get()["items"]
    assert item["subject"]["code"] == "A" and not item["equivalent_to"]


def test_normalized_curricular_reference_can_unlock_without_offer(scene):
    scene.subject("X")
    scene.subject("Y", offer=False, prerequisites=[[" x "]])
    scene.component(" y ", period=2)
    assert scene.get()["items"][0]["unlocked_subject_codes"] == ["Y"]


def test_frozen_dates_do_not_age_mutable_grades_stale_if_error(scene, stub_sigaa):
    scene.subject("A")
    scene.subject("B")
    scene.history(
        "OLD", grade=Grade.MM, term="2020.1", synced=datetime(2021, 1, 1, tzinfo=UTC)
    )
    scene.history("A", term="2026.2", synced=NOW - timedelta(days=2))
    with scene.db() as session:
        links = list(session.scalars(select(ClassroomParticipant)))
        stub_sigaa.classrooms.list_classrooms.return_value = [
            SigaaClassroom(
                id=link.front_end_id,
                number=link.classroom.number,
                semester=link.classroom.semester,
                current=link.classroom.semester == "2026.2",
                subject=SigaaSubject(
                    code=link.classroom.subject_code,
                    name=link.classroom.subject_code,
                    hours=60,
                ),
            )
            for link in links
        ]
    stub_sigaa.classrooms.list_grades.side_effect = httpx.ConnectError("offline")
    result = scene.get(headers={"Cache-Control": "no-cache, stale-if-error=259200"})
    assert codes(result) == ["B"]
    assert "stale_history" in {w["code"] for w in result["warnings"]}
    frozen = next(e for e in result["history"]["grades"] if e["code"] == "OLD")
    assert frozen["approved"] and frozen["freshness"] == "frozen"


@pytest.mark.parametrize("kind", ["optional", "complementary"])
def test_equivalence_only_scores_pending_required_targets(scene, kind):
    scene.subject("X", kind="required", period=1)
    scene.subject("Y", offer=False, kind=kind, period=0, equivalences=[["X"]])
    (item,) = scene.get()["items"]
    assert item["equivalent_to"] == []
    assert item["badges"] == []
    assert "equivalent" not in {reason["code"] for reason in item["reasons"]}
    assert scene.get()["score_version"] == "v2"


def test_free_modules_excluded_even_same_unity_or_unlocking(scene):
    scene.subject("FREE", kind=None)
    scene.subject(
        "UNLOCK", offer=False, kind="required", period=2, prerequisites=[["FREE"]]
    )
    scene.subject("OPTIONAL", kind="optional")
    scene.subject("COMPLEMENTARY", kind="complementary")
    result = scene.get()
    assert codes(result) == ["OPTIONAL", "COMPLEMENTARY"]
    assert result["diagnostics"]["excluded"]["free_module"] == 1


def test_external_equivalence_to_optional_does_not_bypass_free_module_filter(scene):
    scene.subject("FREE", kind=None)
    scene.subject("TARGET", offer=False, kind="optional", equivalences=[["FREE"]])
    result = scene.get()
    assert result["items"] == []
    assert result["diagnostics"]["excluded"]["free_module"] == 1


def test_next_period_bonus_advances_current_flow_without_marking_current_overdue(scene):
    scene.subject("CURRENT_PENDING", kind="required", period=2)
    scene.subject("NEXT", kind="required", period=3)
    scene.subject("OLD", kind="required", period=1)
    scene.component("ENROLLED", period=2)
    scene.history("ENROLLED", term="2026.2", enrolled=True)
    result = scene.get()
    assert result["context"]["period"] == 2
    assert result["context"]["target_period"] == 3
    assert [(item["subject"]["code"], item["score"]) for item in result["items"]] == [
        ("NEXT", 120),
        ("OLD", 95),
        ("CURRENT_PENDING", 80),
    ]


def test_without_enrollment_targets_inferred_pending_period(scene):
    scene.subject("NEXT", kind="required", period=2)
    scene.component("DONE", period=1)
    scene.history("DONE", grade=Grade.MM)
    result = scene.get()
    assert result["context"]["period"] == result["context"]["target_period"] == 2
    assert {r["code"]: r["points"] for r in result["items"][0]["reasons"]} == {
        "required": 50,
        "target_period": 40,
        "same_unity": 30,
    }


async def test_concurrent_history_removal_during_grade_sync_is_valid_empty_history(
    scene, async_database, stub_sigaa
):
    scene.subject("A")
    link_id = scene.history("OLD", synced=None)

    async def grades_after_history_refresh():
        async with async_database.begin() as session:
            link = await session.get(ClassroomParticipant, link_id)
            link.front_end_id = None
        return []

    stub_sigaa.classrooms.list_grades.side_effect = grades_after_history_refresh
    assert codes(scene.get()) == ["A"]


def test_recommendation_flags_do_not_filter_public_catalog(scene):
    scene.subject("FGA0001", catalog_complete=False)
    scene.subject("FGA0002", kind=None)
    with scene.db.begin() as session:
        session.scalar(
            select(Classroom).where(Classroom.subject_code == "FGA0002")
        ).listed_in_offer = False
    assert scene.get()["items"] == []
    for code in ("FGA0001", "FGA0002"):
        response = scene.client.get(
            "/public/subjects", params={"code": code, "semester": "2026.2"}
        )
        assert response.status_code == 200
        (item,) = response.json()
        assert item["code"] == code
        assert len(item["classrooms"]) == 1
        assert "catalog_complete" not in item


def test_new_unsynced_history_after_grade_resolution_requires_retry(scene, monkeypatch):
    from api.sync.engine import Sync

    scene.subject("A")
    scene.history("OLD", grade=Grade.MM)
    resolve = Sync.resolve

    async def resolve_with_concurrent_history(self, task, target, load):
        result = await resolve(self, task, target, load)
        if task.__name__ == "sync_grades":
            scene.history("NEW", synced=None)
        return result

    monkeypatch.setattr(Sync, "resolve", resolve_with_concurrent_history)
    response = scene.client.get(URL)
    assert response.status_code == 503
