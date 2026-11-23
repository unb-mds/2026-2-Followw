from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from hashlib import sha256

from joserfc import jws, jwt
from joserfc.errors import JoseError
from joserfc.jwk import ECKey
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import OAuthProof

MAX_PROOF_LENGTH = 8192
_PROOF_AGE = timedelta(minutes=5)


class InvalidProof(ValueError):
    pass


@dataclass(frozen=True)
class Proof:
    thumbprint: str
    jti: str
    expires_at: datetime

    @classmethod
    def verify(cls, encoded: str, token_endpoint: str) -> Proof:
        """O endpoint é a URL pública configurada pelo servidor, sem query ou fragmento."""
        try:
            if len(encoded) > MAX_PROOF_LENGTH:
                raise ValueError
            header = jws.extract_compact(encoded.encode()).headers()
            jwk = header["jwk"]
            if (
                header["typ"] != "dpop+jwt"
                or header["alg"] != "ES256"
                or jwk["kty"] != "EC"
                or jwk["crv"] != "P-256"
                or "d" in jwk
            ):
                raise ValueError
            key = ECKey.import_key(jwk)
            claims = jwt.decode(encoded, key, algorithms=["ES256"]).claims
            if claims["htm"] != "POST" or claims["htu"] != token_endpoint:
                raise ValueError
            jti, iat = claims["jti"], claims["iat"]
            now = datetime.now(UTC)
            if (
                not isinstance(jti, str)
                or not 1 <= len(jti) <= 128
                or type(iat) is not int
            ):
                raise ValueError
            issued = datetime.fromtimestamp(iat, UTC)
            if not now - _PROOF_AGE < issued <= now + timedelta(seconds=30):
                raise ValueError
            return cls(
                key.thumbprint(), sha256(jti.encode()).hexdigest(), issued + _PROOF_AGE
            )
        except (
            JoseError,
            KeyError,
            ValueError,
            TypeError,
            OverflowError,
            OSError,
        ) as error:
            raise InvalidProof("Prova DPoP inválida.") from error

    async def consume(self, session: AsyncSession) -> None:
        now = datetime.now(UTC)
        if self.expires_at <= now:
            raise InvalidProof("Prova DPoP expirada.")
        await session.execute(delete(OAuthProof).where(OAuthProof.expires_at <= now))
        inserted = await session.scalar(
            insert(OAuthProof)
            .values(
                key_thumbprint=self.thumbprint, jti=self.jti, expires_at=self.expires_at
            )
            .on_conflict_do_nothing()
            .returning(OAuthProof.jti)
        )
        if inserted is None:
            raise InvalidProof("Prova DPoP já utilizada.")
