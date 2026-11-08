import pytest
from sigaa_client import (
    Grade,
)

from api import academic_calendar
from api.db.enums import ClassroomRole, ClassroomStatus, UserLevel
from api.db.models import (
    Classroom,
    User,
)

from .helpers import (
    URL,
    codes,
    points,
    reasons,
    scores,
)


def test_somente_graduacao(scene):
    with scene.db.begin() as session:
        session.get(User, scene.user_id).level = UserLevel.MESTRADO
    assert scene.client.get(URL).status_code == 422


async def test_toda_a_oferta_entra_no_ranking_com_historico_vazio(scene, ranked):
    for n in range(12):
        scene.subject(f"X{n:02}", unit_id=99, kind="complementary")
    scene.component("MISSING", period=1)
    result = scene.get()
    assert codes(result) == [f"X{n:02}" for n in range(12)]
    assert scores(await ranked()) == [(f"X{n:02}", 4) for n in range(12)]
    assert scene.get() == result


def test_exclusoes_disjuntas(scene):
    scene.subject("OK")
    scene.subject("APPROVED")
    scene.history("APPROVED", grade=Grade.MM)
    scene.subject("ENROLLED")
    scene.history("ENROLLED", enrolled=True, term="2026.2")
    scene.subject("PRE", prerequisites=[["UNKNOWN"]], corequisites=[["OTHER"]])
    scene.subject("CO", prerequisites=[], corequisites=[["UNKNOWN"]])
    assert codes(scene.get()) == ["OK"]


@pytest.mark.parametrize("grade", [Grade.SS, Grade.MS, Grade.MM])
def test_mencoes_aprovadas_e_repeticao(scene, grade):
    scene.subject("A")
    scene.subject("B", prerequisites=[["A"]])
    scene.history("A", grade=grade, term="2025.2")
    scene.history("A", grade=Grade.MI, term="2026.1")
    assert codes(scene.get()) == ["B"]


def test_oferta_e_em_andamento_contam_como_concluidas(scene):
    for code in ("TARGET", "FAILED", "LOCKED", "DENIED"):
        scene.subject(code)
    scene.subject("NEEDS_TARGET", prerequisites=[["TARGET"]])
    scene.subject("NEEDS_LOCKED", prerequisites=[["LOCKED"]])
    scene.history("TARGET", grade=Grade.MM, term="2026.2", enrolled=True)
    scene.history("FAILED", grade=Grade.MI)
    scene.history("LOCKED", term="2026.2", status=ClassroomStatus.TRANCADO)
    scene.history("DENIED", term="2026.2", status=ClassroomStatus.DENIED)
    scene.history("FAILED", grade=Grade.SS, term="invalid")
    assert set(codes(scene.get())) == {
        "NEEDS_TARGET",
        "FAILED",
        "LOCKED",
        "DENIED",
    }


@pytest.mark.parametrize("closed", [False, True])
def test_encerrada_sem_mencao_libera_seguinte_mesmo_apos_consolidacao(
    scene, monkeypatch, closed
):
    monkeypatch.setattr(academic_calendar, "grades_closed", lambda semester: closed)
    scene.subject("A")
    scene.subject("B", prerequisites=[["A"]])
    scene.history("A")
    assert codes(scene.get()) == ["B"]


def test_so_vinculos_proprios_de_aluno_e_isolamento_entre_usuarios(scene):
    scene.subject("A", prerequisites=[["B"]])
    scene.history("B", grade=Grade.SS, role=ClassroomRole.MONITOR)
    scene.history("B", grade=Grade.SS, own=False)
    with scene.db.begin() as session:
        user = User(name="Outro", registration="other")
        session.add(user)
        session.flush()
        other = user.id
    scene.history("B", grade=Grade.SS, user_id=other)
    assert scene.get() == []


def test_requisitos_e_ou_com_em_andamento_e_equivalencia(scene):
    scene.history("A", grade=Grade.MM)
    scene.subject("PASS", prerequisites=[["A", "B"], ["A"]], corequisites=[["A"]])
    scene.subject("AND", prerequisites=[["A", "B"]])
    scene.subject("CURRENT", prerequisites=[["C"]])
    scene.subject("CO", corequisites=[["C"]])
    scene.subject("EQUIV", prerequisites=[["Y"]])
    scene.subject("Y", offer=False, equivalences=[["A"]])
    scene.history("C", enrolled=True, term="2026.2")
    assert codes(scene.get()) == ["CO", "CURRENT", "EQUIV", "PASS"]


@pytest.mark.parametrize("grade", [Grade.MI, Grade.II, Grade.SR])
def test_so_recomenda_repeticao_com_reprovacao_confirmada(scene, grade):
    scene.subject("FAILED")
    scene.subject("UNKNOWN")
    scene.history("FAILED", grade=grade)
    scene.history("UNKNOWN", term="2020.1")
    assert codes(scene.get()) == ["FAILED"]


def test_reprovacao_antiga_nao_libera_materia_em_curso_ou_sem_resultado(scene):
    for code in ("CURRENT", "UNKNOWN"):
        scene.subject(code)
        scene.history(code, grade=Grade.MI, term="2025.1")
    scene.history("CURRENT", enrolled=True, term="2026.2")
    scene.history("UNKNOWN", term="2026.1")
    assert scene.get() == []


def test_equivalencias_respeitam_grupos_direcao_e_nao_inferem_transitividade(scene):
    scene.history("A", grade=Grade.MM)
    scene.subject("B", equivalences=[["A"]])
    scene.subject("C", equivalences=[["A", "MISSING"]])
    scene.subject("D", equivalences=[["MISSING"], ["A"]])
    scene.subject("E", equivalences=[["B"]])
    scene.subject("F")
    scene.subject("G", offer=False, equivalences=[["F"]])
    assert codes(scene.get()) == ["C", "E", "F"]


def test_equivalencia_sem_resultado_exclui_repeticao_e_libera_requisito(
    scene, monkeypatch
):
    monkeypatch.setattr(academic_calendar, "grades_closed", lambda semester: True)
    scene.history("A", term="2020.1")
    scene.subject("B", equivalences=[["A"]])
    scene.subject("C", prerequisites=[["B"]])
    scene.subject("D", corequisites=[["B"]])
    assert codes(scene.get()) == ["C", "D"]


def test_sem_mencao_respeita_grupos_e_ou_dos_requisitos(scene, monkeypatch):
    monkeypatch.setattr(academic_calendar, "grades_closed", lambda semester: True)
    scene.history("A", term="2020.1")
    scene.subject("B", prerequisites=[["A", "MISSING"]])
    scene.subject("C", prerequisites=[["MISSING"], ["A"]])
    assert codes(scene.get()) == ["C"]


async def test_sem_mencao_conta_como_concluida_no_fluxo(scene, ranked, monkeypatch):
    monkeypatch.setattr(academic_calendar, "grades_closed", lambda semester: True)
    scene.subject("A", kind="required", period=1)
    scene.subject("B", kind="required", period=2, prerequisites=[["A"]])
    scene.history("A", term="2020.1")
    assert codes(scene.get()) == ["B"]
    assert points(await ranked(), "B")["target_period"] == 25


def test_equivalencia_de_materia_em_curso_exclui_repeticao(scene):
    scene.history("A", enrolled=True, term="2026.2")
    scene.subject("B", equivalences=[["A"]])
    scene.subject("C", prerequisites=[["B"]])
    assert codes(scene.get()) == ["C"]


@pytest.mark.parametrize("grade", [Grade.MI, Grade.II, Grade.SR])
def test_reprovacao_em_equivalente_nao_exclui_candidata_nem_libera_requisito(
    scene, grade
):
    scene.history("A", grade=grade)
    scene.subject("B", equivalences=[["A"]])
    scene.subject("C", prerequisites=[["B"]])
    assert codes(scene.get()) == ["B"]


def test_equivalencia_fora_da_matriz_satisfaz_requisito_e_correquisito(scene):
    scene.history("A", grade=Grade.MM)
    scene.subject("X", offer=False, kind=None, equivalences=[["A"]])
    scene.subject("B", prerequisites=[["X"]])
    scene.subject("C", corequisites=[["X"]])
    assert codes(scene.get()) == ["B", "C"]


def test_correquisitos_cursaveis_no_mesmo_semestre_sao_recomendados(scene):
    scene.subject("TEO", corequisites=[["EXP"]])
    scene.subject("EXP", corequisites=[["TEO"]])
    scene.subject("BASE")
    scene.subject("JUNTO", corequisites=[["BASE"]])
    scene.subject("OU", corequisites=[["MISSING"], ["BASE"]])
    scene.subject("SEM_OFERTA", offer=False)
    scene.subject("NEEDS_OFFER", corequisites=[["SEM_OFERTA"]])
    scene.subject("LOCKED", prerequisites=[["MISSING"]])
    scene.subject("NEEDS_LOCKED", corequisites=[["LOCKED"]])
    scene.subject("CHAIN", corequisites=[["NEEDS_LOCKED"]])
    assert codes(scene.get()) == ["BASE", "EXP", "JUNTO", "OU", "TEO"]


def test_atrasada_apos_o_periodo_em_andamento(scene):
    for code, period in (("A", 2), ("B", 4), ("C", 4), ("D", 6)):
        scene.component(code, period=period)
        scene.history(code, enrolled=True, term="2026.2")
    scene.subject("OLD", kind="required", period=1)
    scene.component("OLD", kind="optional", period=0)
    (item,) = scene.get()
    assert [r["code"] for r in reasons(item)] == [
        "required",
        "overdue",
        "same_unit",
        "hours",
    ]


async def test_cadeias_contam_as_obrigatorias_pendentes_descendentes(scene, ranked):
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
        ("same_unit", None),
        ("hours", 60),
    ]
    assert [r["code"] for r in reasons(items["O"])] == ["same_unit", "hours"]
    x = points(await ranked(), "X")
    assert x["chain_length"] == 30 and x["chain_width"] == 30


def test_turmas_vem_do_semestre_da_oferta(scene):
    scene.subject("A")
    with scene.db.begin() as session:
        session.add(Classroom(subject_code="A", number="00", semester="2026.2"))
        session.add(Classroom(subject_code="A", number="02", semester="2026.1"))
    (item,) = scene.get()
    assert [(c["number"], c["semester"]) for c in item["classrooms"]] == [
        ("00", "2026.2"),
        ("01", "2026.2"),
    ]


def test_sem_turmas_nada_e_recomendado(scene):
    scene.subject("A", offer=False)
    assert scene.get() == []


async def test_exemplos_de_score(scene, ranked):
    for code, period, unlocks in (("ED", 3, 4), ("BD", 3, 2), ("CALC", 1, 3)):
        scene.subject(code, kind="required", period=period, unit_id=99)
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


async def test_optativas_e_complementares_nao_ganham_bonus_de_tipo(scene, ranked):
    scene.subject("X", kind="required", period=1)
    scene.subject("OPT", kind="optional", period=9)
    scene.subject("COMP", kind="complementary", period=9, hours=59)
    for n in range(4):
        scene.subject(
            f"Y{n}", offer=False, kind="required", period=2, prerequisites=[["X"]]
        )
    assert codes(scene.get()) == ["X", "OPT", "COMP"]
    assert scores(await ranked()) == [("X", 114), ("OPT", 9), ("COMP", 8)]


async def test_empates_por_obrigatoria_periodo_positivo_e_codigo(scene, ranked):
    # Optativa com carga alta empata com obrigatórias atrasadas.
    scene.subject("R", kind="required", period=1, unit_id=99)
    scene.subject("Z", kind="required", period=2, unit_id=99)
    scene.subject("A", hours=960)
    scene.component("CURRENT", period=4)
    scene.history("CURRENT", term="2026.2", enrolled=True)
    assert codes(scene.get()) == ["R", "Z", "A"]
    assert scores(await ranked()) == [("R", 69), ("Z", 69), ("A", 69)]


def test_oferta_mais_recente_e_semestres_invalidos(scene):
    scene.subject("A")
    scene.subject("OLD", offer=False)
    with scene.db.begin() as session:
        session.add(Classroom(subject_code="OLD", number="01", semester="2025.2"))
        session.add(Classroom(subject_code="OLD", number="01", semester="invalid"))
    assert codes(scene.get()) == ["A"]


async def test_referencia_normalizada_da_matriz_conta_sem_oferta(scene, ranked):
    scene.subject("X", kind="required", period=1)
    scene.subject("Y", offer=False, prerequisites=[[" x "]])
    scene.component(" y ", period=2)
    assert codes(scene.get()) == ["X"]
    x = points(await ranked(), "X")
    assert x["chain_length"] == 10 and x["chain_width"] == 5


def test_modulo_livre_fica_de_fora_mesmo_da_unidade_ou_destravando(scene):
    scene.subject("FREE", kind=None)
    scene.subject(
        "UNLOCK", offer=False, kind="required", period=2, prerequisites=[["FREE"]]
    )
    scene.subject("OPTIONAL", kind="optional")
    scene.subject("COMPLEMENTARY", kind="complementary")
    assert codes(scene.get()) == ["COMPLEMENTARY", "OPTIONAL"]


async def test_bonus_do_proximo_periodo_e_pendente_do_atual_e_atrasada(scene, ranked):
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


async def test_sem_matricula_mira_o_periodo_pendente_inferido(scene, ranked):
    scene.subject("NEXT", kind="required", period=2)
    scene.component("DONE", period=1)
    scene.history("DONE", grade=Grade.MM)
    (item,) = scene.get()
    assert [r["code"] for r in reasons(item)] == [
        "required",
        "target_period",
        "same_unit",
        "hours",
    ]
    assert points(await ranked(), "NEXT") == {
        "required": 50,
        "target_period": 25,
        "same_unit": 5,
        "hours": 4,
    }
