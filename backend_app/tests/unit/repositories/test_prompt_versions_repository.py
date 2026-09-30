from unittest.mock import AsyncMock, MagicMock

import pytest
from azure.cosmos.exceptions import CosmosResourceNotFoundError

from app.repositories.prompt_versions import PromptVersionRepository


def _async_items(items):
    async def iterator():
        for item in items:
            yield item

    return iterator()


@pytest.fixture
def prompts_container():
    container = MagicMock()
    container.create_item = AsyncMock()
    container.read_item = AsyncMock()
    container.upsert_item = AsyncMock()
    return container


@pytest.fixture
def repository(prompts_container):
    cosmos = MagicMock()
    cosmos.get_container.return_value = prompts_container
    return PromptVersionRepository(cosmos)


@pytest.mark.asyncio
async def test_list_versions_by_template_queries_existing_version_documents(repository, prompts_container):
    versions = [{"id": "version-1"}, {"id": "version-2"}]
    prompts_container.query_items.return_value = _async_items(versions)

    result = await repository.list_versions_by_meeting_type("sub-1")

    assert result == versions
    prompts_container.query_items.assert_called_once_with(
        query=(
            "SELECT c.id, c.created_at, c.created_by_user_id, "
            "c.created_by_display_name, c.source_action, c.change_reason "
            "FROM c WHERE c.type = 'prompt_subcategory_version' "
            "AND c.subcategory_id = @subcategory_id"
        ),
        parameters=[{"name": "@subcategory_id", "value": "sub-1"}],
    )


@pytest.mark.asyncio
async def test_get_version_returns_none_when_missing(repository, prompts_container):
    prompts_container.read_item.side_effect = CosmosResourceNotFoundError(message="missing")

    assert await repository.get_version("version-1") is None


@pytest.mark.asyncio
async def test_get_version_propagates_unexpected_read_errors(repository, prompts_container):
    prompts_container.read_item.side_effect = RuntimeError("storage failed")

    with pytest.raises(RuntimeError, match="storage failed"):
        await repository.get_version("version-1")


@pytest.mark.asyncio
async def test_version_write_preserves_existing_cosmos_shape(repository, prompts_container):
    prompts_container.create_item.side_effect = lambda *, body: body

    created = await repository.create_version(
        {
            "id": "version-1",
            "type": "prompt_subcategory_version",
            "template_id": "template-1",
            "snapshot": {
                "id": "template-1",
                "folder_id": "folder-1",
                "pre_session_talking_points": [],
                "in_session_talking_points": [],
                "visibility": "all",
            },
        }
    )

    document = prompts_container.create_item.await_args.kwargs["body"]
    assert document["type"] == "prompt_subcategory_version"
    assert document["subcategory_id"] == "template-1"
    assert document["snapshot"]["type"] == "prompt_subcategory"
    assert document["snapshot"]["category_id"] == "folder-1"
    assert created["template_id"] == "template-1"
    assert created["snapshot"]["folder_id"] == "folder-1"
