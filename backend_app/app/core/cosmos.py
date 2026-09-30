import asyncio
from typing import Optional, Dict

from azure.core.exceptions import AzureError
from fastapi import Request

from azure.cosmos.aio import CosmosClient as AsyncCosmosClient, ContainerProxy as AsyncContainerProxy
from azure.cosmos.exceptions import CosmosHttpResponseError, CosmosResourceNotFoundError
from azure.identity.aio import DefaultAzureCredential as AsyncDefaultAzureCredential

from .config import AppConfig
from .logging import get_logger

logger = get_logger(__name__)

COSMOS_AVAILABILITY_ERRORS = (RuntimeError, OSError, ValueError, TypeError, AttributeError)

# === Database Service ===
class CosmosService:
    """
    CosmosDB service with proper dependency injection.
    Uses async Cosmos SDK for non-blocking I/O operations.
    """
    
    def __init__(self, config: AppConfig):
        self.config = config
        self._client: Optional[AsyncCosmosClient] = None
        self._database = None
        self._containers: Dict[str, AsyncContainerProxy] = {}
        self._is_available: Optional[bool] = None
        self._initialized = False

    def is_available(self) -> bool:
        """Check if CosmosDB is available and accessible"""
        if self._is_available is not None:
            return self._is_available

        try:
            endpoint = self.config.cosmos_endpoint
        except COSMOS_AVAILABILITY_ERRORS as exc:
            logger.warning(
                "cosmos.is_available_config_failed",
                error=str(exc),
                error_type=type(exc).__name__,
            )
            self._is_available = False
            return False

        if not endpoint:
            self._is_available = False
            return False

        self._is_available = True
        return True
    
    async def initialize(self):
        """
        Async initialization of Cosmos client and database.
        Must be called during application startup before handling requests.
        """
        if self._initialized:
            return
        
        logger.info("cosmos.initialize_started")

        # Prefer explicit key-based auth when a key is provided (common for local dev)
        key = self.config.cosmos_key
        endpoint = self.config.cosmos_endpoint

        if key:
            # Use key-based auth
            logger.info("cosmos.key_auth_selected")
            extracted_key = None
            if isinstance(key, dict):
                for candidate in (
                    "primaryMasterKey",
                    "masterKey",
                    "key",
                    "azure_cosmos_key",
                    "AZURE_COSMOS_KEY",
                    "primarymasterkey",
                ):
                    if candidate in key and isinstance(key[candidate], str):
                        extracted_key = key[candidate]
                        break
            elif isinstance(key, str):
                extracted_key = key
            else:
                try:
                    extracted_key = str(key)
                except (TypeError, ValueError) as e:
                    logger.warning(
                        "cosmos.key_conversion_failed",
                        key_type=type(key).__name__,
                        error=str(e),
                    )
                    extracted_key = None

            if not extracted_key:
                raise RuntimeError(
                    "Unrecognized Cosmos DB key format. Provide a string master key or a TokenCredential implementation."
                )

            if not endpoint:
                raise RuntimeError("Cosmos DB endpoint not configured. Set 'AZURE_COSMOS_ENDPOINT' env var.")

            # Initialize async Cosmos client with consistency level
            from azure.cosmos import ConsistencyLevel
            
            self._client = AsyncCosmosClient(
                url=endpoint,
                credential=extracted_key,
                consistency_level=ConsistencyLevel.Session  # Good balance: fast reads + strong consistency
            )
        else:
            # No key present; fall back to DefaultAzureCredential for managed identity / CLI-based auth
            try:
                logger.info("cosmos.default_credential_auth_selected")
                from azure.cosmos import ConsistencyLevel
                
                credential = AsyncDefaultAzureCredential()
                if not endpoint:
                    raise RuntimeError("Cosmos DB endpoint not configured. Set 'AZURE_COSMOS_ENDPOINT' env var.")
                
                # Initialize async Cosmos client with DefaultAzureCredential
                self._client = AsyncCosmosClient(
                    url=endpoint,
                    credential=credential,
                    consistency_level=ConsistencyLevel.Session
                )
            except CosmosHttpResponseError as ex:
                logger.error(
                    "cosmos.default_credential_initialize_cosmos_failed",
                    endpoint=endpoint,
                    status_code=ex.status_code,
                    error=str(ex),
                    exc_info=True,
                )
                raise
            except (AzureError, RuntimeError, TypeError, ValueError) as ex:
                logger.error(
                    "cosmos.default_credential_initialize_failed",
                    endpoint=endpoint,
                    error=str(ex),
                    error_type=type(ex).__name__,
                    exc_info=True,
                )
                raise
        
        # Initialize database reference
        db_name = self.config.cosmos_database
        if not db_name:
            raise RuntimeError("Cosmos DB name not configured. Set 'AZURE_COSMOS_DB' env var.")

        try:
            self._database = self._client.get_database_client(db_name)
            logger.info("cosmos.initialize_completed", database_name=db_name)
            self._initialized = True
        except CosmosHttpResponseError as e:
            logger.error(
                "cosmos.database_client_get_cosmos_failed",
                database_name=db_name,
                endpoint=endpoint,
                status_code=e.status_code,
                error=str(e),
                exc_info=True,
            )
            raise RuntimeError(
                f"Failed to get Cosmos database client for '{db_name}'. Endpoint={endpoint!r}. Status={e.status_code}. Original: {e}"
            )
        except (AzureError, RuntimeError, TypeError, ValueError) as e:
            logger.error(
                "cosmos.database_client_get_failed",
                database_name=db_name,
                endpoint=endpoint,
                error=str(e),
                error_type=type(e).__name__,
                exc_info=True,
            )
            raise RuntimeError(
                f"Failed to get Cosmos database client for '{db_name}'. Endpoint={endpoint!r}. Original: {e}"
            )

    async def ping(self, timeout_seconds: int = 5) -> bool:
        """
        Lightweight async health ping for Cosmos DB.

        Attempts to initialize the client and read the database properties with
        a short timeout to validate connectivity and credentials. Returns True
        on success and False on any failure.
        """
        try:
            # Ensure client and database are initialized (within timeout)
            await asyncio.wait_for(self.initialize(), timeout=timeout_seconds)

            # Double-check database read is responsive
            try:
                await asyncio.wait_for(self.database.read(), timeout=timeout_seconds)
            except (asyncio.TimeoutError, AzureError, CosmosHttpResponseError, RuntimeError) as e:  # pragma: no cover - defensive
                logger.error(
                    "cosmos.ping_database_read_failed",
                    error=str(e),
                    error_type=type(e).__name__,
                    exc_info=True,
                )
                return False

            return True
        except asyncio.TimeoutError:
            logger.error("cosmos.ping_timed_out", timeout_seconds=timeout_seconds, exc_info=True)
            return False
        except (AzureError, CosmosHttpResponseError, RuntimeError) as e:
            logger.error(
                "cosmos.ping_failed",
                error=str(e),
                error_type=type(e).__name__,
                exc_info=True,
            )
            return False
    
    @property
    def client(self) -> AsyncCosmosClient:
        """Get initialized Cosmos client. Call initialize() first during startup."""
        if self._client is None:
            raise RuntimeError("CosmosService not initialized. Call await cosmos_service.initialize() during startup.")
        return self._client
    
    @property
    def database(self):
        """Get initialized database reference. Call initialize() first during startup."""
        if self._database is None:
            raise RuntimeError("CosmosService not initialized. Call await cosmos_service.initialize() during startup.")
        return self._database
    
    async def close(self):
        """Close async Cosmos client and cleanup resources. Call during application shutdown."""
        if self._client is not None:
            logger.info("cosmos.close_started")
            await self._client.close()
            self._client = None
            self._database = None
            self._containers.clear()
            self._initialized = False
            logger.info("cosmos.close_completed")
    
    def get_container(self, container_name: str) -> AsyncContainerProxy:
        """Get async container reference with caching"""
        if container_name not in self._containers:
            actual_name = self.config.cosmos_containers.get(container_name, container_name)
            try:
                self._containers[container_name] = self.database.get_container_client(actual_name)
            except CosmosResourceNotFoundError as e:
                # Try raw container name as a fallback (in case environment uses different prefix)
                try:
                    logger.warning(
                        "cosmos.container_prefixed_name_missing",
                        prefixed_name=actual_name,
                        raw_name=container_name,
                        status_code=e.status_code,
                    )
                    self._containers[container_name] = self.database.get_container_client(container_name)
                    logger.info(
                        "cosmos.container_raw_name_selected",
                        container_name=container_name,
                    )
                except CosmosHttpResponseError as e2:
                    endpoint = self.config.cosmos_endpoint
                    db = self.config.cosmos_database
                    logger.error(
                        "cosmos.container_get_with_fallback_cosmos_failed",
                        prefixed_name=actual_name,
                        raw_name=container_name,
                        endpoint=endpoint,
                        database=db,
                        status_code=e2.status_code,
                        error=str(e2),
                        exc_info=True,
                    )
                    raise RuntimeError(
                        f"Container not found: '{actual_name}' or '{container_name}'. Endpoint={endpoint!r}, Database={db!r}. Status={e2.status_code}"
                    )
                except (AzureError, RuntimeError, TypeError, ValueError) as e2:
                    endpoint = self.config.cosmos_endpoint
                    db = self.config.cosmos_database
                    logger.error(
                        "cosmos.container_get_with_fallback_failed",
                        prefixed_name=actual_name,
                        raw_name=container_name,
                        endpoint=endpoint,
                        database=db,
                        error=str(e2),
                        error_type=type(e2).__name__,
                        exc_info=True,
                    )
                    raise RuntimeError(
                        f"Failed to get Cosmos container '{actual_name}' or fallback '{container_name}'. Endpoint={endpoint!r}, Database={db!r}. Originals: {e}; {e2}"
                    )
            except CosmosHttpResponseError as e:
                logger.error(
                    "cosmos.container_get_cosmos_failed",
                    container_name=actual_name,
                    status_code=e.status_code,
                    error=str(e),
                    exc_info=True,
                )
                raise RuntimeError(
                    f"Failed to get Cosmos container '{actual_name}'. Status={e.status_code}. Error: {e}"
                )
            except (AzureError, RuntimeError, TypeError, ValueError) as e:
                logger.error(
                    "cosmos.container_get_failed",
                    container_name=actual_name,
                    error=str(e),
                    error_type=type(e).__name__,
                    exc_info=True,
                )
                raise RuntimeError(
                    f"Failed to get Cosmos container '{actual_name}'. Error: {e}"
                )
        return self._containers[container_name]
    
    @property
    def sessions_container(self):
        """Provide sessions container reference (user sessions)."""
        return self.get_container("user_sessions")
    
    @property
    def audit_container(self):
        """Provide audit logs container reference."""
        return self.get_container("audit_logs")


def get_cosmos_service(request: Request) -> CosmosService:
    """Get the CosmosDB service instance from app state."""
    return request.app.state.cosmos_service
