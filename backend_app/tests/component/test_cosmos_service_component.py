"""
Component tests for CosmosService.

These tests exercise CosmosService behavior using the in-memory fake,
verifying user and job management without a real Cosmos DB connection.

Test focus:
- User CRUD operations
- User lookup by email (case-insensitive)
- User permission queries
- Cache behavior and invalidation
- Job CRUD operations
"""

import pytest
import pytest_asyncio
from datetime import datetime, timezone

# Mark all tests in this module as component tests
pytestmark = pytest.mark.component


# ============================================================================
# FIXTURES
# ============================================================================

@pytest_asyncio.fixture
async def cosmos_fake():
    """Provide an in-memory Cosmos DB fake."""
    from tests.common.fakes import InMemoryCosmosFake
    
    fake = InMemoryCosmosFake()
    await fake.initialize()
    yield fake
    await fake.clear_all()


# ============================================================================
# TEST: User CRUD Operations
# ============================================================================

class TestUserCrud:
    """Tests for user create, read, update, delete operations."""
    
    @pytest.mark.asyncio
    async def test_create_user(self, cosmos_fake):
        """Given a user doc, when creating, then user is persisted."""
        from tests.common.factories import user_factory
        
        user = user_factory(id="new-user", email="new@example.com")
        
        created = await cosmos_fake.create_user(user)
        
        assert created["id"] == "new-user"
        assert created["email"] == "new@example.com"
        
        # Verify persistence
        retrieved = await cosmos_fake.get_user_by_id("new-user")
        assert retrieved is not None
        assert retrieved["email"] == "new@example.com"
    
    @pytest.mark.asyncio
    async def test_create_user_with_duplicate_id_fails(self, cosmos_fake):
        """Given a user exists, when creating another with same id, then fails."""
        from tests.common.factories import user_factory
        
        user = user_factory(id="existing-user")
        await cosmos_fake.create_user(user)
        
        duplicate = user_factory(id="existing-user", email="different@example.com")
        
        with pytest.raises(Exception, match="already exists"):
            await cosmos_fake.create_user(duplicate)
    
    @pytest.mark.asyncio
    async def test_get_user_by_id(self, cosmos_fake):
        """Given a user exists, when getting by id, then returns user."""
        from tests.common.factories import user_factory
        
        user = user_factory(id="test-user-id")
        await cosmos_fake.create_user(user)
        
        retrieved = await cosmos_fake.get_user_by_id("test-user-id")
        
        assert retrieved is not None
        assert retrieved["id"] == "test-user-id"
    
    @pytest.mark.asyncio
    async def test_get_user_by_id_returns_none_for_nonexistent(self, cosmos_fake):
        """Given no user exists, when getting by id, then returns None."""
        result = await cosmos_fake.get_user_by_id("nonexistent")
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_get_user_by_email(self, cosmos_fake):
        """Given a user exists, when getting by email, then returns user."""
        from tests.common.factories import user_factory
        
        user = user_factory(email="findme@example.com")
        await cosmos_fake.create_user(user)
        
        retrieved = await cosmos_fake.get_user_by_email("findme@example.com")
        
        assert retrieved is not None
        assert retrieved["email"] == "findme@example.com"
    
    @pytest.mark.asyncio
    async def test_get_user_by_email_case_insensitive(self, cosmos_fake):
        """Given a user exists, when getting by email with different case, then returns user."""
        from tests.common.factories import user_factory
        
        user = user_factory(email="CamelCase@Example.COM")
        await cosmos_fake.create_user(user)
        
        # Query with lowercase
        retrieved = await cosmos_fake.get_user_by_email("camelcase@example.com")
        
        assert retrieved is not None
        assert retrieved["email"] == "CamelCase@Example.COM"
    
    @pytest.mark.asyncio
    async def test_update_user(self, cosmos_fake):
        """Given a user exists, when updating fields, then user is updated."""
        from tests.common.factories import user_factory
        
        user = user_factory(id="update-user", name="Original Name", permission="user")
        await cosmos_fake.create_user(user)
        
        updated = await cosmos_fake.update_user("update-user", {
            "name": "Updated Name",
            "permission": "admin",
        })
        
        assert updated["name"] == "Updated Name"
        assert updated["permission"] == "admin"
        
        # Verify persistence
        retrieved = await cosmos_fake.get_user_by_id("update-user")
        assert retrieved["name"] == "Updated Name"
    
    @pytest.mark.asyncio
    async def test_update_nonexistent_user_raises(self, cosmos_fake):
        """Given no user exists, when updating, then raises ValueError."""
        with pytest.raises(ValueError, match="not found"):
            await cosmos_fake.update_user("nonexistent", {"name": "New Name"})
    
    @pytest.mark.asyncio
    async def test_delete_user(self, cosmos_fake):
        """Given a user exists, when deleting, then user is removed."""
        from tests.common.factories import user_factory
        
        user = user_factory(id="delete-user")
        await cosmos_fake.create_user(user)
        
        result = await cosmos_fake.delete_user("delete-user")
        
        assert result is True
        
        # Verify deletion
        retrieved = await cosmos_fake.get_user_by_id("delete-user")
        assert retrieved is None
    
    @pytest.mark.asyncio
    async def test_delete_nonexistent_user_returns_false(self, cosmos_fake):
        """Given no user exists, when deleting, then returns False."""
        result = await cosmos_fake.delete_user("nonexistent")
        
        assert result is False


# ============================================================================
# TEST: User Queries
# ============================================================================

class TestUserQueries:
    """Tests for querying users."""
    
    @pytest.mark.asyncio
    async def test_get_all_users(self, cosmos_fake):
        """Given multiple users exist, when getting all, then returns all users."""
        from tests.common.factories import user_factory
        
        for i in range(5):
            await cosmos_fake.create_user(user_factory(id=f"user-{i}"))
        
        result = await cosmos_fake.get_all_users()
        
        assert result["total"] == 5
        assert len(result["items"]) == 5
    
    @pytest.mark.asyncio
    async def test_get_all_users_with_pagination(self, cosmos_fake):
        """Given many users exist, when using limit/offset, then returns correct page."""
        from tests.common.factories import user_factory
        
        for i in range(10):
            await cosmos_fake.create_user(user_factory(id=f"user-{i}"))
        
        result = await cosmos_fake.get_all_users(limit=3, offset=2)
        
        assert result["total"] == 10
        assert len(result["items"]) == 3
        assert result["offset"] == 2
    
    @pytest.mark.asyncio
    async def test_get_all_users_iterator(self, cosmos_fake):
        """Given users exist, when iterating, then yields all users."""
        from tests.common.factories import user_factory
        
        for i in range(3):
            await cosmos_fake.create_user(user_factory(id=f"iter-user-{i}"))
        
        users = []
        async for user in cosmos_fake.get_all_users_iterator():
            users.append(user)
        
        assert len(users) == 3
    
    @pytest.mark.asyncio
    async def test_get_users_by_permission(self, cosmos_fake):
        """Given users with different permissions, when filtering, then returns matching."""
        from tests.common.factories import user_factory
        
        await cosmos_fake.create_user(user_factory(id="admin-1", permission="admin"))
        await cosmos_fake.create_user(user_factory(id="admin-2", permission="admin"))
        await cosmos_fake.create_user(user_factory(id="user-1", permission="user"))
        
        admins = await cosmos_fake.get_users_by_permission("admin")
        
        assert len(admins) == 2
        assert all(u["permission"] == "admin" for u in admins)
    
    @pytest.mark.asyncio
    async def test_get_users_by_permission_with_limit(self, cosmos_fake):
        """Given many users with permission, when limiting, then returns limited set."""
        from tests.common.factories import user_factory
        
        for i in range(5):
            await cosmos_fake.create_user(user_factory(id=f"admin-{i}", permission="admin"))
        
        result = await cosmos_fake.get_users_by_permission("admin", limit=2)
        
        assert len(result) == 2
    
    @pytest.mark.asyncio
    async def test_get_user_permission(self, cosmos_fake):
        """Given a user exists, when getting permission, then returns permission level."""
        from tests.common.factories import user_factory
        
        await cosmos_fake.create_user(user_factory(id="perm-user", permission="superuser"))
        
        permission = await cosmos_fake.get_user_permission("perm-user")
        
        assert permission == "superuser"
    
    @pytest.mark.asyncio
    async def test_get_user_permission_returns_none_for_nonexistent(self, cosmos_fake):
        """Given no user exists, when getting permission, then returns None."""
        permission = await cosmos_fake.get_user_permission("nonexistent")
        
        assert permission is None


# ============================================================================
# TEST: Job CRUD Operations
# ============================================================================

class TestJobCrud:
    """Tests for job repository persistence operations."""
    
    @pytest.mark.asyncio
    async def test_create_job(self, cosmos_fake):
        """Given a job doc, when creating, then job is persisted."""
        from app.repositories.jobs import JobRepository
        from tests.common.factories import job_factory
        
        repository = JobRepository(cosmos_fake)
        job = job_factory(id="new-job", user_id="user-1", status="uploaded")
        
        created = await repository.create(job)
        
        assert created["id"] == "new-job"
        assert created["status"] == "uploaded"
    
    @pytest.mark.asyncio
    async def test_get_job_by_id(self, cosmos_fake):
        """Given a job exists, when getting by id, then returns job."""
        from app.repositories.jobs import JobRepository
        from tests.common.factories import job_factory
        
        repository = JobRepository(cosmos_fake)
        job = job_factory(id="retrieve-job")
        await repository.create(job)
        
        retrieved = await repository.get_by_id("retrieve-job")
        
        assert retrieved is not None
        assert retrieved["id"] == "retrieve-job"
    
    @pytest.mark.asyncio
    async def test_get_job_returns_none_for_nonexistent(self, cosmos_fake):
        """Given no job exists, when getting by id, then returns None."""
        from app.repositories.jobs import JobRepository

        result = await JobRepository(cosmos_fake).get_by_id("nonexistent")
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_update_job(self, cosmos_fake):
        """Given a job exists, when updating, then job is updated."""
        from app.repositories.jobs import JobRepository
        from tests.common.factories import job_factory
        
        repository = JobRepository(cosmos_fake)
        job = job_factory(id="update-job", status="uploaded")
        await repository.create(job)
        
        job["status"] = "complete"
        updated = await repository.replace("update-job", job)
        
        assert updated["status"] == "complete"
        
        retrieved = await repository.get_by_id("update-job")
        assert retrieved["status"] == "complete"


# ============================================================================
# TEST: Container Properties
# ============================================================================

class TestContainerProperties:
    """Tests for container property accessors."""
    
    @pytest.mark.asyncio
    async def test_get_jobs_container(self, cosmos_fake):
        """Given cosmos fake, when resolving jobs container, then returns container."""
        container = cosmos_fake.get_container("jobs")
        
        assert container is not None
        assert container.name == "jobs"
    
    @pytest.mark.asyncio
    async def test_users_container_property(self, cosmos_fake):
        """Given cosmos fake, when accessing users_container, then returns auth container."""
        container = cosmos_fake.users_container
        
        assert container is not None
        assert container.name == "auth"
    
# ============================================================================
# TEST: Helper Methods
# ============================================================================

class TestHelperMethods:
    """Tests for helper methods."""
    
    @pytest.mark.asyncio
    async def test_seed_data(self, cosmos_fake):
        """Given users and jobs, when seeding, then all data is created."""
        from app.repositories.jobs import JobRepository
        from tests.common.factories import user_factory, job_factory
        
        users = [user_factory(id=f"seed-user-{i}") for i in range(2)]
        jobs = [job_factory(id=f"seed-job-{i}") for i in range(3)]
        
        await cosmos_fake.seed_data(users=users, jobs=jobs)
        job_repository = JobRepository(cosmos_fake)
        
        # Verify users
        for user in users:
            retrieved = await cosmos_fake.get_user_by_id(user["id"])
            assert retrieved is not None
        
        # Verify jobs
        for job in jobs:
            retrieved = await job_repository.get_by_id(job["id"])
            assert retrieved is not None
    
    @pytest.mark.asyncio
    async def test_clear_all(self, cosmos_fake):
        """Given data exists, when clearing, then all data is removed."""
        from app.repositories.jobs import JobRepository
        from tests.common.factories import user_factory, job_factory
        
        job_repository = JobRepository(cosmos_fake)
        
        await cosmos_fake.create_user(user_factory(id="clear-user"))
        await job_repository.create(job_factory(id="clear-job"))
        
        await cosmos_fake.clear_all()
        
        assert await cosmos_fake.get_user_by_id("clear-user") is None
        assert await job_repository.get_by_id("clear-job") is None
    
    @pytest.mark.asyncio
    async def test_is_available(self, cosmos_fake):
        """Given initialized fake, when checking availability, then returns True."""
        assert cosmos_fake.is_available() is True
