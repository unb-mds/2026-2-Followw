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
from sigaa_client import UserLevel as SigaaUserLevel
from sigaa_client import UserProfile as SigaaUserProfile
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
from api.modules.me.repository import UserRepository
from api.modules.recommendations.ranking import (
    Component,
    chain_length,
    components_by_code,
    descendants,
    target_period,
)
from api.modules.recommendations.repository import RecommendationRepository

NOW = datetime.now(UTC)
URL = "/public/subjects"


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
                entry_semester="2025.1",
                profile_synced_at=NOW,
                classrooms_synced_at=NOW,
            )
            session.add(user)
            session.flush()
            self.user_id = user.id
        self.matrix = self.curriculum()
        with database.begin() as session:
            session.get(User, self.user_id).curriculum_id = self.matrix

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
                **fields,
            )
            session.add(row)
            if offer:
                session.add(
                    Classroom(subject_code=code, number="01", semester="2026.2")
                )
        if kind:
            self.component(code, kind=kind, period=period)

    def user(self, **fields):
        with self.db.begin() as session:
            for name, value in fields.items():
                setattr(session.get(User, self.user_id), name, value)

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
        for item in result:
            assert set(item["recommendation"]) == {"reasons"}
            assert all(set(r) == {"code", "value"} for r in reasons(item))
        return result


@pytest.fixture
def scene(database, client, cookies, stub_sigaa):
    client.cookies.update(
        cookies(refresh=Credentials(registration="251000000", password="senha"))
    )
    return Scenario(database, client)


@pytest.fixture
def ranked(scene, async_database):
    """O ranking interno, com score e pontos que a API não expõe."""

    async def run():
        async with async_database() as session:
            repository = RecommendationRepository(session)
            return await repository.recommend(
                "251000000", await repository.offer_semester()
            )

    return run


@pytest.fixture
def assign(scene, async_database):
    """Estima a matriz como o sync das turmas faz, a partir do estado atual."""

    async def run():
        async with async_database() as session:
            await RecommendationRepository(session).assign_curriculum("251000000")
            await session.commit()

    return run


def codes(result):
    return [i["code"] for i in result]


def reasons(item):
    return item["recommendation"]["reasons"]


def scores(items):
    return [(item.code, item.score) for item in items]


def points(items, code):
    item = next(item for item in items if item.code == code)
    return {reason.code: reason.points for reason in item.reasons}


def test_visitor_without_filters_is_rejected(client):
    assert client.get(URL).status_code == 422


def test_filters_keep_the_plain_search(scene, stub_sigaa):
    scene.subject("A")
    (item,) = scene.client.get(URL, params={"unit": "673"}).json()
    assert item["recommendation"] is None
    stub_sigaa.profile.get_profile.assert_not_awaited()


def test_plain_search_shows_curriculum_kind_from_cache(scene, stub_sigaa):
    scene.subject("REQ", kind="required", period=1)
    scene.subject("OPT", kind="optional")
    scene.subject("COMP", kind="complementary")
    scene.subject("FREE", kind=None)
    result = scene.client.get(URL, params={"unit": "673"}).json()
    assert {i["code"]: i["kind"] for i in result} == {
        "COMP": "optional",
        "FREE": "free",
        "OPT": "optional",
        "REQ": "mandatory",
    }
    stub_sigaa.profile.get_profile.assert_not_awaited()
    stub_sigaa.classrooms.list_classrooms.assert_not_awaited()
    assert {i["code"]: i["kind"] for i in scene.get()} == {
        "REQ": "mandatory",
        "COMP": "optional",
        "OPT": "optional",
    }


def test_kind_is_null_without_curriculum_or_login(scene):
    scene.subject("A")
    with scene.db.begin() as session:
        user = session.get(User, scene.user_id)
        user.course_id = user.curriculum_id = None

    def kinds():
        return [i["kind"] for i in scene.client.get(URL, params={"unit": "673"}).json()]

    assert kinds() == [None]
    scene.client.cookies.clear()
    assert kinds() == [None]


def test_undergraduate_only(scene):
    with scene.db.begin() as session:
        session.get(User, scene.user_id).level = UserLevel.MESTRADO
    assert scene.client.get(URL).status_code == 422


async def test_whole_offer_is_ranked_with_empty_history(scene, ranked):
    for n in range(12):
        scene.subject(f"X{n:02}", unity_id=99, kind="complementary")
    scene.component("MISSING", period=1)
    result = scene.get()
    assert codes(result) == [f"X{n:02}" for n in range(12)]
    assert scores(await ranked()) == [(f"X{n:02}", 4) for n in range(12)]
    assert scene.get() == result


def test_disjoint_exclusions(scene):
    scene.subject("OK")
    scene.subject("APPROVED")
    scene.history("APPROVED", grade=Grade.MM)
    scene.subject("ENROLLED")
    scene.history("ENROLLED", enrolled=True, term="2026.2")
    scene.subject("PRE", prerequisites=[["UNKNOWN"]], corequisites=[["OTHER"]])
    scene.subject("CO", prerequisites=[], corequisites=[["UNKNOWN"]])
    assert codes(scene.get()) == ["OK"]


@pytest.mark.parametrize("grade", [Grade.SS, Grade.MS, Grade.MM])
def test_approved_grades_and_repetition(scene, grade):
    scene.subject("A")
    scene.subject("B", prerequisites=[["A"]])
    scene.history("A", grade=grade, term="2025.2")
    scene.history("A", grade=Grade.MI, term="2026.1")
    assert codes(scene.get()) == ["B"]


def test_target_and_in_progress_count_as_completed(scene):
    for code in ("TARGET", "FAILED", "REMOVED", "LOCKED"):
        scene.subject(code)
    scene.subject("NEEDS_TARGET", prerequisites=[["TARGET"]])
    scene.history("TARGET", grade=Grade.MM, term="2026.2", enrolled=True)
    scene.history("FAILED", grade=Grade.MI)
    scene.history("REMOVED", term="2026.2", status=ClassroomStatus.REMOVIDO)
    scene.history("LOCKED", term="2026.2", status=ClassroomStatus.TRANCADO)
    scene.history("FAILED", grade=Grade.SS, term="invalid")
    assert set(codes(scene.get())) == {"NEEDS_TARGET", "FAILED", "REMOVED", "LOCKED"}


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
    assert scene.get() == []


def test_requirements_and_or_with_in_progress_but_no_equivalent_credit(scene):
    scene.history("A", grade=Grade.MM)
    scene.subject("PASS", prerequisites=[["A", "B"], ["A"]], corequisites=[["A"]])
    scene.subject("AND", prerequisites=[["A", "B"]])
    scene.subject("CURRENT", prerequisites=[["C"]])
    scene.subject("CO", corequisites=[["C"]])
    scene.subject("EQUIV", prerequisites=[["Y"]])
    scene.subject("Y", offer=False, equivalences=[["A"]])
    scene.history("C", enrolled=True, term="2026.2")
    assert codes(scene.get()) == ["CO", "CURRENT", "PASS"]


FLOW = [
    Component(subject_code=code, kind="required", period=period)
    for code, period in (("A", 1), ("B", 1), ("C", 2), ("D", 2))
]


@pytest.mark.parametrize(
    ("done", "expected"),
    [
        (set(), 1),
        ({"A"}, 2),
        ({"A", "C"}, 2),
        ({"A", "B", "C"}, 2),
        ({"A", "B", "C", "D"}, 3),
    ],
)
def test_target_period_from_half_threshold_and_completion(done, expected):
    assert target_period(components_by_code(FLOW), done, set()) == expected


def test_target_period_after_enrolled_lower_median_and_duplicates():
    flow = components_by_code(
        [
            Component(subject_code=code, kind="required", period=period)
            for code, period in (("A", 2), ("B", 4), ("C", 4), ("D", 6), (" a ", 8))
        ]
        + [Component(subject_code="A", kind="optional", period=0)]
    )
    assert flow["A"].period == 2
    assert target_period(flow, set(), {"A", "B", "C", "D"}) == 5
    optional = [Component(subject_code="X", kind="optional", period=0)]
    assert target_period(components_by_code(optional), set(), set()) is None


def test_overdue_after_in_progress_period(scene):
    for code, period in (("A", 2), ("B", 4), ("C", 4), ("D", 6)):
        scene.component(code, period=period)
        scene.history(code, enrolled=True, term="2026.2")
    scene.subject("OLD", kind="required", period=1)
    scene.component("OLD", kind="optional", period=0)
    (item,) = scene.get()
    assert [r["code"] for r in reasons(item)] == [
        "required",
        "overdue",
        "same_unity",
        "hours",
    ]


async def test_curriculum_selection_shift_revision_and_entry(scene, assign):
    scene.subject("A", kind=None)
    scene.curriculum(code="100/2", valid_from="2024.1", sigaa_id=12)
    selected = scene.curriculum(code="100/3", valid_from="2024.1", sigaa_id=13)
    scene.curriculum(code="100/3", valid_from="2024.1", sigaa_id=11)
    scene.curriculum(code="100/99", valid_from="2024.1", shift="N")
    scene.curriculum(code="100/99", valid_from="2024.1", active=False)
    scene.curriculum(code="100/99", valid_from="2027.1")
    scene.curriculum(code="100/4", valid_from="2026.1")
    scene.user(curriculum_id=None)
    await assign()
    assert scene.get() == []
    scene.component("A", kind="optional", matrix=selected)
    assert codes(scene.get()) == ["A"]


async def test_old_entry_fallback_and_unknown_shift_fallback(scene, assign):
    scene.subject("A", kind=None)
    scene.user(entry_semester="2010.1", curriculum_id=None)
    with scene.db.begin() as session:
        session.get(Curriculum, scene.matrix).shift = "N"
    fallback = scene.curriculum(shift=None, valid_from="2024.1")
    scene.component("A", kind="optional", matrix=fallback)
    await assign()
    assert codes(scene.get()) == ["A"]


async def test_without_entry_the_latest_curriculum_is_used(scene, assign):
    scene.subject("A", kind=None)
    latest = scene.curriculum(valid_from="2024.1")
    scene.component("A", kind="optional", matrix=latest)
    scene.user(entry_semester=None, curriculum_id=None)
    await assign()
    assert codes(scene.get()) == ["A"]


@pytest.mark.parametrize("mode", ["future", "opposite_shift", "no_course"])
async def test_without_curriculum_nothing_is_recommended(scene, assign, mode):
    scene.subject("A", kind="required", period=None)
    scene.user(curriculum_id=None)
    with scene.db.begin() as session:
        if mode == "no_course":
            session.get(User, scene.user_id).course_id = None
        else:
            row = session.get(Curriculum, scene.matrix)
            if mode == "future":
                row.valid_from = "2027.1"
            else:
                row.shift = "N"
    await assign()
    assert scene.get() == []


async def test_curriculum_is_assigned_only_while_null(scene, assign):
    scene.subject("A", kind=None)
    scene.curriculum(valid_from="2024.1")
    scene.user(curriculum_id=None, entry_semester="2020.1")
    await assign()
    scene.user(entry_semester="2025.1")
    await assign()
    with scene.db.begin() as session:
        assert session.get(User, scene.user_id).curriculum_id == scene.matrix


def test_classrooms_sync_assigns_the_curriculum(scene, stub_sigaa):
    scene.subject("A", kind="required", period=1)
    scene.user(curriculum_id=None, classrooms_synced_at=None)
    assert codes(scene.get()) == ["A"]
    stub_sigaa.classrooms.list_classrooms.assert_awaited_once()
    with scene.db.begin() as session:
        assert session.get(User, scene.user_id).curriculum_id == scene.matrix


async def test_profile_sync_resets_the_curriculum_only_when_the_course_changes(
    scene, async_database
):
    profile = SigaaUserProfile(
        name="Aluno",
        registration="251000000",
        photo=None,
        bio=None,
        unity="FCTE",
        course="ENGENHARIA DE SOFTWARE",
        shift=None,
        entry_semester="2025.1",
        integralization=None,
        workload=None,
        ira=None,
        mp=None,
        level=SigaaUserLevel.GRADUACAO,
    )

    async def save(profile):
        async with async_database() as session:
            await UserRepository(session).save_profile(profile, NOW)
            await session.commit()

    def curriculum_id():
        with scene.db.begin() as session:
            return session.get(User, scene.user_id).curriculum_id

    await save(profile)
    assert curriculum_id() == scene.matrix
    await save(profile.model_copy(update={"course": "OUTRO CURSO"}))
    assert curriculum_id() is None


async def test_chain_length_and_width_count_pending_required_descendants(scene, ranked):
    scene.subject("X", kind="required", period=1)
    scene.history("A", grade=Grade.MM)
    for code, rules, period in (
        ("Y0", [["X"]], 2),
        ("Y1", [["X"]], 2),
        ("AND", [["X", "B"]], 2),
        ("OR", [["X"], ["A"]], 2),
        ("T", [["Y0"]], 3),
        ("DEEP", [["T"]], 4),
        ("DONE", [["X"]], 2),
    ):
        scene.subject(
            code, offer=False, kind="required", period=period, prerequisites=rules
        )
    scene.history("DONE", grade=Grade.MM)
    scene.subject("FREE", offer=False, kind=None, prerequisites=[["X"]])
    scene.subject("OPT", offer=False, kind="optional", prerequisites=[["X"]])
    scene.subject(
        "AFTER_OPT", offer=False, kind="required", period=5, prerequisites=[["OPT"]]
    )
    scene.subject("O", kind="optional")
    scene.subject(
        "NEEDS_O", offer=False, kind="required", period=2, prerequisites=[["O"]]
    )
    items = {i["code"]: i for i in scene.get()}
    assert [(r["code"], r["value"]) for r in reasons(items["X"])] == [
        ("required", None),
        ("chain_length", 3),
        ("chain_width", 6),
        ("target_period", None),
        ("same_unity", None),
        ("hours", 60),
    ]
    assert [r["code"] for r in reasons(items["O"])] == ["same_unity", "hours"]
    x = points(await ranked(), "X")
    assert x["chain_length"] == 30 and x["chain_width"] == 30


def test_chains_tolerate_cyclic_prerequisites():
    graph = {"A": {"B"}, "B": {"A", "C"}}
    assert chain_length("A", graph) == 2
    assert descendants("A", graph) == {"B", "C"}


def test_classrooms_come_from_the_offer_semester(scene):
    scene.subject("A")
    with scene.db.begin() as session:
        session.add(Classroom(subject_code="A", number="00", semester="2026.2"))
        session.add(Classroom(subject_code="A", number="02", semester="2026.1"))
    (item,) = scene.get()
    assert [(c["number"], c["semester"]) for c in item["classrooms"]] == [
        ("00", "2026.2"),
        ("01", "2026.2"),
    ]


def test_without_classrooms_nothing_is_recommended(scene):
    scene.subject("A", offer=False)
    assert scene.get() == []


async def test_score_examples(scene, ranked):
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
    assert codes(scene.get()) == ["ED", "BD", "CALC"]
    assert scores(await ranked()) == [("ED", 109), ("BD", 99), ("CALC", 94)]


async def test_optional_and_complementary_have_no_kind_bonus(scene, ranked):
    scene.subject("X", kind="required", period=1)
    scene.subject("OPT", kind="optional", period=9)
    scene.subject("COMP", kind="complementary", period=9, hours=59)
    for n in range(4):
        scene.subject(
            f"Y{n}", offer=False, kind="required", period=2, prerequisites=[["X"]]
        )
    assert codes(scene.get()) == ["X", "OPT", "COMP"]
    assert scores(await ranked()) == [("X", 114), ("OPT", 9), ("COMP", 8)]


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
    assert codes(scene.get()) == ["A"]
    assert any(
        step.task == "sync_grades" for job in qstash.jobs() for step in job.steps
    )
    assert scene.get() == []
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
    assert scene.get(headers={"Cache-Control": "no-cache"}) == []
    stub_sigaa.profile.get_profile.assert_awaited_once()
    stub_sigaa.classrooms.list_classrooms.assert_awaited_once()
    assert stub_sigaa.classrooms.list_grades.await_count == 2


def test_frozen_grades_are_not_revalidated(scene, stub_sigaa):
    scene.subject("A")
    scene.history("H", grade=Grade.MM, term="2020.1")
    scene.get(headers={"Cache-Control": "only-if-cached"})
    scene.get()
    stub_sigaa.classrooms.list_grades.assert_not_awaited()


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


async def test_ties_required_then_positive_period_then_code(scene, ranked):
    # Optativa com carga alta empata com obrigatórias atrasadas.
    scene.subject("R", kind="required", period=1, unity_id=99)
    scene.subject("Z", kind="required", period=2, unity_id=99)
    scene.subject("A", hours=960)
    scene.component("CURRENT", period=4)
    scene.history("CURRENT", term="2026.2", enrolled=True)
    assert codes(scene.get()) == ["R", "Z", "A"]
    assert scores(await ranked()) == [("R", 69), ("Z", 69), ("A", 69)]


def test_latest_offer_and_invalid_semesters(scene):
    scene.subject("A")
    scene.subject("OLD", offer=False)
    with scene.db.begin() as session:
        session.add(Classroom(subject_code="OLD", number="01", semester="2025.2"))
        session.add(Classroom(subject_code="OLD", number="01", semester="invalid"))
    assert codes(scene.get()) == ["A"]


async def test_normalized_curricular_reference_counts_without_offer(scene, ranked):
    scene.subject("X", kind="required", period=1)
    scene.subject("Y", offer=False, prerequisites=[[" x "]])
    scene.component(" y ", period=2)
    assert codes(scene.get()) == ["X"]
    x = points(await ranked(), "X")
    assert x["chain_length"] == 10 and x["chain_width"] == 5


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


def test_free_modules_excluded_even_same_unity_or_unlocking(scene):
    scene.subject("FREE", kind=None)
    scene.subject(
        "UNLOCK", offer=False, kind="required", period=2, prerequisites=[["FREE"]]
    )
    scene.subject("OPTIONAL", kind="optional")
    scene.subject("COMPLEMENTARY", kind="complementary")
    assert codes(scene.get()) == ["COMPLEMENTARY", "OPTIONAL"]


async def test_next_period_bonus_and_current_period_pending_is_overdue(scene, ranked):
    scene.subject("CURRENT_PENDING", kind="required", period=2)
    scene.subject("NEXT", kind="required", period=3)
    scene.subject("OLD", kind="required", period=1)
    scene.component("ENROLLED", period=2)
    scene.history("ENROLLED", term="2026.2", enrolled=True)
    assert codes(scene.get()) == ["NEXT", "OLD", "CURRENT_PENDING"]
    assert scores(await ranked()) == [
        ("NEXT", 84),
        ("OLD", 74),
        ("CURRENT_PENDING", 74),
    ]


async def test_without_enrollment_targets_inferred_pending_period(scene, ranked):
    scene.subject("NEXT", kind="required", period=2)
    scene.component("DONE", period=1)
    scene.history("DONE", grade=Grade.MM)
    (item,) = scene.get()
    assert [r["code"] for r in reasons(item)] == [
        "required",
        "target_period",
        "same_unity",
        "hours",
    ]
    assert points(await ranked(), "NEXT") == {
        "required": 50,
        "target_period": 25,
        "same_unity": 5,
        "hours": 4,
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
