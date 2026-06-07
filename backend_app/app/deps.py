from .core.auth import (
    PermissionContext,
    get_current_user,
    get_current_user_sse,
    get_permission_context,
    require_admin,
    require_editor,
    require_moderator,
    require_user,
    security,
)

from typing import Any
from fastapi import Depends, Request
from fastapi.params import Depends as DependsParam

from .core.config import AppConfig
from .core.cosmos import CosmosService, get_cosmos_service
from .core.errors.handler import DefaultErrorHandler, ErrorHandler
from .core.logging import get_logger
from .services.auth.permission_service import PermissionService
from .repositories.users import UserRepository

logger = get_logger(__name__)


def get_app_config(request: Request) -> AppConfig:
    """Return the application configuration instance from app state."""
    return request.app.state.config


def get_error_handler(
    *,
    logger_name: str = "sonic_brief.api",
) -> ErrorHandler:
    """Return the default structured error handler used across routers."""
    return DefaultErrorHandler(lambda: get_logger(logger_name), base_context=None)


def get_user_repository(
    request: Request,
    cosmos_service: CosmosService = Depends(get_cosmos_service),
) -> UserRepository:
    """Provide user persistence repository."""
    state_repository = getattr(request.app.state, "__dict__", {}).get("user_repository")
    if isinstance(state_repository, UserRepository):
        return state_repository
    return UserRepository(cosmos_service, permission_cache=request.app.state.permission_cache)


def _ensure_user_repository(
    cosmos_service: CosmosService,
    user_repository: UserRepository | DependsParam,
    permission_cache: Any = None,
) -> UserRepository:
    if isinstance(user_repository, DependsParam):
        return UserRepository(cosmos_service, permission_cache=permission_cache)
    return user_repository


def get_permission_service(
    request: Request,
    cosmos_service: CosmosService = Depends(get_cosmos_service),
    user_repository: UserRepository = Depends(get_user_repository),
) -> PermissionService:
    """Provide shared PermissionService wired with Cosmos + caches."""
    state_permission_service = getattr(request.app.state, "__dict__", {}).get("permission_service")
    if isinstance(state_permission_service, PermissionService):
        return state_permission_service

    user_repository = _ensure_user_repository(
        cosmos_service,
        user_repository,
        request.app.state.permission_cache,
    )
    service = PermissionService(request.app.state.permission_cache)
    service.set_user_repository(user_repository)

    # Wire PromptService as well so permission checks can resolve the root
    # business_unit_id for nested categories/subcategories.
    from .repositories.prompts import PromptRepository
    from .services.prompts.prompt_service import PromptService

    service.set_prompt_service(PromptService(PromptRepository(cosmos_service)))

    return service


# === Service Providers ===
# Centralized factories for core domain services

def get_analytics_service(
    cosmos_service: CosmosService = Depends(get_cosmos_service),
    user_repository: UserRepository = Depends(get_user_repository),
):
    """Provide AnalyticsService with request-scoped dependencies."""
    from .repositories.analytics import (
        AnalyticsAuditRepository,
        AnalyticsEventRepository,
        AnalyticsPromptRepository,
        AnalyticsReadRepository,
        AnalyticsSessionRepository,
        AnalyticsUserCountRepository,
    )
    from .services.analytics.analytics_service import AnalyticsService
    user_repository = _ensure_user_repository(cosmos_service, user_repository)
    return AnalyticsService(
        user_repository=user_repository,
        analytics_read_repository=AnalyticsReadRepository(cosmos_service),
        analytics_event_repository=AnalyticsEventRepository(cosmos_service),
        analytics_session_repository=AnalyticsSessionRepository(cosmos_service),
        analytics_audit_repository=AnalyticsAuditRepository(cosmos_service),
        analytics_prompt_repository=AnalyticsPromptRepository(cosmos_service),
        analytics_user_count_repository=AnalyticsUserCountRepository(cosmos_service),
    )


def get_file_security_service(config: AppConfig = Depends(get_app_config)):
    """Provide FileSecurityService instance for dependency injection."""
    from .services.storage.file_security_service import FileSecurityService
    return FileSecurityService(config)


def get_storage_service(request: Request):
    """Provide StorageService instance for dependency injection."""
    return request.app.state.storage_service


def get_announcement_service(request: Request):
    """Provide AnnouncementService instance from app state for DI."""
    return request.app.state.announcement_service


def get_prompt_service(
    cosmos_service: CosmosService = Depends(get_cosmos_service),
    request: Request | None = None,
):
    """Provide PromptService with dependency injection
    
    Returns a PromptService instance for prompt management operations.
    """
    from .repositories.prompts import PromptRepository
    from .services.prompts.prompt_service import PromptService
    # Prefer the app-scoped singleton when available so prompt snapshots and
    # business-unit derivations stay warm across requests.
    if request is not None:
        state_prompt_service = getattr(request.app.state, "__dict__", {}).get("prompt_service")
        if isinstance(state_prompt_service, PromptService):
            return state_prompt_service
    return PromptService(PromptRepository(cosmos_service))


def get_business_unit_service(
    cosmos_service: CosmosService = Depends(get_cosmos_service),
    prompt_service = Depends(get_prompt_service),
):
    """Provide BusinessUnitService with request-scoped dependencies."""
    from .repositories.business_units import BusinessUnitStatsRepository
    from .services.prompts.business_unit_service import BusinessUnitService

    return BusinessUnitService(prompt_service, stats_repository=BusinessUnitStatsRepository(cosmos_service))


def get_prompt_version_service(
    cosmos_service: CosmosService = Depends(get_cosmos_service),
    prompt_service = Depends(get_prompt_service),
):
    """Provide PromptVersionService with dependency injection."""
    from .repositories.prompt_versions import PromptVersionRepository
    from .services.prompts.prompt_version_service import PromptVersionService
    return PromptVersionService(prompt_service, PromptVersionRepository(cosmos_service))


def get_job_service(
    cosmos_service: CosmosService = Depends(get_cosmos_service),
    storage_service = Depends(get_storage_service),
    prompt_service = Depends(get_prompt_service),
    request: Request | None = None,
):
    """Provide JobService with request-scoped dependencies."""
    from .repositories.jobs import JobRepository
    from .services.jobs.job_service import JobService
    if request is not None:
        state_job_service = getattr(request.app.state, "__dict__", {}).get("job_service")
        if isinstance(state_job_service, JobService):
            return state_job_service

    return JobService(storage_service, JobRepository(cosmos_service), prompt_service)

def get_job_management_service(
    cosmos_service: CosmosService = Depends(get_cosmos_service),
    job_service = Depends(get_job_service),
):
    """Provide JobManagementService with dependency injection"""
    from .repositories.jobs import JobRepository
    from .services.jobs.job_management_service import JobManagementService

    return JobManagementService(job_service, JobRepository(cosmos_service))


def get_job_chat_history_service(
    cosmos_service: CosmosService = Depends(get_cosmos_service),
):
    """Provide JobChatHistoryService with dependency injection."""
    from .repositories.jobs import JobRepository
    from .services.jobs.job_chat_history_service import JobChatHistoryService

    return JobChatHistoryService(JobRepository(cosmos_service))


def get_admin_job_reprocess_service(
    cosmos_service: CosmosService = Depends(get_cosmos_service),
    storage_service = Depends(get_storage_service),
):
    """Provide AdminJobReprocessService with dependency injection."""
    from .repositories.jobs import JobRepository
    from .services.jobs.admin_job_reprocess_service import AdminJobReprocessService

    return AdminJobReprocessService(storage_service, JobRepository(cosmos_service))


def get_job_reprocess_service(config: AppConfig = Depends(get_app_config)):
    """Provide JobReprocessService for backend-to-Function analysis reprocessing."""
    from .services.jobs.job_reprocess_service import JobReprocessService

    return JobReprocessService(config)


def get_job_upload_service(
    job_service = Depends(get_job_service),
    analytics_service = Depends(get_analytics_service),
    prompt_service = Depends(get_prompt_service),
):
    """Provide JobUploadService for upload admission and job creation workflow."""
    from .services.jobs.job_upload_service import JobUploadService

    return JobUploadService(job_service, analytics_service, prompt_service)


def get_job_status_stream_service(
    job_service = Depends(get_job_service),
    config: AppConfig = Depends(get_app_config),
):
    """Provide JobStatusStreamService for SSE job status updates."""
    from .services.jobs.job_status_stream_service import JobStatusStreamService

    return JobStatusStreamService(job_service, config)


def get_upload_workflow_service(
    storage_service = Depends(get_storage_service),
    job_service = Depends(get_job_service),
    analytics_service = Depends(get_analytics_service),
    prompt_service = Depends(get_prompt_service),
):
    """Provide UploadWorkflowService for direct and multipart upload workflows."""
    from .services.uploads.upload_workflow_service import UploadWorkflowService

    return UploadWorkflowService(
        storage_service=storage_service,
        job_service=job_service,
        analytics_service=analytics_service,
        prompt_service=prompt_service,
    )


def get_job_sharing_service(
    cosmos_service: CosmosService = Depends(get_cosmos_service),
    announcement_service = Depends(get_announcement_service),
    user_repository: UserRepository = Depends(get_user_repository),
):
    """Provide JobSharingService with dependency injection (wires AnnouncementService)."""
    from .repositories.jobs import JobRepository
    from .services.jobs.job_sharing_service import JobSharingService
    user_repository = _ensure_user_repository(cosmos_service, user_repository)

    return JobSharingService(
        JobRepository(cosmos_service),
        user_repository,
        announcement_service=announcement_service,
    )


# === New Modular Session Services ===

def get_session_tracking_service(request: Request) -> Any:
    """Provide SessionTrackingService from app state."""
    return request.app.state.session_tracking_service


def get_export_service(
    cosmos_service: CosmosService = Depends(get_cosmos_service),
    user_repository: UserRepository = Depends(get_user_repository),
):
    """Provide ExportService with dependency injection."""
    from .repositories.analytics import (
        AnalyticsPromptExportRepository,
        AnalyticsPromptRepository,
        AnalyticsReadRepository,
    )
    from .services.analytics.export_service import ExportService
    
    user_repository = _ensure_user_repository(cosmos_service, user_repository)
    analytics_service = get_analytics_service(cosmos_service, user_repository)
    # Provide prompt service to export service so it can look up category/subcategory names
    from .services.prompts.prompt_service import PromptService
    from .repositories.prompts import PromptRepository
    prompt_service = PromptService(PromptRepository(cosmos_service))
    return ExportService(
        analytics_service=analytics_service,
        prompt_service=prompt_service,
        user_repository=user_repository,
        analytics_repository=AnalyticsReadRepository(cosmos_service),
        prompt_export_repository=AnalyticsPromptExportRepository(cosmos_service),
        prompt_repository=AnalyticsPromptRepository(cosmos_service),
    )


def get_analytics_export_workflow_service(
    export_service = Depends(get_export_service),
) -> Any:
    """Provide route workflow ownership for analytics export endpoints."""
    from .services.analytics.analytics_export_workflow_service import AnalyticsExportWorkflowService

    return AnalyticsExportWorkflowService(export_service)


def get_analytics_read_workflow_service(
    analytics_service = Depends(get_analytics_service),
) -> Any:
    """Provide route workflow ownership for analytics read endpoints."""
    from .services.analytics.analytics_read_workflow_service import AnalyticsReadWorkflowService

    return AnalyticsReadWorkflowService(analytics_service)


def get_user_service(
    cosmos_service: CosmosService = Depends(get_cosmos_service),
    prompt_service = Depends(get_prompt_service),
    user_repository: UserRepository = Depends(get_user_repository),
):
    """Provide UserService for business-unit assignments and user helpers."""
    from .services.users.user_service import UserService
    user_repository = _ensure_user_repository(cosmos_service, user_repository)

    return UserService(prompt_service, user_repository)


def get_user_workflow_service(
    user_service = Depends(get_user_service),
) -> Any:
    """Provide route workflow ownership for user-management endpoints."""
    from .services.users.user_workflow_service import UserWorkflowService

    return UserWorkflowService(user_service)


def get_business_unit_workflow_service(
    business_unit_service = Depends(get_business_unit_service),
    permission_service: PermissionService = Depends(get_permission_service),
    user_service = Depends(get_user_service),
) -> Any:
    """Provide route workflow ownership for business-unit endpoints."""
    from .services.prompts.business_unit_workflow_service import BusinessUnitWorkflowService

    return BusinessUnitWorkflowService(
        business_unit_service=business_unit_service,
        permission_service=permission_service,
        user_service=user_service,
    )


def get_system_health_service(request: Request):
    """Provide SystemHealthService instance from app state."""
    return request.app.state.system_health_service


def get_talking_points_service():
    """Provide TalkingPointsService with dependency injection
    
    Returns a TalkingPointsService instance for talking points validation.
    """
    from .services.prompts.talking_points_service import TalkingPointsService
    return TalkingPointsService()


def get_job_permissions(
    permission_service: PermissionService = Depends(get_permission_service)
) -> Any:
    """Provide job permissions wrapper wired with PermissionService for DI.

    This returns a `JobPermissions` instance configured to use the canonical
    `PermissionService` helpers for normalized permission logic.
    """
    from .services.jobs.job_permissions import JobPermissions
    return JobPermissions(permission_service)


def get_job_sharing_workflow_service(
    sharing_service = Depends(get_job_sharing_service),
    job_service = Depends(get_job_service),
    permissions = Depends(get_job_permissions),
) -> Any:
    """Provide route workflow ownership for job sharing endpoints."""
    from .services.jobs.job_sharing_workflow_service import JobSharingWorkflowService

    return JobSharingWorkflowService(
        sharing_service=sharing_service,
        job_service=job_service,
        permissions=permissions,
    )

    
def get_chatbot_service(config: AppConfig = Depends(get_app_config)):
    """Provide ChatBotService with dependency injection
    
    Returns a ChatBotService instance for AI chatbot interactions.
    Uses Azure OpenAI credentials from configuration.
    """
    from .services.jobs.chatbot_service import ChatBotService
    
    if config.azure_openai_key:
        return ChatBotService(
            azure_endpoint=config.azure_openai_endpoint,
            api_key=config.azure_openai_key,
            api_version=config.azure_openai_api_version,
            model_deployment_name=config.azure_openai_deployment_name,
        )
    else:
        try:
            from azure.identity import DefaultAzureCredential
        except ImportError:
            DefaultAzureCredential = None

        if DefaultAzureCredential is None:
            raise RuntimeError(
                "No Azure OpenAI API key configured and DefaultAzureCredential unavailable for managed identity. "
                "Please either set AZURE_OPENAI_KEY in configuration or ensure the application has Managed Identity "
                "enabled with access to Azure OpenAI."
            )

        credential = DefaultAzureCredential()
        return ChatBotService(
            azure_endpoint=config.azure_openai_endpoint,
            api_key=None,
            api_version=config.azure_openai_api_version,
            model_deployment_name=config.azure_openai_deployment_name,
            credential=credential,
        )


def get_job_analysis_chat_service(
    chatbot_service = Depends(get_chatbot_service),
    chat_history_service = Depends(get_job_chat_history_service),
    storage_service = Depends(get_storage_service),
):
    """Provide JobAnalysisChatService for analysis chat workflow."""
    from .services.jobs.job_analysis_chat_service import JobAnalysisChatService

    return JobAnalysisChatService(chatbot_service, chat_history_service, storage_service)


def get_job_analysis_workflow_service(
    chat_service = Depends(get_job_analysis_chat_service),
    chat_history_service = Depends(get_job_chat_history_service),
    job_service = Depends(get_job_service),
    reprocess_service = Depends(get_job_reprocess_service),
) -> Any:
    """Provide route workflow ownership for job analysis endpoints."""
    from .services.jobs.job_analysis_workflow_service import JobAnalysisWorkflowService

    return JobAnalysisWorkflowService(
        chat_service=chat_service,
        chat_history_service=chat_history_service,
        job_service=job_service,
        reprocess_service=reprocess_service,
    )

__all__ = [
    "CosmosService",
    "PermissionContext",
    "get_admin_job_reprocess_service",
    "get_analytics_export_workflow_service",
    "get_analytics_read_workflow_service",
    "get_analytics_service",
    "get_announcement_service",
    "get_app_config",
    "get_business_unit_service",
    "get_business_unit_workflow_service",
    "get_chatbot_service",
    "get_cosmos_service",
    "get_current_user",
    "get_current_user_sse",
    "get_error_handler",
    "get_export_service",
    "get_file_security_service",
    "get_job_analysis_chat_service",
    "get_job_analysis_workflow_service",
    "get_job_chat_history_service",
    "get_job_management_service",
    "get_job_permissions",
    "get_job_reprocess_service",
    "get_job_service",
    "get_job_sharing_service",
    "get_job_sharing_workflow_service",
    "get_job_status_stream_service",
    "get_job_upload_service",
    "get_permission_context",
    "get_permission_service",
    "get_prompt_service",
    "get_prompt_version_service",
    "get_session_tracking_service",
    "get_storage_service",
    "get_system_health_service",
    "get_talking_points_service",
    "get_upload_workflow_service",
    "get_user_repository",
    "get_user_service",
    "get_user_workflow_service",
    "require_admin",
    "require_editor",
    "require_moderator",
    "require_user",
    "security",
]
