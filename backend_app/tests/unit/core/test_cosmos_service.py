import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.core.cosmos import CosmosService
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
    return CosmosService(mock_config)

@pytest.fixture
def mock_container():
    container = MagicMock()
    container.read_item = AsyncMock()
    container.create_item = AsyncMock()
    container.replace_item = AsyncMock()
    container.delete_item = AsyncMock()
    container.query_items = MagicMock()
    return container

@pytest.fixture
def mock_database(mock_container):
    db = MagicMock()
    db.get_container_client.return_value = mock_container
    return db

@pytest.fixture
def mock_client(mock_database):
    client = MagicMock()
    client.get_database_client.return_value = mock_database
    client.close = AsyncMock()
    return client

@pytest.mark.asyncio
class TestInitialize:
    async def test_initialize_success_key(self, cosmos_service, mock_client):
        with patch("app.core.cosmos.AsyncCosmosClient", return_value=mock_client) as mock_client_cls:
            await cosmos_service.initialize()
            
            assert cosmos_service._initialized is True
            assert cosmos_service._client is mock_client
            assert cosmos_service._database is not None
            mock_client_cls.assert_called_once()

    async def test_initialize_success_default_cred(self, cosmos_service, mock_client):
        cosmos_service.config.cosmos_key = None

        with patch("app.core.cosmos.AsyncDefaultAzureCredential") as mock_cred_cls, \
             patch("app.core.cosmos.AsyncCosmosClient", return_value=mock_client) as mock_client_cls:
            
            await cosmos_service.initialize()
            
            assert cosmos_service._initialized is True
            mock_cred_cls.assert_called_once()
            mock_client_cls.assert_called_once()

    async def test_initialize_missing_endpoint(self, cosmos_service):
        cosmos_service.config.cosmos_endpoint = None

        with pytest.raises(RuntimeError, match="Cosmos DB endpoint not configured"):
            await cosmos_service.initialize()

    async def test_initialize_db_error(self, cosmos_service, mock_client):
        mock_client.get_database_client.side_effect = CosmosHttpResponseError(status_code=404, message="DB not found")
        
        with patch("app.core.cosmos.AsyncCosmosClient", return_value=mock_client):
            with pytest.raises(RuntimeError, match="Failed to get Cosmos database client"):
                await cosmos_service.initialize()

@pytest.mark.asyncio
class TestGetContainer:
    async def test_get_container_success(self, cosmos_service, mock_client, mock_database, mock_container):
        with patch("app.core.cosmos.AsyncCosmosClient", return_value=mock_client):
            await cosmos_service.initialize()
            
            container = cosmos_service.get_container("auth")
            assert container is mock_container
            mock_database.get_container_client.assert_called_with("auth_container")
            
            # Test caching
            container2 = cosmos_service.get_container("auth")
            assert container2 is container
            assert mock_database.get_container_client.call_count == 1

    async def test_get_container_fallback(self, cosmos_service, mock_client, mock_database, mock_container):
        # First call raises NotFound, second call succeeds
        mock_database.get_container_client.side_effect = [
            CosmosResourceNotFoundError(message="Not found"),
            mock_container
        ]
        
        with patch("app.core.cosmos.AsyncCosmosClient", return_value=mock_client):
            await cosmos_service.initialize()
            
            container = cosmos_service.get_container("auth")
            assert container is mock_container
            assert mock_database.get_container_client.call_count == 2
            mock_database.get_container_client.assert_any_call("auth_container")
            mock_database.get_container_client.assert_any_call("auth")

