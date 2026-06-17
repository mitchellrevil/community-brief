import pytest
from unittest.mock import AsyncMock, MagicMock

from backend_app.app.api.v1.routes import prompts as prompts_mod
from backend_app.app.core.errors.domain import ApplicationError, ResourceNotFoundError


@pytest.mark.asyncio
async def test_create_category_parent_not_found_raises():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_category.return_value = None

    perm = MagicMock()
    perm.can_manage_business_units = MagicMock(return_value=True)

    from backend_app.app.schemas.prompts import CategoryCreate

    cat = CategoryCreate(name="x", parent_category_id="missing")

    with pytest.raises(ApplicationError) as exc:
        await prompts_mod.create_category(
            category=cat,
            current_user={"id": "u1"},
            auth_context="editor",
            prompt_service=mock_prompt_service,
            perm_service=perm,
        )

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_create_category_db_error_raises_service_unavailable():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_category.return_value = {"id": "p"}
    from backend_app.app.core.config import DatabaseError
    mock_prompt_service.create_category.side_effect = DatabaseError("boom")

    perm = MagicMock()
    perm.set_prompt_service = MagicMock()
    perm.can_edit_category = AsyncMock(return_value=True)

    from backend_app.app.schemas.prompts import CategoryCreate
    cat = CategoryCreate(name="x", parent_category_id="p")

    with pytest.raises(ApplicationError) as exc:
        await prompts_mod.create_category(
            category=cat,
            current_user={"id": "u1"},
            auth_context="editor",
            prompt_service=mock_prompt_service,
            perm_service=perm,
        )

    assert exc.value.status_code == 503


@pytest.mark.asyncio
async def test_update_category_not_found_raises():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_category.return_value = None

    from backend_app.app.schemas.prompts import CategoryUpdate
    data = CategoryUpdate(name="x")

    with pytest.raises(ResourceNotFoundError):
        await prompts_mod.update_category(
            category_id="nope",
            category=data,
            current_user={"id": "u1"},
            auth_context="editor",
            prompt_service=mock_prompt_service,
            perm_service=MagicMock(),
            user_service=AsyncMock(),
        )


@pytest.mark.asyncio
async def test_update_category_permission_denied_raises():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_category.return_value = {"id": "c1", "business_unit_id": "bu1"}

    perm = MagicMock()
    perm.set_prompt_service = MagicMock()
    perm.can_edit_category = AsyncMock(return_value=False)

    from backend_app.app.schemas.prompts import CategoryUpdate
    data = CategoryUpdate(name="x")

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

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_update_category_update_returns_none_raises_not_found():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_category.return_value = {"id": "c1", "business_unit_id": "bu1"}
    mock_prompt_service.update_category.return_value = None

    perm = MagicMock()
    perm.set_prompt_service = MagicMock()
    perm.can_edit_category = AsyncMock(return_value=True)

    from backend_app.app.schemas.prompts import CategoryUpdate
    data = CategoryUpdate(name="x")

    with pytest.raises(ResourceNotFoundError):
        await prompts_mod.update_category(
            category_id="c1",
            category=data,
            current_user={"id": "u1"},
            auth_context="editor",
            prompt_service=mock_prompt_service,
            perm_service=perm,
            user_service=AsyncMock(),
        )


@pytest.mark.asyncio
async def test_delete_category_not_found_raises():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_category.return_value = None

    with pytest.raises(ResourceNotFoundError):
        await prompts_mod.delete_category(
            category_id="nope",
            current_user={"id": "u1"},
            auth_context="editor",
            prompt_service=mock_prompt_service,
            perm_service=MagicMock(),
            user_service=AsyncMock(),
        )


@pytest.mark.asyncio
async def test_delete_category_permission_denied_raises():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_category.return_value = {"id": "c1", "business_unit_id": "bu_other"}

    perm = MagicMock()
    perm.set_prompt_service = MagicMock()
    perm.can_edit_category = AsyncMock(return_value=False)

    with pytest.raises(ApplicationError) as exc:
        await prompts_mod.delete_category(
            category_id="c1",
            current_user={"id": "u1"},
            auth_context="editor",
            prompt_service=mock_prompt_service,
            perm_service=perm,
            user_service=AsyncMock(),
        )

    assert exc.value.status_code == 403
