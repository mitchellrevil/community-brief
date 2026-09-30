from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from app.api.v1.routes.inference_catalog import router
from app.core.auth import get_current_user
from app.core.rate_limit import admin_mutation_limit, standard_rate_limit
from app.deps import get_inference_catalog_service, get_inference_connection_service
from app.schemas.inference_catalog import (
    INITIAL_INFERENCE_CATALOG,
    ModelConnectionResult,
)
from app.services.inference_catalog_service import InferenceCatalogService


@pytest.fixture
def catalogue_client():
    document = INITIAL_INFERENCE_CATALOG.model_dump(mode="json")
    document["_etag"] = '"revision-1"'
    repository = AsyncMock()
    repository.get_inference_catalog.side_effect = lambda: deepcopy(document)

    async def save(catalog, *, etag):
        assert etag == document["_etag"]
        document.clear()
        document.update(catalog)
        document["_etag"] = '"revision-2"'
        return deepcopy(document)

    repository.save_inference_catalog.side_effect = save
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_inference_catalog_service] = (
        lambda: InferenceCatalogService(repository)
    )
    app.dependency_overrides[get_current_user] = lambda: {"permission": "Admin"}
    app.dependency_overrides[admin_mutation_limit] = lambda: None
    app.dependency_overrides[standard_rate_limit] = lambda: None
    return TestClient(app), app, repository


def test_admin_can_add_model_with_nested_arguments_and_read_it_back(catalogue_client):
    client, _, repository = catalogue_client
    response = client.get("/inference/catalog")
    catalog = response.json()
    catalog["version"] += 1
    catalog["models"].append(
        {
            "key": "future-model",
            "display_name": "Future model",
            "deployment": "deployment-blue",
            "provider": "responses",
            "request_defaults": {
                "reasoning": {"effort": "high", "summary": "auto"},
                "new_flag": True,
                "new_array": [1, {"a": "b"}],
            },
            "parameters": {
                "new_flag": {
                    "kind": "boolean",
                    "label": "Flag",
                    "description": "A new option",
                }
            },
        }
    )
    saved = client.put(
        "/admin/inference/catalog",
        headers={"If-Match": response.headers["etag"]},
        json=catalog,
    )
    assert saved.status_code == 200, saved.text
    readback = client.get("/inference/catalog")
    assert readback.headers["etag"] == '"revision-2"'
    assert (
        readback.json()["models"][-1]["request_defaults"]
        == catalog["models"][-1]["request_defaults"]
    )
    repository.save_inference_catalog.assert_awaited_once()


@pytest.mark.parametrize("permission", ["User", "Editor"])
def test_non_admin_cannot_write_catalogue(catalogue_client, permission):
    client, app, repository = catalogue_client
    app.dependency_overrides[get_current_user] = lambda: {"permission": permission}
    response = client.put(
        "/admin/inference/catalog",
        headers={"If-Match": '"revision-1"'},
        json=INITIAL_INFERENCE_CATALOG.model_dump(mode="json"),
    )
    assert response.status_code == 403
    repository.save_inference_catalog.assert_not_awaited()


def test_stale_revision_and_missing_header_do_not_write(catalogue_client):
    client, _, repository = catalogue_client
    payload = INITIAL_INFERENCE_CATALOG.model_dump(mode="json")
    assert client.put("/admin/inference/catalog", json=payload).status_code == 422
    assert (
        client.put(
            "/admin/inference/catalog", json=payload, headers={"If-Match": '"stale"'}
        ).status_code
        == 412
    )
    repository.save_inference_catalog.assert_not_awaited()


def test_cors_allows_catalogue_concurrency_headers(monkeypatch):
    monkeypatch.setenv(
        "JWT_SECRET_KEY", "catalogue-test-secret-with-at-least-32-characters"
    )
    monkeypatch.setenv(
        "AZURE_STORAGE_ACCOUNT_URL", "https://test.blob.core.windows.net"
    )
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://test.openai.azure.com")
    from app.main import configure_cors

    app = FastAPI()
    configure_cors(app, SimpleNamespace(cors_origins_list=["https://community.example"]))
    middleware = next(
        item for item in app.user_middleware if item.cls.__name__ == "CORSMiddleware"
    )
    assert "If-Match" in middleware.kwargs["allow_headers"]
    assert "ETag" in middleware.kwargs["expose_headers"]


@pytest.fixture
def connection_client(catalogue_client):
    client, app, repository = catalogue_client
    service = AsyncMock()
    service.test_connection.return_value = ModelConnectionResult(
        status="success", message="Connection successful."
    )
    app.dependency_overrides[get_inference_connection_service] = lambda: service
    return client, app, repository, service


@pytest.mark.parametrize("provider", ["responses", "chat_completions"])
def test_admin_can_probe_an_unsaved_deployment_without_writing_catalogue(
    connection_client, provider
):
    client, _, repository, service = connection_client
    response = client.post(
        "/admin/inference/test-connection",
        json={"deployment": "unsaved-deployment", "provider": provider},
    )
    assert response.status_code == 200
    assert response.json() == {
        "status": "success", "message": "Connection successful."
    }
    service.test_connection.assert_awaited_once()
    assert service.test_connection.call_args.args[0].deployment == "unsaved-deployment"
    assert service.test_connection.call_args.args[0].provider == provider
    repository.save_inference_catalog.assert_not_awaited()


@pytest.mark.parametrize("permission", ["User", "Editor"])
def test_non_admin_cannot_probe_a_deployment(connection_client, permission):
    client, app, _, service = connection_client
    app.dependency_overrides[get_current_user] = lambda: {"permission": permission}
    response = client.post(
        "/admin/inference/test-connection",
        json={"deployment": "deployment-blue", "provider": "responses"},
    )
    assert response.status_code == 403
    service.test_connection.assert_not_awaited()


@pytest.mark.parametrize(
    "changes",
    [
        {"deployment": "https://arbitrary.example"},
        {"deployment": "../another-deployment"},
        {"deployment": ""},
        {"deployment": "x" * 129},
        {"provider": "unknown"},
        {"endpoint": "https://arbitrary.example"},
        {"api_key": "client-supplied-secret"},
        {"input": "arbitrary prompt"},
    ],
)
def test_probe_rejects_invalid_names_and_extra_configuration(connection_client, changes):
    client, _, _, service = connection_client
    response = client.post(
        "/admin/inference/test-connection",
        json={"deployment": "deployment-blue", "provider": "responses", **changes},
    )
    assert response.status_code == 422
    service.test_connection.assert_not_awaited()
