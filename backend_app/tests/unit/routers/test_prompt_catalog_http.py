from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.routes.prompt_catalog import router
from app.core.auth import get_current_user, require_editor, require_user
from app.core.error_handlers import register_error_handlers
from app.core.rate_limit import standard_rate_limit
from app.deps import get_prompt_catalog


pytestmark = pytest.mark.unit


def _template(item_id: str = "template-1") -> dict:
    return {
        "id": item_id,
        "folder_id": "folder-1",
        "business_unit_id": "bu-1",
        "name": "Standard Meeting",
        "prompts": {"summary": "Summarise the meeting."},
        "pre_session_talking_points": [],
        "in_session_talking_points": [],
        "analysis_workflow": "standard",
        "visibility": "all",
        "speaker_identification_enabled": False,
        "recording_disclaimer_enabled": False,
        "created_at": 1_700_000_000_000,
        "updated_at": 1_700_000_000_001,
    }


def _folder(item_id: str = "folder-1") -> dict:
    return {
        "id": item_id,
        "name": "Councillors",
        "parent_id": None,
        "business_unit_id": item_id,
        "is_business_unit": True,
        "created_at": 1_700_000_000_000,
        "updated_at": 1_700_000_000_001,
    }


@pytest.fixture
def catalog_client():
    application = FastAPI()
    register_error_handlers(application)
    application.include_router(router, prefix="/api/v1")
    catalog = AsyncMock()
    user = {
        "id": "editor-1",
        "permission": "editor",
        "business_unit_ids": ["bu-1"],
    }
    application.dependency_overrides[standard_rate_limit] = lambda: None
    application.dependency_overrides[get_current_user] = lambda: user
    application.dependency_overrides[require_user] = lambda: user
    application.dependency_overrides[require_editor] = lambda: user
    application.dependency_overrides[get_prompt_catalog] = lambda: catalog
    with TestClient(application) as client:
        yield client, catalog


def test_template_list_contract_is_paginated_and_snake_case(catalog_client):
    client, catalog = catalog_client
    catalog.list_templates.return_value = {
        "items": [_template()],
        "total": 107,
        "limit": 100,
        "offset": 0,
        "has_more": True,
    }

    response = client.get(
        "/api/v1/templates?view=management&limit=100&offset=0"
    )

    assert response.status_code == 200
    body = response.json()
    assert {key: body[key] for key in ("total", "limit", "offset", "has_more")} == {
        "total": 107,
        "limit": 100,
        "offset": 0,
        "has_more": True,
    }
    assert body["items"][0]["folder_id"] == "folder-1"
    assert body["items"][0]["pre_session_talking_points"] == []
    assert "category_id" not in body["items"][0]
    assert "preSessionTalkingPoints" not in body["items"][0]
    catalog.list_templates.assert_awaited_once_with(
        folder_id=None,
        view="management",
        limit=100,
        offset=0,
        current_user={
            "id": "editor-1",
            "permission": "editor",
            "business_unit_ids": ["bu-1"],
        },
    )


def test_patch_rejects_an_empty_body(catalog_client):
    client, catalog = catalog_client

    response = client.patch("/api/v1/templates/template-1", json={})

    assert response.status_code == 422
    catalog.update_template.assert_not_awaited()


@pytest.mark.parametrize(
    "patch",
    [
        {"name": None},
        {"folder_id": None},
        {"prompts": None},
        {"visibility": None},
        {"speaker_identification_enabled": None},
    ],
)
def test_patch_rejects_null_for_non_nullable_fields(catalog_client, patch):
    client, catalog = catalog_client

    response = client.patch("/api/v1/templates/template-1", json=patch)

    assert response.status_code == 422
    catalog.update_template.assert_not_awaited()


def test_move_uses_folder_id_on_normal_patch(catalog_client):
    client, catalog = catalog_client
    catalog.update_template.return_value = _template()

    response = client.patch(
        "/api/v1/templates/template-1", json={"folder_id": "folder-2"}
    )

    assert response.status_code == 200
    patch = catalog.update_template.await_args.kwargs["patch"]
    assert patch.model_dump(exclude_unset=True) == {"folder_id": "folder-2"}


def test_template_restoration_has_a_distinct_post_contract(catalog_client):
    client, catalog = catalog_client
    catalog.restore_version.return_value = _template()

    response = client.post(
        "/api/v1/templates/template-1/restorations",
        json={"version_id": "version-2", "reason": "Restore approved version"},
    )

    assert response.status_code == 200
    catalog.restore_version.assert_awaited_once_with(
        "template-1",
        "version-2",
        reason="Restore approved version",
        current_user={
            "id": "editor-1",
            "permission": "editor",
            "business_unit_ids": ["bu-1"],
        },
    )


def test_folder_crud_uses_clean_contract_and_status_codes(catalog_client):
    client, catalog = catalog_client
    catalog.list_folders.return_value = {
        "items": [_folder()],
        "total": 1,
        "limit": 50,
        "offset": 0,
        "has_more": False,
    }
    catalog.create_folder.return_value = _folder()
    catalog.get_folder.return_value = _folder()
    catalog.update_folder.return_value = {**_folder(), "name": "Renamed"}

    listed = client.get("/api/v1/folders?view=management")
    created = client.post(
        "/api/v1/folders", json={"name": "Councillors", "parent_id": None}
    )
    fetched = client.get("/api/v1/folders/folder-1?view=management")
    patched = client.patch(
        "/api/v1/folders/folder-1", json={"name": "Renamed"}
    )
    deleted = client.delete("/api/v1/folders/folder-1")

    assert listed.status_code == 200
    assert listed.json()["items"][0]["parent_id"] is None
    assert created.status_code == 201
    assert fetched.status_code == 200
    assert patched.status_code == 200
    assert patched.json()["name"] == "Renamed"
    assert deleted.status_code == 204
    catalog.delete_folder.assert_awaited_once_with(
        "folder-1",
        current_user={
            "id": "editor-1",
            "permission": "editor",
            "business_unit_ids": ["bu-1"],
        },
    )


def test_template_create_get_delete_and_version_reads(catalog_client):
    client, catalog = catalog_client
    catalog.create_template.return_value = _template()
    catalog.get_template.return_value = _template()
    catalog.list_versions.return_value = {
        "items": [{"id": "version-1", "created_at": 1_700_000_000_000}],
        "total": 1,
        "limit": 25,
        "offset": 0,
        "has_more": False,
    }
    catalog.get_version.return_value = {
        "id": "version-1",
        "template_id": "template-1",
        "snapshot": _template(),
        "created_at": 1_700_000_000_000,
    }
    catalog.compare_versions.return_value = {
        "left": {"id": "version-1"},
        "right": {"id": "current"},
        "left_text": "Old",
        "right_text": "New",
        "summary": {"added": 1, "removed": 1},
    }

    created = client.post(
        "/api/v1/templates",
        json={
            "folder_id": "folder-1",
            "name": "Standard Meeting",
            "prompts": {"summary": "Summarise"},
        },
    )
    fetched = client.get("/api/v1/templates/template-1?view=runtime")
    versions = client.get("/api/v1/templates/template-1/versions")
    version = client.get(
        "/api/v1/templates/template-1/versions/version-1"
    )
    compared = client.get(
        "/api/v1/templates/template-1/versions/compare?left=version-1&right=current"
    )
    deleted = client.delete("/api/v1/templates/template-1")

    assert created.status_code == 201
    assert fetched.status_code == 200
    assert versions.status_code == 200
    assert version.status_code == 200
    assert compared.status_code == 200
    assert deleted.status_code == 204


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/prompts/categories",
        "/api/v1/prompts/subcategories",
        "/api/v1/prompts/retrieve_prompts",
        "/api/v1/prompts/prompt-agent/stream",
        "/api/v1/prompt-folders",
        "/api/v1/meeting-types",
        "/api/v1/templates/template-1/versions/version-1/restore",
    ],
)
def test_retired_prompt_routes_are_not_registered(catalog_client, path):
    client, _ = catalog_client

    assert client.get(path).status_code == 404
