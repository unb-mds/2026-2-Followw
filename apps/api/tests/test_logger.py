import asyncio
import json

import httpx
import pytest
from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient

from api.logger import RequestLoggingMiddleware, event, operation


def records(caplog):
    return [json.loads(r.message) for r in caplog.records if r.name == "followw"]


def test_login_logs_nested_tasks_without_secrets(client, sigaa, caplog):
    response = client.post(
        "/auth/sigaa?token=query-secret",
        json={"registration": "251000000", "password": "senha123"},
        headers={
            "Cookie": "secret-cookie=value-secret",
            "Authorization": "Bearer secret",
        },
    )
    assert response.status_code == 200
    logs = records(caplog)
    tasks = [r for r in logs if r["event"] == "sync.task.completed"]
    assert {r["task"] for r in tasks} >= {
        "sync_account",
        "sync_profile",
        "sync_classrooms",
    }
    assert all(r["duration_ms"] >= 0 for r in tasks)
    assert len({r["request_id"] for r in tasks}) == 1
    assert any(r["event"] == "sigaa.connect.completed" for r in logs)
    assert any(r.get("route") == "/jobs" and r["status_code"] == 204 for r in logs)
    output = caplog.text
    for secret in (
        "senha123",
        "251000000",
        "query-secret",
        "value-secret",
        "Bearer secret",
        "app14~TOKEN1",
        *response.cookies.values(),
    ):
        assert secret not in output


def test_failed_connection_logs_only_exception_type(client, stub_sigaa, caplog):
    stub_sigaa.authenticate.side_effect = httpx.ConnectError("Cookie: secret-error")
    response = client.post(
        "/auth/sigaa", json={"registration": "251000000", "password": "senha123"}
    )
    assert response.status_code == 502
    assert any(r.get("error_type") == "ConnectError" for r in records(caplog))
    assert "secret-error" not in caplog.text
    assert all(r.exc_info is None for r in caplog.records if r.name == "followw")


def test_request_error_and_unknown_path_do_not_log_input(caplog):
    app = FastAPI()
    app.add_middleware(RequestLoggingMiddleware)

    @app.get("/fail")
    async def fail():
        raise ValueError("secret-error")

    with TestClient(app, raise_server_exceptions=False) as client:
        assert client.get("/fail").status_code == 500
        assert client.get("/secret-path?cookie=secret-query").status_code == 404
    logs = records(caplog)
    completed = [r for r in logs if r["event"] == "request.completed"]
    assert [r["status_code"] for r in completed] == [500, 404]
    assert completed[1]["route"] is None
    assert completed[0]["request_id"] != completed[1]["request_id"]
    assert "secret-" not in caplog.text


def test_included_route_logs_template_without_path_parameters(caplog):
    app = FastAPI()
    router = APIRouter()

    @router.get("/{item}")
    async def get_item(item: str):
        return {}

    app.include_router(router, prefix="/items")
    app.add_middleware(RequestLoggingMiddleware)
    with TestClient(app) as client:
        assert client.get("/items/secret-value").status_code == 200
    assert records(caplog)[-1]["route"] == "/items/{item}"
    assert "secret-value" not in caplog.text


async def test_operation_context_is_isolated_and_filters_objects(caplog):
    async def run(task):
        with operation("sync.task", task=task, cookies={"session": "secret"}):
            await asyncio.sleep(0)
            event("inside", credentials="secret", job={"password": "secret"})

    await asyncio.gather(run("profile"), run("statistics"))
    event("outside")
    logs = records(caplog)
    assert [r["task"] for r in logs if r["event"] == "inside"] == [
        "profile",
        "statistics",
    ]
    assert "task" not in logs[-1]
    assert "secret" not in caplog.text


def test_cancellation_is_logged_and_context_reset(caplog):
    with pytest.raises(asyncio.CancelledError), operation("sync.task", task="profile"):
        raise asyncio.CancelledError("secret")
    event("outside")
    logs = records(caplog)
    assert logs[-2]["error_type"] == "CancelledError"
    assert "task" not in logs[-1]
    assert "secret" not in caplog.text
