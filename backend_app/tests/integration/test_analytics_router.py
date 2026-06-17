"""Integration-level checks for analytics route wiring."""
from unittest.mock import AsyncMock

import pytest


class TestAnalyticsReadRoutes:
    @pytest.mark.asyncio
    async def test_user_analytics_route_delegates_to_read_workflow(self):
        from app.api.v1.routes.analytics import get_user_analytics

        read_workflow = AsyncMock()
        read_workflow.get_user_analytics.return_value = {"user_id": "user-123", "total_sessions": 15}

        result = await get_user_analytics(
            user_id="user-123",
            days=30,
            limit=1000,
            offset=0,
            current_user={"id": "admin-1", "permission": "Admin"},
            read_workflow=read_workflow,
        )

        assert result["user_id"] == "user-123"
        read_workflow.get_user_analytics.assert_awaited_once_with(
            user_id="user-123",
            days=30,
            limit=1000,
            offset=0,
        )

    @pytest.mark.asyncio
    async def test_user_session_summary_route_delegates_to_read_workflow(self):
        from app.api.v1.routes.analytics import get_user_session_summary

        read_workflow = AsyncMock()
        read_workflow.get_user_session_summary.return_value = {"total_sessions": 10}

        result = await get_user_session_summary(
            user_id="user-123",
            days=30,
            limit=1000,
            offset=0,
            current_user={"id": "admin-1", "permission": "Admin"},
            read_workflow=read_workflow,
        )

        assert result["total_sessions"] == 10
        read_workflow.get_user_session_summary.assert_awaited_once_with(
            user_id="user-123",
            days=30,
            limit=1000,
            offset=0,
        )

    @pytest.mark.asyncio
    async def test_user_session_analytics_route_delegates_to_read_workflow(self):
        from app.api.v1.routes.analytics import get_user_session_analytics

        read_workflow = AsyncMock()
        read_workflow.get_user_session_analytics.return_value = {"sessions": [{"session_id": "s-1"}]}

        result = await get_user_session_analytics(
            user_id="user-123",
            days=30,
            limit=1000,
            offset=0,
            current_user={"id": "admin-1", "permission": "Admin"},
            read_workflow=read_workflow,
        )

        assert result["sessions"][0]["session_id"] == "s-1"
        read_workflow.get_user_session_analytics.assert_awaited_once_with(
            user_id="user-123",
            days=30,
            limit=1000,
            offset=0,
        )

    @pytest.mark.asyncio
    async def test_detailed_minutes_and_system_routes_delegate_to_read_workflow(self):
        from app.api.v1.routes.analytics import (
            get_system_analytics,
            get_user_detailed_sessions,
            get_user_minutes,
        )

        read_workflow = AsyncMock()
        read_workflow.get_user_detailed_sessions.return_value = {"sessions": []}
        read_workflow.get_user_minutes.return_value = {"total_minutes": 9.0}
        read_workflow.get_system_analytics.return_value = {"total_users": 100}
        current_user = {"id": "admin-1", "permission": "Admin"}

        assert (
            await get_user_detailed_sessions(
                user_id="user-123",
                days=7,
                limit=50,
                include_audit=True,
                current_user=current_user,
                read_workflow=read_workflow,
            )
        )["sessions"] == []
        assert (
            await get_user_minutes(
                user_id="user-123",
                days=30,
                current_user=current_user,
                read_workflow=read_workflow,
            )
        )["total_minutes"] == 9.0
        assert (
            await get_system_analytics(
                days=30,
                business_unit_id=None,
                current_user=current_user,
                read_workflow=read_workflow,
            )
        )["total_users"] == 100

        read_workflow.get_user_detailed_sessions.assert_awaited_once_with(
            user_id="user-123",
            days=7,
            limit=50,
            include_audit=True,
        )
        read_workflow.get_user_minutes.assert_awaited_once_with(user_id="user-123", days=30)
        read_workflow.get_system_analytics.assert_awaited_once_with(
            days=30,
            business_unit_id=None,
            current_user=current_user,
        )


class TestAnalyticsExportRoutes:
    @pytest.mark.asyncio
    async def test_export_system_prompts_route_delegates_to_export_workflow(self):
        from app.api.v1.routes.analytics import export_system_prompts

        export_workflow = AsyncMock()
        export_workflow.export_system_prompts.return_value = "response"
        current_user = {"id": "admin-1", "permission": "Admin"}

        result = await export_system_prompts(
            days=30,
            business_unit_id=None,
            current_user=current_user,
            export_workflow=export_workflow,
        )

        assert result == "response"
        export_workflow.export_system_prompts.assert_awaited_once_with(
            days=30,
            business_unit_id=None,
            current_user=current_user,
        )
