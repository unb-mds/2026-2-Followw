import pytest

from api.modules.oauth.scopes import PERMISSIONS, Scope, granted_scopes


def test_catalogo_informa_rotulo_e_nivel_de_confianca_de_cada_permissao():
    assert set(PERMISSIONS) == set(Scope)
    assert all(permission["label"] for permission in PERMISSIONS.values())
    high = {
        scope
        for scope, permission in PERMISSIONS.items()
        if permission["trust_level"] == "high"
    }
    assert high == {Scope.PROFILE_WRITE, Scope.GRADES, Scope.MEMBERS, Scope.TRANSCRIPT}


def test_emissao_exige_aceite_do_perfil_e_rejeita_escopo_desconhecido():
    for accepted in ([], [Scope.POSTS], [Scope.PROFILE, "admin"]):
        with pytest.raises(ValueError):
            granted_scopes(accepted)


def test_dependencias_precisam_ter_sido_concedidas():
    for scope, required in (
        (Scope.PROFILE_WRITE, Scope.PROFILE),
        (Scope.HISTORY, Scope.CLASSROOMS),
        (Scope.GRADES, Scope.CLASSROOMS),
        (Scope.POSTS, Scope.CLASSROOMS),
        (Scope.MEMBERS, Scope.CLASSROOMS),
        (Scope.FREQUENCY, Scope.CLASSROOMS),
        (Scope.FREQUENCY_WRITE, Scope.FREQUENCY),
    ):
        if required != Scope.PROFILE:
            with pytest.raises(ValueError):
                granted_scopes([Scope.PROFILE, scope])
        assert required in granted_scopes(
            [Scope.PROFILE, Scope.CLASSROOMS, required, scope]
        )


def test_frequencia_exige_turmas_mesmo_com_a_leitura_concedida():
    with pytest.raises(ValueError):
        granted_scopes([Scope.PROFILE, Scope.FREQUENCY, Scope.FREQUENCY_WRITE])
