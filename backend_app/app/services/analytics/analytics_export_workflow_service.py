"""HTTP-adjacent analytics export workflows owned outside the route module."""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any, Optional

from fastapi import Response
from fastapi.responses import FileResponse, StreamingResponse

from ...core.errors.domain import ApplicationError, ErrorCode, ValidationError
from ...core.auth import resolve_analytics_business_unit_scope
from ...services.interfaces import ExportServiceInterface


class AnalyticsExportWorkflowService:
    def __init__(self, export_service: ExportServiceInterface) -> None:
        self.export_service = export_service

    async def export_system_prompts(
        self,
        *,
        days: int,
        business_unit_id: Optional[str],
        current_user: dict[str, Any],
    ) -> Response:
        business_unit_ids = _resolve_export_business_units(current_user, business_unit_id)
        result = await self.export_service.export_prompts_csv(
            days=days,
            business_unit_ids=business_unit_ids,
        )
        if result.get("status") == "error":
            raise ApplicationError(
                result.get("message", "Export failed."),
                ErrorCode.EXTERNAL_SERVICE_ERROR,
                status_code=500,
                details={"operation": "export_prompts_csv", "days": days},
            )

        file_path = result["file_path"]
        try:
            with open(file_path, "r", encoding="utf-8") as export_file:
                content = export_file.read()
            return Response(
                content=content,
                media_type="text/csv",
                headers={"Content-Disposition": f"attachment; filename={result['filename']}"},
            )
        finally:
            await self.export_service.cleanup_temp_file(file_path)

    async def export_system_csv(
        self,
        *,
        days: int,
        business_unit_id: Optional[str],
        current_user: dict[str, Any],
    ) -> FileResponse:
        business_unit_ids = _resolve_export_business_units(current_user, business_unit_id)
        result = await self.export_service.export_system_analytics_csv(
            days=days,
            business_unit_ids=business_unit_ids,
        )
        if result.get("status") != "success":
            raise ApplicationError(
                result.get("message", "Export failed."),
                ErrorCode.EXTERNAL_SERVICE_ERROR,
                status_code=500,
                details={
                    "operation": "export_system_analytics_csv",
                    "days": days,
                    "business_unit_ids": business_unit_ids,
                },
            )

        return FileResponse(
            path=result["file_path"],
            media_type=result["content_type"],
            filename=result["filename"],
            background=lambda: asyncio.create_task(self.export_service.cleanup_temp_file(result["file_path"])),
        )

    def export_users(
        self,
        *,
        format: str,
        export_request: Optional[dict],
    ) -> StreamingResponse:
        if format not in ("csv", "pdf"):
            raise ValidationError(
                "Format must be 'csv' or 'pdf'",
                field="format",
                details={"provided": format},
            )

        if format == "pdf":
            raise ApplicationError(
                "PDF export not implemented",
                ErrorCode.OPERATION_NOT_ALLOWED,
                status_code=501,
                details={"format": format},
            )

        filters = export_request.get("filters") if export_request else None
        timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
        filename = f"community-brief-users-{timestamp}.csv"
        return StreamingResponse(
            self.export_service.stream_users_csv(filters),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )

    async def export_user_pdf(
        self,
        *,
        user_id: str,
        include_analytics: bool,
        days: int,
    ) -> FileResponse:
        result = await self.export_service.export_user_details_pdf(user_id, include_analytics, days)
        if result.get("status") == "error":
            raise ApplicationError(
                result.get("message", "Export failed."),
                ErrorCode.EXTERNAL_SERVICE_ERROR,
                status_code=500,
                details={
                    "operation": "export_user_details_pdf",
                    "user_id": user_id,
                    "include_analytics": include_analytics,
                    "days": days,
                },
            )

        return FileResponse(
            path=result["file_path"],
            media_type=result["content_type"],
            filename=result["filename"],
            background=lambda: asyncio.create_task(self.export_service.cleanup_temp_file(result["file_path"])),
        )


def _resolve_export_business_units(
    current_user: dict[str, Any],
    business_unit_id: Optional[str],
) -> Optional[list[str]]:
    return resolve_analytics_business_unit_scope(
        current_user,
        business_unit_id,
        empty_assignment_message="Editor has no business units assigned",
        insufficient_permission_message="Analytics export requires Editor, Moderator, or Admin permission",
    )
