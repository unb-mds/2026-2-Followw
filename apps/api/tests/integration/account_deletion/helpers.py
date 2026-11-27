from base64 import urlsafe_b64encode
from hashlib import sha256

from sigaa_client import Credentials

from api.modules.me.profile import sync_profile
from api.sync.engine import Job, Step
from api.sync.queue import encode_job


def profile_job():
    return Job(
        credentials=Credentials(registration="251000000", password="senha123"),
        steps=(Step.of(sync_profile),),
    )


def deliver(client, qstash, job):
    body = encode_job(job)
    return client.post(
        "/jobs",
        content=body,
        headers={
            "Upstash-Signature": qstash.sign("https://api.followw.test/jobs", body)
        },
    )


def authorization(client, application):
    verifier = "v" * 43
    response = client.get(
        "/oauth/authorize",
        params={
            "response_type": "code",
            "client_id": application["client_id"],
            "redirect_uri": application["redirect_uris"][0],
            "scope": "profile:read",
            "code_challenge_method": "S256",
            "code_challenge": urlsafe_b64encode(sha256(verifier.encode()).digest())
            .decode()
            .rstrip("="),
        },
    )
    assert response.status_code == 200
    return response.json()["request_token"], verifier
