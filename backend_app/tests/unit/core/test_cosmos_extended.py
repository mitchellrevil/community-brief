import pytest
from unittest.mock import MagicMock, AsyncMock, patch, PropertyMock
from app.core.cosmos import CosmosService, get_cosmos_service
from app.core.config import AppConfig
from azure.cosmos.exceptions import CosmosHttpResponseError, CosmosResourceNotFoundError

@pytest.fixture
def mock_config():
    config = MagicMock(spec=AppConfig)
    config.cosmos_endpoint = "https://test-cosmos.documents.azure.com:443/"
    config.cosmos_key = "test-key"
    config.cosmos_database = "test-db"
    config.cosmos_containers = {"auth": "auth_container", "jobs": "jobs_container"}
    return config

@pytest.fixture
def cosmos_service(mock_config):
    service = CosmosService(mock_config)
    return service

@pytest.mark.asyncio
class TestAvailability:
    def test_is_available_cached(self, cosmos_service):
        cosmos_service._is_available = True
        assert cosmos_service.is_available() is True

    def test_is_available_check(self, cosmos_service):
        # Config has keys, so should return True
        assert cosmos_service.is_available() is True

    def test_is_available_no_config(self, cosmos_service):
        cosmos_service.config.cosmos_endpoint = None
        cosmos_service.config.cosmos_key = None
        assert cosmos_service.is_available() is False

    def test_is_available_exception(self, cosmos_service):
        # Mock config to raise exception on access
        # We can just mock the config object to raise exception when accessing cosmos_endpoint
        p = PropertyMock(side_effect=RuntimeError("Config error"))
        type(cosmos_service.config).cosmos_endpoint = p
        
        assert cosmos_service.is_available() is False

@pytest.mark.asyncio
class TestMisc:
    def test_get_cosmos_service_returns_request_state_instance(self):
        request = MagicMock()
        service = MagicMock(spec=CosmosService)
        request.app.state.cosmos_service = service

        assert get_cosmos_service(request) is service

@pytest.mark.asyncio
class TestInitializationEdgeCases:
    async def test_initialize_dict_key(self, cosmos_service):
        cosmos_service.config.cosmos_key = {"masterKey": "test-key"}
        with patch("app.core.cosmos.AsyncCosmosClient") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.get_database_client.return_value = MagicMock()
            mock_client_cls.return_value = mock_client
            
            await cosmos_service.initialize()
            
            assert cosmos_service._initialized is True
            mock_client_cls.assert_called_once()
            # Check credential passed
            args, kwargs = mock_client_cls.call_args
            assert kwargs["credential"] == "test-key"

    async def test_initialize_invalid_key_format(self, cosmos_service):
        cosmos_service.config.cosmos_key = {"invalid": "key"}
        with pytest.raises(RuntimeError, match="Unrecognized Cosmos DB key format"):
            await cosmos_service.initialize()

    async def test_initialize_default_cred_failure(self, cosmos_service):
        cosmos_service.config.cosmos_key = None
        with patch("app.core.cosmos.AsyncDefaultAzureCredential") as mock_cred_cls:
            with patch("app.core.cosmos.AsyncCosmosClient", side_effect=CosmosHttpResponseError(status_code=401)):
                with pytest.raises(CosmosHttpResponseError):
                    await cosmos_service.initialize()

@pytest.mark.asyncio
class TestContainerFallback:
    async def test_get_container_fallback_success(self, cosmos_service):
        cosmos_service._database = MagicMock()
        mock_container = MagicMock()
        
        # First call raises NotFound, second call succeeds
        cosmos_service._database.get_container_client.side_effect = [
            CosmosResourceNotFoundError(message="Not found"),
            mock_container
        ]
        
        container = cosmos_service.get_container("auth")
        assert container is mock_container
        assert cosmos_service._database.get_container_client.call_count == 2

    async def test_get_container_fallback_failure(self, cosmos_service):
        cosmos_service._database = MagicMock()
        
        # Both calls raise NotFound
        cosmos_service._database.get_container_client.side_effect = CosmosResourceNotFoundError(message="Not found")
        
        with pytest.raises(RuntimeError, match="Container not found"):
            cosmos_service.get_container("auth")

