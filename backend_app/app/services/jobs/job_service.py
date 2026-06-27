from typing import Dict, Any, List, Optional
from urllib.parse import urlparse
from datetime import UTC, datetime
import asyncio
import re
from ...core.logging import get_logger
from ...repositories.jobs import JobRepository
from ..storage.blob_service import StorageService
from ..prompts.prompt_service import PromptService
from ...utils.cache_utils import TTLCache
import uuid

logger = get_logger(__name__)

JOB_SERVICE_ERRORS = (RuntimeError, OSError, ValueError, TypeError)
JOB_PROMPT_SETTINGS_ERRORS = (RuntimeError, ValueError, TypeError, KeyError)
SPEAKER_HEADER_RE = re.compile(
    r"^(?P<prefix>---\s*Speaker\s+)(?P<speaker_id>\w+)"
    r"(?::\s*(?P<name>[^@\r\n]*?))?\s*@\s*(?P<timestamp>[\d:.\s]+)\s*---(?P<ending>\s*)$"
)


_job_cache = TTLCache(default_ttl=60.0)


class JobService:
    def __init__(
        self,
        storage_service: StorageService,
        job_repository: JobRepository,
        prompt_service: Optional[PromptService] = None,
    ):
        self.repository = job_repository
        self.storage = storage_service
        self.prompt_service = prompt_service

    async def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        async def _fetch():
            return await self.repository.get_by_id(job_id)

        try:
            return await _job_cache.get_or_compute(f"job:{job_id}", _fetch)
        except JOB_SERVICE_ERRORS as e:
            logger.warning(
                "job_retrieval_failed",
                exc_info=True,
                job_id=job_id,
                error_type=type(e).__name__,
            )
            return None

    async def update_job_display_name(self, job_id: str, display_name: str) -> Dict[str, Any]:
        job = await self.get_job(job_id)
        if not job:
            raise ValueError("Job not found")

        job["displayname"] = display_name.strip()
        job["updated_at"] = datetime.now(UTC).isoformat()
        updated_job = await self.repository.replace(job_id, job)
        await invalidate_job_cache(job_id)
        await self.enrich_job_file_urls(updated_job)
        return updated_job

    async def update_transcription_speaker_names(
        self,
        job: Dict[str, Any],
        speaker_names: Dict[str, str],
    ) -> str:
        transcription_text = job.get("text_content")
        transcription_url = job.get("transcription_file_path")
        if not transcription_text:
            if not transcription_url:
                raise ValueError("Transcription not available")
            transcription_text = await self.storage.download_text_from_blob(transcription_url)
            if transcription_text is None:
                raise ValueError("Transcription blob not available")

        updated_text = rewrite_transcription_speaker_names(transcription_text, speaker_names)
        if transcription_url:
            await self.storage.upload_text_to_blob(transcription_url, updated_text)
        if job.get("text_content"):
            job["text_content"] = updated_text

        job["updated_at"] = datetime.now(UTC).isoformat()
        await self.repository.replace(job["id"], job)
        await invalidate_job_cache(job["id"])
        return updated_text

    async def update_analysis_text(
        self,
        job: Dict[str, Any],
        analysis_text: str,
    ) -> Dict[str, Any]:
        job["analysis_text"] = analysis_text
        job["updated_at"] = datetime.now(UTC).isoformat()
        updated_job = await self.repository.replace(job["id"], job)
        await invalidate_job_cache(job["id"])
        return updated_job

    async def get_jobs_with_filters(
        self,
        *,
        current_user: Dict[str, Any],
        job_id: Optional[str] = None,
        status: Optional[str] = None,
        created_at_start: Optional[str] = None,
        created_at_end: Optional[str] = None,
        limit: int = 12,
        offset: int = 0,
    ) -> Dict[str, Any]:
        # Build parameterized where clause + params to avoid fragile string concatenation and
        # centralize query-building logic.
        where_sql, params = self._compose_query_where_params(
            user_id=current_user.get("id"), job_id=job_id, status=status,
            created_at_start=created_at_start, created_at_end=created_at_end,
        )

        # Project only the fields needed by list/detail cards to reduce RU usage and payload size.
        data_query = (
            "SELECT c.id, c.type, c.user_id, c.user_email, c.status, c.created_at, c.updated_at, "
            "c.deleted, c.displayname, c.file_name, c.file_path, c.transcription_file_path, "
            "c.analysis_file_path, c.analysis_attempts, c.prompt_category_id, c.prompt_subcategory_id, "
            "c.shared_with, c.upload_method, c.file_size_bytes, c.analysis_started_at, c.analysis_completed_at "
            f"FROM c WHERE {where_sql} ORDER BY c.created_at DESC OFFSET @offset LIMIT @limit"
        )
        count_query = f"SELECT VALUE COUNT(1) FROM c WHERE {where_sql}"

        params_with_paging = params + [
            {"name": "@offset", "value": int(offset)},
            {"name": "@limit", "value": int(limit)},
        ]

        jobs_task = self.repository.query(data_query, params_with_paging)
        count_task = self.repository.query(count_query, list(params))
        jobs, count_results = await asyncio.gather(jobs_task, count_task)
        total = count_results[0] if count_results else 0

        user_permission = current_user.get("permission")

        for job in jobs:
            job["is_owned"] = job.get("user_id") == current_user["id"]
            job["shared_with_count"] = len(job.get("shared_with", []))
            job["user_permission"] = user_permission

        enrich_tasks = [self.enrich_job_file_urls(job) for job in jobs]
        if enrich_tasks:
            await asyncio.gather(*enrich_tasks)

        return {"count": total, "jobs": jobs}

    def _compose_query_where_params(self, user_id: str, job_id: Optional[str], status: Optional[str], created_at_start: Optional[str] = None, created_at_end: Optional[str] = None):
        """Build a WHERE SQL clause and a list of parameter dicts for Cosmos queries.

        Returns a tuple (where_sql, params) where:
          - where_sql is a string like "c.type = @type AND c.user_id = @user_id"
          - params is a list of {name: "@param", value: value}
        """
        # Validate user_id to ensure no accidental injection from outer layers
        if not user_id:
            raise ValueError("user_id is required")

        where_clauses = [
            "c.type = @type",
            "(NOT IS_DEFINED(c.deleted) OR c.deleted = false)",
            "c.user_id = @user_id",
        ]
        params: List[Dict[str, Any]] = [
            {"name": "@type", "value": "job"},
            {"name": "@user_id", "value": user_id},
        ]

        if job_id:
            where_clauses.append("c.id = @job_id")
            params.append({"name": "@job_id", "value": job_id})

        if status:
            where_clauses.append("c.status = @status")
            params.append({"name": "@status", "value": status})

        # Date range filtering - expect ISO datetime strings (stored as ISO in DB)
        if created_at_start is not None:
            where_clauses.append("c.created_at >= @created_at_start")
            params.append({"name": "@created_at_start", "value": created_at_start})

        if created_at_end is not None:
            where_clauses.append("c.created_at <= @created_at_end")
            params.append({"name": "@created_at_end", "value": created_at_end})

        where_sql = " AND ".join(where_clauses)
        return where_sql, params

    async def enrich_job_file_urls(self, job: Dict[str, Any]):
        file_path = job.get("file_path")
        transcription_file_path = job.get("transcription_file_path")
        analysis_file_path = job.get("analysis_file_path")

        path_lookups: list[tuple[str, str]] = []
        if file_path:
            path_lookups.append(("file_path", file_path))
        if transcription_file_path:
            path_lookups.append(("transcription_file_path", transcription_file_path))
        if analysis_file_path:
            path_lookups.append(("analysis_file_path", analysis_file_path))

        if path_lookups:
            sas_results = await asyncio.gather(
                *(self.storage.add_sas_token_to_url(path) for _, path in path_lookups)
            )
            for (field_name, original_path), sas_url in zip(path_lookups, sas_results):
                if field_name == "file_path":
                    path_parts = urlparse(original_path).path.strip("/").split("/")
                    job["file_name"] = path_parts[-1] if path_parts else None
                job[field_name] = sas_url

        if not job.get("displayname"):
            job["displayname"] = job.get("file_name") or "Untitled Recording"

        # Optional multi-attempt analysis support
        attempts = job.get("analysis_attempts")
        if isinstance(attempts, list) and attempts:
            enriched_attempts = []
            for attempt in attempts:
                if not isinstance(attempt, dict):
                    continue
                attempt_path = attempt.get("analysis_file_path")
                if attempt_path:
                    attempt = dict(attempt)
                    attempt["analysis_file_path"] = await self.storage.add_sas_token_to_url(attempt_path)
                enriched_attempts.append(attempt)
            job["analysis_attempts"] = enriched_attempts
        
        # Phase 4: Enrich with prompt inference settings (read-only display)
        # Show what model/reasoning/verbosity the job will use or has used
        if self.prompt_service and job.get("prompt_subcategory_id"):
            try:
                inference_settings = await self.prompt_service.get_subcategory_inference_settings(
                    job["prompt_subcategory_id"]
                )
                if inference_settings:
                    job["prompt_inference_settings"] = inference_settings
                    logger.debug(
                        "job_prompt_inference_settings_enriched",
                        job_id=job.get("id"),
                        prompt_subcategory_id=job["prompt_subcategory_id"],
                        analysis_model=inference_settings.get("analysis_model"),
                    )
            except JOB_PROMPT_SETTINGS_ERRORS as e:
                logger.warning(
                    "job_prompt_inference_settings_enrichment_failed",
                    exc_info=True,
                    job_id=job.get("id"),
                    prompt_subcategory_id=job.get("prompt_subcategory_id"),
                    error=str(e),
                )
        
        return job

    def close(self):
        logger.info("job_service_closed")

    async def upload_and_create_job(self, file_path: str, original_filename: str, owner_user: Dict[str, Any], metadata: Dict[str, Any] = None) -> Dict[str, Any]:
        """Upload a file to storage and create a minimal job record in Cosmos.

        Returns the created job document.
        """
        if metadata is None:
            metadata = {}

        # Upload file to blob storage
        # `StorageService.upload_file` is now async
        blob_url = await self.storage.upload_file(file_path, original_filename)

        # Build job document
        job_doc = {
            # Ensure Cosmos DB required 'id' is present
            "id": str(uuid.uuid4()),
            "type": "job",
            "created_at": datetime.now(UTC).isoformat(),
            "user_id": owner_user.get("id"),
            "user_email": owner_user.get("email"),
            "file_name": original_filename,
            "file_path": blob_url,
            "status": "uploaded",
        }

        # Merge additional metadata if provided
        job_doc.update(metadata)

        # Persist to Cosmos (uses cosmos helper if available)
        try:
            created = await self.repository.create(job_doc)
            await invalidate_job_cache(created["id"])
            # Enrich returned document with SAS tokens
            await self.enrich_job_file_urls(created)
            return created
        except JOB_SERVICE_ERRORS as e:
            logger.error(
                "job_create_after_upload_failed",
                error=str(e),
                error_type=type(e).__name__,
                user_id=owner_user.get("id"),
            )
            # On failure, attempt best-effort cleanup: remove uploaded blob is intentionally omitted
            raise

    async def create_job_from_blob(
        self,
        blob_url: str,
        original_filename: str,
        owner_user: Dict[str, Any],
        metadata: Dict[str, Any] = None,
    ) -> Dict[str, Any]:
        """Create a job record for a file that was uploaded directly to blob storage.

        Unlike ``upload_and_create_job``, the file already exists in blob storage
        (uploaded via SAS token from the client). We only need to verify it and
        create the Cosmos DB document.
        """
        if metadata is None:
            metadata = {}

        # Verify the blob actually exists and get its size
        blob_size = await self.storage.verify_blob_exists(blob_url)
        logger.info(
            "job_create_from_blob_started",
            blob_url=blob_url[:80],
            size_bytes=blob_size,
        )

        job_doc = {
            "id": str(uuid.uuid4()),
            "type": "job",
            "created_at": datetime.now(UTC).isoformat(),
            "user_id": owner_user.get("id"),
            "user_email": owner_user.get("email"),
            "file_name": original_filename,
            "file_path": blob_url,
            "file_size_bytes": blob_size,
            "status": "uploaded",
            "upload_method": "direct",
        }

        job_doc.update(metadata)

        try:
            created = await self.repository.create(job_doc)
            await invalidate_job_cache(created["id"])
            await self.enrich_job_file_urls(created)
            
            # Phase 2: Write job_id to blob metadata (idempotent, non-blocking)
            # This allows Azure Functions to correlate jobs with blobs without relying on URL parsing
            try:
                metadata_written = await self.storage.set_blob_metadata(
                    blob_url,
                    {"job_id": created["id"]}
                )
                if metadata_written:
                    logger.info(
                        "job_blob_metadata_written",
                        job_id=created["id"],
                        blob_url=blob_url[:80],
                    )
                else:
                    logger.warning(
                        "job_blob_metadata_write_failed",
                        job_id=created["id"],
                        blob_url=blob_url[:80],
                    )
            except JOB_SERVICE_ERRORS as e:
                logger.warning(
                    "job_blob_metadata_write_exception",
                    exc_info=True,
                    job_id=created["id"],
                    blob_url=blob_url[:80],
                    error=str(e),
                    error_type=type(e).__name__,
                )
            
            return created
        except JOB_SERVICE_ERRORS as e:
            logger.error(
                "job_create_from_blob_failed",
                error=str(e),
                error_type=type(e).__name__,
                user_id=owner_user.get("id"),
            )
            raise


async def invalidate_job_cache(job_id: str) -> None:
    """Invalidate the shared job cache for a given job id.

    This is exported as a module function so other services (sharing,
    management) can invalidate cached job data after writes.
    """
    await _job_cache.invalidate(f"job:{job_id}")
    from .job_route_workflow_service import invalidate_job_list_cache

    await invalidate_job_list_cache()


def rewrite_transcription_speaker_names(
    transcription_text: str,
    speaker_names: Dict[str, str],
) -> str:
    normalized_names = {
        str(speaker_id).strip(): str(name).strip()
        for speaker_id, name in speaker_names.items()
    }

    def rewrite_line(line: str) -> str:
        newline = ""
        if line.endswith("\r\n"):
            line, newline = line[:-2], "\r\n"
        elif line.endswith("\n"):
            line, newline = line[:-1], "\n"

        match = SPEAKER_HEADER_RE.match(line)
        if not match:
            return f"{line}{newline}"

        speaker_id = match.group("speaker_id")
        if speaker_id not in normalized_names:
            return f"{line}{newline}"

        display_name = normalized_names[speaker_id]
        name_part = f": {display_name}" if display_name else ""
        return f"--- Speaker {speaker_id}{name_part} @ {match.group('timestamp').strip()} ---{newline}"

    return "".join(rewrite_line(line) for line in transcription_text.splitlines(keepends=True))
