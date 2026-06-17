from unittest.mock import AsyncMock, MagicMock

import pytest

from backend_app.app.api.v1.routes import prompts as prompts_mod
from backend_app.app.schemas.prompts import SubcategoryCreate, SubcategoryUpdate


@pytest.mark.asyncio
async def test_create_subcategory_creates_version_snapshot():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_category.return_value = {"id": "cat1", "business_unit_id": "bu1"}
    mock_prompt_service.create_subcategory.return_value = {
        "id": "sub1",
        "type": "prompt_subcategory",
        "category_id": "cat1",
        "name": "Test Sub",
        "prompts": {"default": "Prompt"},
        "preSessionTalkingPoints": [],
        "inSessionTalkingPoints": [],
        "created_at": 123,
        "updated_at": 123,
        "business_unit_id": "bu1",
    }

    perm = MagicMock()
    perm.set_prompt_service = MagicMock()
    perm.can_edit_category = AsyncMock(return_value=True)

    talking_points_service = MagicMock()
    talking_points_service.validate_talking_points_structure.return_value = []
    talking_points_service.ensure_talking_points_structure.side_effect = lambda x: x

    version_service = MagicMock()
    version_service.create_version_snapshot = AsyncMock()

    subcategory = SubcategoryCreate(
        category_id="cat1",
        name="Test Sub",
        prompts={"default": "Prompt"},
    )

    await prompts_mod.create_subcategory(
        subcategory=subcategory,
        current_user={"id": "u1", "display_name": "User One"},
        auth_context="editor",
        prompt_service=mock_prompt_service,
        perm_service=perm,
        talking_points_service=talking_points_service,
        prompt_version_service=version_service,
    )

    version_service.create_version_snapshot.assert_called_once()


@pytest.mark.asyncio
async def test_list_subcategory_versions_returns_payload():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_subcategory.return_value = {
        "id": "sub1",
        "business_unit_id": "bu1",
    }

    version_service = MagicMock()
    version_service.list_versions = AsyncMock(
        return_value={
            "versions": [
                {
                    "id": "v1",
                    "created_at": 100,
                    "created_by_user_id": "u1",
                    "created_by_display_name": "User",
                    "source_action": "update",
                    "change_reason": "Updated",
                }
            ],
            "total": 1,
            "limit": 25,
            "offset": 0,
            "has_more": False,
        }
    )

    result = await prompts_mod.list_subcategory_versions(
        subcategory_id="sub1",
        limit=25,
        offset=0,
        current_user={"id": "u1"},
        auth_context="user",
        prompt_service=mock_prompt_service,
        prompt_version_service=version_service,
    )

    assert result["total"] == 1
    assert result["versions"][0]["id"] == "v1"


@pytest.mark.asyncio
async def test_rollback_subcategory_version_calls_service():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_subcategory.return_value = {
        "id": "sub1",
        "business_unit_id": "bu1",
    }

    perm = MagicMock()
    perm.set_prompt_service = MagicMock()
    perm.can_edit_prompt = AsyncMock(return_value=True)

    talking_points_service = MagicMock()
    talking_points_service.ensure_talking_points_structure.side_effect = lambda x: x

    version_service = MagicMock()
    version_service.rollback_to_version = AsyncMock(
        return_value={
            "id": "sub1",
            "category_id": "cat1",
            "name": "Rolled Back",
            "prompts": {"default": "Old"},
            "preSessionTalkingPoints": [],
            "inSessionTalkingPoints": [],
            "created_at": 1,
            "updated_at": 2,
        }
    )

    rollback_request = prompts_mod.PromptVersionRollbackRequest(reason="Restore")

    result = await prompts_mod.rollback_subcategory_version(
        subcategory_id="sub1",
        version_id="v1",
        rollback_request=rollback_request,
        current_user={"id": "u_admin", "display_name": "Admin"},
        auth_context="editor",
        prompt_service=mock_prompt_service,
        perm_service=perm,
        talking_points_service=talking_points_service,
        prompt_version_service=version_service,
    )

    assert result["name"] == "Rolled Back"
    version_service.rollback_to_version.assert_called_once()


@pytest.mark.asyncio
async def test_update_subcategory_snapshots_pre_change_state():
    mock_prompt_service = AsyncMock()
    existing_subcategory = {
        "id": "sub1",
        "category_id": "cat1",
        "name": "Old Name",
        "prompts": {"default": "old content"},
        "preSessionTalkingPoints": [],
        "inSessionTalkingPoints": [],
        "business_unit_id": "bu1",
    }
    mock_prompt_service.get_subcategory.return_value = existing_subcategory
    mock_prompt_service.update_subcategory.return_value = {
        **existing_subcategory,
        "name": "New Name",
        "prompts": {"default": "new content"},
        "updated_at": 999,
    }

    perm = MagicMock()
    perm.set_prompt_service = MagicMock()
    perm.can_edit_prompt = AsyncMock(return_value=True)

    talking_points_service = MagicMock()
    talking_points_service.validate_talking_points_structure.return_value = []
    talking_points_service.ensure_talking_points_structure.side_effect = lambda x: x

    version_service = MagicMock()
    version_service.create_version_snapshot = AsyncMock()

    subcategory_update = SubcategoryUpdate(
        name="New Name",
        prompts={"default": "new content"},
        preSessionTalkingPoints=[],
        inSessionTalkingPoints=[],
    )

    await prompts_mod.update_subcategory(
        subcategory_id="sub1",
        subcategory=subcategory_update,
        current_user={"id": "u1", "display_name": "Editor"},
        auth_context="editor",
        prompt_service=mock_prompt_service,
        perm_service=perm,
        talking_points_service=talking_points_service,
        prompt_version_service=version_service,
    )

    version_service.create_version_snapshot.assert_called_once()
    call_kwargs = version_service.create_version_snapshot.call_args.kwargs
    assert call_kwargs["subcategory"]["name"] == "Old Name"
    assert call_kwargs["subcategory"]["prompts"]["default"] == "old content"
    assert call_kwargs["source_action"] == "update_pre"
