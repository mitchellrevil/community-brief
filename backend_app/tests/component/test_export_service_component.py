"""
Component tests for ExportService (export_service.py)

Tests for export operations including:
- Users CSV export
- User details PDF export
- System analytics CSV export
- Prompts CSV export
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone
from typing import Dict, Any, List
import os


# Mark all tests as component tests
pytestmark = pytest.mark.component


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def mock_cosmos():
    """Create a mock CosmosService."""
    cosmos = AsyncMock()
    cosmos.get_container = MagicMock()
    return cosmos


@pytest.fixture
def mock_user_repository():
    """Create a mock UserRepository."""
    repository = AsyncMock()
    repository.list = AsyncMock(return_value={"items": [], "total": 0})
    repository.iter_all = MagicMock()
    repository.get_by_id = AsyncMock(return_value=None)
    return repository


@pytest.fixture
def mock_analytics_service():
    """Create a mock AnalyticsService."""
    service = AsyncMock()
    service.get_user_analytics = AsyncMock(return_value={})
    service.get_user_minutes_records = AsyncMock(return_value={})
    service.get_system_analytics = AsyncMock(return_value={"analytics": {"records": []}})
    return service


@pytest.fixture
def mock_prompt_service():
    """Create a mock PromptService."""
    service = AsyncMock()
    service.get_categories_by_ids = AsyncMock(return_value={})
    service.get_subcategory = AsyncMock(return_value=None)
    service.get_category = AsyncMock(return_value=None)
    return service


@pytest.fixture
def export_service(mock_cosmos, mock_analytics_service, mock_prompt_service, mock_user_repository):
    """Create an ExportService with mocked dependencies."""
    from app.repositories.analytics import (
        AnalyticsPromptExportRepository,
        AnalyticsPromptRepository,
        AnalyticsReadRepository,
    )
    from app.services.analytics.export_service import ExportService
    return ExportService(
        analytics_service=mock_analytics_service,
        prompt_service=mock_prompt_service,
        user_repository=mock_user_repository,
        analytics_repository=AnalyticsReadRepository(mock_cosmos),
        prompt_export_repository=AnalyticsPromptExportRepository(mock_cosmos),
        prompt_repository=AnalyticsPromptRepository(mock_cosmos),
    )


def create_user(
    user_id: str = "user_123",
    email: str = "user@example.com",
    full_name: str = "Test User",
    permission: str = "Viewer",
) -> Dict[str, Any]:
    """Helper to create test user dicts."""
    return {
        "id": user_id,
        "email": email,
        "full_name": full_name,
        "permission": permission,
        "source": "azure_ad",
        "microsoft_oid": "oid_123",
        "tenant_id": "tenant_123",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_login": datetime.now(timezone.utc).isoformat(),
        "is_active": True,
    }


# ============================================================================
# TEST: export_users_csv
# ============================================================================

class TestExportUsersCsv:
    """Tests for users CSV export."""
    
    @pytest.mark.asyncio
    async def test_exports_users_to_csv(self, export_service, mock_user_repository):
        """Given users, when exporting CSV, then creates file."""
        users = [create_user(), create_user(user_id="user_2", email="user2@example.com")]
        mock_user_repository.list.return_value = {"items": users, "total": len(users)}
        
        result = await export_service.export_users_csv()
        
        assert result["status"] == "success"
        assert result["file_path"].endswith(".csv")
        assert result["record_count"] == 2
        
        # Clean up
        if os.path.exists(result["file_path"]):
            os.unlink(result["file_path"])
    
    @pytest.mark.asyncio
    async def test_applies_permission_filter(self, export_service, mock_user_repository):
        """Given permission filter, when exporting, then filters users."""
        users = [
            create_user(permission="Admin"),
            create_user(user_id="user_2", permission="Viewer"),
        ]
        mock_user_repository.list.return_value = {"items": users, "total": len(users)}
        
        result = await export_service.export_users_csv(
            filters={"permission": "Admin"}
        )
        
        assert result["status"] == "success"
        assert result["record_count"] == 1
        
        # Clean up
        if os.path.exists(result["file_path"]):
            os.unlink(result["file_path"])
    
    @pytest.mark.asyncio
    async def test_handles_empty_users(self, export_service, mock_user_repository):
        """Given no users, when exporting, then creates empty CSV."""
        mock_user_repository.list.return_value = {"items": [], "total": 0}
        
        result = await export_service.export_users_csv()
        
        assert result["status"] == "success"
        assert result["record_count"] == 0
        
        # Clean up
        if os.path.exists(result["file_path"]):
            os.unlink(result["file_path"])


# ============================================================================
# TEST: stream_users_csv
# ============================================================================

class TestStreamUsersCsv:
    """Tests for streaming users CSV export."""
    
    @pytest.mark.asyncio
    async def test_streams_csv_content(self, export_service, mock_user_repository):
        """Given users, when streaming, then yields CSV rows."""
        users = [create_user()]
        
        async def mock_iterator():
            for user in users:
                yield user
        
        mock_user_repository.iter_all = MagicMock(return_value=mock_iterator())
        
        rows = []
        async for row in export_service.stream_users_csv():
            rows.append(row)
        
        assert len(rows) >= 1  # At least header


# ============================================================================
# TEST: export_user_details_pdf
# ============================================================================

class TestExportUserDetailsPdf:
    """Tests for user details PDF export."""
    
    @pytest.mark.asyncio
    async def test_exports_user_pdf(self, export_service, mock_user_repository, mock_analytics_service):
        """Given user, when exporting PDF, then creates file."""
        user = create_user()
        mock_user_repository.get_by_id.return_value = user
        mock_analytics_service.get_user_analytics.return_value = {
            "analytics": {"total_minutes": 100}
        }
        mock_analytics_service.get_user_minutes_records.return_value = {"records": []}
        
        result = await export_service.export_user_details_pdf(
            user_id="user_123",
            include_analytics=True
        )
        
        assert result["status"] == "success"
        assert result["file_path"].endswith(".pdf")
        
        # Clean up
        if os.path.exists(result["file_path"]):
            os.unlink(result["file_path"])
    
    @pytest.mark.asyncio
    async def test_returns_error_when_user_not_found(self, export_service, mock_user_repository):
        """Given nonexistent user, when exporting PDF, then returns error."""
        mock_user_repository.get_by_id.return_value = None
        
        result = await export_service.export_user_details_pdf(user_id="nonexistent")
        
        assert result["status"] == "error"
        assert "not found" in result["message"].lower()


# ============================================================================
# TEST: export_system_analytics_csv
# ============================================================================

class TestExportSystemAnalyticsCsv:
    """Tests for system analytics CSV export."""
    
    @pytest.mark.asyncio
    async def test_exports_system_analytics(self, export_service, mock_analytics_service):
        """Given analytics data, when exporting, then creates CSV."""
        mock_analytics_service.get_system_analytics.return_value = {
            "analytics": {
                "records": [
                    {
                        "job_id": "job_1",
                        "user_id": "user_1",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "audio_duration_minutes": 5.0,
                        "file_name": "test.wav"
                    }
                ]
            }
        }
        
        result = await export_service.export_system_analytics_csv(days=30)
        
        assert result["status"] == "success"
        assert result["file_path"].endswith(".csv")
        
        # Clean up
        if os.path.exists(result["file_path"]):
            os.unlink(result["file_path"])
    
    @pytest.mark.asyncio
    async def test_handles_empty_records(self, export_service, mock_analytics_service):
        """Given no records, when exporting, then creates empty CSV."""
        mock_analytics_service.get_system_analytics.return_value = {
            "analytics": {"records": []}
        }
        
        result = await export_service.export_system_analytics_csv(days=30)
        
        assert result["status"] == "success"
        
        # Clean up
        if os.path.exists(result["file_path"]):
            os.unlink(result["file_path"])


# ============================================================================
# TEST: export_prompts_csv
# ============================================================================

class TestExportPromptsCsv:
    """Tests for prompts CSV export."""
    
    @pytest.mark.asyncio
    async def test_exports_prompts_csv(self, export_service, mock_cosmos):
        """Given prompt usage data, when exporting, then creates CSV."""
        analytics_records = AsyncMock()
        prompts_container = AsyncMock()
        
        async def mock_analytics_query(*args, **kwargs):
            yield {"prompt_subcategory_id": "subcat_1"}
            yield {"prompt_subcategory_id": "subcat_1"}
            yield {"prompt_subcategory_id": "subcat_2"}
        
        async def mock_prompts_query(*args, **kwargs):
            yield {"id": "subcat_1", "name": "Prompt One"}
            yield {"id": "subcat_2", "name": "Prompt Two"}
        
        analytics_records.query_items = MagicMock(return_value=mock_analytics_query())
        prompts_container.query_items = MagicMock(return_value=mock_prompts_query())
        
        mock_cosmos.get_container = MagicMock(side_effect=lambda name: {
            "analytics": analytics_records,
            "voice_prompts": prompts_container
        }.get(name, AsyncMock()))
        
        result = await export_service.export_prompts_csv(days=30)
        
        assert result["status"] == "success"
        assert result["file_path"].endswith(".csv")
        
        # Clean up
        if os.path.exists(result["file_path"]):
            os.unlink(result["file_path"])


# ============================================================================
# TEST: cleanup_temp_file
# ============================================================================

class TestCleanupTempFile:
    """Tests for temporary file cleanup."""
    
    @pytest.mark.asyncio
    async def test_removes_temp_file(self, export_service):
        """Given temp file, when cleaning up, then removes it."""
        import tempfile
        
        # Create temp file
        temp = tempfile.NamedTemporaryFile(delete=False)
        temp.close()
        
        assert os.path.exists(temp.name)
        
        await export_service.cleanup_temp_file(temp.name)
        
        assert not os.path.exists(temp.name)
    
    @pytest.mark.asyncio
    async def test_handles_nonexistent_file(self, export_service):
        """Given nonexistent file, when cleaning up, then doesn't raise."""
        await export_service.cleanup_temp_file("/nonexistent/path.csv")


# ============================================================================
# TEST: _apply_user_filters
# ============================================================================

class TestApplyUserFilters:
    """Tests for user filtering logic."""
    
    def test_filters_by_permission(self, export_service):
        """Given permission filter, when applying, then filters correctly."""
        users = [
            create_user(permission="Admin"),
            create_user(user_id="user_2", permission="Viewer"),
        ]
        
        result = export_service._apply_user_filters(
            users,
            {"permission": "Admin"}
        )
        
        assert len(result) == 1
        assert result[0]["permission"] == "Admin"
    
    def test_filters_by_active_status(self, export_service):
        """Given is_active filter, when applying, then filters correctly."""
        users = [
            {**create_user(), "is_active": True},
            {**create_user(user_id="user_2"), "is_active": False},
        ]
        
        result = export_service._apply_user_filters(
            users,
            {"is_active": True}
        )
        
        assert len(result) == 1
        assert result[0]["is_active"] is True


# ============================================================================
# TEST: _format_datetime
# ============================================================================

class TestFormatDatetime:
    """Tests for datetime formatting."""
    
    def test_formats_valid_datetime(self, export_service):
        """Given valid datetime, when formatting, then returns formatted string."""
        dt_string = "2024-01-15T10:30:00+00:00"
        
        result = export_service._format_datetime(dt_string)
        
        assert "2024-01-15" in result
        assert "10:30:00" in result
    
    def test_returns_na_for_none(self, export_service):
        """Given None, when formatting, then returns N/A."""
        result = export_service._format_datetime(None)
        
        assert result == "N/A"
    
    def test_handles_invalid_datetime(self, export_service):
        """Given invalid datetime, when formatting, then returns original."""
        result = export_service._format_datetime("not a date")
        
        assert result == "not a date"


# ============================================================================
# TEST: _get_duration_minutes
# ============================================================================

class TestGetDurationMinutes:
    """Tests for duration extraction."""
    
    def test_returns_minutes_when_available(self, export_service):
        """Given minutes field, when extracting, then returns it."""
        record = {"audio_duration_minutes": 5.5}
        
        result = export_service._get_duration_minutes(record)
        
        assert result == 5.5
    
    def test_converts_seconds_to_minutes(self, export_service):
        """Given only seconds, when extracting, then converts to minutes."""
        record = {"audio_duration_seconds": 120}
        
        result = export_service._get_duration_minutes(record)
        
        assert result == 2.0
    
    def test_returns_none_when_no_duration(self, export_service):
        """Given no duration fields, when extracting, then returns None."""
        record = {}
        
        result = export_service._get_duration_minutes(record)
        
        assert result is None
