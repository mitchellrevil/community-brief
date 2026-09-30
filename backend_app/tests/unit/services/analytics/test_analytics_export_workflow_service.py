from unittest.mock import AsyncMock, MagicMock

import pytest

from backend_app.app.core.errors.domain import ApplicationError, ErrorCode, ValidationError
from backend_app.app.services.analytics.analytics_export_workflow_service import (
    AnalyticsExportWorkflowService,
)


@pytest.mark.asyncio
async def test_export_system_csv_success(tmp_path):
    export_file = tmp_path / "out.csv"
    export_file.write_text("a,b,c\n1,2,3\n")
    export_service = MagicMock()
    export_service.export_system_analytics_csv = AsyncMock(
        return_value={
            "status": "success",
            "file_path": str(export_file),
            "content_type": "text/csv",
            "filename": "export.csv",
        }
    )

    response = await AnalyticsExportWorkflowService(export_service).export_system_csv(
        days=7,
        business_unit_id=None,
        current_user={"permission": "Admin"},
    )

    assert response.media_type == "text/csv"
    export_service.export_system_analytics_csv.assert_awaited_once_with(days=7, business_unit_ids=None)


@pytest.mark.asyncio
async def test_export_system_csv_failure_raises():
    export_service = MagicMock()
    export_service.export_system_analytics_csv = AsyncMock(return_value={"status": "error", "message": "fail"})

    with pytest.raises(ApplicationError):
        await AnalyticsExportWorkflowService(export_service).export_system_csv(
            days=7,
            business_unit_id=None,
            current_user={"permission": "Admin"},
        )


@pytest.mark.asyncio
async def test_export_system_csv_scopes_editor_to_assigned_business_units(tmp_path):
    export_file = tmp_path / "out.csv"
    export_file.write_text("a,b,c\n1,2,3\n")
    export_service = MagicMock()
    export_service.export_system_analytics_csv = AsyncMock(
        return_value={
            "status": "success",
            "file_path": str(export_file),
            "content_type": "text/csv",
            "filename": "export.csv",
        }
    )

    await AnalyticsExportWorkflowService(export_service).export_system_csv(
        days=7,
        business_unit_id=None,
        current_user={"permission": "Editor", "business_unit_ids": ["bu-1", "bu-2"]},
    )

    export_service.export_system_analytics_csv.assert_awaited_once_with(
        days=7,
        business_unit_ids=["bu-1", "bu-2"],
    )


@pytest.mark.asyncio
async def test_export_system_csv_rejects_unassigned_business_unit():
    export_service = MagicMock()
    export_service.export_system_analytics_csv = AsyncMock()

    with pytest.raises(ApplicationError) as exc:
        await AnalyticsExportWorkflowService(export_service).export_system_csv(
            days=7,
            business_unit_id="bu-2",
            current_user={"permission": "Editor", "business_unit_ids": ["bu-1"]},
        )

    assert exc.value.status_code == 403
    export_service.export_system_analytics_csv.assert_not_called()


@pytest.mark.asyncio
async def test_export_system_prompts_reads_and_cleans_temp_file(tmp_path):
    export_file = tmp_path / "prompts.csv"
    export_file.write_text("Rank,Prompt Name,Total Jobs\n")
    export_service = MagicMock()
    export_service.export_prompts_csv = AsyncMock(
        return_value={
            "status": "success",
            "file_path": str(export_file),
            "filename": "prompts_export.csv",
        }
    )
    export_service.cleanup_temp_file = AsyncMock()

    response = await AnalyticsExportWorkflowService(export_service).export_system_prompts(
        days=30,
        business_unit_id=None,
        current_user={"permission": "Admin"},
    )

    assert response.media_type == "text/csv"
    assert "attachment" in response.headers.get("Content-Disposition", "")
    export_service.cleanup_temp_file.assert_awaited_once_with(str(export_file))


@pytest.mark.asyncio
async def test_export_system_prompts_failure_raises():
    export_service = MagicMock()
    export_service.export_prompts_csv = AsyncMock(return_value={"status": "error", "message": "fail"})

    with pytest.raises(ApplicationError):
        await AnalyticsExportWorkflowService(export_service).export_system_prompts(
            days=30,
            business_unit_id=None,
            current_user={"permission": "Admin"},
        )


@pytest.mark.asyncio
async def test_export_users_csv_success():
    async def stream_rows():
        yield b"col1,col2\n"

    export_service = MagicMock()
    export_service.stream_users_csv = MagicMock(return_value=stream_rows())
    current_user = {"permission": "Admin"}

    response = AnalyticsExportWorkflowService(export_service).export_users(
        format="csv",
        export_request=None,
        current_user=current_user,
    )

    assert response.media_type == "text/csv"
    assert "Content-Disposition" in response.headers
    export_service.stream_users_csv.assert_called_once_with(None, business_unit_ids=None)


@pytest.mark.asyncio
async def test_export_users_csv_scopes_editor_to_assigned_business_units():
    async def stream_rows():
        yield b"col1,col2\n"

    export_service = MagicMock()
    export_service.stream_users_csv = MagicMock(return_value=stream_rows())

    AnalyticsExportWorkflowService(export_service).export_users(
        format="csv",
        export_request={"filters": {"permission": "Editor"}},
        current_user={"permission": "Editor", "business_unit_ids": ["bu-1", "bu-2"]},
    )

    export_service.stream_users_csv.assert_called_once_with(
        {"permission": "Editor"},
        business_unit_ids=["bu-1", "bu-2"],
    )


@pytest.mark.asyncio
async def test_export_users_invalid_format_and_pdf_raise():
    export_service = MagicMock()
    workflow = AnalyticsExportWorkflowService(export_service)

    with pytest.raises(ValidationError):
        workflow.export_users(format="xml", export_request=None, current_user={"permission": "Admin"})

    with pytest.raises(ApplicationError) as exc:
        workflow.export_users(format="pdf", export_request=None, current_user={"permission": "Admin"})

    assert exc.value.status_code == 501


@pytest.mark.asyncio
async def test_export_user_pdf_success(tmp_path):
    export_file = tmp_path / "user.pdf"
    export_file.write_bytes(b"PDFCONTENT")
    export_service = MagicMock()
    export_service.export_user_details_pdf = AsyncMock(
        return_value={
            "status": "success",
            "file_path": str(export_file),
            "content_type": "application/pdf",
            "filename": "user.pdf",
        }
    )

    response = await AnalyticsExportWorkflowService(export_service).export_user_pdf(
        user_id="u1",
        include_analytics=True,
        days=7,
        current_user={"permission": "Admin"},
    )

    assert response.media_type == "application/pdf"
    export_service.export_user_details_pdf.assert_awaited_once_with(
        "u1",
        True,
        7,
        business_unit_ids=None,
    )


@pytest.mark.asyncio
async def test_export_user_pdf_scopes_editor_to_assigned_business_units(tmp_path):
    export_file = tmp_path / "user.pdf"
    export_file.write_bytes(b"PDFCONTENT")
    export_service = MagicMock()
    export_service.export_user_details_pdf = AsyncMock(
        return_value={
            "status": "success",
            "file_path": str(export_file),
            "content_type": "application/pdf",
            "filename": "user.pdf",
        }
    )

    await AnalyticsExportWorkflowService(export_service).export_user_pdf(
        user_id="u1",
        include_analytics=False,
        days=30,
        current_user={"permission": "Editor", "business_unit_ids": ["bu-9"]},
    )

    export_service.export_user_details_pdf.assert_awaited_once_with(
        "u1",
        False,
        30,
        business_unit_ids=["bu-9"],
    )


@pytest.mark.asyncio
async def test_export_user_pdf_error_status_raises():
    export_service = MagicMock()
    export_service.export_user_details_pdf = AsyncMock(
        return_value={"status": "error", "message": "oops", "status_code": 403, "error_code": ErrorCode.FORBIDDEN}
    )

    with pytest.raises(ApplicationError) as exc:
        await AnalyticsExportWorkflowService(export_service).export_user_pdf(
            user_id="u1",
            include_analytics=True,
            days=7,
            current_user={"permission": "Editor", "business_unit_ids": ["bu-1"]},
        )

    assert exc.value.status_code == 403
