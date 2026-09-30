"""
Integration tests for users router (users.py)

Tests for users API endpoints including:
- POST /api/v1/users/me/business-units - self-assign to business units
- POST /api/v1/users/add-to-business-unit - add user to business units
"""

import pytest
from unittest.mock import AsyncMock


# Mark all tests as integration tests
pytestmark = pytest.mark.integration


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def mock_current_user():
    """Create a mock current user."""
    return {
        "id": "user_123",
        "email": "user@example.com",
        "permission": "User",
        "business_unit_ids": [],
    }


@pytest.fixture
def mock_admin_user():
    """Create a mock admin user."""
    return {
        "id": "admin_123",
        "email": "admin@example.com",
        "permission": "Admin",
        "business_unit_ids": ["bu_123"],
    }


@pytest.fixture
def mock_editor_user():
    """Create a mock editor user."""
    return {
        "id": "editor_123",
        "email": "editor@example.com",
        "permission": "Editor",
        "business_unit_ids": ["bu_123"],
    }


@pytest.fixture
def mock_workflow_service():
    """Create a mock UserWorkflowService."""
    service = AsyncMock()
    service.self_assign_to_business_units = AsyncMock()
    service.add_user_to_business_unit = AsyncMock()
    return service




# ============================================================================
# TEST: POST /api/v1/users/me/business-units
# ============================================================================

class TestSelfAssignToBusinessUnits:
    """Tests for self-assigning to business units endpoint."""
    
    @pytest.mark.asyncio
    async def test_self_assigns_to_business_units(
        self, mock_current_user, mock_workflow_service
    ):
        """Given authenticated user, when self-assigning, then assigns."""
        from app.api.v1.routes.users import self_assign_to_business_units
        from app.schemas.users import SelfAssignToBusinessUnitRequest
        
        mock_workflow_service.self_assign_to_business_units.return_value = {
            "status": "success",
            "user": mock_current_user,
            "business_unit_ids": ["bu_123"],
        }
        
        payload = SelfAssignToBusinessUnitRequest(business_unit_ids=["bu_123"])
        
        result = await self_assign_to_business_units(
            payload=payload,
            current_user=mock_current_user,
            workflow_service=mock_workflow_service,
        )
        
        assert result["status"] == "success"
        mock_workflow_service.self_assign_to_business_units.assert_called_once_with(
            payload=payload,
            current_user=mock_current_user,
        )
    
    @pytest.mark.asyncio
    async def test_self_assigns_to_multiple_business_units(
        self, mock_current_user, mock_workflow_service
    ):
        """Given multiple business unit ids, when self-assigning, then assigns all."""
        from app.api.v1.routes.users import self_assign_to_business_units
        from app.schemas.users import SelfAssignToBusinessUnitRequest
        
        mock_workflow_service.self_assign_to_business_units.return_value = {
            "status": "success",
            "user": mock_current_user,
            "business_unit_ids": ["bu_1", "bu_2", "bu_3"],
        }
        
        payload = SelfAssignToBusinessUnitRequest(business_unit_ids=["bu_1", "bu_2", "bu_3"])
        
        result = await self_assign_to_business_units(
            payload=payload,
            current_user=mock_current_user,
            workflow_service=mock_workflow_service,
        )
        
        assert result["status"] == "success"
        mock_workflow_service.self_assign_to_business_units.assert_called_with(
            payload=payload,
            current_user=mock_current_user,
        )
    
    @pytest.mark.asyncio
    async def test_handles_service_error(
        self, mock_current_user, mock_workflow_service
    ):
        """Given service error, when self-assigning, then handles error."""
        from app.api.v1.routes.users import self_assign_to_business_units
        from app.schemas.users import SelfAssignToBusinessUnitRequest
        
        mock_workflow_service.self_assign_to_business_units.side_effect = RuntimeError("Service error")
        
        payload = SelfAssignToBusinessUnitRequest(business_unit_ids=["bu_123"])
        
        with pytest.raises(RuntimeError):
            await self_assign_to_business_units(
                payload=payload,
                current_user=mock_current_user,
                workflow_service=mock_workflow_service,
            )


# ============================================================================
# TEST: POST /api/v1/users/add-to-business-unit
# ============================================================================

class TestAddUserToBusinessUnit:
    """Tests for adding user to business unit endpoint."""
    
    @pytest.mark.asyncio
    async def test_adds_user_with_one_business_unit_id(
        self, mock_admin_user, mock_workflow_service
    ):
        """Given one business_unit_ids value, when adding user, then adds to that unit."""
        from app.api.v1.routes.users import add_user_to_business_unit
        from app.schemas.users import AddUserToBusinessUnitRequest
        
        mock_workflow_service.add_user_to_business_unit.return_value = {
            "status": "success",
            "user_id": "target_user",
            "business_unit_ids": ["bu_123"],
            "business_unit_names": ["Business Unit 1"],
        }
        
        payload = AddUserToBusinessUnitRequest(
            user_email="target@example.com",
            business_unit_ids=["bu_123"],
        )
        
        result = await add_user_to_business_unit(
            payload=payload,
            current_user=mock_admin_user,
            workflow_service=mock_workflow_service,
        )
        
        assert result["status"] == "success"
        assert "bu_123" in result["business_unit_ids"]
    
    @pytest.mark.asyncio
    async def test_adds_user_with_multiple_business_unit_ids(
        self, mock_admin_user, mock_workflow_service
    ):
        """Given business_unit_ids list, when adding user, then adds to all units."""
        from app.api.v1.routes.users import add_user_to_business_unit
        from app.schemas.users import AddUserToBusinessUnitRequest
        
        mock_workflow_service.add_user_to_business_unit.return_value = {
            "status": "success",
            "user_id": "target_user",
            "business_unit_ids": ["bu_1", "bu_2"],
            "business_unit_names": ["BU 1", "BU 2"],
        }
        
        payload = AddUserToBusinessUnitRequest(
            user_email="target@example.com",
            business_unit_ids=["bu_1", "bu_2"],
        )
        
        result = await add_user_to_business_unit(
            payload=payload,
            current_user=mock_admin_user,
            workflow_service=mock_workflow_service,
        )
        
        assert result["status"] == "success"
        assert len(result["business_unit_ids"]) == 2
    
    @pytest.mark.asyncio
    async def test_raises_validation_error_when_no_business_unit_provided(
        self, mock_admin_user, mock_workflow_service
    ):
        """Given no business unit id, when adding user, then raises validation error."""
        from app.api.v1.routes.users import add_user_to_business_unit
        from app.schemas.users import AddUserToBusinessUnitRequest
        from app.core.errors.domain import ValidationError
        
        payload = AddUserToBusinessUnitRequest(
            user_email="target@example.com",
            business_unit_ids=None,
        )

        mock_workflow_service.add_user_to_business_unit.side_effect = ValidationError(
            "At least one business unit ID must be provided"
        )
        
        with pytest.raises(ValidationError):
            await add_user_to_business_unit(
                payload=payload,
                current_user=mock_admin_user,
                workflow_service=mock_workflow_service,
            )
    
    @pytest.mark.asyncio
    async def test_includes_user_id_in_response(
        self, mock_admin_user, mock_workflow_service
    ):
        """Given successful add, when adding user, then response includes user_id."""
        from app.api.v1.routes.users import add_user_to_business_unit
        from app.schemas.users import AddUserToBusinessUnitRequest
        
        mock_workflow_service.add_user_to_business_unit.return_value = {
            "status": "success",
            "message": "User target@example.com added to business units",
            "user_id": "target_user_id",
            "business_unit_ids": ["bu_123"],
            "business_unit_names": ["BU 1"],
        }
        
        payload = AddUserToBusinessUnitRequest(
            user_email="target@example.com",
            business_unit_ids=["bu_123"],
        )
        
        result = await add_user_to_business_unit(
            payload=payload,
            current_user=mock_admin_user,
            workflow_service=mock_workflow_service,
        )
        
        assert result["user_id"] == "target_user_id"
        assert result["message"] == "User target@example.com added to business units"
