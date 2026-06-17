from unittest.mock import AsyncMock, patch

import pytest

from app.core.errors.domain import ApplicationError, ResourceNotFoundError, ValidationError
from app.models.permissions import PermissionLevel
from app.schemas.users import (
    AddUserToBusinessUnitRequest,
    ChangePasswordRequest,
    RegisterUserRequest,
    SelfAssignToBusinessUnitRequest,
    UserUpdateRequest,
)
from app.services.users.user_workflow_service import UserWorkflowService


@pytest.fixture
def user_service():
    return AsyncMock()


@pytest.fixture
def workflow_service(user_service):
    return UserWorkflowService(user_service)


@pytest.mark.asyncio
async def test_list_users_shapes_pagination(workflow_service, user_service):
    user_service.list_users.return_value = {
        "items": [{"id": "u1"}, {"id": "u2"}],
        "total": 3,
    }

    result = await workflow_service.list_users(limit=2, offset=0)

    assert result["users"] == [{"id": "u1"}, {"id": "u2"}]
    assert result["has_more"] is True


@pytest.mark.asyncio
async def test_get_user_by_email_raises_when_missing(workflow_service, user_service):
    user_service.get_user_by_email.return_value = None

    with pytest.raises(ResourceNotFoundError):
        await workflow_service.get_user_by_email("missing@example.com")


@pytest.mark.asyncio
async def test_search_users_adds_success_status(workflow_service, user_service):
    user_service.search_users.return_value = {"users": [{"id": "u1"}], "total": 1}

    result = await workflow_service.search_users(query="u", limit=20, offset=0)

    assert result == {"status": "success", "users": [{"id": "u1"}], "total": 1}


@pytest.mark.asyncio
async def test_register_user_hashes_password_and_adds_audit_fields(workflow_service, user_service):
    user_service.create_user.return_value = {"id": "u1", "email": "new@example.com"}
    request = RegisterUserRequest(
        email="New@Example.com",
        password="password123",
        permission=PermissionLevel.EDITOR,
    )

    with patch("app.services.users.user_workflow_service.get_password_hash", return_value="hashed"):
        result = await workflow_service.register_user(
            register_request=request,
            current_user={"id": "mod-1"},
        )

    assert result["message"] == "User new@example.com created successfully"
    user_service.create_user.assert_awaited_once_with(
        email="new@example.com",
        password_hash="hashed",
        permission=PermissionLevel.EDITOR.value,
        extra_fields={
            "source": "password",
            "created_by": "mod-1",
            "is_active": True,
            "last_login": None,
        },
    )


@pytest.mark.asyncio
async def test_update_user_dumps_only_supplied_fields(workflow_service, user_service):
    user_service.update_user.return_value = {"id": "u1", "is_active": False}

    result = await workflow_service.update_user(
        user_id="u1",
        update_request=UserUpdateRequest(is_active=False),
    )

    assert result["user"]["is_active"] is False
    user_service.update_user.assert_awaited_once_with("u1", {"is_active": False})


@pytest.mark.asyncio
async def test_change_user_password_maps_missing_user(workflow_service, user_service):
    user_service.update_user_password.side_effect = ValueError("missing")

    with patch("app.services.users.user_workflow_service.get_password_hash", return_value="hashed"):
        with pytest.raises(ResourceNotFoundError):
            await workflow_service.change_user_password(
                user_id="missing",
                password_data=ChangePasswordRequest(new_password="password123"),
                current_user={"id": "admin-1"},
            )


@pytest.mark.asyncio
async def test_delete_user_rejects_self_delete(workflow_service):
    with pytest.raises(ApplicationError):
        await workflow_service.delete_user(user_id="admin-1", current_user={"id": "admin-1"})


@pytest.mark.asyncio
async def test_delete_user_requires_existing_user(workflow_service, user_service):
    user_service.get_user.return_value = None

    with pytest.raises(ResourceNotFoundError):
        await workflow_service.delete_user(user_id="missing", current_user={"id": "admin-1"})


@pytest.mark.asyncio
async def test_self_assign_to_business_units_delegates(workflow_service, user_service):
    user_service.self_assign_business_units.return_value = {"status": "success"}
    current_user = {"id": "user-1"}

    result = await workflow_service.self_assign_to_business_units(
        payload=SelfAssignToBusinessUnitRequest(business_unit_ids=["bu-1"]),
        current_user=current_user,
    )

    assert result["status"] == "success"
    user_service.self_assign_business_units.assert_awaited_once_with(
        user=current_user,
        business_unit_ids=["bu-1"],
    )


@pytest.mark.asyncio
async def test_add_user_to_business_unit_requires_ids(workflow_service):
    with pytest.raises(ValidationError):
        await workflow_service.add_user_to_business_unit(
            payload=AddUserToBusinessUnitRequest(
                user_email="target@example.com",
                business_unit_ids=None,
            ),
            current_user={"id": "admin-1"},
        )


@pytest.mark.asyncio
async def test_add_user_to_business_unit_shapes_response(workflow_service, user_service):
    user_service.add_user_to_business_units.return_value = {
        "user": {"id": "target-1", "email": "target@example.com"},
        "business_unit_ids": ["bu-1"],
        "business_unit_names": ["Marketing"],
    }

    result = await workflow_service.add_user_to_business_unit(
        payload=AddUserToBusinessUnitRequest(
            user_email="target@example.com",
            business_unit_ids=["bu-1"],
        ),
        current_user={"id": "admin-1"},
    )

    assert result["user_id"] == "target-1"
    assert result["business_unit_names"] == ["Marketing"]
    user_service.add_user_to_business_units.assert_awaited_once_with(
        current_user={"id": "admin-1"},
        user_email="target@example.com",
        business_unit_ids=["bu-1"],
    )
