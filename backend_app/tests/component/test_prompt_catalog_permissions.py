import pytest

from app.repositories.prompts import PromptRepository
from app.services.auth.permission_service import PermissionService
from app.services.prompts.prompt_store import PromptStore
from app.utils.permission_cache import InMemoryPermissionCache
from tests.common.factories import user_factory


pytestmark = pytest.mark.component


@pytest.mark.asyncio
async def test_editor_folder_access_is_scoped_to_assigned_business_unit(cosmos_fake):
    store = PromptStore(PromptRepository(cosmos_fake))
    folder = await store.create_folder("Test business unit")
    permissions = PermissionService(InMemoryPermissionCache()).set_prompt_store(store)

    denied = user_factory(id="editor-no-bu", permission="editor", business_unit_ids=[])
    allowed = user_factory(
        id="editor-with-bu",
        permission="editor",
        business_unit_ids=[folder["id"]],
    )

    assert await permissions.can_edit_folder(denied, folder) is False
    assert await permissions.can_edit_folder(allowed, folder) is True
