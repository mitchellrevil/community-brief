from typing import Dict, Any, Optional
from datetime import UTC, datetime
import asyncio

from ...core.config import DatabaseError
from ...core.logging import get_logger
from ...repositories.jobs import JobRepository
from .job_service import JobService

logger = get_logger(__name__)

JOB_MANAGEMENT_ERRORS = (RuntimeError, OSError, ValueError, TypeError)


class JobManagementService:
    def __init__(
        self,
        job_service: JobService,
        job_repository: JobRepository,
    ):
        self.repository = job_repository
        self.job_service = job_service

    async def soft_delete_job(self, job_id: str, user_id: str, is_admin: bool = False) -> Dict[str, Any]:
        try:
            job = await self.repository.get_by_id(job_id)
            if not job:
                return {"status": "error", "message": "Job not found"}
            
            if not is_admin and job.get("user_id") != user_id:
                return {"status": "error", "message": "Access denied: not job owner"}
            
            if job.get("deleted", False):
                return {"status": "error", "message": "Job is already deleted"}
            
            job["deleted"] = True
            job["deleted_at"] = datetime.now(UTC).isoformat()
            job["deleted_by"] = user_id
            
            await self.repository.replace(job_id, job)
            try:
                from .job_service import invalidate_job_cache
                await invalidate_job_cache(job_id)
            except JOB_MANAGEMENT_ERRORS as exc:
                logger.debug(
                    "job_cache_invalidation_failed",
                    exc_info=True,
                    job_id=job_id,
                    error_type=type(exc).__name__,
                )
            
            return {
                "status": "success",
                "message": "Job deleted successfully",
                "job_id": job_id,
                "deleted_at": job["deleted_at"]
            }
            
        except DatabaseError as e:
            logger.error(
                "job_soft_delete_database_error",
                job_id=job_id,
                user_id=user_id,
                error=str(e),
            )
            return {"status": "error", "message": "Database service unavailable"}
        except JOB_MANAGEMENT_ERRORS as e:
            logger.error(
                "job_soft_delete_failed",
                job_id=job_id,
                user_id=user_id,
                error=str(e),
                error_type=type(e).__name__,
            )
            return {"status": "error", "message": str(e)}

    async def restore_job(self, job_id: str, user_id: str, is_admin: bool = False) -> Dict[str, Any]:
        try:
            job = await self.repository.get_by_id(job_id)
            if not job:
                return {"status": "error", "message": "Job not found"}
            
            if not is_admin and job.get("user_id") != user_id:
                return {"status": "error", "message": "Access denied: not job owner"}
            
            if not job.get("deleted", False):
                return {"status": "error", "message": "Job is not deleted"}
            
            # Restore the job
            job["deleted"] = False
            job["restored_at"] = datetime.now(UTC).isoformat()
            job["restored_by"] = user_id
            
            # Remove deletion metadata
            if "deleted_at" in job:
                del job["deleted_at"]
            if "deleted_by" in job:
                del job["deleted_by"]
            
            await self.repository.replace(job_id, job)
            # Cache invalidation is non-critical - log failures at debug level
            try:
                from .job_service import invalidate_job_cache
                await invalidate_job_cache(job_id)
            except JOB_MANAGEMENT_ERRORS as e:
                logger.debug(
                    "job_cache_invalidation_failed",
                    exc_info=True,
                    job_id=job_id,
                    error_type=type(e).__name__,
                )
            
            return {
                "status": "success",
                "message": "Job restored successfully",
                "job_id": job_id,
                "restored_at": job["restored_at"]
            }
            
        except DatabaseError as e:
            logger.error(
                "job_restore_database_error",
                job_id=job_id,
                user_id=user_id,
                error=str(e),
            )
            return {"status": "error", "message": "Database service unavailable"}
        except JOB_MANAGEMENT_ERRORS as e:
            logger.error(
                "job_restore_failed",
                job_id=job_id,
                user_id=user_id,
                error=str(e),
                error_type=type(e).__name__,
            )
            return {"status": "error", "message": str(e)}

    async def permanent_delete_job(self, job_id: str, user_id: str, is_admin: bool = False) -> Dict[str, Any]:
        """
        Permanently delete a job from database and associated files (admin only).
        
        This performs a hard delete that:
        1. Verifies admin access
        2. Retrieves the job to get file paths
        3. Deletes associated blob storage files (audio, transcription, analysis)
        4. Removes the job document from Cosmos DB
        5. Invalidates caches
        
        Args:
            job_id: ID of the job to permanently delete
            user_id: ID of the user performing the deletion (must be admin)
            is_admin: Whether the user is an admin
            
        Returns:
            Dict containing permanent delete result with status and message
        """
        try:
            # Verify admin access
            if not is_admin:
                logger.warning(
                    "job_permanent_delete_denied_non_admin",
                    job_id=job_id,
                    user_id=user_id,
                )
                return {"status": "error", "message": "Access denied: admin privileges required"}
            
            # Get the job first to verify it exists and retrieve file paths
            job = await self.repository.get_by_id(job_id)
            if not job:
                logger.warning(
                    "job_permanent_delete_missing_job",
                    job_id=job_id,
                    user_id=user_id,
                )
                return {"status": "error", "message": "Job not found"}
            
            # Extract file paths for deletion
            file_path = job.get("file_path")
            transcription_path = job.get("transcription_file_path")
            analysis_path = job.get("analysis_file_path")

            analysis_attempt_paths: list[str] = []
            attempts = job.get("analysis_attempts")
            if isinstance(attempts, list):
                for attempt in attempts:
                    if isinstance(attempt, dict) and attempt.get("analysis_file_path"):
                        analysis_attempt_paths.append(attempt.get("analysis_file_path"))
            
            # Delete associated blob storage files
            deletion_errors = []
            
            try:
                from ...core.storage import get_storage_service
                storage_service = get_storage_service()
                
                # Delete audio file if exists
                if file_path:
                    try:
                        await storage_service.delete_blob(file_path)
                        logger.info(
                            "job_audio_blob_deleted",
                            job_id=job_id,
                            file_path=file_path,
                        )
                    except JOB_MANAGEMENT_ERRORS as e:
                        error_msg = f"Failed to delete audio file: {str(e)}"
                        deletion_errors.append(error_msg)
                        logger.warning(
                            "job_audio_blob_delete_failed",
                            exc_info=True,
                            job_id=job_id,
                            file_path=file_path,
                            error_type=type(e).__name__,
                        )
                
                # Delete transcription file if exists
                if transcription_path:
                    try:
                        await storage_service.delete_blob(transcription_path)
                        logger.info(
                            "job_transcription_blob_deleted",
                            job_id=job_id,
                            file_path=transcription_path,
                        )
                    except JOB_MANAGEMENT_ERRORS as e:
                        error_msg = f"Failed to delete transcription file: {str(e)}"
                        deletion_errors.append(error_msg)
                        logger.warning(
                            "job_transcription_blob_delete_failed",
                            exc_info=True,
                            job_id=job_id,
                            file_path=transcription_path,
                            error_type=type(e).__name__,
                        )
                
                # Delete analysis file if exists
                analysis_paths_to_delete = []
                if analysis_path:
                    analysis_paths_to_delete.append(analysis_path)
                analysis_paths_to_delete.extend(analysis_attempt_paths)

                # De-duplicate while preserving order
                seen = set()
                analysis_paths_unique = []
                for p in analysis_paths_to_delete:
                    if p and p not in seen:
                        seen.add(p)
                        analysis_paths_unique.append(p)

                for path in analysis_paths_unique:
                    try:
                        await storage_service.delete_blob(path)
                        logger.info(
                            "job_analysis_blob_deleted",
                            job_id=job_id,
                            file_path=path,
                        )
                    except JOB_MANAGEMENT_ERRORS as e:
                        error_msg = f"Failed to delete analysis file: {str(e)}"
                        deletion_errors.append(error_msg)
                        logger.warning(
                            "job_analysis_blob_delete_failed",
                            exc_info=True,
                            job_id=job_id,
                            file_path=path,
                            error_type=type(e).__name__,
                        )
            except ImportError:
                logger.warning(
                    "job_storage_service_unavailable",
                    job_id=job_id,
                )
            except JOB_MANAGEMENT_ERRORS as e:
                error_msg = f"Error accessing storage service: {str(e)}"
                deletion_errors.append(error_msg)
                logger.error(
                    "job_storage_service_access_failed",
                    exc_info=True,
                    job_id=job_id,
                    error_type=type(e).__name__,
                )
            
            # Delete the job document from Cosmos DB
            deleted = await self.repository.delete(job_id)
            
            if not deleted:
                logger.error(
                    "job_permanent_delete_document_missing",
                    job_id=job_id,
                )
                return {"status": "error", "message": "Job document not found in database"}
            
            # Invalidate cache (non-critical, failures only logged)
            try:
                from .job_service import invalidate_job_cache
                await invalidate_job_cache(job_id)
            except JOB_MANAGEMENT_ERRORS as e:
                logger.debug(
                    "job_cache_invalidation_failed",
                    exc_info=True,
                    job_id=job_id,
                    error_type=type(e).__name__,
                )
            
            logger.info(
                "job_permanent_delete_completed",
                job_id=job_id,
                user_id=user_id,
                deleted_files=bool(file_path or transcription_path or analysis_path),
                file_deletion_errors=len(deletion_errors),
            )
            
            # Build response message
            message = "Job permanently deleted"
            if deletion_errors:
                message += f" (with {len(deletion_errors)} file deletion warning(s))"
            
            return {
                "status": "success",
                "message": message,
                "job_id": job_id,
                "deleted_at": datetime.now(UTC).isoformat(),
                "deletion_warnings": deletion_errors if deletion_errors else None
            }
            
        except DatabaseError as e:
            logger.error(
                "job_permanent_delete_database_error",
                exc_info=True,
                job_id=job_id,
                user_id=user_id,
                error=str(e),
            )
            return {"status": "error", "message": "Database service unavailable"}
        except JOB_MANAGEMENT_ERRORS as e:
            logger.error(
                "job_permanent_delete_failed",
                exc_info=True,
                job_id=job_id,
                user_id=user_id,
                error=str(e),
                error_type=type(e).__name__,
            )
            return {"status": "error", "message": f"Unexpected error: {str(e)}"}

    async def get_deleted_jobs(self, user_id: str, limit: int = 50, offset: int = 0, is_admin: bool = False, filter_user_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Get all soft deleted jobs (admin only).

        Args:
            user_id: ID of the user requesting deleted jobs
            limit: maximum number of jobs to return
            offset: pagination offset
            is_admin: Whether the user is an admin
            filter_user_id: Optional user ID to filter jobs by owner

        Returns:
            Dict containing deleted_jobs list and total_count
        """
        try:
            if not is_admin:
                return {"status": "error", "message": "Access denied: admin privileges required", "deleted_jobs": [], "total_count": 0}

            # Build count query with optional user filter
            count_query = "SELECT VALUE COUNT(1) FROM c WHERE c.type = 'job' AND c.deleted = true"
            count_params = []
            if filter_user_id:
                count_query += " AND c.user_id = @filter_user_id"
                count_params.append({"name": "@filter_user_id", "value": filter_user_id})
            
            # Query for deleted jobs with database-level pagination and optional user filter
            query = f"""
            SELECT * FROM c
            WHERE c.type = 'job'
            AND c.deleted = true"""
            
            if filter_user_id:
                query += "\nAND c.user_id = @filter_user_id"
            
            query += """
            ORDER BY c.deleted_at DESC
            OFFSET @offset LIMIT @limit
            """

            async def fetch_count():
                items = await self.repository.query(count_query, count_params)
                return items[0] if items else 0

            async def fetch_items():
                return await self.repository.query(
                    query,
                    count_params + [{"name": "@offset", "value": offset}, {"name": "@limit", "value": limit}],
                )

            total, items = await asyncio.gather(fetch_count(), fetch_items())
            
            # Enrich deleted jobs with display names and file URLs
            enrich_tasks = [self.job_service.enrich_job_file_urls(job) for job in items]
            enriched_jobs = await asyncio.gather(*enrich_tasks)

            return {"status": "success", "deleted_jobs": list(enriched_jobs), "total_count": total}

        except DatabaseError as e:
            logger.error(
                "deleted_jobs_database_error",
                user_id=user_id,
                filter_user_id=filter_user_id,
                error=str(e),
            )
            return {"status": "error", "message": "Database service unavailable", "deleted_jobs": [], "total_count": 0}
        except JOB_MANAGEMENT_ERRORS as e:
            logger.error(
                "deleted_jobs_fetch_failed",
                user_id=user_id,
                filter_user_id=filter_user_id,
                error=str(e),
                error_type=type(e).__name__,
            )
            return {"status": "error", "message": str(e), "deleted_jobs": [], "total_count": 0}

    async def get_my_jobs(self, user_id: str, limit: int = 100, offset: int = 0, include_deleted: bool = False) -> Dict[str, Any]:
        """
        Get only the jobs owned by the current user with pagination.
        
        Args:
            user_id: ID of the current user
            limit: Maximum number of jobs to return
            offset: Number of jobs to skip
            include_deleted: Whether to include soft-deleted jobs
            
        Returns:
            Dict with 'jobs' list and 'total_count'
        """
        try:
            # Build count query
            count_query = "SELECT VALUE COUNT(1) FROM c WHERE c.type = 'job' AND c.user_id = @user_id"
            if not include_deleted:
                count_query += " AND (NOT IS_DEFINED(c.deleted) OR c.deleted = false)"
            
            count_params = [{"name": "@user_id", "value": user_id}]
            
            # Build data query with pagination
            query = f"""
            SELECT * FROM c
            WHERE c.type = 'job'
            AND c.user_id = @user_id
            """
            if not include_deleted:
                query += " AND (NOT IS_DEFINED(c.deleted) OR c.deleted = false)"
            
            query += """
            ORDER BY c.created_at DESC
            OFFSET @offset LIMIT @limit
            """
            
            params = [{"name": "@user_id", "value": user_id}, {"name": "@offset", "value": int(offset)}, {"name": "@limit", "value": int(limit)}]
            
            async def fetch_count():
                items = await self.repository.query(count_query, count_params)
                return items[0] if items else 0

            async def fetch_jobs():
                return await self.repository.query(query, params)

            total, jobs = await asyncio.gather(fetch_count(), fetch_jobs())
            
            # Enrich jobs with display names and file URLs
            enrich_tasks = [self.job_service.enrich_job_file_urls(job) for job in jobs]
            enriched_jobs = await asyncio.gather(*enrich_tasks)
            
            return {"jobs": list(enriched_jobs), "total_count": total, "status": "success"}
            
        except DatabaseError as e:
            logger.error(
                "user_jobs_database_error",
                user_id=user_id,
                include_deleted=include_deleted,
                error=str(e),
            )
            return {"jobs": [], "total_count": 0, "status": "error", "message": "Database service unavailable"}
        except JOB_MANAGEMENT_ERRORS as e:
            logger.error(
                "user_jobs_fetch_failed",
                user_id=user_id,
                include_deleted=include_deleted,
                error=str(e),
                error_type=type(e).__name__,
            )
            return {"jobs": [], "total_count": 0, "status": "error", "message": str(e)}

    async def trigger_analysis_processing(self, job_id: str, user_id: str, is_admin: bool = False) -> Dict[str, Any]:
        """
        Trigger analysis processing for text-only submissions.
        
        Args:
            job_id: ID of the job to process
            user_id: ID of the user requesting processing
            
        Returns:
            Dict containing processing status
        """
        try:
            # Get the job
            job = await self.repository.get_by_id(job_id)
            if not job:
                return {"status": "error", "message": "Job not found"}
            
            # Check if user has access to this job (admins bypass owner check)
            if not is_admin and job.get("user_id") != user_id:
                return {"status": "error", "message": "Access denied"}
            
            # Check if job has text content to analyze
            if not job.get("text_content") and not job.get("transcription_file_path"):
                return {"status": "error", "message": "No text content available for analysis"}
            
            # Update job status to indicate processing
            job["status"] = "processing_analysis"
            job["analysis_started_at"] = datetime.now(UTC).isoformat()
            
            await self.repository.replace(job_id, job)
            
            # Here you would typically trigger background analysis processing
            # For now, just return success status
            
            return {
                "status": "success",
                "message": "Analysis processing initiated",
                "job_id": job_id,
                "processing_started_at": job["analysis_started_at"]
            }
            
        except DatabaseError as e:
            logger.error(
                "job_analysis_trigger_database_error",
                job_id=job_id,
                user_id=user_id,
                error=str(e),
            )
            return {"status": "error", "message": "Database service unavailable"}
        except JOB_MANAGEMENT_ERRORS as e:
            logger.error(
                "job_analysis_trigger_failed",
                job_id=job_id,
                user_id=user_id,
                error=str(e),
                error_type=type(e).__name__,
            )
            return {"status": "error", "message": str(e)}

    async def get_all_jobs(self, limit: int = 100, offset: int = 0, include_deleted: bool = False, filter_user_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Retrieve all jobs across the system (admin access).

        Args:
            limit: Maximum number of jobs to return
            offset: Pagination offset
            include_deleted: Whether to include soft-deleted jobs
            filter_user_id: Optional user ID to filter jobs by owner

        Returns a dict with 'jobs' and 'total_count'.
        """
        try:
            # Build count query with optional user filter
            count_query = "SELECT VALUE COUNT(1) FROM c WHERE c.type = 'job'"
            if not include_deleted:
                count_query += " AND (NOT IS_DEFINED(c.deleted) OR c.deleted = false)"
            count_params = []
            if filter_user_id:
                count_query += " AND c.user_id = @filter_user_id"
                count_params.append({"name": "@filter_user_id", "value": filter_user_id})
            
            # Build optimized query with database-level pagination and optional user filter
            query = """
            SELECT * FROM c
            WHERE c.type = 'job'
            """
            if not include_deleted:
                query += "\nAND (NOT IS_DEFINED(c.deleted) OR c.deleted = false)"
            
            if filter_user_id:
                query += "\nAND c.user_id = @filter_user_id"

            query += "\nORDER BY c.created_at DESC"
            query += "\nOFFSET @offset LIMIT @limit"

            async def fetch_count():
                items = await self.repository.query(count_query, count_params)
                return items[0] if items else 0

            async def fetch_items():
                return await self.repository.query(
                    query,
                    count_params + [{"name": "@offset", "value": offset}, {"name": "@limit", "value": limit}],
                )

            total, items = await asyncio.gather(fetch_count(), fetch_items())
            
            # Enrich jobs with display names and file URLs
            enrich_tasks = [self.job_service.enrich_job_file_urls(job) for job in items]
            enriched_jobs = await asyncio.gather(*enrich_tasks)

            return {"jobs": list(enriched_jobs), "total_count": total}

        except DatabaseError as e:
            logger.error(
                "all_jobs_database_error",
                include_deleted=include_deleted,
                filter_user_id=filter_user_id,
                error=str(e),
            )
            return {"jobs": [], "total_count": 0, "error": "Database service unavailable"}
        except JOB_MANAGEMENT_ERRORS as e:
            logger.error(
                "all_jobs_fetch_failed",
                include_deleted=include_deleted,
                filter_user_id=filter_user_id,
                error=str(e),
                error_type=type(e).__name__,
            )
            return {"jobs": [], "total_count": 0, "error": str(e)}

    def close(self):
        """Close any resources - placeholder for consistency"""
        logger.info("job_management_service_closed")


async def invalidate_job_cache(job_id: str):
    """Helper exported for tests and consumers to invalidate job cache via job_service.

    Tests patch this module-level helper; forward to job_service.invalidate_job_cache
    when available.
    """
    try:
        from .job_service import invalidate_job_cache as _inv
        if callable(_inv):
            await _inv(job_id)
            return
    except JOB_MANAGEMENT_ERRORS:
        # Best-effort - do not raise from this helper
        return
