from __future__ import annotations

import asyncio
import copy
import time
from typing import Any, AsyncIterator, Dict, List, Optional

from azure.cosmos.exceptions import CosmosResourceNotFoundError

from ..core.cosmos import CosmosService
from ..core.logging import get_logger
from ..utils.permission_cache import BasePermissionCache, get_permission_cache


logger = get_logger(__name__)

try:  # pragma: no cover - optional dependency
    from redis.exceptions import RedisError
except ImportError:  # pragma: no cover - redis is optional for in-memory cache deployments
    RedisError = None

PERMISSION_CACHE_OPERATION_ERRORS = (
    RuntimeError,
    TypeError,
    ValueError,
) + ((RedisError,) if RedisError is not None else ())


class UserRepository:
    """Cosmos persistence for user records."""

    _USER_CACHE_TTL_SECONDS = 60.0

    def __init__(
        self,
        cosmos_service: CosmosService,
        permission_cache: Optional[BasePermissionCache] = None,
    ):
        self.cosmos = cosmos_service
        self._user_cache_by_id: Dict[str, tuple[float, Dict[str, Any]]] = {}
        self._user_cache_by_email: Dict[str, tuple[float, Dict[str, Any]]] = {}
        self._user_cache_lock = asyncio.Lock()
        self._permission_cache = permission_cache or get_permission_cache(cosmos_service.config)

    @property
    def container(self):
        return self.cosmos.get_container("auth")

    async def get_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        cached = self._get_cached_user_by_id(user_id)
        if cached is not None:
            return cached

        try:
            item = await self.container.read_item(item=user_id, partition_key=user_id)
            if item.get("type") != "user":
                return None
            await self._cache_user(item)
            return copy.deepcopy(item)
        except CosmosResourceNotFoundError:
            return None

    async def get_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        cached = self._get_cached_user_by_email(email)
        if cached is not None:
            return cached

        query_iterator = self.container.query_items(
            query="SELECT TOP 1 * FROM c WHERE c.type = 'user' AND (LOWER(c.email) = LOWER(@email) OR c.email = @email)",
            parameters=[{"name": "@email", "value": email}],
        )
        items = [item async for item in query_iterator]
        if not items:
            return None
        user = items[0]
        if user.get("type") != "user":
            return None
        await self._cache_user(user)
        return copy.deepcopy(user)

    async def get_by_entra_identity(
        self,
        *,
        tenant_id: str,
        object_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Return a user linked to the given Entra tenant/object identity."""
        query_iterator = self.container.query_items(
            query=(
                "SELECT TOP 1 * FROM c WHERE c.type = 'user' "
                "AND c.microsoft_oid = @oid AND c.microsoft_tid = @tid"
            ),
            parameters=[
                {"name": "@oid", "value": object_id},
                {"name": "@tid", "value": tenant_id},
            ],
        )
        items = [item async for item in query_iterator]
        if not items:
            return None

        user = items[0]
        await self._cache_user(user)
        return copy.deepcopy(user)

    async def list(self, *, limit: Optional[int] = None, offset: int = 0) -> Dict[str, Any]:
        if limit:
            query = "SELECT * FROM c WHERE c.type = 'user' OFFSET @offset LIMIT @limit"
            params = [{"name": "@offset", "value": int(offset)}, {"name": "@limit", "value": int(limit)}]
        else:
            query = "SELECT * FROM c WHERE c.type = 'user'"
            params = None

        query_iterator = self.container.query_items(query=query, parameters=params)
        items = [item async for item in query_iterator]

        count_iterator = self.container.query_items(query="SELECT VALUE COUNT(1) FROM c WHERE c.type = 'user'")
        count_items = [item async for item in count_iterator]
        total = count_items[0] if count_items else len(items)

        return {
            "items": items,
            "total": total,
            "limit": limit or total,
            "offset": offset,
        }

    async def iter_all(self) -> AsyncIterator[Dict[str, Any]]:
        query_iterator = self.container.query_items(query="SELECT * FROM c WHERE c.type = 'user'")
        async for item in query_iterator:
            yield item

    async def search(self, *, query: str, limit: int, offset: int) -> Dict[str, Any]:
        search_text = (query or "").strip()
        where_clause = "c.type = 'user'"
        params: List[Dict[str, Any]] = []
        if search_text:
            where_clause += " AND (CONTAINS(LOWER(c.email), @search_term) OR CONTAINS(LOWER(c.name), @search_term))"
            params.append({"name": "@search_term", "value": search_text.lower()})

        count_iterator = self.container.query_items(
            query=f"SELECT VALUE COUNT(1) FROM c WHERE {where_clause}",
            parameters=params,
        )
        count_items = [item async for item in count_iterator]
        total = count_items[0] if count_items else 0

        search_params = params + [
            {"name": "@offset", "value": int(offset)},
            {"name": "@limit", "value": int(limit)},
        ]
        query_iterator = self.container.query_items(
            query=f"""
            SELECT c.id, c.email, c.name, c.permission, c.permission_level,
                   c.business_unit_id, c.business_unit_ids, c.business_unit_names
            FROM c
            WHERE {where_clause}
            ORDER BY c.email
            OFFSET @offset LIMIT @limit
            """,
            parameters=search_params,
        )
        users = [item async for item in query_iterator]

        return {
            "users": users,
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": offset + limit < total,
        }

    async def create(self, user_doc: Dict[str, Any]) -> Dict[str, Any]:
        created = await self.container.create_item(body=user_doc)
        await self._cache_user(created)
        return created

    async def update(self, user_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        await self._invalidate_user_cache(user_id=user_id)

        existing = await self.get_by_id(user_id)
        if not existing:
            raise ValueError(f"User with id {user_id} not found")

        old_permission = existing.get("permission")
        new_permission = updates.get("permission")
        if new_permission and old_permission != new_permission:
            await self._invalidate_permission_cache(permission=old_permission)
            await self._invalidate_permission_cache(permission=new_permission)
        await self._invalidate_permission_cache(user_id=user_id)

        existing.update(updates)
        replaced = await self.container.replace_item(item=existing.get("id"), body=existing)
        await self._cache_user(replaced)
        await self._invalidate_auth_resolution_cache(user_id=user_id)
        return replaced

    async def delete(self, user_id: str) -> bool:
        try:
            await self.container.delete_item(item=user_id, partition_key=user_id)
            await self._invalidate_user_cache(user_id=user_id)
            await self._invalidate_permission_cache(user_id=user_id)
            await self._invalidate_auth_resolution_cache(user_id=user_id)
            return True
        except CosmosResourceNotFoundError:
            await self._invalidate_user_cache(user_id=user_id)
            await self._invalidate_auth_resolution_cache(user_id=user_id)
            return False

    async def get_by_permission(self, permission: str, *, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        if not permission:
            return []

        cached = await self._get_cached_users_by_permission(permission)
        if cached is not None and (limit is None or len(cached) <= limit):
            return cached if limit is None else cached[:limit]

        base_query = "SELECT c.id, c.email, c.permission, c.business_unit_id, c.business_unit_ids, c.business_unit_names FROM c WHERE c.type = 'user' AND c.permission = @permission"
        query = f"{base_query} OFFSET 0 LIMIT {int(limit)}" if limit else base_query
        query_iterator = self.container.query_items(
            query=query,
            parameters=[{"name": "@permission", "value": permission}],
        )
        users = [item async for item in query_iterator]
        for user in users:
            user.pop("hashed_password", None)

        await self._set_cached_users_by_permission(permission, users)
        return users

    def _get_cached_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        entry = self._user_cache_by_id.get(user_id)
        if not entry:
            return None
        cached_at, user_doc = entry
        if time.monotonic() - cached_at > self._USER_CACHE_TTL_SECONDS:
            self._user_cache_by_id.pop(user_id, None)
            return None
        return copy.deepcopy(user_doc)

    def _get_cached_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        key = self._normalize_email(email)
        if not key:
            return None
        entry = self._user_cache_by_email.get(key)
        if not entry:
            return None
        cached_at, user_doc = entry
        if time.monotonic() - cached_at > self._USER_CACHE_TTL_SECONDS:
            self._user_cache_by_email.pop(key, None)
            return None
        return copy.deepcopy(user_doc)

    async def _cache_user(self, user_doc: Dict[str, Any]) -> None:
        await self._cache_user_doc(user_doc)
        await self._cache_user_permission(user_doc)

    async def _invalidate_user_cache(self, **kwargs: Any) -> None:
        user_id = kwargs.get("user_id")
        email = kwargs.get("email")
        email_key = self._normalize_email(email)
        async with self._user_cache_lock:
            cached_entry = None
            if user_id and user_id in self._user_cache_by_id:
                cached_entry = self._user_cache_by_id.pop(user_id, None)

            if not email_key and cached_entry:
                cached_user = cached_entry[1]
                email_key = self._normalize_email(cached_user.get("email"))

            if email_key:
                self._user_cache_by_email.pop(email_key, None)

    async def _invalidate_permission_cache(self, **kwargs: Any) -> None:
        user_id = kwargs.get("user_id")
        permission = kwargs.get("permission")
        try:
            if user_id:
                await self._permission_cache.invalidate_user_cache(user_id)
            if permission:
                await self._permission_cache.invalidate_permission_level_cache(permission)
        except PERMISSION_CACHE_OPERATION_ERRORS as exc:
            logger.debug(
                "user_repository.permission_cache_invalidate_failed",
                user_id=user_id,
                permission=permission,
                error=str(exc),
                exc_info=True,
            )

    async def _invalidate_auth_resolution_cache(self, *, user_id: Optional[str]) -> None:
        if not user_id:
            return
        try:
            from ..core.auth import clear_resolved_auth_user_cache_for_user

            await clear_resolved_auth_user_cache_for_user(user_id)
        except (RuntimeError, TypeError, ValueError) as exc:
            logger.debug(
                "user_repository.auth_cache_invalidate_failed",
                user_id=user_id,
                error=str(exc),
                exc_info=True,
            )

    async def _get_cached_users_by_permission(self, permission: str) -> Optional[List[Dict[str, Any]]]:
        return await self._permission_cache.get_users_by_permission(permission)

    async def _set_cached_users_by_permission(self, permission: str, users: List[Dict[str, Any]]) -> None:
        await self._permission_cache.set_users_by_permission(permission, users)

    def _normalize_email(self, email: Optional[str]) -> Optional[str]:
        if isinstance(email, str):
            normalized = email.strip().lower()
            return normalized or None
        return None

    async def _cache_user_doc(self, user_doc: Dict[str, Any]) -> None:
        user_id = user_doc.get("id")
        email_key = self._normalize_email(user_doc.get("email"))
        if not user_id and not email_key:
            return

        user_copy = copy.deepcopy(user_doc)
        cached_at = time.monotonic()

        async with self._user_cache_lock:
            if user_id:
                self._user_cache_by_id[user_id] = (cached_at, user_copy)
            if email_key:
                self._user_cache_by_email[email_key] = (cached_at, user_copy)

    async def _cache_user_permission(self, user_doc: Dict[str, Any]) -> None:
        if not user_doc:
            return
        user_id = user_doc.get("id")
        permission = user_doc.get("permission")
        if not user_id or permission is None:
            return
        try:
            await self._permission_cache.set_user_permission(user_id, permission)
        except PERMISSION_CACHE_OPERATION_ERRORS as exc:
            logger.debug(
                "user_repository.user_permission_cache_store_failed",
                user_id=user_id,
                permission=permission,
                error=str(exc),
                exc_info=True,
            )
