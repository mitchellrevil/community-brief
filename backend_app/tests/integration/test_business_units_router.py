"""
Integration tests for business_units router.

Tests for:
- app/api/v1/routes/business_units.py

Endpoints covered:
- POST /api/v1/business-units (create)
- GET /api/v1/business-units (list)
- GET /api/v1/business-units/{business_unit_id} (get single)
- PUT /api/v1/business-units/{business_unit_id} (update)
- POST /api/v1/business-units/assign-user
- GET /api/v1/business-units/{business_unit_id}/stats
- POST /api/v1/business-units/bulk-update-users
"""
import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import HTTPException


# =============================================================================
# POST /api/v1/business-units tests (create)
# =============================================================================


class TestCreateBusinessUnit:
    """Tests for POST /api/v1/business-units endpoint."""

    @pytest.mark.asyncio
    async def test_given_admin_when_create_bu_then_returns_created(self):
        """Admin can create a business unit."""
        from app.api.v1.routes.business_units import create_business_unit
        from app.schemas.business_units import BusinessUnitCreate

        mock_business_unit_service = AsyncMock()
        mock_business_unit_service.create_business_unit = AsyncMock(
            return_value={
                "id": "bu-123",
                "name": "Marketing",
                "parent_category_id": None,
                "is_business_unit": True,
                "created_at": "2024-01-01T00:00:00Z",
                "updated_at": "2024-01-01T00:00:00Z",
            }
        )
        mock_perm_service = MagicMock()
        mock_perm_service.can_manage_business_units = MagicMock(return_value=True)
        admin_user = {"id": "admin-1", "permission": "Admin"}

        bu_create = BusinessUnitCreate(name="Marketing", description="Marketing dept")

        result = await create_business_unit(
            business_unit=bu_create,
            current_user=admin_user,
            business_unit_service=mock_business_unit_service,
            perm_service=mock_perm_service,
        )

        assert result.id == "bu-123"
        assert result.name == "Marketing"
        assert result.is_business_unit is True
        mock_business_unit_service.create_business_unit.assert_awaited_once_with(
            name="Marketing",
            description="Marketing dept",
        )

    @pytest.mark.asyncio
    async def test_given_non_admin_when_create_bu_then_raises_forbidden(self):
        """Non-admin cannot create business unit."""
        from app.api.v1.routes.business_units import create_business_unit
        from app.schemas.business_units import BusinessUnitCreate

        mock_business_unit_service = AsyncMock()
        mock_perm_service = MagicMock()
        mock_perm_service.can_manage_business_units = MagicMock(return_value=False)
        regular_user = {"id": "user-1", "permission": "User"}

        bu_create = BusinessUnitCreate(name="Marketing")

        with pytest.raises(HTTPException) as exc_info:
            await create_business_unit(
                business_unit=bu_create,
                current_user=regular_user,
                business_unit_service=mock_business_unit_service,
                perm_service=mock_perm_service,
            )

        assert exc_info.value.status_code == 403


# =============================================================================
# GET /api/v1/business-units tests (list)
# =============================================================================


class TestListBusinessUnits:
    """Tests for GET /api/v1/business-units endpoint."""

    @pytest.mark.asyncio
    async def test_given_authenticated_user_when_list_then_returns_all_bus(self):
        """Any authenticated user can list business units."""
        from app.api.v1.routes.business_units import list_business_units

        mock_business_unit_service = AsyncMock()
        mock_business_unit_service.list_business_units = AsyncMock(
            return_value={
                "items": [
                    {
                        "id": "bu-1",
                        "name": "Marketing",
                        "parent_category_id": None,
                        "created_at": "2024-01-01T00:00:00Z",
                        "updated_at": "2024-01-01T00:00:00Z",
                    },
                    {
                        "id": "bu-2",
                        "name": "Sales",
                        "parent_category_id": None,
                        "created_at": "2024-01-01T00:00:00Z",
                        "updated_at": "2024-01-01T00:00:00Z",
                    },
                ],
                "total": 2,
                "limit": 50,
                "offset": 0,
            }
        )
        mock_perm_service = MagicMock()
        user = {"id": "user-1", "permission": "User"}

        result = await list_business_units(
            limit=50,
            offset=0,
            current_user=user,
            business_unit_service=mock_business_unit_service,
            perm_service=mock_perm_service,
        )

        # Should only include top-level categories (no parent_category_id)
        assert len(result.business_units) == 2
        assert result.total == 2
        assert all(bu.parent_category_id is None for bu in result.business_units)

    @pytest.mark.asyncio
    async def test_given_pagination_when_list_then_applies_correctly(self):
        """Pagination is applied correctly to filtered results."""
        from app.api.v1.routes.business_units import list_business_units

        mock_business_unit_service = AsyncMock()
        mock_business_unit_service.list_business_units = AsyncMock(
            return_value={
                "items": [
                    {"id": f"bu-{i}", "name": f"BU {i}", "parent_category_id": None, "created_at": "2024-01-01T00:00:00Z", "updated_at": "2024-01-01T00:00:00Z"}
                    for i in range(2, 5)
                ],
                "total": 10,
                "limit": 3,
                "offset": 2,
            }
        )
        mock_perm_service = MagicMock()
        user = {"id": "user-1", "permission": "User"}

        result = await list_business_units(
            limit=3,
            offset=2,
            current_user=user,
            business_unit_service=mock_business_unit_service,
            perm_service=mock_perm_service,
        )

        assert len(result.business_units) == 3
        assert result.total == 10
        assert result.has_more is True
        assert result.business_units[0].id == "bu-2"


# =============================================================================
# GET /api/v1/business-units/{id} tests
# =============================================================================


class TestGetBusinessUnit:
    """Tests for GET /api/v1/business-units/{business_unit_id} endpoint."""

    @pytest.mark.asyncio
    async def test_given_admin_when_get_bu_then_returns_bu(self):
        """Admin can get a specific business unit."""
        from app.api.v1.routes.business_units import get_business_unit

        mock_business_unit_service = AsyncMock()
        mock_business_unit_service.get_business_unit = AsyncMock(
            return_value={
                "id": "bu-123",
                "name": "Marketing",
                "parent_category_id": None,
                "created_at": "2024-01-01T00:00:00Z",
                "updated_at": "2024-01-01T00:00:00Z",
            }
        )
        mock_perm_service = MagicMock()
        mock_perm_service.can_manage_business_units = MagicMock(return_value=True)
        admin_user = {"id": "admin-1", "permission": "Admin"}

        result = await get_business_unit(
            business_unit_id="bu-123",
            current_user=admin_user,
            business_unit_service=mock_business_unit_service,
            perm_service=mock_perm_service,
        )

        assert result.id == "bu-123"
        assert result.name == "Marketing"

    @pytest.mark.asyncio
    async def test_given_nonexistent_bu_when_get_then_raises_not_found(self):
        """Getting nonexistent BU raises 404."""
        from app.api.v1.routes.business_units import get_business_unit

        mock_business_unit_service = AsyncMock()
        mock_business_unit_service.get_business_unit = AsyncMock(return_value=None)
        mock_perm_service = MagicMock()
        mock_perm_service.can_manage_business_units = MagicMock(return_value=True)
        admin_user = {"id": "admin-1", "permission": "Admin"}

        with pytest.raises(HTTPException) as exc_info:
            await get_business_unit(
                business_unit_id="nonexistent",
                current_user=admin_user,
                business_unit_service=mock_business_unit_service,
                perm_service=mock_perm_service,
            )

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_given_subcategory_when_get_as_bu_then_raises_bad_request(self):
        """Getting a subcategory as BU raises 400."""
        from app.api.v1.routes.business_units import get_business_unit

        mock_business_unit_service = AsyncMock()
        mock_business_unit_service.get_business_unit = AsyncMock(
            return_value={
                "id": "subcat-1",
                "name": "Subcategory",
                "parent_category_id": "bu-123",  # Has parent, not a BU
                "created_at": "2024-01-01T00:00:00Z",
                "updated_at": "2024-01-01T00:00:00Z",
            }
        )
        mock_perm_service = MagicMock()
        mock_perm_service.can_manage_business_units = MagicMock(return_value=True)
        admin_user = {"id": "admin-1", "permission": "Admin"}

        with pytest.raises(HTTPException) as exc_info:
            await get_business_unit(
                business_unit_id="subcat-1",
                current_user=admin_user,
                business_unit_service=mock_business_unit_service,
                perm_service=mock_perm_service,
            )

        assert exc_info.value.status_code == 400


# =============================================================================
# PUT /api/v1/business-units/{id} tests
# =============================================================================


class TestUpdateBusinessUnit:
    """Tests for PUT /api/v1/business-units/{business_unit_id} endpoint."""

    @pytest.mark.asyncio
    async def test_given_admin_when_update_bu_then_returns_updated(self):
        """Admin can update a business unit."""
        from app.api.v1.routes.business_units import update_business_unit
        from app.schemas.business_units import BusinessUnitUpdate

        mock_business_unit_service = AsyncMock()
        mock_business_unit_service.get_business_unit = AsyncMock(
            return_value={
                "id": "bu-123",
                "name": "Marketing",
                "parent_category_id": None,
                "created_at": "2024-01-01T00:00:00Z",
                "updated_at": "2024-01-01T00:00:00Z",
            }
        )
        mock_business_unit_service.update_business_unit = AsyncMock(
            return_value={
                "id": "bu-123",
                "name": "Marketing Dept",
                "parent_category_id": None,
                "created_at": "2024-01-01T00:00:00Z",
                "updated_at": "2024-01-02T00:00:00Z",
            }
        )
        mock_perm_service = MagicMock()
        mock_perm_service.can_manage_business_units = MagicMock(return_value=True)
        admin_user = {"id": "admin-1", "permission": "Admin"}

        bu_update = BusinessUnitUpdate(name="Marketing Dept")

        result = await update_business_unit(
            business_unit_id="bu-123",
            business_unit=bu_update,
            current_user=admin_user,
            business_unit_service=mock_business_unit_service,
            perm_service=mock_perm_service,
        )

        assert result.id == "bu-123"
        assert result.name == "Marketing Dept"

    @pytest.mark.asyncio
    async def test_given_non_admin_when_update_bu_then_raises_forbidden(self):
        """Non-admin cannot update business unit."""
        from app.api.v1.routes.business_units import update_business_unit
        from app.schemas.business_units import BusinessUnitUpdate

        mock_business_unit_service = AsyncMock()
        mock_perm_service = MagicMock()
        mock_perm_service.can_manage_business_units = MagicMock(return_value=False)
        regular_user = {"id": "user-1", "permission": "User"}

        bu_update = BusinessUnitUpdate(name="New Name")

        with pytest.raises(HTTPException) as exc_info:
            await update_business_unit(
                business_unit_id="bu-123",
                business_unit=bu_update,
                current_user=regular_user,
                business_unit_service=mock_business_unit_service,
                perm_service=mock_perm_service,
            )

        assert exc_info.value.status_code == 403


# =============================================================================
# POST /api/v1/business-units/assign-user tests
# =============================================================================


class TestAssignUserToBusinessUnit:
    """Tests for POST /api/v1/business-units/assign-user endpoint."""

    @pytest.mark.asyncio
    async def test_given_admin_when_assign_user_then_success(self):
        """Admin can assign user to business unit."""
        from app.api.v1.routes.business_units import assign_user_to_business_unit
        from app.schemas.business_units import UserBusinessUnitAssignment

        mock_perm_service = MagicMock()
        mock_perm_service.can_assign_user_to_business_unit = MagicMock(return_value=True)
        mock_user_service = AsyncMock()
        mock_user_service.set_user_business_units = AsyncMock(
            return_value={
                "business_unit_names": ["Marketing"],
            }
        )
        admin_user = {"id": "admin-1", "permission": "Admin"}

        assignment = UserBusinessUnitAssignment(
            user_id="user-123",
            business_unit_ids=["bu-1"],
        )

        result = await assign_user_to_business_unit(
            assignment=assignment,
            current_user=admin_user,
            perm_service=mock_perm_service,
            user_service=mock_user_service,
        )

        assert result.success is True
        assert result.user_id == "user-123"
        assert "bu-1" in result.business_unit_ids

    @pytest.mark.asyncio
    async def test_given_multiple_bus_when_assign_then_assigns_all(self):
        """Admin can assign user to multiple business units."""
        from app.api.v1.routes.business_units import assign_user_to_business_unit
        from app.schemas.business_units import UserBusinessUnitAssignment

        mock_perm_service = MagicMock()
        mock_perm_service.can_assign_user_to_business_unit = MagicMock(return_value=True)
        mock_user_service = AsyncMock()
        mock_user_service.set_user_business_units = AsyncMock(
            return_value={
                "business_unit_names": ["Marketing", "Sales"],
            }
        )
        admin_user = {"id": "admin-1", "permission": "Admin"}

        assignment = UserBusinessUnitAssignment(
            user_id="user-123",
            business_unit_ids=["bu-1", "bu-2"],
        )

        result = await assign_user_to_business_unit(
            assignment=assignment,
            current_user=admin_user,
            perm_service=mock_perm_service,
            user_service=mock_user_service,
        )

        assert result.success is True
        assert len(result.business_unit_ids) == 2
        assert "2 business unit(s)" in result.message

    @pytest.mark.asyncio
    async def test_given_non_admin_when_assign_then_raises_forbidden(self):
        """Non-admin cannot assign users to business units."""
        from app.api.v1.routes.business_units import assign_user_to_business_unit
        from app.schemas.business_units import UserBusinessUnitAssignment

        mock_perm_service = MagicMock()
        mock_perm_service.can_assign_user_to_business_unit = MagicMock(return_value=False)
        mock_user_service = AsyncMock()
        regular_user = {"id": "user-1", "permission": "User"}

        assignment = UserBusinessUnitAssignment(
            user_id="user-123",
            business_unit_ids=["bu-1"],
        )

        with pytest.raises(HTTPException) as exc_info:
            await assign_user_to_business_unit(
                assignment=assignment,
                current_user=regular_user,
                perm_service=mock_perm_service,
                user_service=mock_user_service,
            )

        assert exc_info.value.status_code == 403


# =============================================================================
# GET /api/v1/business-units/{id}/stats tests
# =============================================================================


class TestGetBusinessUnitStats:
    """Tests for GET /api/v1/business-units/{business_unit_id}/stats endpoint."""

    @pytest.mark.asyncio
    async def test_given_admin_when_get_stats_then_returns_stats(self):
        """Admin can get business unit statistics."""
        from app.api.v1.routes.business_units import get_business_unit_stats

        mock_business_unit_service = AsyncMock()
        mock_business_unit_service.get_business_unit = AsyncMock(
            return_value={
                "id": "bu-123",
                "name": "Marketing",
                "parent_category_id": None,
            }
        )
        mock_perm_service = MagicMock()
        mock_perm_service.can_manage_business_units = MagicMock(return_value=True)
        mock_business_unit_service.get_business_unit_stats = AsyncMock(
            return_value={
                "business_unit_id": "bu-123",
                "total_users": 10,
                "total_editors": 5,
                "total_categories": 3,
                "total_subcategories": 8,
                "total_prompts": 2,
            }
        )
        admin_user = {"id": "admin-1", "permission": "Admin"}

        result = await get_business_unit_stats(
            business_unit_id="bu-123",
            current_user=admin_user,
            business_unit_service=mock_business_unit_service,
            perm_service=mock_perm_service,
        )

        assert result.business_unit_id == "bu-123"
        assert result.business_unit_name == "Marketing"
        assert result.total_users == 10
        assert result.total_editors == 5
        mock_business_unit_service.get_business_unit_stats.assert_awaited_once_with("bu-123")


# =============================================================================
# POST /api/v1/business-units/bulk-update-users tests
# =============================================================================


class TestBulkUpdateUsers:
    """Tests for POST /api/v1/business-units/bulk-update-users endpoint."""

    @pytest.mark.asyncio
    async def test_given_admin_when_bulk_update_then_updates_all(self):
        """Admin can bulk update users."""
        from app.api.v1.routes.business_units import bulk_update_users
        from app.schemas.business_units import BulkUserUpdate

        mock_perm_service = MagicMock()
        mock_perm_service.can_assign_user_to_business_unit = MagicMock(return_value=True)
        mock_user_service = AsyncMock()
        mock_user_service.bulk_update_users = AsyncMock(
            return_value={
                "success_count": 3,
                "failed_count": 0,
                "updated_user_ids": ["user-1", "user-2", "user-3"],
                "failed_updates": [],
                "message": "Updated 3 users",
            }
        )
        admin_user = {"id": "admin-1", "permission": "Admin"}

        bulk_update = BulkUserUpdate(
            user_ids=["user-1", "user-2", "user-3"],
            business_unit_ids=["bu-1"],
        )

        result = await bulk_update_users(
            bulk_update=bulk_update,
            current_user=admin_user,
            perm_service=mock_perm_service,
            user_service=mock_user_service,
        )

        assert result.success_count == 3
        assert result.failed_count == 0
        mock_user_service.bulk_update_users.assert_called_once()

    @pytest.mark.asyncio
    async def test_given_empty_user_ids_when_bulk_update_then_raises_bad_request(self):
        """Empty user_ids raises 400."""
        from app.api.v1.routes.business_units import bulk_update_users
        from app.schemas.business_units import BulkUserUpdate

        mock_perm_service = MagicMock()
        mock_perm_service.can_assign_user_to_business_unit = MagicMock(return_value=True)
        mock_user_service = AsyncMock()
        admin_user = {"id": "admin-1", "permission": "Admin"}

        bulk_update = BulkUserUpdate(
            user_ids=[],
            business_unit_ids=["bu-1"],
        )

        with pytest.raises(HTTPException) as exc_info:
            await bulk_update_users(
                bulk_update=bulk_update,
                current_user=admin_user,
                perm_service=mock_perm_service,
                user_service=mock_user_service,
            )

        assert exc_info.value.status_code == 400
