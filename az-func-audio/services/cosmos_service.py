from typing import Dict, Any, Optional
from datetime import UTC, datetime
import structlog
from azure.cosmos import CosmosClient
from azure.cosmos.exceptions import CosmosHttpResponseError
from config import AppConfig
from urllib.parse import urlparse

logger = structlog.get_logger(__name__)

COSMOS_SERVICE_ERRORS = (CosmosHttpResponseError, RuntimeError, ValueError, TypeError, KeyError)


class CosmosServiceError(Exception):
    """Custom exception for Cosmos service errors."""
    pass

class CosmosService:
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
            raise CosmosServiceError(f"Error retrieving file by blob url: {str(e)}") from e

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

    def update_job_status(
        self, job_id: str, status: str, **kwargs
    ) -> Dict[str, Any]:
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
                if previous_path and not any(a.get("analysis_file_path") == previous_path for a in existing_attempts if isinstance(a, dict)):
                    existing_attempts.append({
                        "attempt": len(existing_attempts) + 1,
                        "analysis_file_path": previous_path,
                        "created_at": job.get("analysis_completed_at") or job.get("updated_at") or job.get("created_at"),
                    })

                # Append new attempt if not already present.
                if not any(a.get("analysis_file_path") == new_analysis_path for a in existing_attempts if isinstance(a, dict)):
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
                kwargs["analysis_latest_attempt"] = existing_attempts[-1].get("attempt") if existing_attempts else None

            updates = {
                "status": status,
                "updated_at": datetime.now(UTC).isoformat(),
                **kwargs,
            }
            job.update(updates)
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
            return self.jobs_container.upsert_item(body=job)
        except COSMOS_SERVICE_ERRORS as e:
            logger.error(
                "cosmos_job_upsert_failed",
                job_id=job.get("id"),
                error=str(e),
                error_type=type(e).__name__,
            )
            raise CosmosServiceError(f"Error upserting job: {str(e)}") from e

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
            raise CosmosServiceError(f"Error retrieving prompt metadata: {str(e)}") from e


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
