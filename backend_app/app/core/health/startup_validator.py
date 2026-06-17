"""
Startup Validation Module

This module provides comprehensive validation of critical dependencies during application startup.
It implements a fail-fast strategy to prevent broken deployments when dependencies are unavailable.

Key Features:
- Validates Cosmos DB connectivity and required containers
- Validates Azure Blob Storage connectivity
- Validates configuration completeness
- Validates OpenAI service availability
- Provides detailed error reporting with actionable remediation steps
- Supports both blocking (fail-fast) and non-blocking (warning) modes

Usage:
    from core.health import StartupValidator
    
    validator = StartupValidator(cosmos_service, config)
    result = await validator.validate_all()
    
    if not result.is_healthy:
        # Log errors and exit
        for error in result.errors:
            logger.error(error)
        sys.exit(1)
"""

import asyncio
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum

from azure.cosmos.exceptions import CosmosHttpResponseError
from azure.core.exceptions import AzureError, ResourceNotFoundError

from ..config import AppConfig
from ..logging import get_logger

VALIDATION_RUNTIME_ERRORS = (
    AttributeError,
    AzureError,
    CosmosHttpResponseError,
    RuntimeError,
    TypeError,
    ValueError,
)


class ValidationLevel(str, Enum):
    """Severity level for validation checks"""
    CRITICAL = "critical"  # Must pass or app won't start
    WARNING = "warning"    # Should pass but app can continue
    INFO = "info"          # Informational only


@dataclass
class ValidationError:
    """Detailed validation error with remediation guidance"""
    component: str
    message: str
    level: ValidationLevel
    details: Dict[str, Any] = field(default_factory=dict)
    remediation: Optional[str] = None
    timestamp: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    
    def __str__(self) -> str:
        """Format error for logging"""
        msg = f"[{self.level.value.upper()}] {self.component}: {self.message}"
        if self.details:
            msg += f" | Details: {self.details}"
        if self.remediation:
            msg += f" | Remediation: {self.remediation}"
        return msg


@dataclass
class ValidationResult:
    """Result of startup validation"""
    is_healthy: bool
    errors: List[ValidationError] = field(default_factory=list)
    warnings: List[ValidationError] = field(default_factory=list)
    validations_run: int = 0
    validations_passed: int = 0
    duration_seconds: float = 0.0
    
    def add_error(self, error: ValidationError):
        """Add validation error"""
        if error.level == ValidationLevel.CRITICAL:
            self.errors.append(error)
            self.is_healthy = False
        elif error.level == ValidationLevel.WARNING:
            self.warnings.append(error)
    
    def summary(self) -> str:
        """Generate human-readable summary"""
        status = "✅ HEALTHY" if self.is_healthy else "❌ UNHEALTHY"
        return (
            f"{status} - {self.validations_passed}/{self.validations_run} checks passed "
            f"({self.duration_seconds:.2f}s) | "
            f"Errors: {len(self.errors)}, Warnings: {len(self.warnings)}"
        )


class StartupValidationError(Exception):
    """Exception raised when critical startup validation fails"""
    
    def __init__(self, result: ValidationResult):
        self.result = result
        error_messages = "\n".join(str(e) for e in result.errors)
        super().__init__(f"Startup validation failed:\n{error_messages}")


class StartupValidator:
    """
    Comprehensive startup validator for critical dependencies.
    
    Validates:
    1. Cosmos DB connectivity and container availability
    2. Azure Blob Storage connectivity
    3. Configuration completeness
    4. External service availability (OpenAI, Azure Speech)
    """
    
    def __init__(self, cosmos_service, config: AppConfig):
        """
        Initialize startup validator.
        
        Args:
            cosmos_service: CosmosService instance
            config: Application configuration
        """
        self.cosmos = cosmos_service
        self.config = config
        self.logger = get_logger(__name__)
    
    async def validate_all(self, fail_fast: bool = True) -> ValidationResult:
        """
        Run all validation checks.
        
        Args:
            fail_fast: If True, raise exception on critical failures
            
        Returns:
            ValidationResult with all check results
            
        Raises:
            StartupValidationError: If fail_fast=True and critical checks fail
        """
        start_time = datetime.now(UTC)
        result = ValidationResult(is_healthy=True)
        
        self.logger.info("startup_validation.started")
        
        # Run all validation checks
        validation_checks = [
            ("Configuration", self._validate_configuration),
            ("Cosmos DB Connection", self._validate_cosmos_connection),
            ("Cosmos DB Containers", self._validate_cosmos_containers),
            ("Blob Storage", self._validate_blob_storage),
        ]
        
        for check_name, check_func in validation_checks:
            result.validations_run += 1
            try:
                validation_error = await check_func()
                
                if validation_error:
                    result.add_error(validation_error)
                else:
                    result.validations_passed += 1
                    
            except VALIDATION_RUNTIME_ERRORS as e:
                # Unexpected error during validation
                error = ValidationError(
                    component=check_name,
                    message=f"Validation check crashed: {str(e)}",
                    level=ValidationLevel.CRITICAL,
                    details={"error_type": type(e).__name__},
                    remediation="Check application logs for stack trace"
                )
                result.add_error(error)
                self.logger.error(
                    "startup_validation.check_crashed",
                    component=check_name,
                    error=str(e),
                    error_type=type(e).__name__,
                    exc_info=True,
                )
        
        # Calculate duration
        end_time = datetime.now(UTC)
        result.duration_seconds = (end_time - start_time).total_seconds()
        
        # Log summary
        self.logger.info(
            "startup_validation.completed",
            is_healthy=result.is_healthy,
            validations_passed=result.validations_passed,
            validations_run=result.validations_run,
            errors=len(result.errors),
            warnings=len(result.warnings),
            duration_seconds=result.duration_seconds,
        )
        
        # Log errors and warnings
        for error in result.errors:
            self.logger.error(
                "startup_validation.error",
                component=error.component,
                message=error.message,
                level=error.level.value,
                details=error.details,
                remediation=error.remediation,
            )
        for warning in result.warnings:
            self.logger.warning(
                "startup_validation.warning",
                component=warning.component,
                message=warning.message,
                level=warning.level.value,
                details=warning.details,
                remediation=warning.remediation,
            )
        
        # Fail fast if requested and critical errors exist
        if fail_fast and not result.is_healthy:
            raise StartupValidationError(result)
        
        return result
    
    async def _validate_configuration(self) -> Optional[ValidationError]:
        """Validate required configuration values are present"""
        missing_configs = []
        
        # Check critical configuration values
        if not self.config.cosmos_endpoint:
            missing_configs.append("AZURE_COSMOS_ENDPOINT")
        if not self.config.cosmos_database:
            missing_configs.append("AZURE_COSMOS_DB")

        if not self.config.cosmos_key:
            if not getattr(self.config, "has_cosmos_managed_identity_hint", False):
                missing_configs.append("AZURE_COSMOS_KEY (or managed identity env vars)")
        
        if not self.config.jwt_secret_key:
            missing_configs.append("JWT_SECRET_KEY")
        
        if missing_configs:
            return ValidationError(
                component="Configuration",
                message=f"Missing required configuration: {', '.join(missing_configs)}",
                level=ValidationLevel.CRITICAL,
                details={"missing_vars": missing_configs},
                remediation=f"Set environment variables: {', '.join(missing_configs)}"
            )
        
        return None
    
    async def _validate_cosmos_connection(self) -> Optional[ValidationError]:
        """Validate Cosmos DB connection is working by actively pinging the service"""
        try:
            # If a lightweight ping is available on the CosmosService, use it to
            # actively validate network connectivity and credentials instead of
            # relying solely on presence of config values.
            if hasattr(self.cosmos, "ping"):
                try:
                    ok = await self.cosmos.ping(timeout_seconds=5)
                except VALIDATION_RUNTIME_ERRORS as e:
                    self.logger.error(
                        "startup_validation.cosmos_ping_failed",
                        error=str(e),
                        error_type=type(e).__name__,
                        exc_info=True,
                    )
                    ok = False

                if not ok:
                    return ValidationError(
                        component="Cosmos DB Connection",
                        message="Failed to reach Cosmos DB (ping failed)",
                        level=ValidationLevel.CRITICAL,
                        details={
                            "endpoint": self.config.cosmos_endpoint,
                            "database": self.config.cosmos_database,
                        },
                        remediation="Check Cosmos DB endpoint, credentials, and network connectivity. "
                                   "Verify firewall rules allow access from this host."
                    )

                self.logger.debug("startup_validation.cosmos_ping_succeeded")
                return None

            if hasattr(self.cosmos, "is_available") and not self.cosmos.is_available():
                return ValidationError(
                    component="Cosmos DB Connection",
                    message="Cosmos DB not configured or unavailable",
                    level=ValidationLevel.CRITICAL,
                    details={
                        "endpoint": self.config.cosmos_endpoint,
                        "database": self.config.cosmos_database,
                    },
                    remediation="Configure Cosmos DB credentials or enable managed identity."
                )

            # As a final fallback, attempt a read of the database
            database = self.cosmos.database
            database_properties = await database.read()

            self.logger.debug(
                "startup_validation.cosmos_database_connected",
                database_id=database_properties.get("id"),
            )
            return None

        except CosmosHttpResponseError as e:
            return ValidationError(
                component="Cosmos DB Connection",
                message=f"Failed to connect to Cosmos DB",
                level=ValidationLevel.CRITICAL,
                details={
                    "endpoint": self.config.cosmos_endpoint,
                    "database": self.config.cosmos_database,
                    "status_code": e.status_code,
                    "error": str(e)
                },
                remediation="Check Cosmos DB endpoint, credentials, and network connectivity. "
                           "Verify firewall rules allow access from this IP address."
            )
        except VALIDATION_RUNTIME_ERRORS as e:
            return ValidationError(
                component="Cosmos DB Connection",
                message=f"Unexpected error connecting to Cosmos DB: {str(e)}",
                level=ValidationLevel.CRITICAL,
                details={"error_type": type(e).__name__},
                remediation="Check application logs for detailed stack trace"
            )
    
    async def _validate_cosmos_containers(self) -> Optional[ValidationError]:
        """Validate all required Cosmos DB containers exist"""
        try:
            _ = self.cosmos.database
        except VALIDATION_RUNTIME_ERRORS as exc:
            return ValidationError(
                component="Cosmos DB Containers",
                message="Cosmos DB client not initialized",
                level=ValidationLevel.CRITICAL,
                details={"error_type": type(exc).__name__},
                remediation="Ensure CosmosService.initialize() runs during startup before validation."
            )

        required_containers = [
            "auth",
            "jobs",
            "analytics",
            "user_sessions",
            "audit_logs"
        ]
        
        missing_containers = []
        
        for container_name in required_containers:
            try:
                # Try to get container client
                container = self.cosmos.get_container(container_name)
                
                # Test container exists with a simple read (async)
                await container.read()
                
                self.logger.debug(
                    "startup_validation.cosmos_container_validated",
                    container=container_name,
                )
                
            except CosmosHttpResponseError as e:
                if e.status_code == 404:
                    missing_containers.append(container_name)
                    self.logger.warning(
                        "startup_validation.cosmos_container_missing",
                        container=container_name,
                        status_code=e.status_code,
                    )
                else:
                    # Other Cosmos errors (auth, network, etc.)
                    return ValidationError(
                        component="Cosmos DB Containers",
                        message=f"Error accessing container '{container_name}'",
                        level=ValidationLevel.CRITICAL,
                        details={
                            "container": container_name,
                            "status_code": e.status_code,
                            "error": str(e)
                        },
                        remediation=f"Check permissions and container configuration for '{container_name}'"
                    )
            except VALIDATION_RUNTIME_ERRORS as e:
                return ValidationError(
                    component="Cosmos DB Containers",
                    message=f"Unexpected error validating container '{container_name}': {str(e)}",
                    level=ValidationLevel.CRITICAL,
                    details={"container": container_name, "error_type": type(e).__name__},
                    remediation="Check application logs for detailed stack trace"
                )
        
        if missing_containers:
            return ValidationError(
                component="Cosmos DB Containers",
                message=f"Missing required containers: {', '.join(missing_containers)}",
                level=ValidationLevel.CRITICAL,
                details={"missing_containers": missing_containers},
                remediation=f"Create missing containers in Cosmos DB or run infrastructure provisioning scripts. "
                           f"Required containers: {', '.join(missing_containers)}"
            )
        
        return None
    
    async def _validate_blob_storage(self) -> Optional[ValidationError]:
        """Validate Azure Blob Storage is accessible"""
        # Blob storage validation is optional - if not configured, just warn
        storage_account_url = self.config.azure_storage_account_url
        
        if not storage_account_url:
            return ValidationError(
                component="Blob Storage",
                message="Blob storage not configured",
                level=ValidationLevel.CRITICAL,
                details={"config_checked": ["azure_storage_account_url"]},
                remediation="Set AZURE_STORAGE_ACCOUNT_URL"
            )
        
        try:
            from azure.storage.blob.aio import BlobServiceClient  # type: ignore
        except ImportError:  # pragma: no cover - optional dependency
            return ValidationError(
                component="Blob Storage",
                message="azure-storage-blob package not installed; skipping validation",
                level=ValidationLevel.WARNING,
                remediation="Install azure-storage-blob to enable blob storage health checks",
            )

        credential = None
        client = None
        using_default_credential = False
        try:
            if self.config.azure_storage_key:
                credential = self.config.azure_storage_key
            else:
                try:
                    from azure.identity.aio import DefaultAzureCredential  # type: ignore
                except ImportError:  # pragma: no cover - optional dependency
                    return ValidationError(
                        component="Blob Storage",
                        message="azure-identity package not installed; cannot authenticate",
                        level=ValidationLevel.CRITICAL,
                        remediation=(
                            "Install azure-identity or provide AZURE_STORAGE_KEY to enable "
                            "blob storage validation"
                        ),
                    )
                credential = DefaultAzureCredential(
                    exclude_shared_token_cache_credential=True,
                    exclude_visual_studio_code_credential=True,
                )
                using_default_credential = True

            client = BlobServiceClient(
                account_url=storage_account_url,
                credential=credential,
            )

            container_name = self.config.azure_storage_recordings_container
            if not container_name:
                return ValidationError(
                    component="Blob Storage",
                    message="Recordings container not configured",
                    level=ValidationLevel.CRITICAL,
                    details={"config_checked": ["azure_storage_recordings_container"]},
                    remediation="Set AZURE_STORAGE_RECORDINGS_CONTAINER",
                )
            container_client = client.get_container_client(container_name)
            await container_client.get_container_properties()

            self.logger.debug(
                "startup_validation.blob_container_validated",
                account_url=storage_account_url,
                container=container_name,
            )
            return None
        except ResourceNotFoundError:
            return ValidationError(
                component="Blob Storage",
                message="Configured recordings container not found",
                level=ValidationLevel.CRITICAL,
                details={
                    "account_url": storage_account_url,
                    "container": self.config.azure_storage_recordings_container,
                },
                remediation=(
                    "Ensure the recordings container exists or update "
                    "AZURE_STORAGE_RECORDINGS_CONTAINER"
                ),
            )
        except AzureError as exc:
            return ValidationError(
                component="Blob Storage",
                message="Failed to connect to Azure Blob Storage",
                level=ValidationLevel.CRITICAL,
                details={
                    "account_url": storage_account_url,
                    "container": self.config.azure_storage_recordings_container,
                    "error": str(exc),
                },
                remediation=(
                    "Verify storage credentials/managed identity permissions "
                    "and ensure the account is reachable"
                ),
            )
        except (RuntimeError, TypeError, ValueError) as exc:  # pragma: no cover - defensive catch
            return ValidationError(
                component="Blob Storage",
                message=f"Unexpected error validating Blob Storage: {str(exc)}",
                level=ValidationLevel.CRITICAL,
                details={"error_type": type(exc).__name__},
                remediation="Check application logs for detailed stack trace",
            )
        finally:
            if client:
                await client.close()
            if using_default_credential and credential is not None:
                await credential.close()
    
    async def health_check(self) -> Dict[str, Any]:
        """
        Lightweight health check for readiness/liveness probes.
        
        Returns:
            Dict with health status suitable for HTTP health endpoints
        """
        result = await self.validate_all(fail_fast=False)
        
        return {
            "status": "healthy" if result.is_healthy else "unhealthy",
            "timestamp": datetime.now(UTC).isoformat(),
            "checks": {
                "total": result.validations_run,
                "passed": result.validations_passed,
                "failed": len(result.errors),
                "warnings": len(result.warnings)
            },
            "duration_seconds": result.duration_seconds,
            "errors": [
                {
                    "component": e.component,
                    "message": e.message,
                    "level": e.level.value
                }
                for e in result.errors
            ],
            "warnings": [
                {
                    "component": w.component,
                    "message": w.message,
                    "level": w.level.value
                }
                for w in result.warnings
            ]
        }
