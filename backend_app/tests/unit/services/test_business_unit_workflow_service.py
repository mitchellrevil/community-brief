from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.errors.domain import ApplicationError
from app.schemas.business_units import (
    BulkUserUpdate,
    BusinessUnitCreate,
    BusinessUnitUpdate,
    UserBusinessUnitAssignment,
)
from app.services.prompts.business_unit_workflow_service import BusinessUnitWorkflowService


def _business_unit(category_id: str = "bu-1", name: str = "Marketing", parent_category_id=None) -> dict:
    return {
        "id": category_id,
        "name": name,
        "description": None,
        "is_business_unit": True,
        "parent_category_id": parent_category_id,
        "created_at": "2024-01-01T00:00:00+00:00",
        "updated_at": "2024-01-01T00:00:00+00:00",
    }


@pytest.fixture
def business_unit_service():
    return AsyncMock()


@pytest.fixture
def permission_service():
    service = MagicMock()
    service.can_manage_business_units.return_value = True
    service.can_assign_user_to_business_unit.return_value = True
    return service


@pytest.fixture
def user_service():
    return AsyncMock()


@pytest.fixture
def workflow_service(business_unit_service, permission_service, user_service):
    return BusinessUnitWorkflowService(
        business_unit_service=business_unit_service,
        permission_service=permission_service,
        user_service=user_service,
    )


@pytest.mark.asyncio
async def test_create_business_unit_checks_permission_and_shapes_response(workflow_service, business_unit_service):
    business_unit_service.create_business_unit.return_value = _business_unit("bu-1", "Sales")

    result = await workflow_service.create_business_unit(
        business_unit=BusinessUnitCreate(name="Sales", description="Sales team"),
        current_user={"id": "admin-1"},
    )

    assert result.name == "Sales"
    business_unit_service.create_business_unit.assert_awaited_once_with(
        name="Sales",
        description="Sales team",
    )


@pytest.mark.asyncio
async def test_create_business_unit_raises_for_missing_permission(workflow_service, permission_service):
    permission_service.can_manage_business_units.return_value = False

    with pytest.raises(ApplicationError) as exc_info:
        await workflow_service.create_business_unit(
            business_unit=BusinessUnitCreate(name="Sales"),
            current_user={"id": "user-1"},
        )

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_list_business_units_shapes_pagination(workflow_service, business_unit_service):
    business_unit_service.list_business_units.return_value = {
        "items": [_business_unit("bu-1"), _business_unit("bu-2", "Sales")],
        "total": 3,
        "limit": 2,
        "offset": 0,
    }

    result = await workflow_service.list_business_units(limit=2, offset=0)

    assert [unit.id for unit in result.business_units] == ["bu-1", "bu-2"]
    assert result.total == 3
    assert result.has_more is True


@pytest.mark.asyncio
async def test_assign_user_to_business_unit_shapes_message(workflow_service, user_service):
    user_service.set_user_business_units.return_value = {
        "business_unit_names": ["Marketing", "Sales"],
    }

    result = await workflow_service.assign_user_to_business_unit(
        assignment=UserBusinessUnitAssignment(user_id="user-1", business_unit_ids=["bu-1", "bu-2"]),
        current_user={"id": "admin-1"},
    )

    assert result.business_unit_ids == ["bu-1", "bu-2"]
    assert result.business_unit_names == ["Marketing", "Sales"]
    assert "2 business unit" in result.message
    user_service.set_user_business_units.assert_awaited_once_with(
        target_user_id="user-1",
        business_unit_ids=["bu-1", "bu-2"],
    )


@pytest.mark.asyncio
async def test_assign_user_to_business_unit_clears_when_ids_missing(workflow_service, user_service):
    user_service.set_user_business_units.return_value = {"business_unit_names": []}

    result = await workflow_service.assign_user_to_business_unit(
        assignment=UserBusinessUnitAssignment(user_id="user-1", business_unit_ids=None),
        current_user={"id": "admin-1"},
    )

    assert result.business_unit_ids == []
    assert result.message == "User business unit assignments cleared"


@pytest.mark.asyncio
async def test_bulk_update_users_rejects_empty_user_ids(workflow_service):
    with pytest.raises(ApplicationError) as exc_info:
        await workflow_service.bulk_update_users(
            bulk_update=BulkUserUpdate(user_ids=[], business_unit_ids=["bu-1"]),
            current_user={"id": "admin-1"},
        )

    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_update_business_unit_checks_existing_unit_then_delegates_update(
    workflow_service,
    business_unit_service,
):
    business_unit_service.get_business_unit.return_value = _business_unit("bu-1", "Marketing")
    business_unit_service.update_business_unit.return_value = _business_unit("bu-1", "Growth")

    result = await workflow_service.update_business_unit(
        business_unit_id="bu-1",
        business_unit=BusinessUnitUpdate(name="Growth"),
        current_user={"id": "admin-1"},
    )

    assert result.name == "Growth"
    business_unit_service.get_business_unit.assert_awaited_once_with("bu-1")
    business_unit_service.update_business_unit.assert_awaited_once_with(
        bu_id="bu-1",
        name="Growth",
        description=None,
    )


@pytest.mark.asyncio
async def test_get_business_unit_stats_raises_not_found_when_service_returns_none(
    workflow_service,
    business_unit_service,
):
    business_unit_service.get_business_unit.return_value = None

    with pytest.raises(ApplicationError) as exc_info:
        await workflow_service.get_business_unit_stats(
            business_unit_id="missing",
            current_user={"id": "admin-1"},
        )

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_get_business_unit_stats_shapes_stats(workflow_service, business_unit_service):
    business_unit_service.get_business_unit.return_value = _business_unit("bu-1", "Marketing")
    business_unit_service.get_business_unit_stats.return_value = {
        "total_users": 10,
        "total_editors": 2,
        "total_categories": 3,
        "total_subcategories": 4,
        "total_prompts": 5,
    }

    result = await workflow_service.get_business_unit_stats(
        business_unit_id="bu-1",
        current_user={"id": "admin-1"},
    )

    assert result.business_unit_name == "Marketing"
    assert result.total_prompts == 5
