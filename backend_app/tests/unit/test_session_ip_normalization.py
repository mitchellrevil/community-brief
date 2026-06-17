import pytest
from datetime import datetime, timezone

from app.services.monitoring.session_tracking_service import SessionTrackingService


class InMemoryAdapter:
    def __init__(self):
        self.store = {}

    async def upsert_session(self, session):
        self.store[session['id']] = session

    async def get_session(self, session_id, **kwargs):
        return self.store.get(session_id)

    async def get_active_session(self, user_id):
        return None

    async def delete_session(self, session_id):
        self.store.pop(session_id, None)


class LegacySessionAdapter(InMemoryAdapter):
    async def get_active_session(self, user_id):
        return {
            "id": user_id,
            "user_id": user_id,
            "partition_key": user_id,
            "type": "session",
            "status": "active",
            "created_at": "2026-06-06T00:00:00+00:00",
            "last_activity": "2026-06-06T00:00:00+00:00",
            "last_heartbeat": "2026-06-06T00:00:00+00:00",
            "activity_count": "7",
            "total_requests": None,
            "expires_at": "2026-06-06T01:00:00+00:00",
            "session_ranges": [
                {
                    "range_id": "range-1",
                    "status": "active",
                    "activity_count": "2",
                    "total_requests": "3",
                }
            ],
        }


@pytest.mark.asyncio
async def test_session_ip_normalization_and_dedupe():
    adapter = InMemoryAdapter()
    svc = SessionTrackingService(adapter, session_timeout_minutes=15)
    svc._min_heartbeat_seconds = 0

    user_id = "test-user"
    ts = datetime.now(timezone.utc)

    # First call adds ip with port
    await svc.get_or_create_session(user_id=user_id, user_email="a@a.com", user_agent='UA', ip_address='1.2.3.4:12345', timestamp=ts)
    session = await adapter.get_session(user_id)
    assert session is not None
    assert session.get('ip_addresses') == ['1.2.3.0/24']

    # Second call with same IP but different port should not duplicate
    await svc.get_or_create_session(user_id=user_id, user_email="a@a.com", user_agent='UA', ip_address='1.2.3.4:9999', timestamp=ts)
    session = await adapter.get_session(user_id)
    assert session.get('ip_addresses') == ['1.2.3.0/24']

    # Add many IPs to exceed cap
    for i in range(15):
        ip = f"10.0.0.{i}:100{i}"
        await svc.get_or_create_session(user_id=user_id, user_email="a@a.com", user_agent='UA', ip_address=ip, timestamp=ts)

    session = await adapter.get_session(user_id)
    # capped to MAX_IP_ADDRESSES (10) most recent unique IPs
    assert len(session.get('ip_addresses')) <= 10
    # last ip should be 10.0.0.14 (without port)
    assert session.get('ip_addresses')[-1] == '10.0.0.0/24'


@pytest.mark.asyncio
async def test_session_counts_are_coerced_before_increment():
    adapter = LegacySessionAdapter()
    svc = SessionTrackingService(adapter, session_timeout_minutes=15)
    svc._min_heartbeat_seconds = 0

    user_id = "legacy-user"
    ts = datetime.now(timezone.utc)

    await svc.get_or_create_session(
        user_id=user_id,
        user_email="legacy@example.com",
        user_agent="UA",
        ip_address="1.2.3.4:12345",
        timestamp=ts,
    )

    session = await adapter.get_session(user_id)
    assert session is not None
    assert session["activity_count"] == 8
    assert session["total_requests"] == 1
    assert session["session_ranges"][0]["activity_count"] == 2
    assert session["session_ranges"][0]["total_requests"] == 3


@pytest.mark.asyncio
async def test_active_session_heartbeat_updates_coerce_range_counts():
    adapter = LegacySessionAdapter()
    svc = SessionTrackingService(adapter, session_timeout_minutes=15)
    svc._min_heartbeat_seconds = 0

    user_id = "legacy-user-active"
    ts = datetime(2026, 6, 6, 0, 10, tzinfo=timezone.utc)

    await svc.get_or_create_session(
        user_id=user_id,
        user_email="legacy@example.com",
        user_agent="UA",
        ip_address="1.2.3.4:12345",
        timestamp=ts,
    )

    session = await adapter.get_session(user_id)
    assert session is not None
    assert session["activity_count"] == 8
    assert session["total_requests"] == 1
    assert session["session_ranges"][0]["activity_count"] == 3
    assert session["session_ranges"][0]["total_requests"] == 4