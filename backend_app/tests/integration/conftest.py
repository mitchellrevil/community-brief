import pytest
from fastapi.testclient import TestClient
from app.main import app

from app.core.auth import get_current_user
from app.deps import get_job_service


@pytest.fixture
def mock_user():
    """Simplified mock user for integration tests."""
    return {"id": "integration-user-1", "email": "user@example.com", "token": "test-token"}


@pytest.fixture
def mock_job_service():
    """Create a module-scoped mock JobService for integration tests."""
    from unittest.mock import AsyncMock
    service = AsyncMock()
    service.get_jobs_with_filters = AsyncMock()
    service.get_job = AsyncMock()
    service.enrich_job_file_urls = AsyncMock()
    service.upload_and_create_job = AsyncMock()
    service.cosmos = AsyncMock()
    service.cosmos.update_job_async = AsyncMock()
    service.cosmos.get_user_permission = AsyncMock()
    return service


@pytest.fixture
def test_client(request, monkeypatch, mock_job_service, mock_user):
    """Provide a TestClient with DI overrides for common integration tests.

    This overrides `get_current_user` and `get_job_service` so tests may call
    `test_client.post(...)` without needing to set up app-level DI manually.
    """
    # Override authentication and job service via FastAPI's dependency overrides
    app.dependency_overrides[get_current_user] = lambda *a, **k: mock_user
    app.dependency_overrides[get_job_service] = lambda *a, **k: mock_job_service

    # Disable session tracking middleware to avoid Cosmos initialization during tests
    from app.middleware.session_tracking_middleware import SessiontrackingMiddleware

    async def _noop_dispatch(self, request, call_next):
        return await call_next(request)

    monkeypatch.setattr(SessiontrackingMiddleware, "dispatch", _noop_dispatch)

    # Provide a fake analytics service so dependency resolution doesn't attempt Cosmos
    from unittest.mock import AsyncMock, MagicMock
    analytics = MagicMock()
    analytics.track_job_event = AsyncMock()
    from app.deps import get_analytics_service
    app.dependency_overrides[get_analytics_service] = lambda *a, **k: analytics

    client = TestClient(app)
    yield client

    # Clear overrides after the test so other tests aren't affected
    app.dependency_overrides.clear()
    client.close()