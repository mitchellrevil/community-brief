import pytest
from unittest.mock import AsyncMock, MagicMock

from backend_app.app.api.v1.routes import prompts as prompts_mod
from backend_app.app.core.errors.domain import ApplicationError, ResourceNotFoundError
from backend_app.app.core.config import DatabaseError
from backend_app.app.schemas.prompts import SubcategoryUpdate


@pytest.mark.asyncio
async def test_create_category_parent_checks_permissions_and_success():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_category.return_value = {"id": "p1", "business_unit_id": "bu1"}
    mock_prompt_service.create_category.return_value = {"id": "new", "name": "n"}

    perm = MagicMock()
    perm.set_prompt_service = MagicMock()
    perm.can_edit_category = AsyncMock(return_value=True)

    from backend_app.app.schemas.prompts import CategoryCreate
    cat = CategoryCreate(name="x", parent_category_id="p1")

    res = await prompts_mod.create_category(
        category=cat,
        current_user={"id": "u1"},
        auth_context="editor",
        prompt_service=mock_prompt_service,
        perm_service=perm,
    )

    assert res["id"] == "new"


@pytest.mark.asyncio
async def test_create_category_top_level_non_admin_raises():
    mock_prompt_service = AsyncMock()
    perm = MagicMock()
    perm.can_manage_business_units = MagicMock(return_value=False)

    from backend_app.app.schemas.prompts import CategoryCreate
    cat = CategoryCreate(name="top", parent_category_id=None)

    with pytest.raises(ApplicationError) as exc:
        await prompts_mod.create_category(
            category=cat,
            current_user={"id": "u1"},
            auth_context="editor",
            prompt_service=mock_prompt_service,
            perm_service=perm,
        )

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_list_categories_unexpected_error_bubbles_to_global_handler():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.list_categories.side_effect = RuntimeError("boom")

    with pytest.raises(RuntimeError):
        await prompts_mod.list_categories(
            limit=10,
            offset=0,
            current_user={},
            auth_context="user",
            prompt_service=mock_prompt_service,
        )


@pytest.mark.asyncio
async def test_update_category_success_and_handler_on_db_error():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_category.return_value = {"id": "c1", "business_unit_id": "bu1"}
    mock_prompt_service.update_category.return_value = {"id": "c1", "name": "newname"}

    perm = MagicMock()
    perm.set_prompt_service = MagicMock()
    perm.can_edit_category = AsyncMock(return_value=True)

    from backend_app.app.schemas.prompts import CategoryUpdate
    data = CategoryUpdate(name="newname")

    res = await prompts_mod.update_category(
        category_id="c1",
        category=data,
        current_user={"id": "u1"},
        auth_context="editor",
        prompt_service=mock_prompt_service,
        perm_service=perm,
        user_service=AsyncMock(),
    )

    assert res["name"] == "newname"

    # now test db error routes to domain error for the global handler
    mock_prompt_service.update_category.side_effect = DatabaseError("boom")

    with pytest.raises(ApplicationError) as exc:
        await prompts_mod.update_category(
            category_id="c1",
            category=data,
            current_user={"id": "u1"},
            auth_context="editor",
            prompt_service=mock_prompt_service,
            perm_service=perm,
            user_service=AsyncMock(),
        )
    assert exc.value.status_code == 503


@pytest.mark.asyncio
async def test_delete_category_success_and_db_error_handler():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_category.return_value = {"id": "c1", "business_unit_id": "bu1"}
    mock_prompt_service.delete_category_and_subcategories = AsyncMock()

    perm = MagicMock()
    perm.set_prompt_service = MagicMock()
    perm.can_edit_category = AsyncMock(return_value=True)

    res = await prompts_mod.delete_category(
        category_id="c1",
        current_user={"id": "u1"},
        auth_context="editor",
        prompt_service=mock_prompt_service,
        perm_service=perm,
        user_service=AsyncMock(),
    )

    assert res["status"] == 200

    # db error path
    mock_prompt_service.delete_category_and_subcategories.side_effect = DatabaseError("boom")

    with pytest.raises(ApplicationError) as exc:
        await prompts_mod.delete_category(
            category_id="c1",
            current_user={"id": "u1"},
            auth_context="editor",
            prompt_service=mock_prompt_service,
            perm_service=perm,
            user_service=AsyncMock(),
        )
    assert exc.value.status_code == 503


@pytest.mark.asyncio
async def test_update_subcategory_success_and_not_found():
    mock_prompt_service = AsyncMock()
    existing = {"id": "sub1", "business_unit_id": "bu1"}
    mock_prompt_service.get_subcategory.return_value = existing
    mock_prompt_service.update_subcategory.return_value = {"id": "sub1", "name": "updated"}

    perm = MagicMock()
    perm.set_prompt_service = MagicMock()
    perm.can_edit_prompt = AsyncMock(return_value=True)

    talking = MagicMock()
    talking.validate_talking_points_structure.return_value = []
    talking.ensure_talking_points_structure.return_value = {"id": "sub1", "name": "updated"}
    prompt_versions = MagicMock()
    prompt_versions.create_version_snapshot = AsyncMock()

    subcategory_update = SubcategoryUpdate(
        name="updated",
        prompts={"s": "x"},
        preSessionTalkingPoints=[],
        inSessionTalkingPoints=[],
    )

    res = await prompts_mod.update_subcategory(
        subcategory_id="sub1",
        subcategory=subcategory_update,
        current_user={"id": "u1"},
        auth_context="editor",
        prompt_service=mock_prompt_service,
        perm_service=perm,
        talking_points_service=talking,
        prompt_version_service=prompt_versions,
    )

    assert res["id"] == "sub1"

    # not found
    mock_prompt_service.get_subcategory.return_value = None
    with pytest.raises(ResourceNotFoundError):
        await prompts_mod.update_subcategory(
            subcategory_id="does_not_exist",
            subcategory=subcategory_update,
            current_user={"id": "u1"},
            auth_context="editor",
            prompt_service=mock_prompt_service,
            perm_service=perm,
            talking_points_service=talking,
            prompt_version_service=prompt_versions,
        )


@pytest.mark.asyncio
async def test_move_subcategory_target_missing_and_success():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_subcategory.return_value = {"id": "sub1", "business_unit_id": "bu1"}
    mock_prompt_service.get_category.return_value = None

    perm = MagicMock()
    perm.set_prompt_service = MagicMock()
    perm.can_edit_prompt = AsyncMock(return_value=True)
    perm.can_edit_category = AsyncMock(return_value=True)
    prompt_versions = MagicMock()
    prompt_versions.create_version_snapshot = AsyncMock()

    with pytest.raises(ResourceNotFoundError):
        await prompts_mod.move_subcategory(
            subcategory_id="sub1",
            new_category_id="missing",
            current_user={"id": "u1"},
            auth_context="editor",
            prompt_service=mock_prompt_service,
            perm_service=perm,
            talking_points_service=MagicMock(),
            prompt_version_service=prompt_versions,
        )

    # success path
    mock_prompt_service.get_category.return_value = {"id": "catnew", "business_unit_id": "bu1"}
    mock_prompt_service.move_subcategory.return_value = {"id": "sub1", "category_id": "catnew"}

    talking2 = MagicMock()
    talking2.ensure_talking_points_structure.return_value = {"id": "sub1", "category_id": "catnew"}

    res = await prompts_mod.move_subcategory(
        subcategory_id="sub1",
        new_category_id="catnew",
        current_user={"id": "u1"},
        auth_context="editor",
        prompt_service=mock_prompt_service,
        perm_service=perm,
        talking_points_service=talking2,
        prompt_version_service=prompt_versions,
    )

    assert res["category_id"] == "catnew"


@pytest.mark.asyncio
async def test_delete_subcategory_success():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_subcategory.return_value = {"id": "sub1", "business_unit_id": "bu1"}
    mock_prompt_service.delete_subcategory = AsyncMock()

    perm = MagicMock()
    perm.set_prompt_service = MagicMock()
    perm.can_edit_prompt = AsyncMock(return_value=True)
    prompt_versions = MagicMock()
    prompt_versions.create_version_snapshot = AsyncMock()

    res = await prompts_mod.delete_subcategory(
        subcategory_id="sub1",
        current_user={"id": "u1"},
        auth_context="editor",
        prompt_service=mock_prompt_service,
        perm_service=perm,
        talking_points_service=MagicMock(),
        prompt_version_service=prompt_versions,
    )

    assert res["status"] == 200


@pytest.mark.asyncio
async def test_retrieve_prompts_db_error_raises_service_unavailable():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.retrieve_prompts_hierarchy.side_effect = DatabaseError("DB down")

    with pytest.raises(ApplicationError) as exc:
        await prompts_mod.retrieve_prompts(
            current_user={},
            auth_context="user",
            prompt_service=mock_prompt_service,
        )
    assert exc.value.status_code == 503


@pytest.mark.asyncio
async def test_create_category_admin_top_level_success():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.create_category.return_value = {"id": "top1", "name": "top"}

    perm = MagicMock()
    perm.can_manage_business_units = MagicMock(return_value=True)

    from backend_app.app.schemas.prompts import CategoryCreate
    cat = CategoryCreate(name="top", parent_category_id=None)

    res = await prompts_mod.create_category(
        category=cat,
        current_user={"id": "admin"},
        auth_context="admin",
        prompt_service=mock_prompt_service,
        perm_service=perm,
    )

    assert res["id"] == "top1"


@pytest.mark.asyncio
async def test_create_category_parent_edit_forbidden():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_category.return_value = {"id": "p1", "business_unit_id": "bu_other"}
    perm = MagicMock()
    perm.set_prompt_service = MagicMock()
    perm.can_edit_category = AsyncMock(return_value=False)

    from backend_app.app.schemas.prompts import CategoryCreate
    cat = CategoryCreate(name="x", parent_category_id="p1")

    with pytest.raises(ApplicationError) as exc:
        await prompts_mod.create_category(
            category=cat,
            current_user={"id": "u1"},
            auth_context="editor",
            prompt_service=mock_prompt_service,
            perm_service=perm,
        )

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_list_subcategories_has_more_and_unexpected_errors_bubble():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.list_subcategories.return_value = {"items": [{"id": "s1", "prompt_visibility": "all", "visible_to_user_ids": None}], "total": 10}

    talking = MagicMock()
    talking.ensure_talking_points_structure.return_value = {"id": "s1", "prompt_visibility": "all", "visible_to_user_ids": None}

    res = await prompts_mod.list_subcategories(category_id=None, limit=1, offset=0, include_hidden=True, current_user={"id": "u1", "permission": "editor"}, auth_context="editor", prompt_service=mock_prompt_service, talking_points_service=talking)
    # With include_hidden=True and editor permission, has_more is always False (post-filter mode)
    assert res["has_more"] is False
    assert len(res["subcategories"]) == 1

    # unexpected errors are handled by the global exception handler
    mock_prompt_service.list_subcategories.side_effect = RuntimeError("boom")

    with pytest.raises(RuntimeError):
        await prompts_mod.list_subcategories(category_id=None, limit=1, offset=0, include_hidden=True, current_user={"id": "u1", "permission": "user"}, auth_context="user", prompt_service=mock_prompt_service, talking_points_service=talking)


@pytest.mark.asyncio
async def test_get_subcategory_unexpected_error_bubbles():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_subcategory.side_effect = RuntimeError("boom")

    with pytest.raises(RuntimeError):
        await prompts_mod.get_subcategory(subcategory_id="x", current_user={}, auth_context="user", prompt_service=mock_prompt_service, talking_points_service=MagicMock())


@pytest.mark.asyncio
async def test_update_subcategory_permission_and_validation_and_not_found():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_subcategory.return_value = {"id": "subx", "business_unit_id": "bu1"}
    perm = MagicMock(); perm.set_prompt_service = MagicMock(); perm.can_edit_prompt = AsyncMock(return_value=False)

    subcategory_update = SubcategoryUpdate(
        name="x",
        prompts={},
        preSessionTalkingPoints=[],
        inSessionTalkingPoints=[],
    )

    with pytest.raises(ApplicationError):
        await prompts_mod.update_subcategory(subcategory_id="subx", subcategory=subcategory_update, current_user={}, auth_context="editor", prompt_service=mock_prompt_service, perm_service=perm, talking_points_service=MagicMock(), prompt_version_service=MagicMock())

    # validation error path
    perm.can_edit_prompt = AsyncMock(return_value=True)
    mock_prompt_service.update_subcategory.return_value = {"id": "subx"}
    talking = MagicMock()
    talking.validate_talking_points_structure.side_effect = ValueError("bad")

    with pytest.raises(Exception):
        await prompts_mod.update_subcategory(subcategory_id="subx", subcategory=subcategory_update, current_user={}, auth_context="editor", prompt_service=mock_prompt_service, perm_service=perm, talking_points_service=talking, prompt_version_service=MagicMock())

    # update returns None -> not found
    talking.validate_talking_points_structure.side_effect = None
    talking.validate_talking_points_structure.return_value = []
    mock_prompt_service.update_subcategory.return_value = None
    with pytest.raises(ResourceNotFoundError):
        await prompts_mod.update_subcategory(subcategory_id="subx", subcategory=subcategory_update, current_user={}, auth_context="editor", prompt_service=mock_prompt_service, perm_service=perm, talking_points_service=talking, prompt_version_service=MagicMock())


@pytest.mark.asyncio
async def test_move_subcategory_permission_checks():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_subcategory.return_value = {"id": "subx", "business_unit_id": "bu1"}
    mock_prompt_service.get_category.return_value = {"id": "cat1", "business_unit_id": "bu_other"}

    perm = MagicMock(); perm.set_prompt_service = MagicMock(); perm.can_edit_prompt = AsyncMock(return_value=False); perm.can_edit_category = AsyncMock(return_value=True)

    with pytest.raises(ApplicationError):
        await prompts_mod.move_subcategory(subcategory_id="subx", new_category_id="cat1", current_user={}, auth_context="editor", prompt_service=mock_prompt_service, perm_service=perm, talking_points_service=MagicMock(), prompt_version_service=MagicMock())

    # can_edit_prompt true, can_edit_category false
    perm.can_edit_prompt = AsyncMock(return_value=True); perm.can_edit_category = AsyncMock(return_value=False)
    with pytest.raises(ApplicationError):
        await prompts_mod.move_subcategory(subcategory_id="subx", new_category_id="cat1", current_user={}, auth_context="editor", prompt_service=mock_prompt_service, perm_service=perm, talking_points_service=MagicMock(), prompt_version_service=MagicMock())


@pytest.mark.asyncio
async def test_delete_subcategory_not_found_raises():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_subcategory.return_value = None

    with pytest.raises(ResourceNotFoundError):
        await prompts_mod.delete_subcategory(subcategory_id="missing", current_user={}, auth_context="editor", prompt_service=mock_prompt_service, perm_service=MagicMock(), talking_points_service=MagicMock(), prompt_version_service=MagicMock())


@pytest.mark.asyncio
async def test_retrieve_prompts_success():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.retrieve_prompts_hierarchy.return_value = [{"category_name": "c", "category_id": "cid", "subcategories": []}]

    res = await prompts_mod.retrieve_prompts(current_user={}, auth_context="user", prompt_service=mock_prompt_service)
    assert res["status"] == 200


@pytest.mark.asyncio
async def test_retrieve_prompts_filters_editor_and_nobody_for_standard_user():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.retrieve_prompts_hierarchy.return_value = [
        {
            "category_name": "c",
            "category_id": "cid",
            "subcategories": [
                {"subcategory_id": "all", "subcategory_name": "All", "prompts": {}, "prompt_visibility": "all"},
                {"subcategory_id": "editors", "subcategory_name": "Editors", "prompts": {}, "prompt_visibility": "only_editors"},
                {"subcategory_id": "nobody", "subcategory_name": "Nobody", "prompts": {}, "prompt_visibility": "nobody"},
            ],
        }
    ]

    res = await prompts_mod.retrieve_prompts(
        current_user={"permission": "User"},
        auth_context="user",
        prompt_service=mock_prompt_service,
    )

    subcategory_ids = [s["subcategory_id"] for s in res["data"][0]["subcategories"]]
    assert subcategory_ids == ["all"]


@pytest.mark.asyncio
async def test_retrieve_prompts_allows_only_editors_for_editor_user():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.retrieve_prompts_hierarchy.return_value = [
        {
            "category_name": "c",
            "category_id": "cid",
            "subcategories": [
                {"subcategory_id": "all", "subcategory_name": "All", "prompts": {}, "prompt_visibility": "all"},
                {"subcategory_id": "editors", "subcategory_name": "Editors", "prompts": {}, "prompt_visibility": "only_editors"},
                {"subcategory_id": "nobody", "subcategory_name": "Nobody", "prompts": {}, "prompt_visibility": "nobody"},
            ],
        }
    ]

    res = await prompts_mod.retrieve_prompts(
        current_user={"permission": "Editor"},
        auth_context="user",
        prompt_service=mock_prompt_service,
    )

    subcategory_ids = [s["subcategory_id"] for s in res["data"][0]["subcategories"]]
    assert subcategory_ids == ["all", "editors"]
