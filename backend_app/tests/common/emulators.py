"""
Emulator fixtures for integration tests.

This module provides pytest fixtures that connect to running Azure emulators
(Azurite, Cosmos DB Emulator, Redis) for full integration testing.

These fixtures are only used when running tests with --run-emulators flag.

Prerequisites:
    1. Start emulators: docker-compose -f tests/common/docker-compose.emulators.yml up -d
    2. Wait for healthchecks to pass
    3. Run tests: pytest --run-emulators -m integration

Environment Variables (auto-set by fixtures):
    - AZURE_STORAGE_ACCOUNT_URL: Azurite blob endpoint
    - AZURE_STORAGE_KEY: Azurite well-known key
    - AZURE_COSMOS_ENDPOINT: Cosmos emulator endpoint
    - AZURE_COSMOS_KEY: Cosmos emulator well-known key
    - REDIS_URL: Redis connection string
"""

import asyncio
import logging
import os
import ssl
import time
import uuid
from typing import Any, Dict, Generator, Optional
from urllib.parse import urlparse

import httpx
import pytest
import pytest_asyncio

logger = logging.getLogger(__name__)


# ============================================================================
# EMULATOR CONFIGURATION
# ============================================================================

class EmulatorConfig:
    """Configuration for connecting to emulators."""
    
    # Azurite (Azure Storage Emulator)
    AZURITE_BLOB_HOST = os.getenv("AZURITE_BLOB_HOST", "127.0.0.1")
    AZURITE_BLOB_PORT = int(os.getenv("AZURITE_BLOB_PORT", "10000"))
    AZURITE_ACCOUNT_NAME = "devstoreaccount1"
    AZURITE_ACCOUNT_KEY = "REDACTED"
    AZURITE_BLOB_URL = f"http://{AZURITE_BLOB_HOST}:{AZURITE_BLOB_PORT}/{AZURITE_ACCOUNT_NAME}"
    
    # Cosmos DB Emulator
    COSMOS_HOST = os.getenv("COSMOS_HOST", "127.0.0.1")
    COSMOS_PORT = int(os.getenv("COSMOS_PORT", "8081"))
    COSMOS_ENDPOINT = f"https://{COSMOS_HOST}:{COSMOS_PORT}"
    # Well-known Cosmos emulator key
    COSMOS_KEY = "REDACTED"
    COSMOS_DATABASE = os.getenv("COSMOS_TEST_DATABASE", "TestVoiceDB")
    
    # Redis
    REDIS_HOST = os.getenv("REDIS_HOST", "127.0.0.1")
    REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
    REDIS_URL = f"redis://{REDIS_HOST}:{REDIS_PORT}/0"
    
    # Test isolation prefix (unique per test run)
    RUN_PREFIX = os.getenv("TEST_RUN_PREFIX", f"test_{uuid.uuid4().hex[:8]}_")


# ============================================================================
# HEALTH CHECK UTILITIES
# ============================================================================

async def wait_for_azurite(
    timeout: float = 30.0,
    poll_interval: float = 1.0,
) -> bool:
    """
    Wait for Azurite to be healthy and accepting connections.
    
    Args:
        timeout: Maximum time to wait in seconds
        poll_interval: Time between health check attempts
    
    Returns:
        True if Azurite is ready, False if timeout reached
    """
    url = f"http://{EmulatorConfig.AZURITE_BLOB_HOST}:{EmulatorConfig.AZURITE_BLOB_PORT}/"
    
    start_time = time.monotonic()
    while time.monotonic() - start_time < timeout:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(url)
                # Azurite returns 400 for root path, which means it's running
                if response.status_code in (200, 400):
                    logger.info("Azurite is ready")
                    return True
        except (httpx.ConnectError, httpx.TimeoutException) as e:
            logger.debug(f"Azurite not ready yet: {e}")
        
        await asyncio.sleep(poll_interval)
    
    logger.error(f"Azurite did not become ready within {timeout}s")
    return False


async def wait_for_cosmos(
    timeout: float = 120.0,
    poll_interval: float = 5.0,
) -> bool:
    """
    Wait for Cosmos DB Emulator to be healthy.
    
    The Cosmos emulator takes longer to start, so we use a longer timeout.
    
    Args:
        timeout: Maximum time to wait in seconds
        poll_interval: Time between health check attempts
    
    Returns:
        True if Cosmos is ready, False if timeout reached
    """
    # Cosmos emulator uses self-signed cert, so we need to disable verification
    url = f"{EmulatorConfig.COSMOS_ENDPOINT}/_explorer/emulator.pem"
    
    start_time = time.monotonic()
    while time.monotonic() - start_time < timeout:
        try:
            async with httpx.AsyncClient(timeout=10.0, verify=False) as client:
                response = await client.get(url)
                if response.status_code == 200:
                    logger.info("Cosmos DB Emulator is ready")
                    return True
        except (httpx.ConnectError, httpx.TimeoutException, ssl.SSLError) as e:
            logger.debug(f"Cosmos not ready yet: {e}")
        
        await asyncio.sleep(poll_interval)
    
    logger.error(f"Cosmos DB Emulator did not become ready within {timeout}s")
    return False


# ============================================================================
# COSMOS DB SETUP UTILITIES
# ============================================================================

async def setup_cosmos_database(
    database_name: str,
    container_configs: Optional[Dict[str, str]] = None,
) -> None:
    """
    Create database and containers in Cosmos emulator.
    
    Args:
        database_name: Name of the database to create
        container_configs: Dict of container_name -> partition_key_path
    """
    from azure.cosmos.aio import CosmosClient
    from azure.cosmos import PartitionKey
    
    if container_configs is None:
        # Default containers matching production
        container_configs = {
            "auth": "/id",
            "jobs": "/id",
            "prompts": "/id",
            "analytics": "/id",
            "user_sessions": "/id",
            "audit_logs": "/id",
        }
    
    # Disable SSL verification for emulator
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    
    async with CosmosClient(
        EmulatorConfig.COSMOS_ENDPOINT,
        EmulatorConfig.COSMOS_KEY,
        connection_verify=False,
    ) as client:
        # Create database
        try:
            database = await client.create_database_if_not_exists(database_name)
            logger.info(f"Created/verified database: {database_name}")
        except Exception as e:
            logger.warning(f"Database creation issue: {e}")
            database = client.get_database_client(database_name)
        
        # Create containers
        for container_name, partition_key_path in container_configs.items():
            prefixed_name = f"{EmulatorConfig.RUN_PREFIX}{container_name}"
            try:
                await database.create_container_if_not_exists(
                    id=prefixed_name,
                    partition_key=PartitionKey(path=partition_key_path),
                )
                logger.info(f"Created/verified container: {prefixed_name}")
            except Exception as e:
                logger.warning(f"Container creation issue for {prefixed_name}: {e}")


async def cleanup_cosmos_containers(database_name: str) -> None:
    """
    Clean up test containers from Cosmos emulator.
    
    Removes all containers with the test run prefix.
    """
    from azure.cosmos.aio import CosmosClient
    
    async with CosmosClient(
        EmulatorConfig.COSMOS_ENDPOINT,
        EmulatorConfig.COSMOS_KEY,
        connection_verify=False,
    ) as client:
        try:
            database = client.get_database_client(database_name)
            containers = database.list_containers()
            
            async for container in containers:
                if container["id"].startswith(EmulatorConfig.RUN_PREFIX):
                    await database.delete_container(container["id"])
                    logger.info(f"Deleted test container: {container['id']}")
        except Exception as e:
            logger.warning(f"Cleanup issue: {e}")


# ============================================================================
# AZURITE SETUP UTILITIES
# ============================================================================

async def setup_azurite_container(container_name: str) -> None:
    """
    Create a container in Azurite for testing.
    
    Args:
        container_name: Name of the container to create
    """
    from azure.storage.blob.aio import BlobServiceClient
    
    connection_string = (
        f"DefaultEndpointsProtocol=http;"
        f"AccountName={EmulatorConfig.AZURITE_ACCOUNT_NAME};"
        f"AccountKey={EmulatorConfig.AZURITE_ACCOUNT_KEY};"
        f"BlobEndpoint=http://{EmulatorConfig.AZURITE_BLOB_HOST}:{EmulatorConfig.AZURITE_BLOB_PORT}/{EmulatorConfig.AZURITE_ACCOUNT_NAME};"
    )
    
    async with BlobServiceClient.from_connection_string(connection_string) as client:
        prefixed_name = f"{EmulatorConfig.RUN_PREFIX}{container_name}"
        try:
            await client.create_container(prefixed_name)
            logger.info(f"Created Azurite container: {prefixed_name}")
        except Exception as e:
            if "ContainerAlreadyExists" not in str(e):
                logger.warning(f"Container creation issue: {e}")


async def cleanup_azurite_containers() -> None:
    """Clean up test containers from Azurite."""
    from azure.storage.blob.aio import BlobServiceClient
    
    connection_string = (
        f"DefaultEndpointsProtocol=http;"
        f"AccountName={EmulatorConfig.AZURITE_ACCOUNT_NAME};"
        f"AccountKey={EmulatorConfig.AZURITE_ACCOUNT_KEY};"
        f"BlobEndpoint=http://{EmulatorConfig.AZURITE_BLOB_HOST}:{EmulatorConfig.AZURITE_BLOB_PORT}/{EmulatorConfig.AZURITE_ACCOUNT_NAME};"
    )
    
    async with BlobServiceClient.from_connection_string(connection_string) as client:
        async for container in client.list_containers():
            if container["name"].startswith(EmulatorConfig.RUN_PREFIX):
                await client.delete_container(container["name"])
                logger.info(f"Deleted Azurite container: {container['name']}")


# ============================================================================
# PYTEST FIXTURES
# ============================================================================

@pytest.fixture(scope="session")
def emulator_config():
    """Provide emulator configuration."""
    return EmulatorConfig()


@pytest_asyncio.fixture(scope="session")
async def emulators_ready():
    """
    Session-scoped fixture that ensures all emulators are ready.
    
    This fixture:
    1. Waits for emulators to be healthy
    2. Sets up test databases/containers
    3. Sets environment variables for the test session
    4. Cleans up after all tests complete
    """
    # Wait for emulators
    azurite_ready = await wait_for_azurite()
    cosmos_ready = await wait_for_cosmos()
    
    if not azurite_ready:
        pytest.skip("Azurite emulator not available")
    
    if not cosmos_ready:
        pytest.skip("Cosmos DB emulator not available")
    
    # Set environment variables for this test session
    os.environ["AZURE_STORAGE_ACCOUNT_URL"] = EmulatorConfig.AZURITE_BLOB_URL
    os.environ["AZURE_STORAGE_KEY"] = EmulatorConfig.AZURITE_ACCOUNT_KEY
    os.environ["AZURE_COSMOS_ENDPOINT"] = EmulatorConfig.COSMOS_ENDPOINT
    os.environ["AZURE_COSMOS_KEY"] = EmulatorConfig.COSMOS_KEY
    os.environ["AZURE_COSMOS_DB"] = EmulatorConfig.COSMOS_DATABASE
    os.environ["AZURE_COSMOS_DB_PREFIX"] = EmulatorConfig.RUN_PREFIX
    
    os.environ["CACHE_TYPE"] = "memory"
    
    # Set up test infrastructure
    await setup_azurite_container("uploads")
    await setup_cosmos_database(EmulatorConfig.COSMOS_DATABASE)
    
    yield {
        "azurite": azurite_ready,
        "cosmos": cosmos_ready,
        "run_prefix": EmulatorConfig.RUN_PREFIX,
    }
    
    # Cleanup
    await cleanup_azurite_containers()
    await cleanup_cosmos_containers(EmulatorConfig.COSMOS_DATABASE)


@pytest_asyncio.fixture
async def cosmos_emulator_client(emulators_ready):
    """
    Provide a Cosmos client connected to the emulator.
    
    Use this for integration tests that need direct database access.
    """
    from azure.cosmos.aio import CosmosClient
    
    async with CosmosClient(
        EmulatorConfig.COSMOS_ENDPOINT,
        EmulatorConfig.COSMOS_KEY,
        connection_verify=False,
    ) as client:
        database = client.get_database_client(EmulatorConfig.COSMOS_DATABASE)
        yield database


@pytest_asyncio.fixture
async def blob_emulator_client(emulators_ready):
    """
    Provide a Blob client connected to Azurite.
    
    Use this for integration tests that need direct storage access.
    """
    from azure.storage.blob.aio import BlobServiceClient
    
    connection_string = (
        f"DefaultEndpointsProtocol=http;"
        f"AccountName={EmulatorConfig.AZURITE_ACCOUNT_NAME};"
        f"AccountKey={EmulatorConfig.AZURITE_ACCOUNT_KEY};"
        f"BlobEndpoint={EmulatorConfig.AZURITE_BLOB_URL};"
    )
    
    async with BlobServiceClient.from_connection_string(connection_string) as client:
        yield client



# ============================================================================
# TEST DATA SEEDING
# ============================================================================

@pytest_asyncio.fixture
async def seeded_cosmos_data(cosmos_emulator_client):
    """
    Seed Cosmos with test data for integration tests.
    
    Returns the seeded data for assertion in tests.
    """
    from tests.common.factories import user_factory, job_factory
    
    # Get containers
    auth_container = cosmos_emulator_client.get_container_client(
        f"{EmulatorConfig.RUN_PREFIX}auth"
    )
    jobs_container = cosmos_emulator_client.get_container_client(
        f"{EmulatorConfig.RUN_PREFIX}jobs"
    )
    
    # Create test users
    users = [
        user_factory(id="int-user-1", email="user1@test.com", permission="user"),
        user_factory(id="int-admin-1", email="admin@test.com", permission="admin"),
    ]
    
    for user in users:
        await auth_container.upsert_item(user)
    
    # Create test jobs
    jobs = [
        job_factory(id="int-job-1", user_id="int-user-1", status="uploaded"),
        job_factory(id="int-job-2", user_id="int-user-1", status="complete"),
    ]
    
    for job in jobs:
        await jobs_container.upsert_item(job)
    
    yield {"users": users, "jobs": jobs}
    
    # Cleanup seeded data
    for user in users:
        try:
            await auth_container.delete_item(user["id"], partition_key=user["id"])
        except Exception:
            pass
    
    for job in jobs:
        try:
            await jobs_container.delete_item(job["id"], partition_key=job["id"])
        except Exception:
            pass
