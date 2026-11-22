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
        (Scope.FREQUENCY_WRITE, Scope.FREQUENCY),
        (Scope.POST_MARKS, Scope.POSTS),
    ):
        if required != Scope.PROFILE:
            with pytest.raises(ValueError):
                granted_scopes([Scope.PROFILE, scope])
        assert set(granted_scopes([Scope.PROFILE, required, scope])) == {
            Scope.PROFILE,
            required,
            scope,
        }
