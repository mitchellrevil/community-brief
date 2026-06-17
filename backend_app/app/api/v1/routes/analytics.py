"""Analytics routes."""

from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from fastapi import Response
from ....core.rate_limit import standard_rate_limit
from fastapi.responses import FileResponse, StreamingResponse

from ....core.auth import require_admin, require_editor
from ....deps import get_analytics_export_workflow_service, get_analytics_read_workflow_service
from ....models.analytics_models import (
    AdminSessionsResponse,
    UserAnalyticsResponse,
    UserMinutesResponse,
    UserSessionsResponse,
)
from ....services.analytics.analytics_export_workflow_service import AnalyticsExportWorkflowService
from ....services.analytics.analytics_read_workflow_service import AnalyticsReadWorkflowService

router = APIRouter(prefix="/analytics", dependencies=[Depends(standard_rate_limit)])


@router.get("/users/{user_id}/analytics", response_model=UserAnalyticsResponse, tags=["user-analytics"])
async def get_user_analytics(
    user_id: str,
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(1000, ge=1, le=10000, description="Max records to return"),
    offset: int = Query(0, ge=0, description="Number of records to skip"),
    current_user: dict[str, Any] = Depends(require_admin),
    read_workflow: AnalyticsReadWorkflowService = Depends(get_analytics_read_workflow_service),
) -> dict[str, Any]:
    return await read_workflow.get_user_analytics(user_id=user_id, days=days, limit=limit, offset=offset)


@router.get("/users/{user_id}/session-summary", tags=["user-analytics"])
async def get_user_session_summary(
    user_id: str,
    days: int = Query(default=30, description="Number of days to analyze"),
    limit: int = Query(1000, ge=1, le=10000, description="Max sessions to return"),
    offset: int = Query(0, ge=0, description="Number of sessions to skip"),
    current_user: dict[str, Any] = Depends(require_admin),
    read_workflow: AnalyticsReadWorkflowService = Depends(get_analytics_read_workflow_service),
) -> dict[str, Any]:
    return await read_workflow.get_user_session_summary(user_id=user_id, days=days, limit=limit, offset=offset)


@router.get("/users/{user_id}/session-analytics", tags=["user-analytics"])
async def get_user_session_analytics(
    user_id: str,
    days: int = Query(default=30, description="Number of days to analyze"),
    limit: int = Query(1000, ge=1, le=10000, description="Max sessions to return"),
    offset: int = Query(0, ge=0, description="Number of sessions to skip"),
    current_user: dict[str, Any] = Depends(require_admin),
    read_workflow: AnalyticsReadWorkflowService = Depends(get_analytics_read_workflow_service),
) -> dict[str, Any]:
    return await read_workflow.get_user_session_analytics(user_id=user_id, days=days, limit=limit, offset=offset)


@router.get("/sessions", response_model=AdminSessionsResponse, tags=["user-analytics"])
async def get_admin_sessions(
    days: int = Query(default=30, ge=1, le=365, description="Number of days to analyze"),
    status: Optional[str] = Query(default=None, description="Filter by session status"),
    user_id: Optional[str] = Query(default=None, description="Filter by user id"),
    limit: int = Query(default=100, ge=1, le=1000, description="Max sessions to return"),
    offset: int = Query(default=0, ge=0, description="Number of sessions to skip"),
    current_user: dict[str, Any] = Depends(require_admin),
    read_workflow: AnalyticsReadWorkflowService = Depends(get_analytics_read_workflow_service),
) -> dict[str, Any]:
    return await read_workflow.get_admin_sessions(
        days=days,
        status=status,
        user_id=user_id,
        limit=limit,
        offset=offset,
    )


@router.get("/users/{user_id}/detailed-sessions", tags=["user-analytics"])
async def get_user_detailed_sessions(
    user_id: str,
    days: int = Query(default=7, description="Number of days to analyze"),
    limit: int = Query(default=50, description="Maximum number of sessions to return"),
    include_audit: bool = Query(default=True, description="Include audit log entries"),
    current_user: dict[str, Any] = Depends(require_admin),
    read_workflow: AnalyticsReadWorkflowService = Depends(get_analytics_read_workflow_service),
) -> dict[str, Any]:
    return await read_workflow.get_user_detailed_sessions(
        user_id=user_id,
        days=days,
        limit=limit,
        include_audit=include_audit,
    )


@router.get("/users/{user_id}/sessions", response_model=UserSessionsResponse, tags=["user-analytics"])
async def get_user_sessions(
    user_id: str,
    days: int = Query(default=30, ge=1, le=365, description="Number of days to analyze"),
    status: Optional[str] = Query(default=None, description="Filter by session status"),
    limit: int = Query(default=100, ge=1, le=1000, description="Max sessions to return"),
    offset: int = Query(default=0, ge=0, description="Number of sessions to skip"),
    current_user: dict[str, Any] = Depends(require_admin),
    read_workflow: AnalyticsReadWorkflowService = Depends(get_analytics_read_workflow_service),
) -> dict[str, Any]:
    return await read_workflow.get_user_sessions(
        user_id=user_id,
        days=days,
        status=status,
        limit=limit,
        offset=offset,
    )


@router.get("/users/{user_id}/minutes", response_model=UserMinutesResponse, tags=["user-analytics"])
async def get_user_minutes(
    user_id: str,
    days: int = Query(30, ge=1, le=365),
    current_user: dict[str, Any] = Depends(require_admin),
    read_workflow: AnalyticsReadWorkflowService = Depends(get_analytics_read_workflow_service),
) -> dict[str, Any]:
    return await read_workflow.get_user_minutes(user_id=user_id, days=days)


@router.get("/system", tags=["user-analytics"])
async def get_system_analytics(
    days: int = Query(30, ge=1, le=365),
    business_unit_id: Optional[str] = Query(
        None,
        description="Filter by business unit (Admin only). Editors automatically filtered to their BU.",
    ),
    current_user: dict[str, Any] = Depends(require_editor),
    read_workflow: AnalyticsReadWorkflowService = Depends(get_analytics_read_workflow_service),
) -> dict[str, Any]:
    return await read_workflow.get_system_analytics(
        days=days,
        business_unit_id=business_unit_id,
        current_user=current_user,
    )


@router.get("/system/export/prompts", tags=["user-analytics"])
async def export_system_prompts(
    days: int = Query(30, ge=1, le=365),
    business_unit_id: Optional[str] = Query(
        None,
        description="Filter by business unit (Admin only). Editors automatically filtered to their BU.",
    ),
    current_user: dict[str, Any] = Depends(require_editor),
    export_workflow: AnalyticsExportWorkflowService = Depends(get_analytics_export_workflow_service),
) -> Response:
    return await export_workflow.export_system_prompts(
        days=days,
        business_unit_id=business_unit_id,
        current_user=current_user,
    )


@router.get("/export/system/csv", tags=["analytics.export"])
async def export_system_csv(
    days: int = Query(30, ge=1, le=365),
    business_unit_id: Optional[str] = Query(
        None,
        description="Filter by business unit (Admin only). Editors automatically filtered to their BU.",
    ),
    current_user: dict[str, Any] = Depends(require_editor),
    export_workflow: AnalyticsExportWorkflowService = Depends(get_analytics_export_workflow_service),
) -> FileResponse:
    return await export_workflow.export_system_csv(
        days=days,
        business_unit_id=business_unit_id,
        current_user=current_user,
    )


@router.post("/export/users/{format}", tags=["analytics.export"])
async def export_users(
    format: str,
    export_request: Optional[dict] = None,
    current_user: dict[str, Any] = Depends(require_editor),
    export_workflow: AnalyticsExportWorkflowService = Depends(get_analytics_export_workflow_service),
) -> StreamingResponse:
    return export_workflow.export_users(format=format, export_request=export_request)


@router.get("/export/users/{user_id}/pdf", tags=["analytics.export"])
async def export_user_pdf(
    user_id: str,
    include_analytics: bool = Query(True),
    days: int = Query(30, ge=1, le=365),
    current_user: dict[str, Any] = Depends(require_editor),
    export_workflow: AnalyticsExportWorkflowService = Depends(get_analytics_export_workflow_service),
) -> FileResponse:
    return await export_workflow.export_user_pdf(
        user_id=user_id,
        include_analytics=include_analytics,
        days=days,
    )
