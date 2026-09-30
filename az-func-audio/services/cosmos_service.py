from typing import Dict, Any, Optional
from datetime import UTC, datetime, timedelta
from math import ceil
from azure.core import MatchConditions
from azure.cosmos import CosmosClient
from azure.cosmos.exceptions import (
    CosmosHttpResponseError,
    CosmosResourceExistsError,
)
from config import AppConfig
from core.logging import get_logger
from urllib.parse import urlparse

logger = get_logger(__name__)

COSMOS_SERVICE_ERRORS = (
    CosmosHttpResponseError,
    RuntimeError,
    ValueError,
    TypeError,
    KeyError,
)
MAX_JOB_WRITE_RETRIES = 4


class CosmosServiceError(Exception):
    """Custom exception for Cosmos service errors."""

    pass


class CosmosService:
    RETENTION_DAYS = 30
    def __init__(
        self,
        config: AppConfig,
        credential: Any = None,
        cosmos_client: CosmosClient = None,
    ) -> None:
        """Initialize the CosmosService with config, optional credential, and cosmos client."""
        self.config = config
        cosmos_key = getattr(config, "cosmos_key", None)
        if cosmos_key:
            self.credential = cosmos_key
        elif credential is not None:
            self.credential = credential
        else:
            try:
                from azure.identity import DefaultAzureCredential

                self.credential = DefaultAzureCredential(logging_enable=True)
            except (ImportError, ModuleNotFoundError):
                # Defer credential creation failures until authentication is required
                self.credential = None

        self.client = (
            cosmos_client
            if cosmos_client is not None
            else CosmosClient(url=config.cosmos_endpoint, credential=self.credential)
        )
        self.database = self.client.get_database_client(config.cosmos_database)
        self.jobs_container = self.database.get_container_client(
            config.cosmos_jobs_container
        )
        self.prompts_container = self.database.get_container_client(
            config.cosmos_prompts_container
        )

    def get_inference_catalog(self) -> Dict[str, Any]:
        # Lifecycle changes must apply to the next job, including warm workers.
        try:
            catalog = self.prompts_container.read_item(
                item="inference_catalog", partition_key="inference_catalog"
            )
            if not isinstance(catalog, dict) or not catalog.get("models"):
                raise ValueError("Inference catalog is empty or invalid")
            return catalog
        except COSMOS_SERVICE_ERRORS as exc:
            raise CosmosServiceError(
                "Inference catalog unavailable; analysis cannot start"
            ) from exc

    def get_file_by_blob_url(self, blob_url: str) -> Optional[Dict[str, Any]]:
        """Get file document by blob URL.

        This performs an exact match on `c.file_path` first. If no exact match
        is found, perform a suffix-based fallback lookup using the path portion
        of the blob URL (container + blob path). This helps handle cases where
        the stored `file_path` may differ slightly (for example, because of
        SAS tokens or small normalization differences).
        """
        try:
            # Exact match first
            query = "SELECT * FROM c WHERE c.file_path = @file_path"
            files = list(
                self.jobs_container.query_items(
                    query=query,
                    parameters=[{"name": "@file_path", "value": blob_url}],
                    enable_cross_partition_query=True,
                )
            )
            if files:
                return files[0]

            # Fallback: try matching by suffix (container/path/filename)
            try:
                parsed = urlparse(blob_url)
                suffix = parsed.path.lstrip("/")
                fallback_query = "SELECT * FROM c WHERE CONTAINS(c.file_path, @suffix)"
                fallback_files = list(
                    self.jobs_container.query_items(
                        query=fallback_query,
                        parameters=[{"name": "@suffix", "value": suffix}],
                        enable_cross_partition_query=True,
                    )
                )
                if fallback_files:
                    logger.warning(
                        "cosmos_file_lookup_suffix_matched",
                        suffix=suffix,
                    )
                    return fallback_files[0]
            except COSMOS_SERVICE_ERRORS as fallback_e:
                logger.debug(
                    "cosmos_file_lookup_suffix_failed",
                    error=str(fallback_e),
                    error_type=type(fallback_e).__name__,
                )

            return None
        except COSMOS_SERVICE_ERRORS as e:
            logger.error(
                "cosmos_file_lookup_failed",
                error=str(e),
                error_type=type(e).__name__,
            )
            raise CosmosServiceError(
                f"Error retrieving file by blob url: {str(e)}"
            ) from e

    def get_job_by_id(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get job by ID."""
        try:
            job = self.jobs_container.read_item(item=job_id, partition_key=job_id)
            return job if job else None
        except COSMOS_SERVICE_ERRORS as e:
            logger.error(
                "cosmos_job_lookup_failed",
                job_id=job_id,
                error=str(e),
                error_type=type(e).__name__,
            )
            raise CosmosServiceError(f"Error retrieving job by id: {str(e)}") from e

    def update_job_status(self, job_id: str, status: str, **kwargs) -> Dict[str, Any]:
        """Update job status and additional fields."""
        try:
            job = self.get_job_by_id(job_id)
            if not job:
                raise ValueError(f"Job not found: {job_id}")

            # Keep a history of analysis attempts while maintaining the latest pointer.
            new_analysis_path = kwargs.get("analysis_file_path")
            if new_analysis_path:
                existing_attempts = job.get("analysis_attempts")
                if not isinstance(existing_attempts, list):
                    existing_attempts = []

                # Seed from the previous single pointer if attempts were not tracked.
                previous_path = job.get("analysis_file_path")
                if previous_path and not any(
                    a.get("analysis_file_path") == previous_path
                    for a in existing_attempts
                    if isinstance(a, dict)
                ):
                    existing_attempts.append(
                        {
                            "attempt": len(existing_attempts) + 1,
                            "analysis_file_path": previous_path,
                            "created_at": job.get("analysis_completed_at")
                            or job.get("updated_at")
                            or job.get("created_at"),
                        }
                    )

                # Append new attempt if not already present.
                if not any(
                    a.get("analysis_file_path") == new_analysis_path
                    for a in existing_attempts
                    if isinstance(a, dict)
                ):
                    new_attempt = {
                        "attempt": len(existing_attempts) + 1,
                        "analysis_file_path": new_analysis_path,
                        "created_at": datetime.now(UTC).isoformat(),
                    }
                    # Include provider metadata if available (Phase 3 observability)
                    if "analysis_provider" in kwargs:
                        new_attempt["analysis_provider"] = kwargs["analysis_provider"]
                    existing_attempts.append(new_attempt)

                kwargs["analysis_attempts"] = existing_attempts
                kwargs["analysis_latest_attempt"] = (
                    existing_attempts[-1].get("attempt") if existing_attempts else None
                )

            updates = {
                "status": status,
                "updated_at": datetime.now(UTC).isoformat(),
                **kwargs,
            }
            job.update(updates)
            self._preserve_expiry_deadline(job)
            return self.jobs_container.upsert_item(body=job)
        except COSMOS_SERVICE_ERRORS as e:
            logger.error(
                "cosmos_job_status_update_failed",
                job_id=job_id,
                status=status,
                error=str(e),
                error_type=type(e).__name__,
            )
            raise CosmosServiceError(f"Error updating job status: {str(e)}") from e

    def upsert_job(self, job: Dict[str, Any]) -> Dict[str, Any]:
        """Insert or update a job document in Cosmos DB."""
        try:
            self._preserve_expiry_deadline(job)
            return self.jobs_container.upsert_item(body=job)
        except COSMOS_SERVICE_ERRORS as e:
            logger.error(
                "cosmos_job_upsert_failed",
                job_id=job.get("id"),
                error=str(e),
                error_type=type(e).__name__,
            )
            raise CosmosServiceError(f"Error upserting job: {str(e)}") from e

    def create_job_if_missing(self, job: Dict[str, Any]) -> Dict[str, Any]:
        """Create a deterministic reprocess output job without overwriting a retry."""

        try:
            self._preserve_expiry_deadline(job)
            return self.jobs_container.create_item(body=job)
        except CosmosResourceExistsError:
            existing_job = self.get_job_by_id(str(job["id"]))
            if existing_job is None:
                raise CosmosServiceError(
                    f"Job {job['id']} exists but could not be read"
                )
            return existing_job
        except COSMOS_SERVICE_ERRORS as exc:
            raise CosmosServiceError(
                f"Error creating reprocess output job: {exc}"
            ) from exc

    def commit_reprocess_result(
        self,
        job_id: str,
        *,
        job_updates: Dict[str, Any],
        analysis_attempt: Dict[str, Any],
    ) -> tuple[Dict[str, Any], int]:
        """Merge one idempotent analysis attempt into the latest job document."""

        for _ in range(MAX_JOB_WRITE_RETRIES):
            job = self.get_job_by_id(job_id)
            if job is None:
                raise CosmosServiceError(f"Job not found: {job_id}")

            etag = job.get("_etag")
            if not etag:
                raise CosmosServiceError(f"Job {job_id} has no ETag")

            attempts = self._analysis_attempts_with_previous_result(job)
            operation_id = analysis_attempt.get("reprocess_operation_id")
            matching_attempt = next(
                (
                    attempt
                    for attempt in attempts
                    if isinstance(attempt, dict)
                    and (
                        operation_id
                        and attempt.get("reprocess_operation_id") == operation_id
                    )
                ),
                None,
            )
            if matching_attempt is None:
                saved_attempt = {
                    **analysis_attempt,
                    "attempt": len(attempts) + 1,
                }
                attempts.append(saved_attempt)
                attempt_number = int(saved_attempt["attempt"])
            else:
                attempt_number = int(matching_attempt["attempt"])

            job.update(job_updates)
            job["analysis_attempts"] = attempts
            job["analysis_latest_attempt"] = attempt_number
            self._preserve_expiry_deadline(job)

            try:
                saved_job = self.jobs_container.replace_item(
                    item=job_id,
                    body=job,
                    etag=etag,
                    match_condition=MatchConditions.IfNotModified,
                )
                return saved_job, attempt_number
            except CosmosHttpResponseError as exc:
                if exc.status_code != 412:
                    raise CosmosServiceError(
                        f"Error committing reprocess result: {exc}"
                    ) from exc

        raise CosmosServiceError(
            f"Job {job_id} changed too frequently to commit reprocess result"
        )

    def _preserve_expiry_deadline(self, job: Dict[str, Any]) -> None:
        """Keep Function writes from extending a recording's Cosmos TTL."""
        now = datetime.now(UTC)
        expires_at = self._parse_expiry(job.get("expires_at"))
        if expires_at is None:
            created_at = self._parse_expiry(job.get("created_at"))
            expires_at = (created_at or now) + timedelta(days=self.RETENTION_DAYS)
            job["expires_at"] = expires_at.isoformat()

        job["ttl"] = max(1, ceil((expires_at - now).total_seconds()))

    @staticmethod
    def _parse_expiry(value: Any) -> Optional[datetime]:
        if isinstance(value, datetime):
            return value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)
        if not isinstance(value, str):
            return None
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        return parsed.astimezone(UTC) if parsed.tzinfo else parsed.replace(tzinfo=UTC)

    @staticmethod
    def _analysis_attempts_with_previous_result(
        job: Dict[str, Any],
    ) -> list[Dict[str, Any]]:
        existing_attempts = job.get("analysis_attempts")
        attempts = (
            [dict(attempt) for attempt in existing_attempts if isinstance(attempt, dict)]
            if isinstance(existing_attempts, list)
            else []
        )

        previous_path = job.get("analysis_file_path")
        previous_result_is_recorded = any(
            attempt.get("analysis_file_path") == previous_path for attempt in attempts
        )
        if previous_path and not previous_result_is_recorded:
            attempts.append(
                {
                    "attempt": len(attempts) + 1,
                    "analysis_file_path": previous_path,
                    "created_at": (
                        job.get("analysis_completed_at")
                        or job.get("updated_at")
                        or job.get("created_at")
                    ),
                }
            )
        return attempts

    def get_prompts(self, subcategory_id: str) -> Dict[str, Any]:
        """Get prompts for a subcategory."""
        try:
            query = """
                SELECT * FROM c 
                WHERE c.type = 'prompt_subcategory' 
                AND c.id = @subcategory_id
            """
            prompts = list(
                self.prompts_container.query_items(
                    query=query,
                    parameters=[{"name": "@subcategory_id", "value": subcategory_id}],
                    enable_cross_partition_query=True,
                )
            )

            if not prompts:
                raise ValueError(f"No prompts found for subcategory: {subcategory_id}")

            # Get all prompts from the prompts object
            prompt_data = prompts[0].get("prompts", {})

            if not prompt_data:
                raise ValueError("No prompts found in subcategory")

            # Get the first (and only) value from the prompts object
            prompt_text = next(iter(prompt_data.values()))

            # Return the entire prompts object along with metadata
            return prompt_text

        except COSMOS_SERVICE_ERRORS as e:
            logger.error(
                "cosmos_prompts_lookup_failed",
                subcategory_id=subcategory_id,
                error=str(e),
                error_type=type(e).__name__,
            )
            raise CosmosServiceError(f"Error retrieving prompts: {str(e)}") from e

    def get_prompt_metadata(self, subcategory_id: str) -> Dict[str, Any]:
        """Get full prompt document including inference settings.

        Returns the complete prompt document with:
        - prompt text
        - analysis_model (optional)
        - analysis_reasoning (optional)
        - analysis_verbosity (optional)
        - analysis_provider (optional)
        - provider_parameters (optional)
        - other metadata
        """
        try:
            query = """
                SELECT * FROM c 
                WHERE c.type = 'prompt_subcategory' 
                AND c.id = @subcategory_id
            """
            prompts = list(
                self.prompts_container.query_items(
                    query=query,
                    parameters=[{"name": "@subcategory_id", "value": subcategory_id}],
                    enable_cross_partition_query=True,
                )
            )

            if not prompts:
                raise ValueError(f"No prompts found for subcategory: {subcategory_id}")

            return prompts[0]

        except COSMOS_SERVICE_ERRORS as e:
            logger.error(
                "cosmos_prompt_metadata_lookup_failed",
                subcategory_id=subcategory_id,
                error=str(e),
                error_type=type(e).__name__,
            )
            raise CosmosServiceError(
                f"Error retrieving prompt metadata: {str(e)}"
            ) from e


def get_cosmos_client() -> CosmosClient:
    """Factory to create a CosmosClient using AppConfig authentication.

    This mirrors the expectation in other modules (for example, session_cleanup.py)
    which import `get_cosmos_client` from this module.
    """
    config = AppConfig()
    if config.cosmos_key:
        credential = config.cosmos_key
    else:
        try:
            from azure.identity import DefaultAzureCredential

            credential = DefaultAzureCredential(logging_enable=True)
        except (ImportError, ModuleNotFoundError):
            credential = None
    return CosmosClient(url=config.cosmos_endpoint, credential=credential)
