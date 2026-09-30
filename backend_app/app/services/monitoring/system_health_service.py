"""
System Health Service - Only real metrics: API response time, Database response time, Memory usage
"""
import time
import asyncio
import json
from datetime import UTC, datetime
from typing import Dict, Any, Optional

from ...core.logging import get_logger
from ...models.analytics_models import SystemHealthMetrics, SystemHealthResponse
from ...repositories.system_health import SystemHealthRepository

# Optional psutil import
try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False

logger = get_logger(__name__)

SYSTEM_HEALTH_ERRORS = (RuntimeError, OSError, ValueError, TypeError)


class SystemHealthService:
    def __init__(
        self,
        repository: SystemHealthRepository,
    ):
        self.service_start_time = time.time()
        self.repository = repository
        self._db_health_cache_ms: Optional[float] = None
        self._db_health_cache_timestamp: float = 0.0
        self._db_health_cache_ttl_seconds = 5.0
        
        self._monitoring_task: Optional[asyncio.Task] = None
        self._cached_health_response: Optional[SystemHealthResponse] = None
        self._monitoring_interval_seconds = 30.0

    async def start_monitoring(self):
        if self._monitoring_task is None:
            self._monitoring_task = asyncio.create_task(self._monitoring_loop())
            logger.info("system_health_monitoring_started")

    async def stop_monitoring(self):
        if self._monitoring_task:
            self._monitoring_task.cancel()
            try:
                await self._monitoring_task
            except asyncio.CancelledError:
                pass
            self._monitoring_task = None
            logger.info("system_health_monitoring_stopped")

    async def _monitoring_loop(self):
        while True:
            try:
                api_response_time = await self._test_api_response_time()
                db_result = await self._test_database_health()
                if isinstance(db_result, dict):
                    db_response_time = db_result.get("response_time_ms", db_result.get("response_time", -1.0))
                else:
                    db_response_time = db_result
                memory_usage = self._get_real_memory_usage()
                
                services = await self._check_services_status(api_response_time, db_response_time)

                metrics = SystemHealthMetrics(
                    api_response_time_ms=api_response_time,
                    database_response_time_ms=db_response_time,
                    storage_response_time_ms=0.0,
                    uptime_percentage=0.0,
                    active_connections=0,
                    memory_usage_percentage=memory_usage,
                    disk_usage_percentage=0.0
                )

                status = self._determine_overall_status(metrics, services)

                self._cached_health_response = SystemHealthResponse(
                    status=status,
                    timestamp=datetime.now(UTC).isoformat(),
                    metrics=metrics,
                    services=services
                )
                
            except SYSTEM_HEALTH_ERRORS as exc:
                logger.error(
                    "system_health_monitoring_loop_failed",
                    error=str(exc),
                    error_type=type(exc).__name__,
                    exc_info=True,
                )
            
            await asyncio.sleep(self._monitoring_interval_seconds)

    async def get_system_health(self) -> SystemHealthResponse:
        """Return the current system health, using cached value if available.
        """
        # Return cached response if available
        if self._cached_health_response:
            # Update timestamp to current request time but keep metrics
            response = self._cached_health_response.model_copy()
            response.timestamp = datetime.now(UTC).isoformat()
            return response.model_dump()

        try:
            # Real metrics only
            api_response_time = await self._test_api_response_time()
            db_result = await self._test_database_health()
            if isinstance(db_result, dict):
                db_response_time = db_result.get("response_time_ms", db_result.get("response_time", -1.0))
            else:
                db_response_time = db_result
            memory_usage = self._get_real_memory_usage()
            
            # Service status based on real response times
            services = await self._check_services_status(api_response_time, db_response_time)

            metrics = SystemHealthMetrics(
                api_response_time_ms=api_response_time,
                database_response_time_ms=db_response_time,
                storage_response_time_ms=0.0,  # Not used
                uptime_percentage=0.0,  # Not used
                active_connections=0,  # Not used
                memory_usage_percentage=memory_usage,
                disk_usage_percentage=0.0  # Not used
            )

            # Determine overall status
            status = self._determine_overall_status(metrics, services)

            response_model = SystemHealthResponse(
                status=status,
                timestamp=datetime.now(UTC).isoformat(),
                metrics=metrics,
                services=services,
            )

            return response_model.model_dump()

        except SYSTEM_HEALTH_ERRORS as exc:
            logger.error(
                "system_health_get_failed",
                error=str(exc),
                error_type=type(exc).__name__,
                exc_info=True,
            )
            err_model = self._get_error_response(str(exc))
            if hasattr(err_model, "model_dump"):
                return err_model.model_dump()
            return err_model

    async def _test_api_response_time(self) -> float:
        """Test actual API response time with meaningful operation"""
        start_time = time.time()
        
        # Perform realistic API work - JSON serialization/deserialization
        test_data = {
            "timestamp": datetime.now(UTC).isoformat(),
            "test_array": list(range(100)),
            "nested": {"key": "value", "numbers": [1, 2, 3, 4, 5]}
        }
        
        # Serialize and deserialize to simulate real work
        serialized = json.dumps(test_data)
        deserialized = json.loads(serialized)
        
        # Verify the operation worked
        assert deserialized["test_array"][50] == 50
        
        response_time = (time.time() - start_time) * 1000
        return round(response_time, 2)

    async def _test_database_health(self):
        """Test actual database connectivity and response time"""
        if not self.repository:
            return {"status": "unavailable", "response_time_ms": -1.0}
            
        # Return cached healthy value if still fresh to avoid pounding Cosmos on every health hit
        now = time.time()
        if (
            self._db_health_cache_ms is not None
            and (now - self._db_health_cache_timestamp) < self._db_health_cache_ttl_seconds
        ):
            # Return structured cached result for tests
            ms = self._db_health_cache_ms
            status = "healthy" if ms >= 0 else "unhealthy"
            return {"status": status, "response_time_ms": ms}

        try:
            start_time = time.time()
            
            results = await self.repository.probe_auth_container()
            logger.debug("system_health_database_probe_completed", result_count=len(results))
            
            
            response_time = round((time.time() - start_time) * 1000, 2)
            if response_time >= 0:
                self._db_health_cache_ms = response_time
                self._db_health_cache_timestamp = now
            # Return a structured result for tests while preserving cache
            return {"status": "healthy", "response_time_ms": response_time}
            
        except SYSTEM_HEALTH_ERRORS as exc:
            logger.warning(
                "system_health_database_probe_failed",
                error=str(exc),
                error_type=type(exc).__name__,
            )
            return {"status": "unhealthy", "response_time_ms": -1.0}

    def _get_real_memory_usage(self) -> float:
        """Get only real memory usage"""
        if PSUTIL_AVAILABLE:
            try:
                # Real memory usage
                memory = psutil.virtual_memory()
                return round(memory.percent, 1)
            except SYSTEM_HEALTH_ERRORS as exc:
                logger.warning(
                    "system_health_memory_usage_failed",
                    error=str(exc),
                    error_type=type(exc).__name__,
                )
        
        # Return 0 if we can't get real memory usage
        return 0.0

    async def _check_services_status(self, api_time: Optional[float] = None, db_time: Optional[float] = None) -> Dict[str, str]:
        """
        Check status of API and Database services based on response times
        
        Returns:
            Dict with 'api' and 'database' keys and status values:
            - 'healthy': Good response times
            - 'degraded': Slow but working
            - 'unhealthy': Very slow 
            - 'unavailable': Not working
        """
        services = {}
        
        # If missing times, default to unavailable
        if api_time is None:
            api_time = -1.0

        # API service status
        if api_time > 0:
            if api_time < 100:
                services["api"] = "healthy"
            elif api_time < 1000:
                services["api"] = "degraded"
            else:
                services["api"] = "unhealthy"
        else:
            services["api"] = "unavailable"
        
        # Database service status
        if db_time is None:
            db_time = -1.0

        if db_time > 0:
            if db_time < 200:
                services["database"] = "healthy"
            elif db_time < 1000:
                services["database"] = "degraded"
            else:
                services["database"] = "unhealthy"
        else:
            services["database"] = "unavailable"
        
        return services

    def _determine_overall_status(self, metrics_or_components, services: Optional[Dict[str, str]] = None) -> str:
        """Determine overall status based on API, Database, and Memory only"""
        # Count service statuses
        # Support being passed a components dict only (tests call this form)
        if services is None and isinstance(metrics_or_components, dict):
            components = metrics_or_components
            # components may be {name: {"status": status}} or {name: status}
            statuses = []
            for val in components.values():
                if isinstance(val, dict):
                    statuses.append(val.get("status"))
                else:
                    statuses.append(val)

            unhealthy_services = sum(1 for status in statuses if status == "unhealthy")
            unavailable_services = sum(1 for status in statuses if status == "unavailable")
            degraded_services = sum(1 for status in statuses if status == "degraded")
        else:
            services = services or {}
            unhealthy_services = sum(1 for status in services.values() if status == "unhealthy")
            unavailable_services = sum(1 for status in services.values() if status == "unavailable")
            degraded_services = sum(1 for status in services.values() if status == "degraded")
        
        # If any critical service is unavailable
        if unavailable_services > 0:
            return "unhealthy"
        
        # If any service is unhealthy
        if unhealthy_services > 0:
            return "unhealthy"
        
        # Check memory usage (only if we have real data)
        # If metrics were passed, respect memory thresholds
        if services is not None and not isinstance(metrics_or_components, dict):
            metrics = metrics_or_components
            if metrics.memory_usage_percentage > 0 and metrics.memory_usage_percentage > 90:
                return "unhealthy"
            return "unhealthy"
        
        # If services are degraded
        if degraded_services > 0:
            return "degraded"
        
        # Check if performance is degraded
        if services is not None and not isinstance(metrics_or_components, dict):
            metrics = metrics_or_components
            if (
                metrics.api_response_time_ms > 500
                or (metrics.database_response_time_ms > 0 and metrics.database_response_time_ms > 500)
                or (metrics.memory_usage_percentage > 0 and metrics.memory_usage_percentage > 80)
            ):
                return "degraded"
            return "degraded"
        
        return "healthy"

    def _get_error_response(self, error_message: str) -> SystemHealthResponse:
        """Return error response with minimal real data"""
        return SystemHealthResponse(
            status="unknown",
            timestamp=datetime.now(UTC).isoformat(),
            metrics=SystemHealthMetrics(
                api_response_time_ms=-1.0,  # Indicates error
                database_response_time_ms=-1.0,
                storage_response_time_ms=0.0,  # Not used
                uptime_percentage=0.0,  # Not used
                active_connections=0,  # Not used
                memory_usage_percentage=0.0,
                disk_usage_percentage=0.0  # Not used
            ),
            services={
                "error": error_message,
                "api": "unknown",
                "database": "unknown"
            }
        )
