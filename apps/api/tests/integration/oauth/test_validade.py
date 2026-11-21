from datetime import UTC, datetime, timedelta

from api.core.config import settings


def test_access_expira_apos_quarenta_minutos_sem_prorrogar_com_leituras(
    client, emitir, stub_sigaa, monkeypatch
):
    from api.modules.oauth import tokens

    issued = datetime.now(UTC).replace(microsecond=0)

    class Clock(datetime):
        instant = issued

        @classmethod
        def now(cls, tz=None):
            return cls.instant

    monkeypatch.setattr(tokens, "datetime", Clock)
    token = emitir().access_token
    headers = {"Authorization": f"Bearer {token}"}
    Clock.instant = issued + timedelta(minutes=39)
    assert client.get("/me", headers=headers).status_code == 200
    Clock.instant += timedelta(minutes=1)
    assert client.get("/me", headers=headers).status_code == 401


def test_trocar_chave_dos_cookies_preserva_oauth_e_trocar_chave_oauth_invalida(
    client, emitir, stub_sigaa, monkeypatch
):
    token = emitir().access_token
    headers = {"Authorization": f"Bearer {token}"}
    monkeypatch.setattr(settings, "jwt_secret_key", "c" * 32)
    assert client.get("/me", headers=headers).status_code == 200
    monkeypatch.setattr(settings, "oauth_secret_key", "o" * 32)
    assert client.get("/me", headers=headers).status_code == 401
