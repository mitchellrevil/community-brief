from unittest.mock import AsyncMock

import pytest

from app.api.v1.routes.permissions import (
    get_my_permissions,
    get_users_by_permission,
    update_user_permission,
)
from app.core.errors.domain import ApplicationError
from app.models.permissions import PermissionLevel
from app.schemas.permissions import UserPermissionUpdateRequest


@pytest.mark.asyncio
async def test_get_my_permissions_shapes_current_user_response():
    current_user = {
        "id": "u1",
        "email": "user@example.com",
        "permission": "Editor",
        "business_unit_ids": ["bu-1"],
        "business_unit_names": ["Marketing"],
    }

    result = await get_my_permissions(current_user=current_user)

    assert result == {
        "status": 200,
        "data": {
            "user_id": "u1",
            "email": "user@example.com",
            "permission": "Editor",
            "business_unit_ids": ["bu-1"],
            "business_unit_names": ["Marketing"],
        },
    }


@pytest.mark.asyncio
async def test_get_users_by_permission_calls_user_service():
    user_service = AsyncMock()
    user_service.get_users_by_permission.return_value = [{"id": "u1"}]

    result = await get_users_by_permission(
        permission_level=PermissionLevel.EDITOR,
        _current_user={"id": "editor-1"},
        user_service=user_service,
    )

    assert result == {
        "status": 200,
        "users": [{"id": "u1"}],
        "count": 1,
        "permission_level": "Editor",
    }
    user_service.get_users_by_permission.assert_awaited_once_with("Editor")


@pytest.mark.asyncio
async def test_update_user_permission_rejects_self_change():
    with pytest.raises(ApplicationError):
        await update_user_permission(
            user_id="admin-1",
            permission_data=UserPermissionUpdateRequest(permission=PermissionLevel.EDITOR),
            current_user={"id": "admin-1"},
            user_service=AsyncMock(),
        )


@pytest.mark.asyncio
async def test_update_user_permission_updates_user():
    user_service = AsyncMock()
    user_service.update_user.return_value = {"id": "u1", "permission": "Admin"}
    permission_data = UserPermissionUpdateRequest(permission=PermissionLevel.ADMIN)

    result = await update_user_permission(
        user_id="u1",
        permission_data=permission_data,
        current_user={"id": "admin-1"},
        user_service=user_service,
    )

    assert result["message"] == "User permission updated to Admin"
    assert result["user"] == {"id": "u1", "permission": "Admin"}
    update_payload = user_service.update_user.await_args.args[1]
    assert update_payload["permission"] == "Admin"
    assert "updated_at" in update_payload
