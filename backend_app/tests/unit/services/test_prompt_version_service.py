import copy
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend_app.app.services.prompts.prompt_version_service import PromptVersionService
from backend_app.app.repositories.prompt_versions import PromptVersionRepository


class FakeContainer:
    def __init__(self):
        self.items = {}

    async def create_item(self, body):
        self.items[body["id"]] = copy.deepcopy(body)
        return copy.deepcopy(body)

    async def upsert_item(self, body):
        self.items[body["id"]] = copy.deepcopy(body)
        return copy.deepcopy(body)

    async def read_item(self, item, partition_key):
        if item not in self.items:
            raise RuntimeError("Not found")
        return copy.deepcopy(self.items[item])

    def query_items(self, query, parameters=None):
        subcategory_id = None
        if parameters:
            for parameter in parameters:
                if parameter.get("name") == "@subcategory_id":
                    subcategory_id = parameter.get("value")

        async def _iterator():
            for value in self.items.values():
                if value.get("type") != "prompt_subcategory_version":
                    continue
                if subcategory_id and value.get("subcategory_id") != subcategory_id:
                    continue
                yield copy.deepcopy(value)

        return _iterator()


@pytest.fixture
def setup_service():
    container = FakeContainer()
    cosmos_service = MagicMock()
    cosmos_service.get_container.return_value = container

    prompt_service = MagicMock()
    prompt_service.get_subcategory = AsyncMock(
        return_value={
            "id": "sub_1",
            "type": "prompt_subcategory",
            "category_id": "cat_1",
            "name": "Current prompt",
            "prompts": {"default": "Current prompt content"},
            "created_at": 1000,
            "updated_at": 2000,
            "updated_by_user_id": "u_live",
            "updated_by_display_name": "Live User",
        }
    )

    service = PromptVersionService(prompt_service, PromptVersionRepository(cosmos_service))
    return service, container, prompt_service


@pytest.mark.asyncio
async def test_create_and_list_versions(setup_service):
    service, _, _ = setup_service

    await service.create_version_snapshot(
        subcategory={
            "id": "sub_1",
            "type": "prompt_subcategory",
            "category_id": "cat_1",
            "name": "First",
            "prompts": {"default": "hello"},
        },
        created_by_user_id="u_1",
        created_by_display_name="User One",
        source_action="create",
    )

    result = await service.list_versions("sub_1", limit=10, offset=0)

    assert result["total"] == 1
    assert len(result["versions"]) == 1
    assert result["versions"][0]["created_by_display_name"] == "User One"
    assert result["versions"][0]["source_action"] == "create"


@pytest.mark.asyncio
async def test_diff_versions_returns_summary(setup_service):
    service, _, _ = setup_service

    created = await service.create_version_snapshot(
        subcategory={
            "id": "sub_1",
            "type": "prompt_subcategory",
            "category_id": "cat_1",
            "name": "Diffable",
            "prompts": {"default": "line one\nline two"},
        },
        created_by_user_id="u_1",
        created_by_display_name="User One",
        source_action="update",
    )

    diff = await service.diff_versions(
        subcategory_id="sub_1",
        left=created["id"],
        right="current",
    )

    assert "left_text" in diff
    assert "right_text" in diff
    assert diff["summary"]["added"] >= 0
    assert diff["summary"]["removed"] >= 0


@pytest.mark.asyncio
async def test_rollback_to_version_restores_snapshot(setup_service):
    service, container, prompt_service = setup_service

    old_snapshot = {
        "id": "sub_1",
        "type": "prompt_subcategory",
        "category_id": "cat_1",
        "name": "Old Name",
        "prompts": {"default": "old content"},
        "created_at": 1000,
        "updated_at": 1001,
    }
    created_version = await service.create_version_snapshot(
        subcategory=old_snapshot,
        created_by_user_id="u_1",
        created_by_display_name="User One",
        source_action="update",
    )

    rolled_back = await service.rollback_to_version(
        subcategory_id="sub_1",
        version_id=created_version["id"],
        actor_user_id="u_admin",
        actor_display_name="Admin",
        reason="Bad edit",
    )

    assert rolled_back["name"] == "Old Name"
    assert rolled_back["prompts"]["default"] == "old content"
    assert rolled_back["updated_by_user_id"] == "u_admin"

    listed = await service.list_versions("sub_1", limit=20, offset=0)
    assert listed["total"] >= 3

    prompt_service.get_subcategory.assert_called()
    assert "sub_1" in container.items
