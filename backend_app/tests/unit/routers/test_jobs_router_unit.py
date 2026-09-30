import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime, timezone, timedelta


@pytest.mark.asyncio
async def test_get_jobs_with_date_filters_assigns_result():
    from app.api.v1.routes.jobs import get_jobs

    mock_current_user = {"id": "user_1"}
    mock_job_service = AsyncMock()
    mock_error_handler = MagicMock()

    # Mock the service to return a normal paginated result
    mock_job_service.get_jobs_with_filters.return_value = {"jobs": [], "count": 0, "status": 200}

    start = "2025-11-21"
    end = "2025-12-08"

    # Should not raise and should call service with ISO strings
    result = await get_jobs(
        job_id=None,
        status=None,
        created_at_start=start,
        created_at_end=end,
        limit=12,
        offset=0,
        current_user=mock_current_user,
        job_svc=mock_job_service,
    )

    assert result["status"] == 200
    mock_job_service.get_jobs_with_filters.assert_called()
