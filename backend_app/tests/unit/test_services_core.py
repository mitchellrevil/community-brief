"""
Unit tests for services.py

Tests for service provider functions (dependency injection factories) including:
- get_permission_service
- get_analytics_service
- get_storage_service
- get_job_service
- get_job_management_service
- get_job_sharing_service
- get_session_tracking_service
- get_export_service
- get_prompt_service
- get_user_service
- get_system_health_service
- get_talking_points_service
- get_job_permissions
- get_chatbot_service
"""

import pytest
from unittest.mock import MagicMock, patch, AsyncMock


# Mark all tests as unit tests
pytestmark = pytest.mark.unit


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def mock_cosmos_service():
    """Create a mock CosmosService."""
    return AsyncMock()


@pytest.fixture
def mock_user_repository():
    """Create a mock UserRepository."""
    return AsyncMock()


@pytest.fixture
def mock_config():
    """Create a mock AppConfig."""
    config = MagicMock()
    config.azure_storage_connection_string = "UseDevelopmentStorage=true"
    config.azure_openai_endpoint = "https://test.openai.azure.com"
    config.azure_openai_key = "test_key"
    config.azure_openai_api_version = "2024-02-15-preview"
    config.azure_openai_deployment_name = "gpt-4"
    return config


@pytest.fixture
def mock_request():
    """Create a mock FastAPI request with app.state services."""
    app = MagicMock()
    app.state.permission_cache = MagicMock()
    app.state.storage_service = MagicMock()
    app.state.session_tracking_service = MagicMock()
    app.state.system_health_service = MagicMock()

    request = MagicMock()
    request.app = app
    return request


# ============================================================================
# TEST: get_permission_service
# ============================================================================

class TestGetPermissionService:
    """Tests for get_permission_service factory."""
    
    def test_returns_permission_service_instance(self, mock_request, mock_cosmos_service, mock_user_repository):
        """Given cosmos service, when getting permission service, then returns instance."""
        from app.deps import get_permission_service
        
        result = get_permission_service(mock_request, mock_cosmos_service, mock_user_repository)
        
        assert result is not None
        from app.services.auth.permission_service import PermissionService
        assert isinstance(result, PermissionService)
    
    def test_wires_user_repository(self, mock_request, mock_cosmos_service, mock_user_repository):
        """Given user repository, when getting permission service, then wires repository."""
        from app.deps import get_permission_service
        
        result = get_permission_service(mock_request, mock_cosmos_service, mock_user_repository)
        
        assert result.user_repository is mock_user_repository
    
    def test_returns_new_instance_per_call(self, mock_request, mock_cosmos_service, mock_user_repository):
        """Given multiple calls, when getting service, then returns new instances."""
        from app.deps import get_permission_service
        
        result1 = get_permission_service(mock_request, mock_cosmos_service, mock_user_repository)
        result2 = get_permission_service(mock_request, mock_cosmos_service, mock_user_repository)
        
        assert result1 is not result2


# ============================================================================
# TEST: get_analytics_service
# ============================================================================

class TestGetAnalyticsService:
    """Tests for get_analytics_service factory."""
    
    def test_returns_analytics_service_instance(self, mock_cosmos_service):
        """Given cosmos service, when getting analytics service, then returns instance."""
        from app.deps import get_analytics_service
        
        result = get_analytics_service(mock_cosmos_service)
        
        assert result is not None
        from app.services.analytics.analytics_service import AnalyticsService
        assert isinstance(result, AnalyticsService)


# ============================================================================
# TEST: get_file_security_service
# ============================================================================

class TestGetFileSecurityService:
    """Tests for get_file_security_service factory."""
    
    def test_returns_file_security_service_instance(self, mock_config):
        """Given no args, when getting file security service, then returns instance."""
        from app.deps import get_file_security_service
        
        result = get_file_security_service(mock_config)
        
        assert result is not None
        from app.services.storage.file_security_service import FileSecurityService
        assert isinstance(result, FileSecurityService)


# ============================================================================
# TEST: get_storage_service
# ============================================================================

class TestGetStorageService:
    """Tests for get_storage_service factory."""
    
    def test_returns_storage_service_instance(self):
        """Given config, when getting storage service, then returns instance."""
        from app.deps import get_storage_service
        mock_request = MagicMock()
        mock_request.app = MagicMock()
        mock_request.app.state.storage_service = MagicMock()
        
        result = get_storage_service(mock_request)
        
        assert result is mock_request.app.state.storage_service
    
    def test_returns_cached_instance(self):
        """Given multiple calls, when getting storage service, then returns same instance."""
        from app.deps import get_storage_service
        mock_request = MagicMock()
        mock_request.app = MagicMock()
        mock_request.app.state.storage_service = MagicMock()
        
        result1 = get_storage_service(mock_request)
        result2 = get_storage_service(mock_request)
        
        # Should be the same instance from request state
        assert result1 is result2


# ============================================================================
# TEST: get_job_service
# ============================================================================

class TestGetJobService:
    """Tests for get_job_service factory."""
    
    def test_returns_job_service_instance(self, mock_cosmos_service):
        """Given cosmos and storage service, when getting job service, then returns instance."""
        from app.deps import get_job_service
        mock_storage_service = MagicMock()
        
        result = get_job_service(mock_cosmos_service, mock_storage_service)
        
        assert result is not None
        from app.services.jobs.job_service import JobService
        assert isinstance(result, JobService)


# ============================================================================
# TEST: get_job_management_service
# ============================================================================

class TestGetJobManagementService:
    """Tests for get_job_management_service factory."""
    
    def test_returns_job_management_service_instance(self, mock_cosmos_service):
        """Given cosmos and job service, when getting management service, then returns instance."""
        from app.deps import get_job_management_service
        mock_job_service = MagicMock()
        
        result = get_job_management_service(mock_cosmos_service, mock_job_service)
        
        assert result is not None
        from app.services.jobs.job_management_service import JobManagementService
        assert isinstance(result, JobManagementService)


# ============================================================================
# TEST: get_job_sharing_service
# ============================================================================

class TestGetJobSharingService:
    """Tests for get_job_sharing_service factory."""
    
    def test_returns_job_sharing_service_instance(self, mock_cosmos_service):
        """Given cosmos service, when getting sharing service, then returns instance."""
        from app.deps import get_job_sharing_service
        
        result = get_job_sharing_service(mock_cosmos_service)
        
        assert result is not None
        from app.services.jobs.job_sharing_service import JobSharingService
        assert isinstance(result, JobSharingService)


# ============================================================================
# TEST: get_session_tracking_service
# ============================================================================

class TestGetSessionTrackingService:
    """Tests for get_session_tracking_service factory."""
    
    def test_returns_session_tracking_service_instance(self, mock_request):
        """Given Cosmos available, when getting session tracking service, then returns instance."""
        from app.deps import get_session_tracking_service

        result = get_session_tracking_service(mock_request)

        assert result is mock_request.app.state.session_tracking_service


# ============================================================================
# TEST: get_export_service
# ============================================================================

class TestGetExportService:
    """Tests for get_export_service factory."""
    
    def test_returns_export_service_instance(self, mock_cosmos_service):
        """Given cosmos service, when getting export service, then returns instance."""
        from app.deps import get_export_service
        
        result = get_export_service(mock_cosmos_service)
        
        assert result is not None
        from app.services.analytics.export_service import ExportService
        assert isinstance(result, ExportService)


# ============================================================================
# TEST: get_prompt_service
# ============================================================================

class TestGetPromptService:
    """Tests for get_prompt_service factory."""
    
    def test_returns_prompt_service_instance(self, mock_cosmos_service):
        """Given cosmos service, when getting prompt service, then returns instance."""
        from app.deps import get_prompt_service
        
        result = get_prompt_service(mock_cosmos_service)
        
        assert result is not None
        from app.services.prompts.prompt_service import PromptService
        assert isinstance(result, PromptService)


# ============================================================================
# TEST: get_user_service
# ============================================================================

class TestGetUserService:
    """Tests for get_user_service factory."""
    
    def test_returns_user_service_instance(self, mock_cosmos_service):
        """Given cosmos and prompt service, when getting user service, then returns instance."""
        from app.deps import get_user_service
        mock_prompt_service = MagicMock()
        
        result = get_user_service(mock_cosmos_service, mock_prompt_service)
        
        assert result is not None
        from app.services.users.user_service import UserService
        assert isinstance(result, UserService)


# ============================================================================
# TEST: get_system_health_service
# ============================================================================

class TestGetSystemHealthService:
    """Tests for get_system_health_service factory."""
    
    def test_returns_system_health_service_instance(self, mock_request):
        """Given cosmos service, when getting health service, then returns instance."""
        from app.deps import get_system_health_service
        
        result = get_system_health_service(mock_request)
        
        assert result is mock_request.app.state.system_health_service


# ============================================================================
# TEST: get_talking_points_service
# ============================================================================

class TestGetTalkingPointsService:
    """Tests for get_talking_points_service factory."""
    
    def test_returns_talking_points_service_instance(self):
        """Given no args, when getting talking points service, then returns instance."""
        from app.deps import get_talking_points_service
        
        result = get_talking_points_service()
        
        assert result is not None
        from app.services.prompts.talking_points_service import TalkingPointsService
        assert isinstance(result, TalkingPointsService)


# ============================================================================
# TEST: get_job_permissions
# ============================================================================

class TestGetJobPermissions:
    """Tests for get_job_permissions factory."""
    
    def test_returns_job_permissions_instance(self):
        """Given permission service, when getting job permissions, then returns instance."""
        from app.deps import get_job_permissions
        mock_permission_service = MagicMock()
        
        result = get_job_permissions(mock_permission_service)
        
        assert result is not None
        from app.services.jobs.job_permissions import JobPermissions
        assert isinstance(result, JobPermissions)


# ============================================================================
# TEST: get_chatbot_service
# ============================================================================

class TestGetChatbotService:
    """Tests for get_chatbot_service factory."""
    
    def test_returns_chatbot_service_instance(self, mock_config):
        """Given config, when getting chatbot service, then returns instance."""
        from app.deps import get_chatbot_service
        
        result = get_chatbot_service(mock_config)
        
        assert result is not None
        from app.services.jobs.chatbot_service import ChatBotService
        assert isinstance(result, ChatBotService)
    
    def test_passes_openai_config_to_service(self, mock_config):
        """Given config, when getting chatbot service, then passes openai config."""
        from app.deps import get_chatbot_service
        
        result = get_chatbot_service(mock_config)
        
        assert result._azure_endpoint == mock_config.azure_openai_endpoint
        assert result._api_key == mock_config.azure_openai_key
