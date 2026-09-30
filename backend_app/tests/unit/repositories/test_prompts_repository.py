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
async def test_archive_folder_tree_archives_templates_and_folders_deepest_first():
    container = MagicMock()
    container.query_items.side_effect = [
        _async_items(
            [
                {"id": "cat-1", "type": "prompt_category"},
                {
                    "id": "cat-2",
                    "type": "prompt_category",
                    "parent_category_id": "cat-1",
                },
                {"id": "cat-other", "type": "prompt_category"},
            ]
        ),
        _async_items(
            [
                {
                    "id": "sub-1",
                    "type": "prompt_subcategory",
                    "category_id": "cat-1",
                },
                {
                    "id": "sub-2",
                    "type": "prompt_subcategory",
                    "category_id": "cat-2",
                    "_etag": "etag-2",
                },
                {
                    "id": "sub-other",
                    "type": "prompt_subcategory",
                    "category_id": "cat-other",
                },
            ]
        ),
    ]
    container.replace_item = AsyncMock()

    await _repository_with_container(container).archive_folder_tree(
        "cat-1", deleted_at=1234, deleted_by_user_id="editor-1"
    )

    writes = container.replace_item.await_args_list
    assert [call.kwargs["item"] for call in writes] == [
        "sub-1",
        "sub-2",
        "cat-2",
        "cat-1",
    ]
    assert all(
        call.kwargs["body"]["deleted_at"] == 1234
        and call.kwargs["body"]["deleted_by_user_id"] == "editor-1"
        for call in writes
    )
    assert [call.kwargs["body"]["type"] for call in writes] == [
        "deleted_prompt_subcategory",
        "deleted_prompt_subcategory",
        "deleted_prompt_category",
        "deleted_prompt_category",
    ]
    assert writes[1].kwargs["etag"] == "etag-2"
    assert "sub-other" not in [call.kwargs["item"] for call in writes]


@pytest.mark.asyncio
async def test_delete_meeting_type_deletes_by_id_partition():
    container = MagicMock()
    container.delete_item = AsyncMock()

    await _repository_with_container(container).delete_meeting_type("sub-1")

    container.delete_item.assert_awaited_once_with(
        item="sub-1", partition_key="sub-1"
    )


@pytest.mark.asyncio
async def test_deleted_references_remain_available_but_not_active():
    container = MagicMock()
    container.read_item = AsyncMock(
        side_effect=[
            {
                "id": "cat-1",
                "type": "deleted_prompt_category",
                "name": "Historic folder",
            },
            {
                "id": "sub-1",
                "type": "deleted_prompt_subcategory",
                "name": "Historic template",
                "category_id": "cat-1",
            },
            {
                "id": "cat-1",
                "type": "deleted_prompt_category",
                "name": "Historic folder",
            },
        ]
    )
    repository = _repository_with_container(container)

    folder = await repository.get_folder_reference("cat-1")
    template = await repository.get_meeting_type_reference("sub-1")
    active_folder = await repository.get_folder("cat-1")

    assert folder and folder["name"] == "Historic folder"
    assert template and template["folder_id"] == "cat-1"
    assert active_folder is None


@pytest.mark.asyncio
async def test_clean_meeting_type_write_preserves_existing_cosmos_shape():
    container = MagicMock()
    container.create_item = AsyncMock(side_effect=lambda *, body: body)
    repository = _repository_with_container(container)

    created = await repository.create_meeting_type(
        {
            "id": "meeting-1",
            "folder_id": "folder-1",
            "name": "Standard Meeting",
            "pre_session_talking_points": [],
            "in_session_talking_points": [],
            "visibility": "all",
        }
    )

    document = container.create_item.await_args.kwargs["body"]
    assert document["id"] == "meeting-1"
    assert document["type"] == "prompt_subcategory"
    assert document["category_id"] == "folder-1"
    assert document["prompt_visibility"] == "all"
    assert created["folder_id"] == "folder-1"
