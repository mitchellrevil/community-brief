"""
Component tests for AnalyticsService (analytics_service.py)

Tests for analytics operations including:
- Event tracking
- User analytics
- Session analytics
- System analytics
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List


# Mark all tests as component tests
pytestmark = pytest.mark.component


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def mock_cosmos():
    """Create a mock CosmosService with all containers."""
    cosmos = AsyncMock()

    async def empty_query(*args, **kwargs):
        if False:
            yield
    
    # Create mock containers
    containers = {
        "analytics": AsyncMock(),
        "user_sessions": AsyncMock(),
        "audit_logs": AsyncMock(),
        "auth": AsyncMock(),
        "prompts": AsyncMock(),
    }
    for container in containers.values():
        container.query_items = MagicMock(return_value=empty_query())

    cosmos.get_container = MagicMock(side_effect=lambda name: containers[name])
    cosmos.jobs_container = AsyncMock()
    
    return cosmos


@pytest.fixture
def mock_user_repository():
    """Create a mock UserRepository."""
    repository = AsyncMock()
    repository.get_by_id = AsyncMock(return_value=None)
    return repository


@pytest.fixture
def analytics_service(mock_cosmos, mock_user_repository):
    """Create an AnalyticsService with mocked dependencies."""
    from app.repositories.analytics import (
        AnalyticsAuditRepository,
        AnalyticsEventRepository,
        AnalyticsPromptRepository,
        AnalyticsReadRepository,
        AnalyticsSessionRepository,
        AnalyticsUserCountRepository,
    )
    from app.services.analytics.analytics_service import AnalyticsService
    return AnalyticsService(
        user_repository=mock_user_repository,
        analytics_read_repository=AnalyticsReadRepository(mock_cosmos),
        analytics_event_repository=AnalyticsEventRepository(mock_cosmos),
        analytics_session_repository=AnalyticsSessionRepository(mock_cosmos),
        analytics_audit_repository=AnalyticsAuditRepository(mock_cosmos),
        analytics_prompt_repository=AnalyticsPromptRepository(mock_cosmos),
        analytics_user_count_repository=AnalyticsUserCountRepository(mock_cosmos),
    )


# ============================================================================
# TEST: track_job_event
# ============================================================================

class TestTrackJobEvent:
    """Tests for job event tracking."""
    
    @pytest.mark.asyncio
    async def test_tracks_job_event_with_analytics(self, analytics_service, mock_cosmos):
        """Given job event, when tracking, then creates event and analytics."""
        mock_cosmos.get_container("analytics").create_item = AsyncMock()
        
        result = await analytics_service.track_job_event(
            job_id="job_123",
            user_id="user_123",
            event_type="job_created",
            metadata={"audio_duration_seconds": 120}
        )
        
        assert isinstance(result, str)
    
    @pytest.mark.asyncio
    async def test_converts_seconds_to_minutes(self, analytics_service, mock_cosmos):
        """Given seconds, when tracking job event, then calculates minutes."""
        mock_cosmos.get_container("analytics").create_item = AsyncMock()
        
        await analytics_service.track_job_event(
            job_id="job_123",
            user_id="user_123",
            event_type="job_created",
            metadata={"audio_duration_seconds": 120}
        )
        
        # Verify analytics doc was created with minutes
        call_args = mock_cosmos.get_container("analytics").create_item.call_args
        if call_args:
            analytics_doc = call_args[1].get("body", {})
            assert analytics_doc.get("audio_duration_minutes") == 2.0


# ============================================================================
# TEST: get_user_analytics
# ============================================================================

class TestGetUserAnalytics:
    """Tests for user analytics retrieval."""
    
    @pytest.mark.asyncio
    async def test_returns_user_analytics_from_analytics_records(
        self, analytics_service, mock_cosmos
    ):
        """Given analytics data, when getting user analytics, then returns summary."""
        async def mock_query(*args, **kwargs):
            yield {"audio_duration_minutes": 10}
            yield {"audio_duration_minutes": 20}
        
        mock_cosmos.get_container("analytics").query_items = MagicMock(side_effect=mock_query)
        
        result = await analytics_service.get_user_analytics(
            user_id="user_123",
            days=30
        )
        
        assert result["user_id"] == "user_123"
        assert "analytics" in result
        assert result["analytics"]["transcription_stats"]["total_minutes"] == 30.0
    
    @pytest.mark.asyncio
    async def test_returns_empty_when_analytics_missing(self, analytics_service, mock_cosmos):
        """Given no analytics data, when getting user analytics, then returns empty stats."""
        async def empty_query(*args, **kwargs):
            if False:
                yield
        
        mock_cosmos.get_container("analytics").query_items = MagicMock(return_value=empty_query())
        
        result = await analytics_service.get_user_analytics(
            user_id="user_123",
            days=30
        )
        
        assert result["analytics"]["transcription_stats"]["total_minutes"] == 0.0
        assert result["analytics"]["transcription_stats"]["total_jobs"] == 0


# ============================================================================
# TEST: get_user_session_summary
# ============================================================================

class TestGetUserSessionSummary:
    """Tests for user session summary."""
    
    @pytest.mark.asyncio
    async def test_returns_session_summary(self, analytics_service, mock_cosmos):
        """Given sessions, when getting summary, then returns aggregated data."""
        async def mock_session_query(*args, **kwargs):
            now = datetime.now(timezone.utc)
            yield {
                "id": "user_123",
                "user_id": "user_123",
                "type": "session",
                "status": "active",
                "created_at": (now - timedelta(days=1)).isoformat(),
                "last_activity": now.isoformat(),
                "session_ranges": [
                    {
                        "range_id": "r-1",
                        "start_time": (now - timedelta(hours=1)).isoformat(),
                        "last_activity": now.isoformat(),
                        "last_heartbeat": now.isoformat(),
                        "status": "active",
                        "activity_count": 3,
                        "total_requests": 5,
                    }
                ],
            }
        
        mock_cosmos.get_container("user_sessions").query_items = MagicMock(return_value=mock_session_query())
        
        result = await analytics_service.get_user_session_summary(
            user_id="user_123",
            days=30,
            limit=50,
            offset=0
        )
        
        assert result["user_id"] == "user_123"
        assert "summary" in result
    
    @pytest.mark.asyncio
    async def test_returns_empty_when_container_unavailable(self, analytics_service, mock_cosmos):
        """Given no sessions container, when getting summary, then returns empty."""
        analytics_service._session_records_available = False
        
        result = await analytics_service.get_user_session_summary(
            user_id="user_123",
            days=30,
            limit=50,
            offset=0
        )
        
        assert result["summary"]["total_sessions"] == 0


# ============================================================================
# TEST: get_system_analytics
# ============================================================================

class TestGetSystemAnalytics:
    """Tests for system-wide analytics."""
    
    @pytest.mark.asyncio
    async def test_returns_system_analytics(self, analytics_service, mock_cosmos):
        """Given analytics data, when getting system analytics, then returns summary."""
        async def mock_query(*args, **kwargs):
            yield {
                "id": "rec_1",
                "user_id": "user_1",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "audio_duration_minutes": 10,
                "prompt_category_id": "cat_1"
            }
            yield {
                "id": "rec_2",
                "user_id": "user_2",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "audio_duration_minutes": 20,
                "prompt_category_id": "cat_1"
            }
        
        async def mock_session_query(*args, **kwargs):
            yield {"user_id": "user_1"}
        
        mock_cosmos.get_container("analytics").query_items = MagicMock(side_effect=mock_query)
        mock_cosmos.get_container("user_sessions").query_items = MagicMock(return_value=mock_session_query())
        
        result = await analytics_service.get_system_analytics(days=30)
        
        assert "analytics" in result
        assert result["analytics"]["total_minutes"] == 30.0
        assert result["analytics"]["total_jobs"] == 2
    
    @pytest.mark.asyncio
    async def test_filters_by_business_unit(self, analytics_service, mock_cosmos):
        """Given business unit filter, when getting analytics, then applies filter."""
        async def mock_query(*args, **kwargs):
            yield {
                "user_id": "user_1",
                "audio_duration_minutes": 10,
                "prompt_category_id": "cat_1"
            }
        
        async def mock_session_query(*args, **kwargs):
            if False:
                yield

        async def mock_prompt_query(*args, **kwargs):
            yield {"id": "cat_1", "business_unit_id": "bu_1"}

        analytics_records = mock_cosmos.get_container("analytics")
        session_records = mock_cosmos.get_container("user_sessions")
        user_records = mock_cosmos.get_container("auth")
        mock_prompts_container = AsyncMock()
        mock_prompts_container.query_items = MagicMock(return_value=mock_prompt_query())
        mock_cosmos.get_container = MagicMock(
            side_effect=lambda name: {
                "analytics": analytics_records,
                "prompts": mock_prompts_container,
                "user_sessions": session_records,
                "auth": user_records,
            }[name]
        )
        
        mock_cosmos.get_container("analytics").query_items = MagicMock(side_effect=mock_query)
        mock_cosmos.get_container("user_sessions").query_items = MagicMock(return_value=mock_session_query())
        
        result = await analytics_service.get_system_analytics(
            days=30,
            business_unit_ids=["bu_1"]
        )
        
        assert result["analytics"]["total_jobs"] == 1

    @pytest.mark.asyncio
    async def test_filters_by_business_unit_when_record_uses_root_category_id(self, analytics_service, mock_cosmos):
        """Given analytics tagged with the BU category itself, when filtering by BU, then includes it."""
        async def mock_query(*args, **kwargs):
            params = kwargs.get("parameters", [])
            category_param_values = {
                param["value"]
                for param in params
                if param.get("name", "").startswith("@prompt_category_")
            }
            assert "category_1744854349255" in category_param_values
            yield {
                "user_id": "user_1",
                "audio_duration_minutes": 10,
                "prompt_category_id": "category_1744854349255",
            }

        async def mock_session_query(*args, **kwargs):
            if False:
                yield

        async def mock_prompt_query(*args, **kwargs):
            if False:
                yield

        analytics_records = mock_cosmos.get_container("analytics")
        session_records = mock_cosmos.get_container("user_sessions")
        user_records = mock_cosmos.get_container("auth")
        mock_prompts_container = AsyncMock()
        mock_prompts_container.query_items = MagicMock(return_value=mock_prompt_query())
        mock_cosmos.get_container = MagicMock(
            side_effect=lambda name: {
                "analytics": analytics_records,
                "prompts": mock_prompts_container,
                "user_sessions": session_records,
                "auth": user_records,
            }[name]
        )

        mock_cosmos.get_container("analytics").query_items = MagicMock(side_effect=mock_query)
        mock_cosmos.get_container("user_sessions").query_items = MagicMock(return_value=mock_session_query())

        result = await analytics_service.get_system_analytics(
            days=30,
            business_unit_ids=["category_1744854349255"],
        )

        assert result["analytics"]["total_jobs"] == 1

    @pytest.mark.asyncio
    async def test_reports_historical_data_when_requested_window_is_empty(self, analytics_service, mock_cosmos):
        """Given no records in the selected window, when historical analytics exist, then expose latest historical timestamp."""

        async def analytics_query(*args, **kwargs):
            query = kwargs.get("query", "")
            if "SELECT TOP 1 c.id, c.timestamp, c.created_at" in query:
                yield {
                    "id": "analytics_job_latest",
                    "timestamp": "2026-03-15T01:11:48.534011+00:00",
                }
                return
            if False:
                yield

        async def empty_query(*args, **kwargs):
            if False:
                yield

        mock_cosmos.get_container("analytics").query_items = MagicMock(side_effect=lambda *args, **kwargs: analytics_query(*args, **kwargs))
        mock_cosmos.get_container("user_sessions").query_items = MagicMock(return_value=empty_query())
        mock_cosmos.get_container("auth").query_items = MagicMock(return_value=empty_query())

        result = await analytics_service.get_system_analytics(days=30)

        assert result["analytics"]["total_jobs"] == 0
        assert result["analytics"]["has_historical_data"] is True
        assert result["analytics"]["latest_available_timestamp"] == "2026-03-15T01:11:48.534011+00:00"


# ============================================================================
# TEST: get_user_minutes_records
# ============================================================================

class TestGetUserMinutesRecords:
    """Tests for user minutes records retrieval."""
    
    @pytest.mark.asyncio
    async def test_returns_minutes_records(self, analytics_service, mock_cosmos):
        """Given analytics records, when getting minutes, then returns records."""
        async def mock_query(*args, **kwargs):
            yield {
                "job_id": "job_1",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "audio_duration_minutes": 5.0,
                "file_name": "test.wav"
            }
        
        mock_cosmos.get_container("analytics").query_items = MagicMock(return_value=mock_query())
        
        result = await analytics_service.get_user_minutes_records(
            user_id="user_123",
            days=30
        )
        
        assert result["user_id"] == "user_123"
        assert result["total_records"] == 1
        assert result["total_minutes"] == 5.0
    
    @pytest.mark.asyncio
    async def test_converts_seconds_to_minutes(self, analytics_service, mock_cosmos):
        """Given seconds, when getting minutes, then converts."""
        async def mock_query(*args, **kwargs):
            yield {
                "job_id": "job_1",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "audio_duration_seconds": 120
            }
        
        mock_cosmos.get_container("analytics").query_items = MagicMock(return_value=mock_query())
        
        result = await analytics_service.get_user_minutes_records(
            user_id="user_123",
            days=30
        )
        
        assert result["records"][0]["audio_duration_minutes"] == 2.0


# ============================================================================
# TEST: get_recent_jobs
# ============================================================================

class TestGetRecentJobs:
    """Tests for recent jobs retrieval."""
    
    @pytest.mark.asyncio
    async def test_returns_recent_jobs(self, analytics_service, mock_cosmos):
        """Given jobs, when getting recent, then returns them."""
        async def mock_query(*args, **kwargs):
            yield {
                "id": "job_1",
                "user_id": "user_1",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "status": "completed"
            }
        
        mock_cosmos.get_container("analytics").query_items = MagicMock(return_value=mock_query())
        
        result = await analytics_service.get_recent_jobs(limit=10)
        
        assert len(result) == 1
        assert result[0]["id"] == "job_1"
    
    @pytest.mark.asyncio
    async def test_filters_by_prompt_id(self, analytics_service, mock_cosmos):
        """Given prompt filter, when getting recent jobs, then applies filter."""
        async def mock_query(*args, **kwargs):
            yield {"id": "job_1", "prompt_id": "prompt_1"}
        
        mock_cosmos.get_container("analytics").query_items = MagicMock(return_value=mock_query())
        
        result = await analytics_service.get_recent_jobs(
            limit=10,
            prompt_id="prompt_1"
        )
        
        # Verify filter was applied in query
        call_args = mock_cosmos.get_container("analytics").query_items.call_args
        query = call_args.kwargs.get("query", "")
        assert "prompt_id" in query


# ============================================================================
# TEST: close
# ============================================================================

class TestClose:
    """Tests for service cleanup."""
    
    def test_close_is_safe(self, analytics_service):
        """Given service, when closing, then no error is raised."""
        analytics_service.close()  # Should not raise

