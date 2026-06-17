"""
Component tests for subcategory update permissions.

These tests exercise PromptSubcategoryWorkflowService directly so they cover
real permission derivation without paying the full FastAPI app lifecycle cost.
"""

from datetime import datetime, timezone
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.errors.domain import ApplicationError
from app.schemas.prompts import SubcategoryUpdate
from app.services.auth.permission_service import PermissionService
from app.services.prompts.prompt_subcategory_workflow_service import (
    PromptSubcategoryWorkflowService,
)
from app.utils.permission_cache import InMemoryPermissionCache


pytestmark = pytest.mark.component


@pytest.fixture
def mock_prompt_service():
    service = AsyncMock()
    service.get_subcategory = AsyncMock()
    service.get_business_unit_id_from_category = AsyncMock()
    service.update_subcategory = AsyncMock()
    return service


@pytest.fixture
def talking_points_service():
    service = MagicMock()
    service.validate_talking_points_structure.side_effect = lambda items: items
    service.ensure_talking_points_structure.side_effect = lambda subcategory: subcategory
    return service


@pytest.fixture
def prompt_version_service():
    service = MagicMock()
    service.create_version_snapshot = AsyncMock()
    return service


@pytest.fixture
def permission_service():
    return PermissionService(InMemoryPermissionCache())


@pytest.fixture
def workflow_service(
    mock_prompt_service,
    permission_service,
    talking_points_service,
    prompt_version_service,
):
    return PromptSubcategoryWorkflowService(
        prompt_service=mock_prompt_service,
        permission_service=permission_service,
        talking_points_service=talking_points_service,
        prompt_version_service=prompt_version_service,
    )


def create_test_subcategory(
    *,
    subcategory_id: str = "subcategory_123",
    category_id: str = "bu_123",
    business_unit_id: str | None = "bu_123",
    name: str = "Test Subcategory",
) -> dict[str, Any]:
    now = int(datetime.now(timezone.utc).timestamp() * 1000)
    subcategory = {
        "id": subcategory_id,
        "type": "prompt_subcategory",
        "category_id": category_id,
        "name": name,
        "prompts": {"system": "Test prompt content"},
        "preSessionTalkingPoints": [],
        "inSessionTalkingPoints": [],
        "created_at": now,
        "updated_at": now,
    }
    if business_unit_id is not None:
        subcategory["business_unit_id"] = business_unit_id
    return subcategory


def create_user(
    *,
    user_id: str,
    permission: str,
    business_unit_ids: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "id": user_id,
        "email": f"{user_id}@example.com",
        "name": f"User {user_id}",
        "permission": permission,
        "business_unit_ids": business_unit_ids or [],
    }


def create_update_payload(name: str = "Updated Name") -> SubcategoryUpdate:
    return SubcategoryUpdate(
        name=name,
        prompts={"system": "Updated prompt"},
        preSessionTalkingPoints=[],
        inSessionTalkingPoints=[],
    )


class TestEditorPutSubcategoryPermission:
    @pytest.mark.asyncio
    async def test_editor_with_matching_bu_can_update_subcategory(
        self,
        workflow_service,
        mock_prompt_service,
        prompt_version_service,
    ):
        business_unit_id = "bu_test_123"
        existing = create_test_subcategory(
            subcategory_id="subcategory_1234",
            category_id=business_unit_id,
            business_unit_id=business_unit_id,
        )
        updated = {**existing, "name": "Updated Name"}
        editor_user = create_user(
            user_id="editor_1",
            permission="Editor",
            business_unit_ids=[business_unit_id],
        )

        mock_prompt_service.get_subcategory.return_value = existing
        mock_prompt_service.get_business_unit_id_from_category.return_value = business_unit_id
        mock_prompt_service.update_subcategory.return_value = updated

        result = await workflow_service.update_subcategory(
            subcategory_id=existing["id"],
            subcategory=create_update_payload(),
            current_user=editor_user,
        )

        assert result["name"] == "Updated Name"
        mock_prompt_service.get_business_unit_id_from_category.assert_awaited_once_with(
            business_unit_id
        )
        mock_prompt_service.update_subcategory.assert_awaited_once()
        prompt_version_service.create_version_snapshot.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_editor_without_matching_bu_gets_403(
        self,
        workflow_service,
        mock_prompt_service,
        prompt_version_service,
    ):
        business_unit_id = "bu_test_123"
        existing = create_test_subcategory(
            subcategory_id="subcategory_1234",
            category_id=business_unit_id,
            business_unit_id=business_unit_id,
        )
        editor_user = create_user(
            user_id="editor_2",
            permission="Editor",
            business_unit_ids=["different_bu"],
        )

        mock_prompt_service.get_subcategory.return_value = existing
        mock_prompt_service.get_business_unit_id_from_category.return_value = business_unit_id

        with pytest.raises(ApplicationError) as exc_info:
            await workflow_service.update_subcategory(
                subcategory_id=existing["id"],
                subcategory=create_update_payload(),
                current_user=editor_user,
            )

        assert exc_info.value.status_code == 403
        mock_prompt_service.update_subcategory.assert_not_awaited()
        prompt_version_service.create_version_snapshot.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_editor_with_empty_bu_list_gets_403(
        self,
        workflow_service,
        mock_prompt_service,
        prompt_version_service,
    ):
        business_unit_id = "bu_test_123"
        existing = create_test_subcategory(
            subcategory_id="subcategory_1234",
            category_id=business_unit_id,
            business_unit_id=business_unit_id,
        )
        editor_user = create_user(
            user_id="editor_3",
            permission="Editor",
            business_unit_ids=[],
        )

        mock_prompt_service.get_subcategory.return_value = existing
        mock_prompt_service.get_business_unit_id_from_category.return_value = business_unit_id

        with pytest.raises(ApplicationError) as exc_info:
            await workflow_service.update_subcategory(
                subcategory_id=existing["id"],
                subcategory=create_update_payload(),
                current_user=editor_user,
            )

        assert exc_info.value.status_code == 403
        mock_prompt_service.update_subcategory.assert_not_awaited()
        prompt_version_service.create_version_snapshot.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_admin_can_update_any_subcategory(
        self,
        workflow_service,
        mock_prompt_service,
        prompt_version_service,
    ):
        business_unit_id = "bu_test_123"
        existing = create_test_subcategory(
            subcategory_id="subcategory_1234",
            category_id=business_unit_id,
            business_unit_id=business_unit_id,
        )
        updated = {**existing, "name": "Updated Name"}
        admin_user = create_user(
            user_id="admin_1",
            permission="Admin",
            business_unit_ids=[],
        )

        mock_prompt_service.get_subcategory.return_value = existing
        mock_prompt_service.update_subcategory.return_value = updated

        result = await workflow_service.update_subcategory(
            subcategory_id=existing["id"],
            subcategory=create_update_payload(),
            current_user=admin_user,
        )

        assert result["name"] == "Updated Name"
        mock_prompt_service.get_business_unit_id_from_category.assert_not_called()
        mock_prompt_service.update_subcategory.assert_awaited_once()
        prompt_version_service.create_version_snapshot.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_editor_with_legacy_subcategory_derives_business_unit_from_category(
        self,
        workflow_service,
        mock_prompt_service,
        prompt_version_service,
    ):
        business_unit_id = "bu_test_456"
        existing = create_test_subcategory(
            subcategory_id="subcategory_legacy_789",
            category_id=business_unit_id,
            business_unit_id=None,
            name="Legacy Subcategory",
        )
        updated = {**existing, "name": "Updated Legacy Name"}
        editor_user = create_user(
            user_id="editor_legacy",
            permission="Editor",
            business_unit_ids=[business_unit_id],
        )

        mock_prompt_service.get_subcategory.return_value = existing
        mock_prompt_service.get_business_unit_id_from_category.return_value = business_unit_id
        mock_prompt_service.update_subcategory.return_value = updated

        result = await workflow_service.update_subcategory(
            subcategory_id=existing["id"],
            subcategory=create_update_payload(name="Updated Legacy Name"),
            current_user=editor_user,
        )

        assert result["name"] == "Updated Legacy Name"
        mock_prompt_service.get_business_unit_id_from_category.assert_awaited_once_with(
            business_unit_id
        )
        mock_prompt_service.update_subcategory.assert_awaited_once()
        prompt_version_service.create_version_snapshot.assert_awaited_once()
