from unittest.mock import AsyncMock, MagicMock

import pytest

from app.repositories.prompts import PromptRepository


def _async_items(items):
    async def iterator():
        for item in items:
            yield item

    return iterator()


def _repository_with_container(container):
    cosmos = MagicMock()
    cosmos.get_container.return_value = container
    return PromptRepository(cosmos)


@pytest.mark.asyncio
async def test_delete_category_and_subcategories_deletes_children_then_category():
    container = MagicMock()
    container.query_items.return_value = _async_items([
        {"id": "sub-1"},
        {"id": "sub-2"},
    ])
    container.delete_item = AsyncMock()

    await _repository_with_container(container).delete_category_and_subcategories("cat-1")

    assert container.delete_item.await_args_list[0].kwargs == {
        "item": "sub-1",
        "partition_key": "sub-1",
    }
    assert container.delete_item.await_args_list[1].kwargs == {
        "item": "sub-2",
        "partition_key": "sub-2",
    }
    assert container.delete_item.await_args_list[2].kwargs == {
        "item": "cat-1",
        "partition_key": "cat-1",
    }


@pytest.mark.asyncio
async def test_delete_subcategory_deletes_by_id_partition():
    container = MagicMock()
    container.delete_item = AsyncMock()

    await _repository_with_container(container).delete_subcategory("sub-1")

    container.delete_item.assert_awaited_once_with(item="sub-1", partition_key="sub-1")
