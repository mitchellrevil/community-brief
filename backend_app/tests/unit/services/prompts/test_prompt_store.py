from unittest.mock import AsyncMock

import pytest

from app.services.prompts.prompt_store import PromptStore


@pytest.fixture(autouse=True)
def clear_prompt_snapshots():
    PromptStore._invalidate_folders()
    PromptStore._invalidate_templates()
    yield
    PromptStore._invalidate_folders()
    PromptStore._invalidate_templates()


@pytest.mark.asyncio
async def test_folder_snapshot_is_complete_stably_sorted_and_shared():
    repository = AsyncMock()
    repository.list_folders.return_value = [
        {"id": "folder-z", "name": "Beta"},
        {"id": "folder-b", "name": "alpha"},
        {"id": "folder-a", "name": "Alpha"},
    ]
    first_store = PromptStore(repository)
    second_store = PromptStore(repository)

    first = await first_store.list_folders(limit=2, offset=0)
    second = await second_store.list_folders(limit=2, offset=2)

    assert [item["id"] for item in first["items"]] == ["folder-a", "folder-b"]
    assert [item["id"] for item in second["items"]] == ["folder-z"]
    repository.list_folders.assert_awaited_once()


@pytest.mark.asyncio
async def test_folder_mutation_invalidates_only_the_folder_snapshot():
    repository = AsyncMock()
    repository.list_folders.side_effect = [
        [{"id": "folder-1", "name": "Original", "parent_id": None}],
        [{"id": "folder-1", "name": "Renamed", "parent_id": None}],
    ]
    repository.list_meeting_types.return_value = [
        {"id": "template-1", "name": "Template", "folder_id": "folder-1"}
    ]
    repository.save_folder.side_effect = lambda folder: folder
    store = PromptStore(repository)

    await store.list_folders()
    await store.list_templates()
    await store.update_folder("folder-1", name="Renamed")
    result = await store.list_folders()
    await store.list_templates()

    assert result["items"][0]["name"] == "Renamed"
    assert repository.list_folders.await_count == 2
    assert repository.list_meeting_types.await_count == 1


@pytest.mark.asyncio
async def test_folder_save_repairs_missing_business_unit_from_existing_parent():
    repository = AsyncMock()
    repository.list_folders.return_value = [
        {"id": "children-services", "name": "Children's Services", "parent_id": None},
        {"id": "cpc", "name": "CPC", "parent_id": "children-services"},
    ]
    repository.save_folder.side_effect = lambda folder: folder
    store = PromptStore(repository)

    updated = await store.update_folder("cpc", name="CPC meetings")

    assert updated["business_unit_id"] == "children-services"
    assert updated["is_business_unit"] is False


@pytest.mark.asyncio
async def test_template_mutation_invalidates_the_template_snapshot():
    repository = AsyncMock()
    repository.list_meeting_types.side_effect = [
        [{"id": "template-1", "name": "Original", "folder_id": "folder-1"}],
        [{"id": "template-1", "name": "Renamed", "folder_id": "folder-1"}],
    ]
    repository.save_meeting_type.side_effect = lambda meeting_type: meeting_type
    store = PromptStore(repository)

    await store.list_templates()
    await store.update_template("template-1", name="Renamed")
    result = await store.list_templates()

    assert result["items"][0]["name"] == "Renamed"
    assert repository.list_meeting_types.await_count == 2


@pytest.mark.asyncio
async def test_folder_delete_archives_tree_and_invalidates_both_snapshots():
    repository = AsyncMock()
    repository.list_folders.return_value = []
    repository.list_meeting_types.return_value = []
    store = PromptStore(repository)
    store._now_ms = lambda: 1234

    await store.list_folders()
    await store.list_templates()
    await store.delete_folder_and_templates(
        "folder-1", deleted_by_user_id="editor-1"
    )

    repository.archive_folder_tree.assert_awaited_once_with(
        "folder-1", deleted_at=1234, deleted_by_user_id="editor-1"
    )
    assert PromptStore._folders is None
    assert PromptStore._templates is None


@pytest.mark.asyncio
async def test_historical_reference_reads_include_archived_documents():
    repository = AsyncMock()
    repository.get_folder_reference.side_effect = [
        {"id": "folder-1", "name": "Historic folder"},
        None,
    ]
    repository.get_meeting_type_reference.return_value = {
        "id": "template-1",
        "folder_id": "folder-1",
        "name": "Historic template",
        "visibility": "all",
    }
    store = PromptStore(repository)

    folders = await store.get_folder_references_by_ids(
        ["folder-1", "folder-1", "missing"]
    )
    template = await store.get_template_reference("template-1")

    assert folders == {"folder-1": {"id": "folder-1", "name": "Historic folder"}}
    assert template and template["name"] == "Historic template"
    assert repository.get_folder_reference.await_count == 2
