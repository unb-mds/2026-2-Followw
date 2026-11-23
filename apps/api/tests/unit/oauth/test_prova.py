from time import time

import pytest
from joserfc import jwt
from joserfc.jwk import ECKey

from api.modules.oauth.proof import InvalidProof, Proof


def test_prova_exige_chave_publica_metodo_destino_e_emissao_recentes():
    endpoint = "https://api.example/oauth/token"
    key = ECKey.generate_key("P-256")
    header = {"alg": "ES256", "typ": "dpop+jwt", "jwk": key.as_dict(private=False)}
    claims = {"jti": "teste", "htu": endpoint, "htm": "POST", "iat": int(time())}
    for changed_header, changed_claims in [
        ({"typ": "JWT"}, {}),
        ({"jwk": key.as_dict(private=True)}, {}),
        ({"jwk": ECKey.generate_key("P-256").as_dict(private=False)}, {}),
        ({}, {"htm": "GET"}),
        ({}, {"htu": endpoint + "/outro"}),
        ({}, {"jti": ""}),
        ({}, {"iat": 0}),
        ({}, {"iat": int(time()) + 600}),
    ]:
        token = jwt.encode(header | changed_header, claims | changed_claims, key)
        with pytest.raises(InvalidProof):
            Proof.verify(token, endpoint)
