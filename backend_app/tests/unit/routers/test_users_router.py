from unittest.mock import AsyncMock

import pytest

from app.api.v1.routes.users import (
    add_user_to_business_unit,
    change_user_password,
    delete_user,
    get_all_users,
    get_user_by_email,
    get_user_by_id,
    register_user,
    search_users,
    search_support_contacts,
    self_assign_to_business_units,
    update_user,
    update_my_favourite_prompt,
)
from app.api.v1.routes.users import router
from app.core.auth import get_current_user
from app.schemas.users import (
    AddUserToBusinessUnitRequest,
    ChangePasswordRequest,
    FavouritePromptUpdateRequest,
    RegisterUserRequest,
    SelfAssignToBusinessUnitRequest,
    UserUpdateRequest,
)


@pytest.mark.asyncio
async def test_get_all_users_delegates_to_workflow():
    workflow_service = AsyncMock()
    workflow_service.list_users.return_value = {"status": 200, "users": []}

    result = await get_all_users(
        limit=10,
        offset=0,
        current_user={"id": "editor-1"},
        workflow_service=workflow_service,
    )

    assert result["users"] == []
    workflow_service.list_users.assert_awaited_once_with(limit=10, offset=0)


@pytest.mark.asyncio
async def test_get_user_by_email_delegates_to_workflow():
    workflow_service = AsyncMock()
    workflow_service.get_user_by_email.return_value = {"status": 200, "user": {"id": "u1"}}

    result = await get_user_by_email(
        email="user@example.com",
        current_user={"id": "editor-1"},
        workflow_service=workflow_service,
    )

    assert result["user"]["id"] == "u1"
    workflow_service.get_user_by_email.assert_awaited_once_with("user@example.com")


@pytest.mark.asyncio
async def test_search_users_delegates_to_workflow():
    workflow_service = AsyncMock()
    workflow_service.search_users.return_value = {"status": "success", "users": []}

    result = await search_users(
        query="sam",
        limit=5,
        offset=1,
        current_user={"id": "user-1"},
        workflow_service=workflow_service,
    )

    assert result["status"] == "success"
    workflow_service.search_users.assert_awaited_once_with(query="sam", limit=5, offset=1)


@pytest.mark.asyncio
async def test_search_support_contacts_delegates_to_authenticated_workflow():
    workflow_service = AsyncMock()
    workflow_service.search_support_contacts.return_value = {
        "status": 200,
        "contacts": [{"display_name": "Support Editor", "email": "editor@example.com", "business_unit_names": []}],
    }

    result = await search_support_contacts(
        query="support",
        limit=5,
        offset=1,
        current_user={"id": "user-1"},
        workflow_service=workflow_service,
    )

    assert result["contacts"][0]["email"] == "editor@example.com"
    workflow_service.search_support_contacts.assert_awaited_once_with(
        query="support",
        limit=5,
        offset=1,
    )


def test_support_contacts_route_requires_an_authenticated_user():
    route = next(route for route in router.routes if route.path == "/auth/support-contacts")

    assert get_current_user in {dependency.call for dependency in route.dependant.dependencies}


@pytest.mark.asyncio
async def test_get_user_by_id_delegates_to_workflow():
    workflow_service = AsyncMock()
    workflow_service.get_user_by_id.return_value = {"status": 200, "user": {"id": "u1"}}

    result = await get_user_by_id(
        user_id="u1",
        current_user={"id": "editor-1"},
        workflow_service=workflow_service,
    )

    assert result["user"]["id"] == "u1"
    workflow_service.get_user_by_id.assert_awaited_once_with("u1")


@pytest.mark.asyncio
async def test_register_user_delegates_to_workflow():
    workflow_service = AsyncMock()
    workflow_service.register_user.return_value = {"status": 200, "user": {"id": "u1"}}
    current_user = {"id": "mod-1"}
    request = RegisterUserRequest(email="new@example.com", password="password123")

    result = await register_user(
        register_request=request,
        current_user=current_user,
        workflow_service=workflow_service,
    )

    assert result["user"]["id"] == "u1"
    workflow_service.register_user.assert_awaited_once_with(
        register_request=request,
        current_user=current_user,
    )


@pytest.mark.asyncio
async def test_update_user_delegates_to_workflow():
    workflow_service = AsyncMock()
    workflow_service.update_user.return_value = {"status": 200, "user": {"id": "u1"}}
    request = UserUpdateRequest(is_active=False)

    result = await update_user(
        user_id="u1",
        update_request=request,
        current_user={"id": "admin-1"},
        workflow_service=workflow_service,
    )

    assert result["user"]["id"] == "u1"
    workflow_service.update_user.assert_awaited_once_with(user_id="u1", update_request=request)


@pytest.mark.asyncio
async def test_change_user_password_delegates_to_workflow():
    workflow_service = AsyncMock()
    workflow_service.change_user_password.return_value = {"status": "success"}
    current_user = {"id": "admin-1"}
    password_data = ChangePasswordRequest(new_password="new-password")

    result = await change_user_password(
        user_id="u1",
        password_data=password_data,
        current_user=current_user,
        workflow_service=workflow_service,
    )

    assert result["status"] == "success"
    workflow_service.change_user_password.assert_awaited_once_with(
        user_id="u1",
        password_data=password_data,
        current_user=current_user,
    )


@pytest.mark.asyncio
async def test_delete_user_delegates_to_workflow():
    workflow_service = AsyncMock()
    workflow_service.delete_user.return_value = {"status": "success"}
    current_user = {"id": "admin-1"}

    result = await delete_user(
        user_id="u1",
        current_user=current_user,
        workflow_service=workflow_service,
    )

    assert result["status"] == "success"
    workflow_service.delete_user.assert_awaited_once_with(user_id="u1", current_user=current_user)


@pytest.mark.asyncio
async def test_self_assign_to_business_units_delegates_to_workflow():
    workflow_service = AsyncMock()
    workflow_service.self_assign_to_business_units.return_value = {"status": "success"}
    current_user = {"id": "user-1"}
    payload = SelfAssignToBusinessUnitRequest(business_unit_ids=["bu-1"])

    result = await self_assign_to_business_units(
        payload=payload,
        current_user=current_user,
        workflow_service=workflow_service,
    )

    assert result["status"] == "success"
    workflow_service.self_assign_to_business_units.assert_awaited_once_with(
        payload=payload,
        current_user=current_user,
    )


@pytest.mark.asyncio
async def test_update_my_favourite_prompt_delegates_to_workflow():
    workflow_service = AsyncMock()
    workflow_service.update_favourite_prompt.return_value = {
        "status": 200,
        "data": {"favourite_prompt_ids": ["prompt-1"]},
    }
    current_user = {"id": "user-1"}

    result = await update_my_favourite_prompt(
        payload=FavouritePromptUpdateRequest(favourite=True),
        prompt_id="prompt-1",
        current_user=current_user,
        workflow_service=workflow_service,
    )

    assert result["data"]["favourite_prompt_ids"] == ["prompt-1"]
    workflow_service.update_favourite_prompt.assert_awaited_once_with(
        current_user=current_user,
        prompt_id="prompt-1",
        favourite=True,
    )


@pytest.mark.asyncio
async def test_add_user_to_business_unit_delegates_to_workflow():
    workflow_service = AsyncMock()
    workflow_service.add_user_to_business_unit.return_value = {"status": "success"}
    current_user = {"id": "admin-1"}
    payload = AddUserToBusinessUnitRequest(user_email="target@example.com", business_unit_ids=["bu-1"])

    result = await add_user_to_business_unit(
        payload=payload,
        current_user=current_user,
        workflow_service=workflow_service,
    )

    assert result["status"] == "success"
    workflow_service.add_user_to_business_unit.assert_awaited_once_with(
        payload=payload,
        current_user=current_user,
    )
