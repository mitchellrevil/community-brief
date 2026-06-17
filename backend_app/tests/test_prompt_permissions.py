import pytest

from app.services.auth.permission_service import PermissionService
from app.services.prompts.prompt_service import PromptService
from app.repositories.prompts import PromptRepository
from app.utils.permission_cache import InMemoryPermissionCache
from tests.common.factories import user_factory


async def test_editor_denied_create_subcategory_without_bu(cosmos_fake):
    """
    Editor without any business_unit_ids should NOT be allowed to edit/create
    subcategories under a top-level category (business unit).
    """
    permission_cache = InMemoryPermissionCache()
    perm_service = PermissionService(permission_cache)
    prompt_service = PromptService(PromptRepository(cosmos_fake))

    # Create an editor user with no business unit assignments
    editor = user_factory(id="editor-no-bu", permission="Editor", business_unit_ids=[])
    await cosmos_fake.create_user(editor)

    # Create a top-level category (business unit)
    category = await prompt_service.create_category("Test BU - denied")

    perm_service.set_prompt_service(prompt_service)

    # PermissionService should deny editors who are not members of the BU
    can_edit = await perm_service.can_edit_category(editor, category)
    assert can_edit is False


async def test_editor_allowed_create_subcategory_in_own_bu(cosmos_fake):
    """
    Editor who has the target business unit id in `business_unit_ids` should be
    allowed to edit/create subcategories under that BU.
    """
    permission_cache = InMemoryPermissionCache()
    perm_service = PermissionService(permission_cache)
    prompt_service = PromptService(PromptRepository(cosmos_fake))

    # Create a top-level category (business unit)
    category = await prompt_service.create_category("Test BU - allowed")

    # Create an editor user assigned to that BU
    editor = user_factory(id="editor-with-bu", permission="Editor", business_unit_ids=[category["id"]])
    await cosmos_fake.create_user(editor)

    perm_service.set_prompt_service(prompt_service)

    # PermissionService should allow editors who are members of the BU
    can_edit = await perm_service.can_edit_category(editor, category)
    assert can_edit is True

    # Simulate creating a subcategory under that category (service-level)
    created = await prompt_service.create_subcategory(category["id"], "Subcat A", {}, [], [])
    assert created is not None
    assert created.get("type") == "prompt_subcategory"
    assert created.get("business_unit_id") == category["id"]
