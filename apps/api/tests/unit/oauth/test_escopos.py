import pytest

from api.modules.oauth.scopes import DEPENDENCIES, LABELS, Scope, granted_scopes


def test_catalogo_tem_rotulo_para_todas_as_permissoes():
    assert set(LABELS) == set(Scope)


def test_emissao_exige_aceite_do_perfil_e_rejeita_escopo_desconhecido():
    for accepted in ([], [Scope.POSTS], [Scope.PROFILE, "admin"]):
        with pytest.raises(ValueError):
            granted_scopes(accepted)


def test_dependencias_precisam_ter_sido_concedidas():
    for scope, required in DEPENDENCIES.items():
        if required != Scope.PROFILE:
            with pytest.raises(ValueError):
                granted_scopes([Scope.PROFILE, scope])
        assert set(granted_scopes([Scope.PROFILE, required, scope])) == {
            Scope.PROFILE,
            required,
            scope,
        }
