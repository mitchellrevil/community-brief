"""Compatibility entry point for the jobs route's shared upload workflow."""

import asyncio
from typing import Any, Dict, Optional

from fastapi import UploadFile

from ..interfaces import AnalyticsServiceInterface
from ..prompts.prompt_catalog import PromptCatalog
from ..uploads.upload_workflow_service import UploadWorkflowService
from .job_service import JobService


class JobUploadService:
    """Both upload routes use one validation, concurrency, provenance and cleanup path."""

    def __init__(
        self,
        job_service: JobService,
        analytics_service: AnalyticsServiceInterface,
        prompt_catalog: PromptCatalog,
        *,
        upload_semaphore: Optional[asyncio.Semaphore] = None,
    ) -> None:
        self.workflow = UploadWorkflowService(
            storage_service=job_service.storage,
            job_service=job_service,
            analytics_service=analytics_service,
            prompt_catalog=prompt_catalog,
            upload_semaphore=upload_semaphore,
        )

    async def create_job_from_upload(
        self,
        *,
        file: UploadFile,
        current_user: Dict[str, Any],
        prompt_category_id: Optional[str] = None,
        prompt_subcategory_id: Optional[str] = None,
        pre_session_form_data: Optional[str] = None,
        recording_consent: Optional[Dict[str, Any]] = None,
        teams_event_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        return await self.workflow.upload_job_file(
            file=file,
            current_user=current_user,
            prompt_category_id=prompt_category_id,
            prompt_subcategory_id=prompt_subcategory_id,
            pre_session_form_data=pre_session_form_data,
            recording_consent=recording_consent,
            teams_event_id=teams_event_id,
        )
