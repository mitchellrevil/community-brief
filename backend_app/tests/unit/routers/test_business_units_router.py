from unittest.mock import AsyncMock

import pytest

from backend_app.app.api.v1.routes.business_units import (
    assign_user_to_business_unit,
    bulk_update_users,
    create_business_unit,
    get_business_unit,
    get_business_unit_stats,
    list_business_units,
    update_business_unit,
)
from backend_app.app.schemas.business_units import (
    BulkUserUpdate,
    BulkUserUpdateResponse,
    BusinessUnitCreate,
    BusinessUnitListResponse,
    BusinessUnitResponse,
    BusinessUnitStats,
    BusinessUnitUpdate,
    UserBusinessUnitAssignment,
    UserBusinessUnitAssignmentResponse,
)


def _business_unit_response(category_id: str = "bu-1", name: str = "Marketing") -> BusinessUnitResponse:
    return BusinessUnitResponse(
        id=category_id,
        name=name,
        description=None,
        is_business_unit=True,
        parent_category_id=None,
        created_at=1704067200000,
        updated_at=1704067200000,
    )


@pytest.mark.asyncio
async def test_create_business_unit_delegates_to_workflow():
    workflow_service = AsyncMock()
    workflow_service.create_business_unit.return_value = _business_unit_response(name="Sales")
    current_user = {"id": "admin-1"}
    business_unit = BusinessUnitCreate(name="Sales", description="Sales team")

    result = await create_business_unit(
        business_unit=business_unit,
        current_user=current_user,
        workflow_service=workflow_service,
    )

    assert result.name == "Sales"
    workflow_service.create_business_unit.assert_awaited_once_with(
        business_unit=business_unit,
        current_user=current_user,
    )


@pytest.mark.asyncio
async def test_list_business_units_delegates_to_workflow():
    workflow_service = AsyncMock()
    workflow_service.list_business_units.return_value = BusinessUnitListResponse(
        business_units=[_business_unit_response("bu-1"), _business_unit_response("bu-2", "Sales")],
        total=3,
        limit=2,
        offset=0,
        has_more=True,
    )

    result = await list_business_units(
        limit=2,
        offset=0,
        current_user={"id": "user-1"},
        workflow_service=workflow_service,
    )

    assert [unit.id for unit in result.business_units] == ["bu-1", "bu-2"]
    workflow_service.list_business_units.assert_awaited_once_with(limit=2, offset=0)


@pytest.mark.asyncio
async def test_assign_user_to_business_unit_delegates_to_workflow():
    workflow_service = AsyncMock()
    workflow_service.assign_user_to_business_unit.return_value = UserBusinessUnitAssignmentResponse(
        user_id="user-1",
        business_unit_ids=["bu-1"],
        business_unit_names=["Marketing"],
        success=True,
        message="User successfully assigned",
    )
    current_user = {"id": "admin-1"}
    assignment = UserBusinessUnitAssignment(user_id="user-1", business_unit_ids=["bu-1"])

    result = await assign_user_to_business_unit(
        assignment=assignment,
        current_user=current_user,
        workflow_service=workflow_service,
    )

    assert result.user_id == "user-1"
    workflow_service.assign_user_to_business_unit.assert_awaited_once_with(
        assignment=assignment,
        current_user=current_user,
    )


@pytest.mark.asyncio
async def test_bulk_update_users_delegates_to_workflow():
    workflow_service = AsyncMock()
    workflow_service.bulk_update_users.return_value = BulkUserUpdateResponse(
        success_count=1,
        failed_count=0,
        updated_user_ids=["user-1"],
        failed_updates=[],
        message="Updated 1 user",
    )
    current_user = {"id": "admin-1"}
    bulk_update = BulkUserUpdate(user_ids=["user-1"], business_unit_ids=["bu-1"])

    result = await bulk_update_users(
        bulk_update=bulk_update,
        current_user=current_user,
        workflow_service=workflow_service,
    )

    assert result.success_count == 1
    workflow_service.bulk_update_users.assert_awaited_once_with(
        bulk_update=bulk_update,
        current_user=current_user,
    )


@pytest.mark.asyncio
async def test_get_business_unit_delegates_to_workflow():
    workflow_service = AsyncMock()
    workflow_service.get_business_unit.return_value = _business_unit_response("bu-1")
    current_user = {"id": "admin-1"}

    result = await get_business_unit(
        business_unit_id="bu-1",
        current_user=current_user,
        workflow_service=workflow_service,
    )

    assert result.id == "bu-1"
    workflow_service.get_business_unit.assert_awaited_once_with(
        business_unit_id="bu-1",
        current_user=current_user,
    )


@pytest.mark.asyncio
async def test_update_business_unit_delegates_to_workflow():
    workflow_service = AsyncMock()
    workflow_service.update_business_unit.return_value = _business_unit_response("bu-1", "Growth")
    current_user = {"id": "admin-1"}
    business_unit = BusinessUnitUpdate(name="Growth")

    result = await update_business_unit(
        business_unit_id="bu-1",
        business_unit=business_unit,
        current_user=current_user,
        workflow_service=workflow_service,
    )

    assert result.name == "Growth"
    workflow_service.update_business_unit.assert_awaited_once_with(
        business_unit_id="bu-1",
        business_unit=business_unit,
        current_user=current_user,
    )


@pytest.mark.asyncio
async def test_get_business_unit_stats_delegates_to_workflow():
    workflow_service = AsyncMock()
    workflow_service.get_business_unit_stats.return_value = BusinessUnitStats(
        business_unit_id="bu-1",
        business_unit_name="Marketing",
        total_users=2,
        total_editors=1,
        total_categories=3,
        total_subcategories=4,
        total_prompts=5,
    )
    current_user = {"id": "admin-1"}

    result = await get_business_unit_stats(
        business_unit_id="bu-1",
        current_user=current_user,
        workflow_service=workflow_service,
    )

    assert result.total_prompts == 5
    workflow_service.get_business_unit_stats.assert_awaited_once_with(
        business_unit_id="bu-1",
        current_user=current_user,
    )
