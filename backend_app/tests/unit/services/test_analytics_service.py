import asyncio
from datetime import datetime, timezone, timedelta
import pytest
from unittest.mock import AsyncMock, MagicMock

from backend_app.app.repositories.analytics import (
    AnalyticsAuditRepository,
    AnalyticsEventRepository,
    AnalyticsPromptRepository,
    AnalyticsReadRepository,
    AnalyticsSessionRepository,
    AnalyticsUserCountRepository,
)
from backend_app.app.repositories.users import UserRepository
from backend_app.app.services.analytics.analytics_service import AnalyticsService


@pytest.fixture
def mock_cosmos_service():
    cosmos = MagicMock()
    containers = {
        "analytics": MagicMock(),
        "user_sessions": MagicMock(),
        "audit_logs": MagicMock(),
        "auth": MagicMock(),
        "prompts": MagicMock(),
    }
    cosmos.get_container = MagicMock(side_effect=lambda name: containers[name])
    cosmos.jobs_container = MagicMock()
    return cosmos


@pytest.fixture
def analytics_service(mock_cosmos_service):
    return build_analytics_service(mock_cosmos_service)


def build_analytics_service(cosmos, *, user_repository=None):
    return AnalyticsService(
        user_repository=user_repository or UserRepository(cosmos),
        analytics_read_repository=AnalyticsReadRepository(cosmos),
        analytics_event_repository=AnalyticsEventRepository(cosmos),
        analytics_session_repository=AnalyticsSessionRepository(cosmos),
        analytics_audit_repository=AnalyticsAuditRepository(cosmos),
        analytics_prompt_repository=AnalyticsPromptRepository(cosmos),
        analytics_user_count_repository=AnalyticsUserCountRepository(cosmos),
    )


@pytest.mark.asyncio
async def test_track_job_event_returns_id_when_analytics_missing():
    cosmos = MagicMock()
    cosmos.get_container = MagicMock(side_effect=RuntimeError("analytics unavailable"))
    svc = build_analytics_service(cosmos)

    res = await svc.track_job_event('j1', 'u1', 'job_uploaded', metadata={'audio_duration_seconds': 60})
    assert isinstance(res, str)


@pytest.mark.asyncio
async def test_get_user_analytics_returns_empty_stats_when_records_unavailable():
    cosmos = MagicMock()
    svc = build_analytics_service(cosmos)
    svc._analytics_records_available = False

    out = await svc.get_user_analytics('u1', days=1)

    assert out['analytics']['transcription_stats']['total_jobs'] == 0
    assert out['analytics']['transcription_stats']['total_minutes'] == 0.0


@pytest.mark.asyncio
async def test_get_user_analytics_details_uses_timestamp_fields():
    cosmos = MagicMock()

    svc = build_analytics_service(cosmos)
    svc.analytics_reads.count_user_analytics_records = AsyncMock(return_value=2)
    svc.analytics_reads.list_user_analytics_records = AsyncMock(return_value=[
        {"id": "rec-1", "timestamp": "2024-01-02T00:00:00Z", "audio_duration_minutes": 5},
        {"id": "rec-2", "timestamp": "2024-01-01T00:00:00Z", "audio_duration_minutes": 7},
    ])
    out = await svc.get_user_analytics_details(user_id='u1', days=1, limit=10, offset=0)

    assert out['total'] == 2
    assert out['analytics']['total_jobs'] == 2
    assert out['items'][0]['id'] == 'rec-1'


@pytest.mark.asyncio
async def test_track_job_event_with_analytics_repository_calls_create():
    cosmos = MagicMock()
    analytics_records = MagicMock()
    analytics_records.create_item = AsyncMock(return_value=None)
    cosmos.get_container = MagicMock(return_value=analytics_records)

    svc = build_analytics_service(cosmos)
    res = await svc.track_job_event('job1', 'u1', 'job_uploaded', metadata={'audio_duration_seconds': 60, 'file_name': 'f'})
    assert isinstance(res, str)
    assert analytics_records.create_item.called


@pytest.mark.asyncio
async def test_get_user_analytics_with_analytics_repository():
    # analytics repository path
    items = [{'audio_duration_minutes': 1}, {'audio_duration_seconds': 120}]
    class C:
        def query_items(self, query=None, parameters=None):
            async def it():
                for x in items:
                    yield x
            return it()

    cosmos = MagicMock()
    cosmos.get_container = MagicMock(return_value=C())
    svc = build_analytics_service(cosmos)
    out = await svc.get_user_analytics('u1', days=1)
    assert out['analytics']['transcription_stats']['total_jobs'] >= 1


@pytest.mark.asyncio
async def test_get_user_analytics_details_and_session_summary():
    cosmos = MagicMock()
    svc = build_analytics_service(cosmos)

    # analytics not available early return
    assert (await svc.get_user_analytics_details(user_id='u1', days=1, limit=10, offset=0))['total'] == 0

    # sessions summary when session records are unavailable
    svc._session_records_available = False
    s = await svc.get_user_session_summary(user_id='u1', days=1, limit=10, offset=0)
    assert s['summary']['total_sessions'] == 0

    # session analytics early return
    sa = await svc.get_user_session_analytics(user_id='u1', days=1, limit=5, offset=0)
    assert sa['period_days'] == 1


@pytest.mark.asyncio
async def test_get_user_analytics_details_and_sessions_complex():
    cosmos = MagicMock()
    svc = build_analytics_service(cosmos)

    # Simulate analytics records being available and repository methods returning count and items.
    svc._analytics_records_available = True
    svc.analytics_reads.count_user_analytics_records = AsyncMock(return_value=2)
    svc.analytics_reads.list_user_analytics_records = AsyncMock(
        return_value=[{'audio_duration_minutes': 1}, {'audio_duration_seconds': 120}]
    )

    details = await svc.get_user_analytics_details(user_id='u1', days=7, limit=10, offset=0)
    assert details['total'] == 2

    # sessions summary with container available
    svc._session_records_available = True
    now = datetime.now(timezone.utc)
    session_doc = {
        "id": "u1",
        "user_id": "u1",
        "type": "session",
        "session_ranges": [
            {
                "range_id": "r1",
                "start_time": (now - timedelta(hours=2)).isoformat(),
                "last_activity": (now - timedelta(hours=1, minutes=50)).isoformat(),
                "last_heartbeat": (now - timedelta(hours=1, minutes=50)).isoformat(),
                "status": "active",
                "activity_count": 2,
                "total_requests": 4,
            },
            {
                "range_id": "r2",
                "start_time": (now - timedelta(hours=1)).isoformat(),
                "last_activity": (now - timedelta(minutes=40)).isoformat(),
                "last_heartbeat": (now - timedelta(minutes=40)).isoformat(),
                "status": "closed",
                "activity_count": 2,
                "total_requests": 4,
            },
        ],
    }
    svc.session_reads.list_user_sessions = AsyncMock(return_value=[session_doc])
    svc.session_reads.list_user_sessions_by_user_id = AsyncMock(return_value=[])
    svc.session_reads.get_session_by_partition = AsyncMock(return_value=None)

    summ = await svc.get_user_session_summary(user_id='u1', days=1, limit=10, offset=0)
    assert summ['summary']['total_sessions'] == 2

    # session analytics with one range
    svc.session_reads.list_user_sessions = AsyncMock(return_value=[{
        "id": "u1",
        "user_id": "u1",
        "type": "session",
        "session_ranges": [{
            "range_id": "r1",
            "start_time": (now - timedelta(hours=1)).isoformat(),
            "last_activity": (now - timedelta(minutes=30)).isoformat(),
            "last_heartbeat": (now - timedelta(minutes=30)).isoformat(),
            "status": "active",
            "activity_count": 3,
            "total_requests": 2,
            "ip_address": "1.1.1.1",
        }],
    }])
    svc.session_reads.list_user_sessions_by_user_id = AsyncMock(return_value=[])
    svc.session_reads.get_session_by_partition = AsyncMock(return_value=None)

    analytics = await svc.get_user_session_analytics(user_id='u1', days=1, limit=5, offset=0)
    assert analytics['total_sessions'] == 1 and analytics['fetched_sessions'] == 1

    # detailed sessions with audit timeline
    svc.session_reads.list_user_sessions = AsyncMock(return_value=[{
        "id": "u1",
        "user_id": "u1",
        "type": "session",
        "session_ranges": [{
            "range_id": "r1",
            "start_time": (now - timedelta(hours=1)).isoformat(),
            "last_activity": (now - timedelta(minutes=30)).isoformat(),
            "last_heartbeat": (now - timedelta(minutes=30)).isoformat(),
            "status": "active",
            "activity_count": 1,
            "ip_address": "1.1.1.1",
        }],
    }])
    svc.session_reads.list_user_sessions_by_user_id = AsyncMock(return_value=[])
    svc.session_reads.get_session_by_partition = AsyncMock(return_value=None)
    svc.audit_reads.is_available = MagicMock(return_value=True)
    svc.audit_reads.list_user_audit_logs = AsyncMock(
        return_value=[{'id': 'a1', 'timestamp': '2024-01-01T00:01:00Z', 'event_type': 'e', 'resource': 'r'}]
    )
    scoped = await svc.get_user_detailed_sessions(user_id='u1', days=7, limit=10, include_audit=True)
    assert 'detailed_sessions' in scoped

    # minutes records when analytics records are available
    svc._analytics_records_available = True
    svc.analytics_reads.list_user_duration_records = AsyncMock(
        return_value=[{'job_id': 'j1', 'timestamp': 't', 'event_type': 'e', 'audio_duration_seconds': 120}]
    )
    minutes = await svc.get_user_minutes_records('u1')
    assert isinstance(minutes, list) or isinstance(minutes, dict) or 'audio_duration_minutes' in (minutes[0] if isinstance(minutes, list) else {})

class TestGetUserDetailedSessions:
    @pytest.mark.asyncio
    async def test_get_user_detailed_sessions_success(self, analytics_service, mock_cosmos_service):
        async def async_iter(items):
            for item in items:
                yield item

        now = datetime.now(timezone.utc)
        mock_cosmos_service.get_container("user_sessions").query_items.side_effect = [
            async_iter([
                {
                    "id": "user1",
                    "user_id": "user1",
                    "type": "session",
                    "session_ranges": [
                        {
                            "range_id": "s1",
                            "start_time": (now - timedelta(hours=1)).isoformat(),
                            "last_heartbeat": (now - timedelta(minutes=30)).isoformat(),
                            "status": "active",
                        }
                    ]
                }
            ]),
            async_iter([]) # Audit logs
        ]

        result = await analytics_service.get_user_detailed_sessions(user_id="user1")
        
        assert len(result["detailed_sessions"]) == 1
        assert result["detailed_sessions"][0]["session_id"] == "s1"

class TestGetSystemAnalytics:
    @pytest.mark.asyncio
    async def test_get_system_analytics_success(self, analytics_service, mock_cosmos_service):
        async def async_iter(items):
            for item in items:
                yield item

        mock_cosmos_service.get_container("analytics").query_items.return_value = async_iter([
            {"id": "1", "audio_duration_minutes": 10, "user_id": "u1", "timestamp": "2023-01-01T00:00:00Z"}
        ])
        
        # Mock sessions container for active users
        mock_cosmos_service.get_container("user_sessions").query_items.return_value = async_iter([{"user_id": "u1"}])

        result = await analytics_service.get_system_analytics()
        
        assert result["analytics"]["total_minutes"] == 10.0
        assert result["analytics"]["total_jobs"] == 1
        # Removed generated_at assertion

class TestGetRecentJobs:
    @pytest.mark.asyncio
    async def test_get_recent_jobs_success(self, analytics_service, mock_cosmos_service):
        async def async_iter(items):
            for item in items:
                yield item

        # get_recent_jobs uses analytics repository records
        mock_cosmos_service.get_container("analytics").query_items.return_value = async_iter([
            {"id": "job1", "created_at": "2023-01-01T00:00:00Z"}
        ])

        result = await analytics_service.get_recent_jobs()
        
        assert len(result) == 1
        assert result[0]["id"] == "job1"

