"""
Component tests for CosmosService (cosmos.py)

Tests for Cosmos DB operations including:
- User repository CRUD operations
- Job CRUD operations
- Container access
- Caching behavior
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone
from typing import Dict, Any

from app.repositories.jobs import JobRepository
from app.repositories.users import UserRepository


# Mark all tests as component tests
pytestmark = pytest.mark.component


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def mock_config():
    """Create a mock AppConfig."""
    config = MagicMock()
    config.cosmos_endpoint = "https://test.cosmos.azure.com:443/"
    config.cosmos_key = "test_key"
    config.cosmos_database = "test_db"
    config.cosmos_containers = {
        "auth": "auth",
        "jobs": "jobs",
        "analytics": "analytics",
    }
    return config


@pytest.fixture
def cosmos_service(mock_config):
    """Create a CosmosService with mocked config."""
    from app.core.cosmos import CosmosService
    service = CosmosService(config=mock_config)
    
    # Mock the containers
    service._containers = {}
    service._initialized = True
    service._database = MagicMock()
    
    return service


@pytest.fixture
def mock_container():
    """Create a mock async container."""
    container = AsyncMock()
    container.read_item = AsyncMock()
    container.query_items = MagicMock()
    container.create_item = AsyncMock()
    container.replace_item = AsyncMock()
    container.delete_item = AsyncMock()
    return container


@pytest.fixture
def user_repository(cosmos_service):
    permission_cache = AsyncMock()
    permission_cache.get_users_by_permission = AsyncMock(return_value=None)
    permission_cache.set_users_by_permission = AsyncMock()
    permission_cache.set_user_permission = AsyncMock()
    permission_cache.invalidate_user_cache = AsyncMock()
    permission_cache.invalidate_permission_level_cache = AsyncMock()
    return UserRepository(cosmos_service, permission_cache=permission_cache)


@pytest.fixture
def job_repository(cosmos_service):
    return JobRepository(cosmos_service)


def create_user(
    user_id: str = "user_123",
    email: str = "user@example.com",
    permission: str = "Viewer",
) -> Dict[str, Any]:
    """Helper to create test user dicts."""
    return {
        "id": user_id,
        "type": "user",
        "email": email,
        "permission": permission,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def create_job(
    job_id: str = "job_123",
    user_id: str = "user_123",
    status: str = "pending",
) -> Dict[str, Any]:
    """Helper to create test job dicts."""
    return {
        "id": job_id,
        "type": "job",
        "user_id": user_id,
        "status": status,
        "created_at": int(datetime.now(timezone.utc).timestamp() * 1000),
    }


# ============================================================================
# TEST: is_available
# ============================================================================

class TestIsAvailable:
    """Tests for Cosmos availability checking."""
    
    def test_returns_true_when_credentials_available(self, cosmos_service):
        """Given valid credentials, when checking availability, then returns True."""
        result = cosmos_service.is_available()
        
        assert result is True
    
    def test_returns_false_when_no_endpoint(self, mock_config):
        """Given no endpoint, when checking availability, then returns False."""
        mock_config.cosmos_endpoint = None
        mock_config.cosmos_key = None
        
        from app.core.cosmos import CosmosService
        
        service = CosmosService(config=mock_config)
        result = service.is_available()
        
        assert result is False


# ============================================================================
# TEST: get_container
# ============================================================================

class TestGetContainer:
    """Tests for container access."""
    
    def test_caches_container_reference(self, cosmos_service):
        """Given container request, when getting twice, then caches reference."""
        mock_container = MagicMock()
        cosmos_service._database.get_container_client = MagicMock(return_value=mock_container)
        
        container1 = cosmos_service.get_container("auth")
        container2 = cosmos_service.get_container("auth")
        
        assert container1 is container2
        cosmos_service._database.get_container_client.assert_called_once()


# ============================================================================
# TEST: get_user_by_id
# ============================================================================

class TestGetUserById:
    """Tests for user retrieval by ID."""
    
    @pytest.mark.asyncio
    async def test_returns_user_when_found(self, cosmos_service, mock_container, user_repository):
        """Given existing user, when getting by id, then returns user."""
        user = create_user()
        mock_container.read_item = AsyncMock(return_value=user)
        cosmos_service._containers["auth"] = mock_container
        
        result = await user_repository.get_by_id("user_123")
        
        assert result is not None
        assert result["id"] == "user_123"
    
    @pytest.mark.asyncio
    async def test_returns_none_when_not_found(self, cosmos_service, mock_container, user_repository):
        """Given nonexistent user, when getting by id, then returns None."""
        from azure.cosmos.exceptions import CosmosResourceNotFoundError
        
        mock_container.read_item = AsyncMock(
            side_effect=CosmosResourceNotFoundError(status_code=404, message="Not found")
        )
        cosmos_service._containers["auth"] = mock_container
        
        result = await user_repository.get_by_id("nonexistent")
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_uses_cache_on_second_call(self, cosmos_service, mock_container, user_repository):
        """Given cached user, when getting again, then uses cache."""
        user = create_user()
        mock_container.read_item = AsyncMock(return_value=user)
        cosmos_service._containers["auth"] = mock_container
        
        # First call
        await user_repository.get_by_id("user_123")
        
        # Reset mock
        mock_container.read_item.reset_mock()
        
        # Second call should use cache
        result = await user_repository.get_by_id("user_123")
        
        assert result is not None
        # Cache hit - no second read
        mock_container.read_item.assert_not_called()


# ============================================================================
# TEST: get_user_by_email
# ============================================================================

class TestGetUserByEmail:
    """Tests for user retrieval by email."""
    
    @pytest.mark.asyncio
    async def test_returns_user_when_found(self, cosmos_service, mock_container, user_repository):
        """Given existing user, when getting by email, then returns user."""
        user = create_user()
        
        async def mock_query(*args, **kwargs):
            yield user
        
        mock_container.query_items = MagicMock(return_value=mock_query())
        cosmos_service._containers["auth"] = mock_container
        
        result = await user_repository.get_by_email("user@example.com")
        
        assert result is not None
        assert result["email"] == "user@example.com"
    
    @pytest.mark.asyncio
    async def test_returns_none_when_not_found(self, cosmos_service, mock_container, user_repository):
        """Given no user with email, when getting, then returns None."""
        async def mock_query(*args, **kwargs):
            if False:
                yield
        
        mock_container.query_items = MagicMock(return_value=mock_query())
        cosmos_service._containers["auth"] = mock_container
        
        result = await user_repository.get_by_email("nonexistent@example.com")
        
        assert result is None


# ============================================================================
# TEST: get_all_users
# ============================================================================

class TestGetAllUsers:
    """Tests for getting all users."""
    
    @pytest.mark.asyncio
    async def test_returns_paginated_users(self, cosmos_service, mock_container, user_repository):
        """Given users, when getting all, then returns paginated result."""
        users = [create_user(), create_user(user_id="user_2")]
        
        call_count = 0
        async def mock_query(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                for user in users:
                    yield user
            else:
                yield 2  # Count
        
        mock_container.query_items = MagicMock(side_effect=[mock_query(), mock_query()])
        cosmos_service._containers["auth"] = mock_container
        
        result = await user_repository.list()
        
        assert "items" in result
        assert "total" in result
    
    @pytest.mark.asyncio
    async def test_applies_pagination_parameters(self, cosmos_service, mock_container, user_repository):
        """Given limit and offset, when getting users, then applies pagination."""
        async def mock_query(*args, **kwargs):
            yield create_user()
        
        async def mock_count(*args, **kwargs):
            yield 10
        
        mock_container.query_items = MagicMock(side_effect=[mock_query(), mock_count()])
        cosmos_service._containers["auth"] = mock_container
        
        result = await user_repository.list(limit=5, offset=2)
        
        assert result["limit"] == 5
        assert result["offset"] == 2


# ============================================================================
# TEST: create_user
# ============================================================================

class TestCreateUser:
    """Tests for user creation."""
    
    @pytest.mark.asyncio
    async def test_creates_user_successfully(self, cosmos_service, mock_container, user_repository):
        """Given valid user data, when creating, then creates user."""
        user_doc = create_user()
        mock_container.create_item = AsyncMock(return_value=user_doc)
        cosmos_service._containers["auth"] = mock_container
        
        result = await user_repository.create(user_doc)
        
        assert result["id"] == "user_123"
        mock_container.create_item.assert_called_once()


# ============================================================================
# TEST: update_user
# ============================================================================

class TestUpdateUser:
    """Tests for user update."""
    
    @pytest.mark.asyncio
    async def test_updates_user_successfully(self, cosmos_service, mock_container, user_repository):
        """Given valid user, when updating, then updates user."""
        existing_user = create_user()
        updated_user = {**existing_user, "permission": "Admin"}
        
        mock_container.read_item = AsyncMock(return_value=existing_user)
        mock_container.replace_item = AsyncMock(return_value=updated_user)
        cosmos_service._containers["auth"] = mock_container
        
        result = await user_repository.update(
            "user_123",
            {"permission": "Admin"}
        )
        
        assert result["permission"] == "Admin"
    
    @pytest.mark.asyncio
    async def test_raises_when_user_not_found(self, cosmos_service, mock_container, user_repository):
        """Given nonexistent user, when updating, then raises ValueError."""
        from azure.cosmos.exceptions import CosmosResourceNotFoundError
        
        mock_container.read_item = AsyncMock(
            side_effect=CosmosResourceNotFoundError(status_code=404, message="Not found")
        )
        cosmos_service._containers["auth"] = mock_container
        
        with pytest.raises(ValueError, match="not found"):
            await user_repository.update("nonexistent", {"name": "New Name"})


# ============================================================================
# TEST: delete_user
# ============================================================================

class TestDeleteUser:
    """Tests for user deletion."""
    
    @pytest.mark.asyncio
    async def test_deletes_user_successfully(self, cosmos_service, mock_container, user_repository):
        """Given existing user, when deleting, then returns True."""
        mock_container.delete_item = AsyncMock()
        cosmos_service._containers["auth"] = mock_container
        
        result = await user_repository.delete("user_123")
        
        assert result is True
    
    @pytest.mark.asyncio
    async def test_returns_false_when_user_not_found(self, cosmos_service, mock_container, user_repository):
        """Given nonexistent user, when deleting, then returns False."""
        from azure.cosmos.exceptions import CosmosResourceNotFoundError
        
        mock_container.delete_item = AsyncMock(
            side_effect=CosmosResourceNotFoundError(status_code=404, message="Not found")
        )
        cosmos_service._containers["auth"] = mock_container
        
        result = await user_repository.delete("nonexistent")
        
        assert result is False


# ============================================================================
# TEST: get_job
# ============================================================================

class TestGetJob:
    """Tests for job retrieval."""
    
    @pytest.mark.asyncio
    async def test_returns_job_when_found(self, cosmos_service, mock_container, job_repository):
        """Given existing job, when getting, then returns job."""
        job = create_job()
        mock_container.read_item = AsyncMock(return_value=job)
        cosmos_service._containers["jobs"] = mock_container
        
        result = await job_repository.get_by_id("job_123")
        
        assert result is not None
        assert result["id"] == "job_123"
    
    @pytest.mark.asyncio
    async def test_returns_none_when_not_found(self, cosmos_service, mock_container, job_repository):
        """Given nonexistent job, when getting, then returns None."""
        from azure.cosmos.exceptions import CosmosResourceNotFoundError
        
        mock_container.read_item = AsyncMock(
            side_effect=CosmosResourceNotFoundError(status_code=404, message="Not found")
        )
        cosmos_service._containers["jobs"] = mock_container
        
        result = await job_repository.get_by_id("nonexistent")
        
        assert result is None


# ============================================================================
# TEST: create_job
# ============================================================================

class TestCreateJob:
    """Tests for job creation."""
    
    @pytest.mark.asyncio
    async def test_creates_job_successfully(self, cosmos_service, mock_container, job_repository):
        """Given valid job data, when creating, then creates job."""
        job_doc = create_job()
        mock_container.create_item = AsyncMock(return_value=job_doc)
        cosmos_service._containers["jobs"] = mock_container
        
        result = await job_repository.create(job_doc)
        
        assert result["id"] == "job_123"


# ============================================================================
# TEST: update_job
# ============================================================================

class TestUpdateJob:
    """Tests for job update."""
    
    @pytest.mark.asyncio
    async def test_updates_job_successfully(self, cosmos_service, mock_container, job_repository):
        """Given valid job, when updating, then updates job."""
        updated_job = create_job(status="completed")
        mock_container.replace_item = AsyncMock(return_value=updated_job)
        cosmos_service._containers["jobs"] = mock_container
        
        result = await job_repository.replace("job_123", updated_job)
        
        assert result["status"] == "completed"


# ============================================================================
# TEST: User Caching
# ============================================================================

class TestUserCaching:
    """Tests for user caching behavior."""
    
    @pytest.mark.asyncio
    async def test_invalidates_cache_on_update(self, cosmos_service, mock_container, user_repository):
        """Given cached user, when updating, then invalidates cache."""
        user = create_user()
        updated_user = {**user, "permission": "Admin"}
        
        mock_container.read_item = AsyncMock(return_value=user)
        mock_container.replace_item = AsyncMock(return_value=updated_user)
        cosmos_service._containers["auth"] = mock_container
        
        # Cache the user
        await user_repository.get_by_id("user_123")
        assert user_repository._get_cached_user_by_id("user_123") is not None
        
        # Update should invalidate cache
        await user_repository.update("user_123", {"permission": "Admin"})
        
        # Cache should be refreshed with new data
        cached = user_repository._get_cached_user_by_id("user_123")
        assert cached is not None
        assert cached["permission"] == "Admin"
    
    @pytest.mark.asyncio
    async def test_normalizes_email_for_cache(self, cosmos_service, mock_container, user_repository):
        """Given email with varied case, when caching, then normalizes."""
        user = create_user(email="User@Example.COM")
        
        async def mock_query(*args, **kwargs):
            yield user
        
        mock_container.query_items = MagicMock(return_value=mock_query())
        cosmos_service._containers["auth"] = mock_container
        
        # Fetch with original case
        await user_repository.get_by_email("User@Example.COM")
        
        # Should find in cache with different case
        cached = user_repository._get_cached_user_by_email("user@example.com")
        assert cached is not None


# ============================================================================
# TEST: Permission Caching
# ============================================================================

class TestPermissionCaching:
    """Tests for permission caching behavior."""
    
    @pytest.mark.asyncio
    async def test_caches_user_permission(self, cosmos_service, mock_container, user_repository):
        """Given user with permission, when fetching, then caches permission."""
        user = create_user(permission="Editor")
        mock_container.read_item = AsyncMock(return_value=user)
        cosmos_service._containers["auth"] = mock_container
        
        # Mock permission cache
        await user_repository.get_by_id("user_123")
        
        # Should have cached the permission
        user_repository._permission_cache.set_user_permission.assert_called()


# ============================================================================
# TEST: get_users_by_permission
# ============================================================================

class TestGetUsersByPermission:
    """Tests for getting users by permission level."""
    
    @pytest.mark.asyncio
    async def test_returns_users_with_permission(self, cosmos_service, mock_container, user_repository):
        """Given users with permission, when getting by permission, then returns them."""
        users = [
            create_user(user_id="admin_1", permission="Admin"),
            create_user(user_id="admin_2", permission="Admin"),
        ]
        
        async def mock_query(*args, **kwargs):
            for user in users:
                yield user
        
        mock_container.query_items = MagicMock(return_value=mock_query())
        cosmos_service._containers["auth"] = mock_container
        result = await user_repository.get_by_permission("Admin")
        
        assert len(result) == 2
    
    @pytest.mark.asyncio
    async def test_returns_empty_for_invalid_permission(self, user_repository):
        """Given empty permission, when getting users, then returns empty list."""
        result = await user_repository.get_by_permission("")
        
        assert result == []
