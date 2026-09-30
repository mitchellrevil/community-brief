from unittest.mock import AsyncMock

import pytest

from backend_app.app.core.errors.domain import ApplicationError
from backend_app.app.services.analytics.analytics_read_workflow_service import AnalyticsReadWorkflowService


@pytest.mark.asyncio
async def test_user_analytics_reads_are_cached_per_service_instance():
    analytics_service = AsyncMock()
    analytics_service.get_user_analytics_details.return_value = {"user_id": "u1", "total_sessions": 1}
    workflow = AnalyticsReadWorkflowService(analytics_service)

    first = await workflow.get_user_analytics(user_id="u1", days=30, limit=1000, offset=0)
    second = await workflow.get_user_analytics(user_id="u1", days=30, limit=1000, offset=0)

    assert first == second
    analytics_service.get_user_analytics_details.assert_awaited_once_with(
        user_id="u1",
        days=30,
        limit=1000,
        offset=0,
    )


@pytest.mark.asyncio
async def test_session_summary_and_session_analytics_delegate_to_service():
    analytics_service = AsyncMock()
    analytics_service.get_user_session_summary.return_value = {"total_sessions": 2}
    analytics_service.get_user_session_analytics.return_value = {"sessions": [{"id": "s1"}]}
    workflow = AnalyticsReadWorkflowService(analytics_service)

    assert (
        await workflow.get_user_session_summary(user_id="u1", days=7, limit=50, offset=10)
    )["total_sessions"] == 2
    assert (
        await workflow.get_user_session_analytics(user_id="u1", days=7, limit=50, offset=10)
    )["sessions"] == [{"id": "s1"}]

    analytics_service.get_user_session_summary.assert_awaited_once_with(
        user_id="u1",
        days=7,
        limit=50,
        offset=10,
    )
    analytics_service.get_user_session_analytics.assert_awaited_once_with(
        user_id="u1",
        days=7,
        limit=50,
        offset=10,
    )


@pytest.mark.asyncio
async def test_passthrough_user_read_methods_delegate_to_service():
    analytics_service = AsyncMock()
    analytics_service.get_admin_sessions.return_value = {"sessions": []}
    analytics_service.get_user_detailed_sessions.return_value = {"detailed": True}
    analytics_service.get_user_sessions.return_value = {"user_sessions": []}
    analytics_service.get_user_minutes_response.return_value = {"total_minutes": 3.5}
    workflow = AnalyticsReadWorkflowService(analytics_service)

    await workflow.get_admin_sessions(days=30, status="active", user_id="u1", limit=10, offset=5)
    await workflow.get_user_detailed_sessions(user_id="u1", days=7, limit=50, include_audit=False)
    await workflow.get_user_sessions(user_id="u1", days=30, status=None, limit=100, offset=0)
    await workflow.get_user_minutes(user_id="u1", days=30)

    analytics_service.get_admin_sessions.assert_awaited_once_with(
        days=30,
        status="active",
        user_id="u1",
        limit=10,
        offset=5,
    )
    analytics_service.get_user_detailed_sessions.assert_awaited_once_with(
        user_id="u1",
        days=7,
        limit=50,
        include_audit=False,
    )
    analytics_service.get_user_sessions.assert_awaited_once_with(
        user_id="u1",
        days=30,
        status=None,
        limit=100,
        offset=0,
    )
    analytics_service.get_user_minutes_response.assert_awaited_once_with(user_id="u1", days=30)


@pytest.mark.asyncio
async def test_system_analytics_resolves_business_unit_scope():
    analytics_service = AsyncMock()
    analytics_service.get_system_analytics.return_value = {"total_users": 5}
    workflow = AnalyticsReadWorkflowService(analytics_service)

    await workflow.get_system_analytics(
        days=30,
        business_unit_id=None,
        current_user={"permission": "Editor", "business_unit_ids": ["bu-1", "bu-2"]},
    )

    analytics_service.get_system_analytics.assert_awaited_once_with(
        days=30,
        business_unit_ids=["bu-1", "bu-2"],
    )


@pytest.mark.asyncio
async def test_system_analytics_rejects_editor_without_business_units():
    analytics_service = AsyncMock()
    workflow = AnalyticsReadWorkflowService(analytics_service)

    with pytest.raises(ApplicationError) as exc:
        await workflow.get_system_analytics(
            days=30,
            business_unit_id=None,
            current_user={"permission": "Editor", "business_unit_ids": []},
        )

    assert exc.value.status_code == 403
    analytics_service.get_system_analytics.assert_not_called()
