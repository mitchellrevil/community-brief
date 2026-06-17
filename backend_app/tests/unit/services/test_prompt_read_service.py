import pytest
from unittest.mock import AsyncMock

from app.services.prompts.prompt_read_service import PromptReadService


pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def clear_prompt_read_service_cache():
    PromptReadService._list_subcategories_cache._cache.clear()
    PromptReadService._retrieve_prompts_cache._cache.clear()
    yield
    PromptReadService._list_subcategories_cache._cache.clear()
    PromptReadService._retrieve_prompts_cache._cache.clear()


def _make_prompt_service():
    prompt_service = AsyncMock()
    prompt_service.list_subcategories = AsyncMock(
        return_value={
            "items": [
                    {
                        "id": "sub_1",
                        "category_id": "cat_1",
                        "name": "Visible subcategory",
                        "prompt_visibility": "all",
                        "visible_to_user_ids": [],
                        "preSessionTalkingPoints": [],
                        "inSessionTalkingPoints": [],
                    }
            ]
        }
    )
    prompt_service.retrieve_prompts_hierarchy = AsyncMock(
        return_value=[
            {
                "category_name": "Cat 1",
                "category_id": "cat_1",
                "subcategories": [
                    {
                        "subcategory_name": "Visible subcategory",
                        "subcategory_id": "sub_1",
                        "prompt_visibility": "all",
                        "visible_to_user_ids": [],
                    }
                ],
            }
        ]
    )
    return prompt_service


async def test_list_subcategories_reuses_cached_response():
    prompt_service = _make_prompt_service()
    service = PromptReadService(prompt_service=prompt_service, talking_points_service=None)

    current_user = {"id": "user_1", "permission": "user"}

    first = await service.list_subcategories(
        category_id=None,
        limit=50,
        offset=0,
        include_hidden=False,
        current_user=current_user,
    )
    second = await service.list_subcategories(
        category_id=None,
        limit=50,
        offset=0,
        include_hidden=False,
        current_user=current_user,
    )

    assert first == second
    assert prompt_service.list_subcategories.await_count == 1


async def test_retrieve_prompts_reuses_cached_response():
    prompt_service = _make_prompt_service()
    service = PromptReadService(prompt_service=prompt_service, talking_points_service=None)

    current_user = {"id": "user_1", "permission": "user"}

    first = await service.retrieve_prompts(current_user=current_user)
    second = await service.retrieve_prompts(current_user=current_user)

    assert first == second
    assert prompt_service.retrieve_prompts_hierarchy.await_count == 1
