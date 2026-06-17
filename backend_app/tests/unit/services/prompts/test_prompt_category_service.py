from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.prompts.prompt_category_service import PromptCategoryService


def build_service(*, user_service=None) -> PromptCategoryService:
    return PromptCategoryService(
        prompt_service=MagicMock(),
        permission_service=MagicMock(),
        user_service=user_service,
    )


@pytest.mark.asyncio
async def test_refresh_user_business_unit_names_soft_fails_on_runtime_error():
    user_service = MagicMock()
    user_service.refresh_business_unit_names = AsyncMock(side_effect=RuntimeError("refresh failed"))
    service = build_service(user_service=user_service)

    await service._refresh_user_business_unit_names("bu-1")

    user_service.refresh_business_unit_names.assert_awaited_once_with("bu-1")


@pytest.mark.asyncio
async def test_remove_business_unit_from_users_soft_fails_on_runtime_error():
    user_service = MagicMock()
    user_service.remove_business_unit_from_users = AsyncMock(side_effect=RuntimeError("cleanup failed"))
    service = build_service(user_service=user_service)

    await service._remove_business_unit_from_users("bu-1")

    user_service.remove_business_unit_from_users.assert_awaited_once_with("bu-1")
