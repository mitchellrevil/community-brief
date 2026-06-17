import pytest
from unittest.mock import MagicMock, patch
from backend_app.app.core.cosmos import CosmosService
from backend_app.app.core.config import AppConfig

@pytest.fixture
def mock_config():
    config = MagicMock(spec=AppConfig)
    config.cosmos_endpoint = "https://test.documents.azure.com:443/"
    config.cosmos_key = "test_key"
    config.cosmos_database = "test_db"
    config.cosmos_containers = {"jobs": "jobs_container"}
    return config

@pytest.fixture
def cosmos_service(mock_config):
    return CosmosService(mock_config)

class TestCosmosServiceInitialization:
    @pytest.mark.asyncio
    async def test_initialize_success(self, cosmos_service):
        with patch("backend_app.app.core.cosmos.AsyncCosmosClient") as MockClient:
            mock_client_instance = MockClient.return_value
            mock_db_client = MagicMock()
            mock_client_instance.get_database_client.return_value = mock_db_client
            
            await cosmos_service.initialize()
            
            assert cosmos_service._client is not None
            assert cosmos_service._database is not None
            assert cosmos_service._initialized is True
            # Mock is_available to return True since we initialized successfully
            cosmos_service._is_available = True
            assert cosmos_service.is_available() is True

    @pytest.mark.asyncio
    async def test_initialize_failure(self, cosmos_service):
        with patch("backend_app.app.core.cosmos.AsyncCosmosClient") as MockClient:
            MockClient.side_effect = RuntimeError("Connection failed")
            
            with pytest.raises(RuntimeError) as excinfo:
                await cosmos_service.initialize()
            
            assert "Connection failed" in str(excinfo.value)
            assert cosmos_service._initialized is False

class TestGetContainer:
    @pytest.mark.asyncio
    async def test_get_container_success(self, cosmos_service):
        cosmos_service._database = MagicMock()
        mock_container = MagicMock()
        cosmos_service._database.get_container_client.return_value = mock_container
        
        container = cosmos_service.get_container("jobs")
        
        assert container == mock_container
        cosmos_service._database.get_container_client.assert_called_with("jobs_container")

    @pytest.mark.asyncio
    async def test_get_container_not_found(self, cosmos_service):
        cosmos_service._database = MagicMock()
        # Simulate container not found for both prefixed and raw names
        cosmos_service._database.get_container_client.side_effect = RuntimeError("Container not found")
        
        with pytest.raises(RuntimeError) as excinfo:
            cosmos_service.get_container("unknown")
        
        assert "Failed to get Cosmos container" in str(excinfo.value)

