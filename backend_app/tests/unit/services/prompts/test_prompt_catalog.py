from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.prompts.prompt_catalog import PromptCatalog
from app.schemas.prompt_catalog import PromptTemplatePatch


pytestmark = pytest.mark.unit


@pytest.mark.asyncio
async def test_invalid_form_update_does_not_write_or_create_history():
    from app.core.errors.domain import ValidationError
    from app.services.prompts.talking_points_service import TalkingPointsService

    catalog = _catalog([])
    catalog.talking_points_service = TalkingPointsService()
    catalog.store.get_template.return_value = _template(1)
    with pytest.raises(ValidationError):
        await catalog.update_template(
            "template-001",
            patch=PromptTemplatePatch(pre_session_talking_points=[
                {"fields": [{"name": "existing", "label": " ", "type": "text"}]}
            ]),
            current_user={"id": "editor", "permission": "editor", "business_unit_ids": ["bu-1"]},
        )
    catalog.store.update_template.assert_not_awaited()
    assert not catalog.version_repository.mock_calls


def test_form_write_preserves_legacy_keys_and_array_options():
    from app.services.prompts.talking_points_service import TalkingPointsService

    catalog = _catalog([])
    catalog.talking_points_service = TalkingPointsService()
    fields = catalog._validate_talking_points([{"fields": [
        {"name": "legacy_key", "label": "Renamed", "type": "select", "options": ["A, B", "C"]},
        {"name": "checked", "type": "checkbox", "value": False},
    ]}])[0]["fields"]
    assert fields[0]["name"] == "legacy_key"
    assert fields[0]["options"] == ["A, B", "C"]
    assert fields[1]["value"] is False


def _catalog(templates: list[dict]) -> PromptCatalog:
    store = AsyncMock()
    store.list_templates.return_value = {
        "items": templates,
        "total": len(templates),
        "limit": len(templates),
        "offset": 0,
    }
    store.get_business_unit_id_from_folder.return_value = "bu-1"
    permission = MagicMock()
    permission.set_prompt_store.return_value = permission
    permission.has_business_unit_access.side_effect = (
        lambda user, business_unit_id: business_unit_id in user["business_unit_ids"]
    )
    permission.can_edit_prompt_template = AsyncMock(return_value=True)
    return PromptCatalog(
        store=store,
        permission_service=permission,
        talking_points_service=MagicMock(),
        version_repository=AsyncMock(),
        inference_catalog_service=AsyncMock(),
    )


def _template(index: int, *, visibility: str = "all") -> dict:
    return {
        "id": f"template-{index:03}",
        "folder_id": "folder-1",
        "business_unit_id": "bu-1",
        "name": f"Template {index:03}",
        "visibility": visibility,
    }


@pytest.mark.asyncio
async def test_runtime_filters_complete_snapshot_before_pagination():
    items = [
        *[_template(index, visibility="nobody") for index in range(3)],
        *[_template(index) for index in range(3, 110)],
    ]
    items[-2]["name"] = "Standard Meeting"
    items[-1]["name"] = "Ward Surgery"
    catalog = _catalog(items)
    user = {
        "id": "user-1",
        "permission": "user",
        "business_unit_ids": ["bu-1"],
    }

    first = await catalog.list_templates(
        folder_id=None, view="runtime", limit=100, offset=0, current_user=user
    )
    second = await catalog.list_templates(
        folder_id=None, view="runtime", limit=100, offset=100, current_user=user
    )

    assert first["total"] == 107
    assert len(first["items"]) == 100
    assert first["has_more"] is True
    assert second["total"] == 107
    assert len(second["items"]) == 7
    assert second["has_more"] is False
    assert {item["id"] for item in first["items"]}.isdisjoint(
        {item["id"] for item in second["items"]}
    )
    assert {item["name"] for item in second["items"]} >= {
        "Standard Meeting",
        "Ward Surgery",
    }
    assert catalog.store.list_templates.await_args_list[0].kwargs["limit"] is None


@pytest.mark.asyncio
async def test_management_includes_hidden_templates_for_editors():
    catalog = _catalog([_template(1, visibility="nobody")])
    editor = {
        "id": "editor-1",
        "permission": "editor",
        "business_unit_ids": ["bu-1"],
    }

    result = await catalog.list_templates(
        folder_id=None,
        view="management",
        limit=100,
        offset=0,
        current_user=editor,
    )

    assert result["total"] == 1


@pytest.mark.asyncio
async def test_runtime_enforces_allowlist_across_business_units():
    template = {
        **_template(1, visibility="only_editors"),
        "visible_to_user_ids": ["allowed-user"],
    }
    catalog = _catalog([template])

    allowed = await catalog.list_templates(
        folder_id=None,
        view="runtime",
        limit=100,
        offset=0,
        current_user={
            "id": "allowed-user",
            "permission": "user",
            "business_unit_ids": ["bu-1"],
        },
    )
    other_unit = await catalog.list_templates(
        folder_id=None,
        view="runtime",
        limit=100,
        offset=0,
        current_user={
            "id": "allowed-user",
            "permission": "user",
            "business_unit_ids": ["bu-2"],
        },
    )

    assert allowed["total"] == 1
    assert other_unit["total"] == 1


@pytest.mark.asyncio
async def test_management_reads_published_templates_outside_editor_business_unit():
    catalog = _catalog([_template(1)])
    catalog.permission_service.can_edit_prompt_template.return_value = False

    result = await catalog.list_templates(
        folder_id=None,
        view="management",
        limit=100,
        offset=0,
        current_user={
            "id": "editor-1",
            "permission": "editor",
            "business_unit_ids": ["bu-2"],
        },
    )

    assert result["total"] == 1


@pytest.mark.asyncio
async def test_management_does_not_expose_hidden_template_outside_editor_business_unit():
    catalog = _catalog([_template(1, visibility="nobody")])
    catalog.permission_service.can_edit_prompt_template.return_value = False

    result = await catalog.list_templates(
        folder_id=None,
        view="management",
        limit=100,
        offset=0,
        current_user={
            "id": "editor-1",
            "permission": "editor",
            "business_unit_ids": ["bu-2"],
        },
    )

    assert result["total"] == 0


@pytest.mark.asyncio
async def test_noop_patch_does_not_write_or_create_a_version():
    existing = _template(1)
    catalog = _catalog([])
    catalog.store.get_template.return_value = existing

    result = await catalog.update_template(
        existing["id"],
        patch=PromptTemplatePatch(name=existing["name"]),
        current_user={
            "id": "editor-1",
            "permission": "editor",
            "business_unit_ids": ["bu-1"],
        },
    )

    assert result == existing
    catalog.store.update_template.assert_not_awaited()
    catalog.version_repository.create_version.assert_not_awaited()


@pytest.mark.asyncio
async def test_partial_patch_writes_only_changes_and_versions_the_previous_state():
    existing = _template(1)
    catalog = _catalog([])
    catalog.store.get_template.return_value = existing
    catalog.store.update_template.return_value = {
        **existing,
        "name": "Renamed template",
    }

    result = await catalog.update_template(
        existing["id"],
        patch=PromptTemplatePatch(name="Renamed template"),
        current_user={
            "id": "editor-1",
            "full_name": "Editor One",
            "permission": "editor",
            "business_unit_ids": ["bu-1"],
        },
    )

    assert result["name"] == "Renamed template"
    catalog.store.update_template.assert_awaited_once()
    changes = catalog.store.update_template.await_args.kwargs
    assert changes["name"] == "Renamed template"
    assert changes["updated_by_user_id"] == "editor-1"
    version = catalog.version_repository.create_version.await_args.args[0]
    assert version["snapshot"]["name"] == existing["name"]
    assert version["source_action"] == "update_pre"


@pytest.mark.asyncio
async def test_delete_folder_records_actor_for_safe_archive():
    catalog = _catalog([])
    catalog.store.get_folder.return_value = {
        "id": "folder-1",
        "name": "Folder One",
        "parent_id": "bu-1",
        "business_unit_id": "bu-1",
    }
    catalog.permission_service.can_edit_folder = AsyncMock(return_value=True)

    await catalog.delete_folder(
        "folder-1",
        current_user={
            "id": "editor-1",
            "permission": "editor",
            "business_unit_ids": ["bu-1"],
        },
    )

    catalog.store.delete_folder_and_templates.assert_awaited_once_with(
        "folder-1", deleted_by_user_id="editor-1"
    )


@pytest.mark.asyncio
async def test_restore_replaces_the_template_and_keeps_pre_and_post_versions():
    current = {**_template(1), "prompts": {"summary": "Current"}}
    restored = {**current, "prompts": {"summary": "Approved"}}
    catalog = _catalog([])
    catalog.store.get_template.return_value = current
    catalog.store.replace_template.return_value = restored
    catalog.version_repository.get_version.return_value = {
        "id": "version-1",
        "type": "prompt_subcategory_version",
        "template_id": current["id"],
        "snapshot": restored,
    }

    result = await catalog.restore_version(
        current["id"],
        "version-1",
        reason="Approved rollback",
        current_user={
            "id": "editor-1",
            "full_name": "Editor One",
            "permission": "editor",
            "business_unit_ids": ["bu-1"],
        },
    )

    assert result["prompts"] == {"summary": "Approved"}
    replacement = catalog.store.replace_template.await_args.args[0]
    assert replacement["id"] == current["id"]
    assert replacement["prompts"] == {"summary": "Approved"}
    actions = [
        call.args[0]["source_action"]
        for call in catalog.version_repository.create_version.await_args_list
    ]
    assert actions == ["restore_pre", "restore_post"]
