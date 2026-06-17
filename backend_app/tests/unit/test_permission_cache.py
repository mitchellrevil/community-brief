"""
Unit tests for permission cache utilities.

Tests for InMemoryPermissionCache behavior including:
- Get/set operations
- TTL expiration
- Invalidation
- Batch operations
"""

import pytest
import pytest_asyncio
import time
from unittest.mock import patch


# Mark all tests in this module as unit tests
pytestmark = pytest.mark.unit


# ============================================================================
# FIXTURES
# ============================================================================

@pytest_asyncio.fixture
async def cache():
    """Provide a fresh in-memory permission cache."""
    from app.utils.permission_cache import InMemoryPermissionCache
    
    return InMemoryPermissionCache(
        key_prefix="test:",
        default_ttl=300,  # 5 minutes
    )


# ============================================================================
# TEST: Basic Get/Set Operations
# ============================================================================

class TestBasicOperations:
    """Tests for basic cache get/set operations."""
    
    @pytest.mark.asyncio
    async def test_set_and_get_user_permission(self, cache):
        """Given a permission is set, when getting, then returns permission."""
        await cache.set_user_permission("user-1", "admin")
        
        result = await cache.get_user_permission("user-1")
        
        assert result == "admin"
    
    @pytest.mark.asyncio
    async def test_get_returns_none_for_missing_key(self, cache):
        """Given no permission set, when getting, then returns None."""
        result = await cache.get_user_permission("nonexistent")
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_set_overwrites_existing(self, cache):
        """Given a permission exists, when setting new value, then overwrites."""
        await cache.set_user_permission("user-1", "user")
        await cache.set_user_permission("user-1", "admin")
        
        result = await cache.get_user_permission("user-1")
        
        assert result == "admin"
    
    @pytest.mark.asyncio
    async def test_set_and_get_users_by_permission(self, cache):
        """Given users are cached by permission, when getting, then returns users."""
        users = [
            {"id": "user-1", "email": "a@test.com", "permission": "admin"},
            {"id": "user-2", "email": "b@test.com", "permission": "admin"},
        ]
        
        await cache.set_users_by_permission("admin", users)
        
        result = await cache.get_users_by_permission("admin")
        
        assert result is not None
        assert len(result) == 2
        assert result[0]["id"] == "user-1"
    
    @pytest.mark.asyncio
    async def test_get_users_by_permission_returns_none_when_empty(self, cache):
        """Given no users cached for permission, when getting, then returns None."""
        result = await cache.get_users_by_permission("superuser")
        
        assert result is None


# ============================================================================
# TEST: TTL Expiration
# ============================================================================

class TestTtlExpiration:
    """Tests for TTL-based cache expiration."""
    
    @pytest.mark.asyncio
    async def test_expired_entry_returns_none(self, cache):
        """Given a permission with short TTL, when expired, then returns None."""
        # Set with 0 TTL (immediate expiry)
        await cache.set_user_permission("user-1", "admin", ttl=0)
        
        # Small delay to ensure expiry
        time.sleep(0.01)
        
        result = await cache.get_user_permission("user-1")
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_custom_ttl_is_respected(self, cache):
        """Given custom TTL, when checking before expiry, then returns value."""
        await cache.set_user_permission("user-1", "admin", ttl=60)
        
        # Immediately check (within TTL)
        result = await cache.get_user_permission("user-1")
        
        assert result == "admin"
    
    @pytest.mark.asyncio
    async def test_users_by_permission_expiry(self, cache):
        """Given users cached with short TTL, when expired, then returns None."""
        users = [{"id": "user-1", "permission": "admin"}]
        await cache.set_users_by_permission("admin", users, ttl=0)
        
        time.sleep(0.01)
        
        result = await cache.get_users_by_permission("admin")
        
        assert result is None


# ============================================================================
# TEST: Cache Invalidation
# ============================================================================

class TestCacheInvalidation:
    """Tests for cache invalidation operations."""
    
    @pytest.mark.asyncio
    async def test_invalidate_user_cache(self, cache):
        """Given a user permission is cached, when invalidating, then returns None."""
        await cache.set_user_permission("user-1", "admin")
        
        await cache.invalidate_user_cache("user-1")
        
        result = await cache.get_user_permission("user-1")
        assert result is None
    
    @pytest.mark.asyncio
    async def test_invalidate_does_not_affect_other_users(self, cache):
        """Given multiple users cached, when invalidating one, then others remain."""
        await cache.set_user_permission("user-1", "admin")
        await cache.set_user_permission("user-2", "user")
        
        await cache.invalidate_user_cache("user-1")
        
        assert await cache.get_user_permission("user-1") is None
        assert await cache.get_user_permission("user-2") == "user"
    
    @pytest.mark.asyncio
    async def test_invalidate_permission_level_cache(self, cache):
        """Given users by permission cached, when invalidating, then returns None."""
        users = [{"id": "user-1", "permission": "admin"}]
        await cache.set_users_by_permission("admin", users)
        
        await cache.invalidate_permission_level_cache("admin")
        
        result = await cache.get_users_by_permission("admin")
        assert result is None
    
    @pytest.mark.asyncio
    async def test_invalidate_permission_does_not_affect_other_levels(self, cache):
        """Given multiple permission levels cached, when invalidating one, then others remain."""
        await cache.set_users_by_permission("admin", [{"id": "a"}])
        await cache.set_users_by_permission("user", [{"id": "b"}])
        
        await cache.invalidate_permission_level_cache("admin")
        
        assert await cache.get_users_by_permission("admin") is None
        assert await cache.get_users_by_permission("user") is not None


# ============================================================================
# TEST: Batch Operations
# ============================================================================

class TestBatchOperations:
    """Tests for batch cache operations."""
    
    @pytest.mark.asyncio
    async def test_get_multiple_permissions(self, cache):
        """Given multiple users cached, when getting multiple, then returns all."""
        await cache.set_user_permission("user-1", "admin")
        await cache.set_user_permission("user-2", "user")
        await cache.set_user_permission("user-3", "superuser")
        
        result = await cache.get_multiple_permissions(["user-1", "user-2", "user-4"])
        
        assert result["user-1"] == "admin"
        assert result["user-2"] == "user"
        assert result["user-4"] is None  # Not in cache
    
    @pytest.mark.asyncio
    async def test_set_multiple_permissions(self, cache):
        """Given permission dict, when setting multiple, then all are cached."""
        permissions = {
            "user-1": "admin",
            "user-2": "user",
            "user-3": "superuser",
        }
        
        await cache.set_multiple_permissions(permissions)
        
        assert await cache.get_user_permission("user-1") == "admin"
        assert await cache.get_user_permission("user-2") == "user"
        assert await cache.get_user_permission("user-3") == "superuser"
    
    @pytest.mark.asyncio
    async def test_get_multiple_empty_list(self, cache):
        """Given empty user list, when getting multiple, then returns empty dict."""
        result = await cache.get_multiple_permissions([])
        
        assert result == {}
    
    @pytest.mark.asyncio
    async def test_set_multiple_empty_dict(self, cache):
        """Given empty dict, when setting multiple, then no error."""
        await cache.set_multiple_permissions({})
        # Should complete without error


# ============================================================================
# TEST: Cache Info
# ============================================================================

class TestCacheInfo:
    """Tests for cache info/stats retrieval."""
    
    @pytest.mark.asyncio
    async def test_get_cache_info(self, cache):
        """Given a cache with entries, when getting info, then returns stats."""
        await cache.set_user_permission("user-1", "admin")
        await cache.set_user_permission("user-2", "user")
        
        info = await cache.get_cache_info()
        
        assert info["cache_type"] == "in_memory"
        assert info["total_permission_keys"] >= 2
        assert info["default_ttl"] == 300
    
    @pytest.mark.asyncio
    async def test_cache_info_counts_expired(self, cache):
        """Given expired entries exist, when getting info, then counts them."""
        await cache.set_user_permission("valid-user", "admin", ttl=3600)
        await cache.set_user_permission("expired-user", "user", ttl=0)
        
        time.sleep(0.01)
        
        info = await cache.get_cache_info()
        
        assert info["valid_entries"] >= 1
        assert info["expired_entries"] >= 1


# ============================================================================
# TEST: Cache Decorator
# ============================================================================

class TestCacheDecorator:
    """Tests for the cache_permission_check decorator."""
    
    @pytest.mark.asyncio
    async def test_decorator_caches_result(self, cache):
        """Given a decorated function, when called, then result is cached."""
        call_count = 0
        
        @cache.cache_permission_check()
        async def get_permission(user_id: str) -> str:
            nonlocal call_count
            call_count += 1
            return "admin"
        
        # First call
        result1 = await get_permission("user-1")
        # Second call (should use cache)
        result2 = await get_permission("user-1")
        
        assert result1 == "admin"
        assert result2 == "admin"
        assert call_count == 1  # Only called once due to caching
    
    @pytest.mark.asyncio
    async def test_decorator_returns_cached_value(self, cache):
        """Given a cached value exists, when calling decorated fn, then returns cached."""
        # Pre-populate cache
        await cache.set_user_permission("user-1", "superuser")
        
        call_count = 0
        
        @cache.cache_permission_check()
        async def get_permission(user_id: str) -> str:
            nonlocal call_count
            call_count += 1
            return "admin"  # Different value
        
        result = await get_permission("user-1")
        
        assert result == "superuser"  # Returns cached, not computed
        assert call_count == 0  # Never called
    
    @pytest.mark.asyncio
    async def test_decorator_with_custom_ttl(self, cache):
        """Given custom TTL in decorator, when caching, then uses custom TTL."""
        @cache.cache_permission_check(ttl=1)
        async def get_permission(user_id: str) -> str:
            return "admin"
        
        await get_permission("user-1")
        
        # Check it's cached
        result = await cache.get_user_permission("user-1")
        assert result == "admin"


# ============================================================================
# TEST: Factory Function
# ============================================================================

class TestFactoryFunction:
    """Tests for the get_permission_cache factory."""
    
    def test_get_permission_cache_returns_cache(self):
        """Given default settings, when getting cache, then returns cache instance."""
        from app.utils.permission_cache import InMemoryPermissionCache
        
        # Create a mock settings object
        from unittest.mock import MagicMock
        settings = MagicMock()
        settings.cache.cache_type = "memory"
        settings.cache.redis_url = None
        settings.cache.key_prefix = "test:"
        settings.cache.default_ttl = 300
        
        from app.utils.permission_cache import _create_permission_cache
        cache = _create_permission_cache(settings)
        
        assert isinstance(cache, InMemoryPermissionCache)
