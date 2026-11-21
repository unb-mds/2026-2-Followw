import pytest

from api.modules.recommendations.ranking import (
    CatalogSubject,
    Component,
    chain_length,
    components_by_code,
    dependency_graph,
    descendants,
    eligible,
    scoped_catalog,
    scoped_rules,
    target_period,
)

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
def test_periodo_alvo_pela_metade_e_pela_conclusao(done, expected):
    assert target_period(components_by_code(FLOW), done, set()) == expected


def test_periodo_alvo_apos_mediana_inferior_das_matriculadas_e_duplicadas():
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


def test_cadeias_toleram_pre_requisitos_ciclicos():
    graph = {"A": {"B"}, "B": {"A", "C"}}
    assert chain_length("A", graph) == 2
    assert descendants("A", graph) == {"B", "C"}


def test_regras_no_escopo_descartam_codigos_fora_da_matriz():
    rules = [["FGA0138"], ["FGA0313"]]
    scope = {"FGA0312", "FGA0313", "FGA0314"}
    assert scoped_rules(rules, scope) == [["FGA0313"]]


def test_regras_no_escopo_mantem_originais_quando_nenhuma_opcao_esta_nele():
    assert scoped_rules([["EXT0001"]], {"FGA0312"}) == [["EXT0001"]]
    assert scoped_rules(None, {"FGA0312"}) is None


def _legacy_catalog():
    return {
        "FGA0314": CatalogSubject(
            code="FGA0314",
            hours=60,
            unit_id=673,
            prerequisites=[["FGA0138"], ["FGA0313"]],
            corequisites=None,
        )
    }


def test_materia_com_pre_requisito_legado_nao_e_elegivel_sem_requisito_da_matriz():
    catalog = scoped_catalog(_legacy_catalog(), {"FGA0313", "FGA0314"})
    assert eligible(catalog, {"FGA0314"}, {"FGA0138"}) == set()
    assert eligible(catalog, {"FGA0314"}, {"FGA0313"}) == {"FGA0314"}


def test_pre_requisito_legado_ja_cumprido_continua_valendo():
    catalog = scoped_catalog(_legacy_catalog(), {"FGA0313", "FGA0314", "FGA0138"})
    assert eligible(catalog, {"FGA0314"}, {"FGA0138"}) == {"FGA0314"}


def test_grafo_de_dependencias_ignora_pre_requisito_legado():
    pending = scoped_catalog(_legacy_catalog(), {"FGA0313", "FGA0314"})
    assert dependency_graph(pending) == {"FGA0313": {"FGA0314"}}
