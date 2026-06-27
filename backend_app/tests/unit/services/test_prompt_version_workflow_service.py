from unittest.mock import AsyncMock, MagicMock

import pytest

from backend_app.app.core.errors.domain import ResourceNotFoundError
from backend_app.app.services.prompts.prompt_version_workflow_service import PromptVersionWorkflowService


@pytest.mark.asyncio
async def test_list_versions_rejects_hidden_subcategory():
    prompt_service = AsyncMock()
    prompt_service.get_subcategory.return_value = {
        "id": "sub1",
        "category_id": "cat1",
        "prompt_visibility": "nobody",
        "visible_to_user_ids": None,
    }
    prompt_service.get_business_unit_id_from_category.return_value = "bu1"

    version_service = AsyncMock()
    permission_service = MagicMock()
    permission_service.has_business_unit_access.return_value = True

    service = PromptVersionWorkflowService(
        prompt_service=prompt_service,
        prompt_version_service=version_service,
        permission_service=permission_service,
    )

    with pytest.raises(ResourceNotFoundError):
        await service.list_versions(
            subcategory_id="sub1",
            limit=25,
            offset=0,
            current_user={"id": "editor_1", "permission": "editor", "business_unit_ids": ["bu1"]},
        )

    version_service.list_versions.assert_not_called()


@pytest.mark.asyncio
async def test_diff_versions_rejects_cross_business_unit_prompt():
    prompt_service = AsyncMock()
    prompt_service.get_subcategory.return_value = {
        "id": "sub2",
        "category_id": "cat2",
        "prompt_visibility": "all",
        "visible_to_user_ids": None,
    }
    prompt_service.get_business_unit_id_from_category.return_value = "bu2"

    version_service = AsyncMock()
    permission_service = MagicMock()
    permission_service.has_business_unit_access.return_value = False

    service = PromptVersionWorkflowService(
        prompt_service=prompt_service,
        prompt_version_service=version_service,
        permission_service=permission_service,
    )

    with pytest.raises(ResourceNotFoundError):
        await service.diff_versions(
            subcategory_id="sub2",
            left="current",
            right="v1",
            current_user={"id": "user_1", "permission": "user", "business_unit_ids": ["bu1"]},
        )

    version_service.diff_versions.assert_not_called()
