from __future__ import annotations

import asyncio
import os
import re
import sys
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Callable, Optional

from azure.core.exceptions import AzureError
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.v1.router import router as api_v1_router
from .core.aiohttp_client import shutdown as aiohttp_client_shutdown
from .core.aiohttp_client import startup as aiohttp_client_startup
from .core.config import AppConfig
from .core.cosmos import CosmosService
from .core.error_handlers import register_error_handlers
from .core.health.startup_validator import StartupValidationError, StartupValidator
from .core.logging import configure_logging, get_logger
from .core.middleware import (
    InputValidationMiddleware,
    RequestContextMiddleware,
    SecurityHeadersMiddleware,
)
from .core.rate_limit import close_rate_limiter, init_rate_limiter
from .repositories.system_health import SystemHealthRepository
from .services.monitoring.system_health_service import SystemHealthService
from .services.storage.blob_service import StorageService
from .utils.permission_cache import get_permission_cache
from .utils.session_lifecycle import heartbeat_threshold_minutes


_env_path = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(_env_path, override=False)

config = AppConfig()
configure_logging(environment=config.environment)
logger = get_logger(__name__)


def configure_cors(app: FastAPI, settings: AppConfig) -> None:
    cors_origins = settings.cors_origins_list if settings.cors_origins_list else []

    if "*" in cors_origins and settings.environment.lower() in {"production", "prod"}:
        logger.critical("security.cors_wildcard_production")
        sys.exit(1)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[] if "*" in cors_origins else cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "Accept",
            "X-Requested-With",
            "Cache-Control",
            "Connection",
            "X-Accel-Buffering",
            "X-Request-ID",
        ],
        expose_headers=[
            "Cache-Control",
            "Connection",
            "X-Accel-Buffering",
            "X-Request-ID",
        ],
    )


def configure_middleware(app: FastAPI) -> None:
    dangerous_pattern = re.compile(
        r"<script[^>]*>.*?</script>|javascript:|on\w+\s*=|\.\./|\.\\\.|<\s*iframe",
        re.IGNORECASE,
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(InputValidationMiddleware, dangerous_pattern=dangerous_pattern)

    from .middleware.session_tracking_middleware import SessiontrackingMiddleware

    app.add_middleware(
        SessiontrackingMiddleware,
        session_service=lambda: app.state.session_tracking_service,
    )
    app.add_middleware(RequestContextMiddleware)


def _is_test_environment() -> bool:
    """Return True when the app is running under pytest-driven test startup."""
    testing_flag = os.getenv("TESTING", "").strip().lower()
    if testing_flag in {"1", "true", "yes", "on"}:
        return True
    return bool(os.getenv("PYTEST_CURRENT_TEST"))


def configure_app_state(app: FastAPI, settings: AppConfig) -> None:
    app.state.config = settings
    app.state.permission_cache = get_permission_cache(settings)
    app.state.cosmos_service = CosmosService(settings)
    app.state.storage_service = StorageService(settings)
    app.state.system_health_service = SystemHealthService(
        SystemHealthRepository(app.state.cosmos_service)
    )
    app.state.session_tracking_service = None

    from .repositories.announcements import AnnouncementRepository
    from .repositories.prompts import PromptRepository
    from .repositories.jobs import JobRepository
    from .repositories.users import UserRepository
    from .services.announcement_service import AnnouncementService
    from .services.auth.permission_service import PermissionService
    from .services.jobs.job_service import JobService
    from .services.prompts.prompt_service import PromptService

    app.state.user_repository = UserRepository(
        app.state.cosmos_service,
        permission_cache=app.state.permission_cache,
    )
    app.state.prompt_service = PromptService(PromptRepository(app.state.cosmos_service))
    app.state.job_service = JobService(
        app.state.storage_service,
        JobRepository(app.state.cosmos_service),
        app.state.prompt_service,
    )
    app.state.permission_service = PermissionService(
        app.state.permission_cache,
        user_repository=app.state.user_repository,
    )
    app.state.permission_service.set_prompt_service(app.state.prompt_service)
    app.state.announcement_repository = AnnouncementRepository(app.state.cosmos_service)
    app.state.announcement_service = AnnouncementService(app.state.announcement_repository)


def register_health_routes(app: FastAPI) -> None:
    @app.get("/health/live", tags=["health"])
    async def live_health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/health/ready", tags=["health"])
    async def ready_health() -> dict[str, str]:
        cosmos_service = app.state.cosmos_service
        if hasattr(cosmos_service, "is_available") and not cosmos_service.is_available():
            return {"status": "degraded", "cosmos": "unavailable"}
        return {"status": "ok"}


async def initialize_cosmos(app: FastAPI) -> None:
    cosmos_service = app.state.cosmos_service
    if hasattr(cosmos_service, "is_available") and cosmos_service.is_available():
        await cosmos_service.initialize()
        logger.info("startup.cosmos.initialized")
        return
    logger.warning("startup.cosmos.unavailable")


async def initialize_session_tracking(app: FastAPI) -> asyncio.Task | None:
    from .services.monitoring.session_persistence import CosmosSessionPersistence
    from .services.monitoring.session_tracking_service import SessionTrackingService

    cosmos_service = app.state.cosmos_service
    if not hasattr(cosmos_service, "is_available") or not cosmos_service.is_available():
        raise RuntimeError("CosmosDB unavailable for session tracking")

    container = getattr(cosmos_service, "sessions_container", None)
    if container is None:
        raise RuntimeError("Cosmos DB sessions container not available for session tracking")

    app.state.session_tracking_service = SessionTrackingService(CosmosSessionPersistence(container))
    await app.state.system_health_service.start_monitoring()

    async def session_cleanup_loop() -> None:
        while True:
            stale_minutes = heartbeat_threshold_minutes()
            stale_time = (datetime.now(UTC) - timedelta(minutes=stale_minutes)).isoformat()
            expired = await app.state.session_tracking_service.expire_stale_sessions(
                stale_before_iso=stale_time
            )
            if expired:
                logger.info("sessions.expired", count=expired)
            await asyncio.sleep(300)

    return asyncio.create_task(session_cleanup_loop())


@asynccontextmanager
async def lifespan(app: FastAPI):
    cleanup_task: asyncio.Task | None = None
    logger.info("startup.started")

    try:
        await init_rate_limiter(config.redis_url, prefix="community-brief")
        await initialize_cosmos(app)
        try:
            cleanup_task = await initialize_session_tracking(app)
        except RuntimeError as exc:
            logger.error(
                "startup.session_tracking_failed",
                exc_type=type(exc).__name__,
                error=str(exc),
            )

        validator = StartupValidator(app.state.cosmos_service, config)
        fail_fast = not _is_test_environment()
        try:
            validation_result = await validator.validate_all(fail_fast=fail_fast)
            if validation_result.warnings:
                logger.warning("startup.validation_warnings", count=len(validation_result.warnings))
        except StartupValidationError:
            logger.critical("startup.validation_failed", exc_info=True)
            if fail_fast:
                sys.exit(1)

        await aiohttp_client_startup()

        from .core.http_client import startup as httpx_client_startup

        await httpx_client_startup()
        logger.info("startup.completed")
        yield
    finally:
        logger.info("shutdown.started")
        if cleanup_task:
            cleanup_task.cancel()
            try:
                await cleanup_task
            except asyncio.CancelledError:
                pass

        try:
            await app.state.system_health_service.stop_monitoring()
        except RuntimeError as exc:
            logger.warning(
                "shutdown.system_health_failed",
                exc_type=type(exc).__name__,
                error=str(exc),
                exc_info=True,
            )

        try:
            await app.state.cosmos_service.close()
        except (AzureError, RuntimeError) as exc:
            logger.warning(
                "shutdown.cosmos_failed",
                exc_type=type(exc).__name__,
                error=str(exc),
                exc_info=True,
            )

        await aiohttp_client_shutdown()

        from .core.http_client import shutdown as httpx_client_shutdown

        await httpx_client_shutdown()
        await close_rate_limiter()
        logger.info("shutdown.completed")


def create_app(settings: AppConfig = config, app_lifespan: Optional[Callable] = lifespan) -> FastAPI:
    app = FastAPI(lifespan=app_lifespan)
    configure_app_state(app, settings)
    configure_cors(app, settings)
    configure_middleware(app)
    register_error_handlers(app)
    register_health_routes(app)
    app.include_router(api_v1_router)
    return app


app = create_app(config, lifespan)
