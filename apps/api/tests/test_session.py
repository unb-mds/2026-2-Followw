import base64
import json
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import Request, Response
from joserfc import jwt
from joserfc.jwe import JWERegistry
from joserfc.jwk import OctKey
from joserfc.jws import JWSRegistry
from pydantic import SecretStr, ValidationError
from sigaa_client import Credentials

from api.core.config import Settings, settings
from api.utils.session import (
    ACCESS_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    _key,
    clear_cookies,
    decrypt_cookie,
    derive_key,
    encrypt_cookie,
    read_access_cookie,
    read_refresh_cookie,
    set_access_cookie,
    set_refresh_cookie,
)

SENHA = "S3nh@-Muito-Secreta"
CREDENCIAIS = Credentials(registration="251000000", password=SecretStr(SENHA))
SEGREDOS = (SENHA, "251000000", "app14~TOKEN1")


def _request(**cookies: str) -> Request:
    header = "; ".join(f"{k}={v}" for k, v in cookies.items())
    return Request(scope={"type": "http", "headers": [(b"cookie", header.encode())]})


def _exp(minutes: int = 5) -> int:
    return int((datetime.now(UTC) + timedelta(minutes=minutes)).timestamp())


def _refresh_claims(**extra) -> dict:
    return {"registration": "251000000", "password": SENHA, "exp": _exp(), **extra}


def _b64decode(parte: str) -> bytes:
    return base64.urlsafe_b64decode(parte + "=" * (-len(parte) % 4))


def _b64encode(dados: bytes) -> str:
    return base64.urlsafe_b64encode(dados).rstrip(b"=").decode()


def _visivel(token: str) -> str:
    """Tudo que alguém com o cookie em mãos lê sem a chave."""
    partes = [token] + [
        _b64decode(parte).decode("latin-1") for parte in token.split(".")
    ]
    return "\n".join(partes)


def _cookies(response: Response, ler_cookies) -> dict[str, str]:
    return {nome: morsel.value for nome, morsel in ler_cookies(response).items()}


def _jwe(header: dict, claims: dict, key: OctKey) -> str:
    registry = JWERegistry(algorithms=list(header.values()))
    return jwt.encode(header, claims, key, registry=registry)


# Emissão


def test_access_cookie_vai_e_volta(ler_cookies):
    response = Response()
    set_access_cookie(response, "app14~TOKEN1")

    assert read_access_cookie(_request(**_cookies(response, ler_cookies))) == (
        "app14~TOKEN1"
    )


def test_refresh_cookie_devolve_as_credenciais(ler_cookies):
    response = Response()
    set_refresh_cookie(response, CREDENCIAIS)

    lidas = read_refresh_cookie(_request(**_cookies(response, ler_cookies)))

    assert lidas == CREDENCIAIS
    assert lidas.password.get_secret_value() == SENHA


def test_cookies_sao_jwe_compacto_com_aes_gcm(ler_cookies):
    response = Response()
    set_access_cookie(response, "app14~TOKEN1")
    set_refresh_cookie(response, CREDENCIAIS)

    for token in _cookies(response, ler_cookies).values():
        partes = token.split(".")
        assert len(partes) == 5
        assert json.loads(_b64decode(partes[0])) == {
            "typ": "JWT",
            "alg": "dir",
            "enc": "A256GCM",
        }
        # `dir` não embrulha chave; IV de 96 bits e tag de 128 bits do GCM.
        assert partes[1] == ""
        assert len(_b64decode(partes[2])) == 12
        assert len(_b64decode(partes[4])) == 16


def test_nenhum_segredo_fica_legivel_no_cookie(ler_cookies):
    response = Response()
    set_access_cookie(response, "app14~TOKEN1")
    set_refresh_cookie(response, CREDENCIAIS)

    for token in _cookies(response, ler_cookies).values():
        visivel = _visivel(token)
        for segredo in SEGREDOS:
            assert segredo not in visivel


def test_mesmo_payload_gera_cookies_diferentes():
    """IV aleatório: repetir o IV no GCM vaza o XOR dos textos e a chave de MAC."""
    claims = _refresh_claims()
    tokens = [encrypt_cookie(REFRESH_COOKIE_NAME, claims) for _ in range(20)]

    assert len(set(tokens)) == len(tokens)
    assert len({token.split(".")[2] for token in tokens}) == len(tokens)


def test_cookie_carrega_exp_do_lado_de_dentro(ler_cookies):
    response = Response()
    set_access_cookie(response, "app14~TOKEN1")
    set_refresh_cookie(response, CREDENCIAIS)

    jar = _cookies(response, ler_cookies)
    exp = {nome: decrypt_cookie(nome, token)["exp"] for nome, token in jar.items()}

    agora = datetime.now(UTC).timestamp()
    assert exp[ACCESS_COOKIE_NAME] == pytest.approx(
        agora + settings.access_token_expire_minutes * 60, abs=5
    )
    assert exp[REFRESH_COOKIE_NAME] > exp[ACCESS_COOKIE_NAME]


def test_cookies_sao_httponly_e_lax(ler_cookies):
    response = Response()
    set_access_cookie(response, "app14~TOKEN1")

    morsel = ler_cookies(response)[ACCESS_COOKIE_NAME]
    assert morsel["httponly"]
    assert morsel["samesite"] == "lax"
    assert int(morsel["max-age"]) == settings.access_token_expire_minutes * 60


def test_secure_so_em_producao(ler_cookies, monkeypatch: pytest.MonkeyPatch):
    """Em desenvolvimento a API roda em HTTP puro e o navegador descartaria."""
    response = Response()
    set_access_cookie(response, "app14~TOKEN1")
    assert not ler_cookies(response)[ACCESS_COOKIE_NAME]["secure"]

    monkeypatch.setattr(settings, "environment", "production")
    response = Response()
    set_access_cookie(response, "app14~TOKEN1")
    assert ler_cookies(response)[ACCESS_COOKIE_NAME]["secure"]


def test_clear_cookies_apaga_os_dois(ler_cookies):
    response = Response()
    clear_cookies(response)

    assert _cookies(response, ler_cookies) == {
        ACCESS_COOKIE_NAME: "",
        REFRESH_COOKIE_NAME: "",
    }


# Chaves


def test_cada_uso_tem_sua_propria_chave():
    chaves = {
        _key(ACCESS_COOKIE_NAME).raw_value,
        _key(REFRESH_COOKIE_NAME).raw_value,
        derive_key("followw:jobs"),
    }

    assert len(chaves) == 3
    assert settings.jwt_secret_key.encode() not in chaves
    assert all(len(chave) == 32 for chave in chaves)


def test_cookie_nao_e_aceito_no_lugar_do_outro():
    access = encrypt_cookie(ACCESS_COOKIE_NAME, _refresh_claims())
    refresh = encrypt_cookie(REFRESH_COOKIE_NAME, {"session_token": "x", "exp": _exp()})

    assert decrypt_cookie(REFRESH_COOKIE_NAME, access) is None
    assert decrypt_cookie(ACCESS_COOKIE_NAME, refresh) is None
    assert read_refresh_cookie(_request(**{REFRESH_COOKIE_NAME: access})) is None


def test_trocar_o_segredo_invalida_os_cookies(monkeypatch: pytest.MonkeyPatch):
    token = encrypt_cookie(REFRESH_COOKIE_NAME, _refresh_claims())

    monkeypatch.setattr(settings, "jwt_secret_key", "outro-segredo-" + "x" * 32)

    assert decrypt_cookie(REFRESH_COOKIE_NAME, token) is None


def test_segredo_curto_e_recusado(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "curto")

    with pytest.raises(ValidationError, match="jwt_secret_key"):
        Settings()


# Leitura


def test_cookies_ausentes_nao_quebram():
    request = _request()

    assert read_access_cookie(request) is None
    assert read_refresh_cookie(request) is None


@pytest.mark.parametrize(
    "parte",
    [
        pytest.param(0, id="header"),
        pytest.param(1, id="chave-cifrada"),
        pytest.param(2, id="iv"),
        pytest.param(3, id="texto-cifrado"),
        pytest.param(4, id="tag"),
    ],
)
def test_qualquer_bit_alterado_e_recusado(parte: int):
    partes = encrypt_cookie(REFRESH_COOKIE_NAME, _refresh_claims()).split(".")
    dados = bytearray(_b64decode(partes[parte]) or b"\x00" * 32)
    dados[0] ^= 1
    partes[parte] = _b64encode(bytes(dados))

    assert decrypt_cookie(REFRESH_COOKIE_NAME, ".".join(partes)) is None


def test_trocar_o_header_sem_mexer_no_resto_e_recusado():
    """O header protegido entra como AAD do GCM."""
    partes = encrypt_cookie(REFRESH_COOKIE_NAME, _refresh_claims()).split(".")
    partes[0] = _b64encode(b'{"alg":"dir","enc":"A256GCM","kid":"x"}')

    assert decrypt_cookie(REFRESH_COOKIE_NAME, ".".join(partes)) is None


def test_tag_truncada_e_recusada():
    partes = encrypt_cookie(REFRESH_COOKIE_NAME, _refresh_claims()).split(".")
    partes[4] = _b64encode(_b64decode(partes[4])[:4])

    assert decrypt_cookie(REFRESH_COOKIE_NAME, ".".join(partes)) is None


def test_cifrado_com_outra_chave_e_recusado():
    token = _jwe(
        {"alg": "dir", "enc": "A256GCM"}, _refresh_claims(), OctKey.generate_key(256)
    )

    assert decrypt_cookie(REFRESH_COOKIE_NAME, token) is None


@pytest.mark.parametrize(
    "header",
    [
        pytest.param({"alg": "dir", "enc": "A128CBC-HS256"}, id="outro-enc"),
        pytest.param({"alg": "A256KW", "enc": "A256GCM"}, id="outro-alg"),
        pytest.param({"alg": "dir", "enc": "A256GCM", "zip": "DEF"}, id="zip"),
    ],
)
def test_jwe_fora_do_perfil_e_recusado_mesmo_com_a_chave_certa(header: dict):
    """Só `dir` + `A256GCM`: sem confusão de algoritmo nem bomba de descompressão."""
    token = _jwe(header, _refresh_claims(), _key(REFRESH_COOKIE_NAME))

    assert decrypt_cookie(REFRESH_COOKIE_NAME, token) is None


@pytest.mark.parametrize(
    "key",
    [
        pytest.param(OctKey.import_key(settings.jwt_secret_key.encode()), id="segredo"),
        pytest.param(_key(REFRESH_COOKIE_NAME), id="chave-do-cookie"),
    ],
)
def test_jws_assinado_e_recusado(key: OctKey):
    """Inclui o formato antigo (JWS HS256 com o segredo): legível, logo inaceitável."""
    token = jwt.encode({"alg": "HS256"}, _refresh_claims(), key)

    assert decrypt_cookie(REFRESH_COOKIE_NAME, token) is None
    assert read_refresh_cookie(_request(**{REFRESH_COOKIE_NAME: token})) is None


@pytest.mark.filterwarnings("ignore::joserfc.errors.SecurityWarning")
def test_jwt_sem_assinatura_e_recusado():
    token = jwt.encode(
        {"alg": "none"},
        _refresh_claims(),
        None,
        registry=JWSRegistry(algorithms=["none"]),
    )

    assert decrypt_cookie(REFRESH_COOKIE_NAME, token) is None


@pytest.mark.parametrize(
    "claims",
    [
        pytest.param({"session_token": "x", "exp": _exp(-1)}, id="expirado"),
        pytest.param({"session_token": "x"}, id="sem-exp"),
        pytest.param({"session_token": "x", "exp": "amanha"}, id="exp-invalido"),
    ],
)
def test_validade_e_conferida_depois_de_decifrar(claims: dict):
    token = _jwe({"alg": "dir", "enc": "A256GCM"}, claims, _key(ACCESS_COOKIE_NAME))

    assert decrypt_cookie(ACCESS_COOKIE_NAME, token) is None
    assert read_access_cookie(_request(**{ACCESS_COOKIE_NAME: token})) is None


@pytest.mark.parametrize(
    "token",
    [
        pytest.param("", id="vazio"),
        pytest.param("nao-e-um-jwe", id="texto"),
        pytest.param("a.b.c.d.e", id="partes-invalidas"),
        pytest.param("....", id="partes-vazias"),
        pytest.param("e30.e30.e30.e30.e30", id="json-vazio"),
        pytest.param("%%%.%%%.%%%.%%%.%%%", id="base64-invalido"),
        pytest.param(
            _b64encode(b'{"alg":"dir","enc":["A256GCM"]}') + ".e30.e30.e30.e30",
            id="enc-como-lista",
        ),
    ],
)
def test_lixo_vira_none(token: str):
    assert decrypt_cookie(ACCESS_COOKIE_NAME, token) is None
    assert decrypt_cookie(REFRESH_COOKIE_NAME, token) is None


@pytest.mark.parametrize(
    "claims",
    [
        pytest.param({"session_token": "x"}, id="sem-exp"),
        pytest.param({"session_token": "x", "exp": "amanha"}, id="exp-invalido"),
    ],
)
def test_cifrar_sem_exp_e_recusado(claims: dict):
    with pytest.raises(TypeError, match="exp"):
        encrypt_cookie(ACCESS_COOKIE_NAME, claims)


def test_refresh_cookie_sem_senha_vira_none():
    """Cifrado por nós, mas com formato antigo: não pode virar exceção."""
    token = encrypt_cookie(
        REFRESH_COOKIE_NAME, {"registration": "251000000", "exp": _exp()}
    )

    assert read_refresh_cookie(_request(**{REFRESH_COOKIE_NAME: token})) is None


# Ponta a ponta


def test_login_nao_devolve_nenhum_segredo_legivel(client, sigaa):
    sigaa.password = SENHA

    response = client.post(
        "/auth/sigaa", json={"registration": "251000000", "password": SENHA}
    )

    assert response.status_code == 200
    brutos = response.headers.get_list("set-cookie")
    assert {h.split("=", 1)[0] for h in brutos} == {
        ACCESS_COOKIE_NAME,
        REFRESH_COOKIE_NAME,
    }
    for header in brutos:
        token = header.split("=", 1)[1].split(";", 1)[0]
        for segredo in SEGREDOS:
            assert segredo not in _visivel(token)
    assert read_refresh_cookie(_request(**dict(response.cookies))) == CREDENCIAIS
