"""HTTP-adjacent analytics read workflows owned outside the route module."""
from __future__ import annotations

from typing import Any, Optional

from ...core.auth import resolve_analytics_business_unit_scope
from ...models.analytics_models import UserAnalyticsResponse
from ...utils.cache_utils import TTLCache
from .analytics_service import AnalyticsService


_analytics_cache = TTLCache[UserAnalyticsResponse](default_ttl=30.0)


class AnalyticsReadWorkflowService:
    def __init__(self, analytics_service: AnalyticsService) -> None:
        self.analytics_service = analytics_service

    async def get_user_analytics(
        self,
        *,
        user_id: str,
        days: int,
        limit: int,
        offset: int,
    ) -> dict[str, Any]:
        cache_key = f"user_analytics:{id(self.analytics_service)}:{user_id}:{days}:{limit}:{offset}"

        async def compute_analytics() -> dict[str, Any]:
            return await self.analytics_service.get_user_analytics_details(
                user_id=user_id,
                days=days,
                limit=limit,
                offset=offset,
            )

        return await _analytics_cache.get_or_compute(cache_key, compute_analytics)

    async def get_user_session_summary(
        self,
        *,
        user_id: str,
        days: int,
        limit: int,
        offset: int,
    ) -> dict[str, Any]:
        cache_key = f"user_session_summary:{id(self.analytics_service)}:{user_id}:{days}:{limit}:{offset}"

        async def compute_session_summary() -> dict[str, Any]:
            return await self.analytics_service.get_user_session_summary(
                user_id=user_id,
                days=days,
                limit=limit,
                offset=offset,
            )

        return await _analytics_cache.get_or_compute(cache_key, compute_session_summary)

    async def get_user_session_analytics(
        self,
        *,
        user_id: str,
        days: int,
        limit: int,
        offset: int,
    ) -> dict[str, Any]:
        cache_key = f"user_session_analytics:{id(self.analytics_service)}:{user_id}:{days}:{limit}:{offset}"

        async def compute_session_analytics() -> dict[str, Any]:
            return await self.analytics_service.get_user_session_analytics(
                user_id=user_id,
                days=days,
                limit=limit,
                offset=offset,
            )

        return await _analytics_cache.get_or_compute(cache_key, compute_session_analytics)

    async def get_admin_sessions(
        self,
        *,
        days: int,
        status: Optional[str],
        user_id: Optional[str],
        limit: int,
        offset: int,
    ) -> dict[str, Any]:
        return await self.analytics_service.get_admin_sessions(
            days=days,
            status=status,
            user_id=user_id,
            limit=limit,
            offset=offset,
        )

    async def get_user_detailed_sessions(
        self,
        *,
        user_id: str,
        days: int,
        limit: int,
        include_audit: bool,
    ) -> dict[str, Any]:
        return await self.analytics_service.get_user_detailed_sessions(
            user_id=user_id,
            days=days,
            limit=limit,
            include_audit=include_audit,
        )

    async def get_user_sessions(
        self,
        *,
        user_id: str,
        days: int,
        status: Optional[str],
        limit: int,
        offset: int,
    ) -> dict[str, Any]:
        return await self.analytics_service.get_user_sessions(
            user_id=user_id,
            days=days,
            status=status,
            limit=limit,
            offset=offset,
        )

    async def get_user_minutes(self, *, user_id: str, days: int) -> dict[str, Any]:
        return await self.analytics_service.get_user_minutes_response(user_id=user_id, days=days)

    async def get_system_analytics(
        self,
        *,
        days: int,
        business_unit_id: Optional[str],
        current_user: dict[str, Any],
    ) -> dict[str, Any]:
        business_unit_ids = resolve_analytics_business_unit_scope(
            current_user,
            business_unit_id,
            empty_assignment_message="Editor account not assigned to any business units. Contact administrator.",
            insufficient_permission_message="Analytics access requires Editor, Moderator, or Admin permission",
        )
        return await self.analytics_service.get_system_analytics(
            days=days,
            business_unit_ids=business_unit_ids,
        )
