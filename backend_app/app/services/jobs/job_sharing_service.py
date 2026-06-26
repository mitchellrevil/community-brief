from typing import Dict, Any, List, Optional
from datetime import UTC, datetime
import asyncio
import re

from ...core.config import DatabaseError
from ...core.logging import get_logger
from ...utils.cache_utils import TTLCache
from ...repositories.jobs import JobRepository
from ...repositories.users import UserRepository

logger = get_logger(__name__)

JOB_SHARING_ERRORS = (RuntimeError, OSError, ValueError, TypeError, KeyError)
JOB_SHARING_PARSE_ERRORS = (TypeError, ValueError)

# Shared jobs cache (per user)
_shared_jobs_cache = TTLCache(default_ttl=10.0)


class JobSharingService:
    def __init__(
        self,
        job_repository: JobRepository,
        user_repository: UserRepository,
        announcement_service: Optional[Any] = None,
    ):
        self.repository = job_repository
        self.user_repository = user_repository
        # announcement_service expected to implement create_announcement(announcement: Dict[str, Any])
        self.announcement_service = announcement_service

    async def share_job(self, job_id: str, owner_user_id: str, target_user_email: str, permission_level: str = "view", message: Optional[str] = None) -> Dict[str, Any]:
        try:
            job = await self.repository.get_by_id(job_id)
            if not job:
                return {"status": "error", "message": "Job not found"}

            if not _can_manage_sharing(job, owner_user_id):
                return {"status": "error", "message": "Access denied: not job owner"}

            target_user = await self.user_repository.get_by_email(target_user_email)
            if not target_user:
                return {"status": "error", "message": "Target user not found"}

            if "shared_with" not in job:
                job["shared_with"] = []

            # Attempt to resolve owner's profile to store alongside share metadata
            try:
                owner_user = await self.user_repository.get_by_id(owner_user_id)
                owner_email = owner_user.get("email") if owner_user else None
                # Prefer explicit display name fields where available
                owner_display_name = None
                if owner_user:
                    owner_display_name = (
                        owner_user.get("display_name")
                        or owner_user.get("displayname")
                        or owner_user.get("name")
                        or owner_user.get("full_name")
                        or owner_user.get("fullName")
                    )
                    if not owner_display_name:
                        first = owner_user.get("first_name") or owner_user.get("firstName")
                        last = owner_user.get("last_name") or owner_user.get("lastName")
                        if first or last:
                            owner_display_name = " ".join([p for p in (first, last) if p]).strip()
                    if not owner_display_name and owner_email:
                        # Fallback formatting for email local-part (e.g. "john.doe@example.com" -> "John Doe")
                        local = owner_email.split("@")[0]
                        parts = re.split(r'[._+\-]', local)
                        owner_display_name = " ".join([p.capitalize() for p in parts if p])
            except JOB_SHARING_ERRORS:
                owner_email = None
                owner_display_name = None

            now_epoch_ms = int(datetime.now(UTC).timestamp() * 1000)

            existing_share = next(
                (share for share in job["shared_with"] if share.get("user_id") == target_user["id"]),
                None
            )

            if existing_share:
                existing_share["permission_level"] = permission_level
                existing_share["shared_at"] = now_epoch_ms
                existing_share["shared_by"] = owner_user_id
                if owner_email:
                    existing_share["shared_by_email"] = owner_email
                if owner_display_name:
                    existing_share["shared_by_name"] = owner_display_name
                if message is not None:
                    existing_share["message"] = message
            else:
                job["shared_with"].append({
                    "user_id": target_user["id"],
                    "user_email": target_user_email,
                    "permission_level": permission_level,
                    "shared_at": now_epoch_ms,
                    "shared_by": owner_user_id,
                    "shared_by_email": owner_email,
                    "shared_by_name": owner_display_name,
                    "message": message,
                })

            await self.repository.replace(job_id, job)
            # Cache invalidation is non-critical - log failures at debug level
            try:
                from .job_service import invalidate_job_cache
                await invalidate_job_cache(job_id)
            except JOB_SHARING_ERRORS as e:
                logger.debug(
                    "job_sharing.job_cache_invalidation_failed",
                    exc_info=True,
                    job_id=job_id,
                    error_type=type(e).__name__,
                )
            try:
                await _invalidate_shared_jobs_cache_for(
                    owner_user_id,
                    job.get("user_id"),
                    target_user["id"] if target_user else None,
                )
            except JOB_SHARING_ERRORS as e:
                logger.debug(
                    "job_sharing.shared_jobs_cache_invalidation_failed",
                    exc_info=True,
                    owner_user_id=owner_user_id,
                    error_type=type(e).__name__,
                )

            # Fire-and-forget announcement creation (non-blocking). Any failures should not
            # affect the share operation. We schedule a background task and consume exceptions
            # via a done callback so the task exceptions don't leak to the event loop.
            try:
                if self.announcement_service:
                    now_epoch_ms = int(datetime.now(UTC).timestamp() * 1000)
                    title = f"Job shared: {job.get('title', job_id)}"
                    ann_payload = {
                        "title": title,
                        "message": message or f"{owner_user_id} shared a job with you",
                        "target_user_emails": [target_user_email],
                        "link": f"/jobs/{job_id}",
                        "metadata": {
                            "job_id": job_id,
                            "shared_by": owner_user_id,
                            "permission_level": permission_level,
                            "shared_at": now_epoch_ms,
                        },
                    }

                    task = asyncio.create_task(self.announcement_service.create_announcement(ann_payload))

                    def _on_announce_done(t: asyncio.Task):
                        try:
                            t.result()
                        except JOB_SHARING_ERRORS:
                            logger.exception(
                                "job_sharing.announcement_create_failed",
                                job_id=job_id,
                            )

                    task.add_done_callback(_on_announce_done)
            except JOB_SHARING_ERRORS:
                logger.debug(
                    "job_sharing.announcement_schedule_failed",
                    exc_info=True,
                    job_id=job_id,
                )
            
            return {
                "status": "success",
                "message": f"Job shared with {target_user_email}",
                "permission_level": permission_level,
                "shared_with_count": len(job["shared_with"])
            }
            
        except DatabaseError as e:
            logger.error(
                "job_sharing.share_database_error",
                job_id=job_id,
                error=str(e),
                error_type=type(e).__name__,
            )
            return {"status": "error", "message": "Database service unavailable"}
        except JOB_SHARING_ERRORS as e:
            logger.error(
                "job_sharing.share_failed",
                job_id=job_id,
                error=str(e),
                error_type=type(e).__name__,
            )
            return {"status": "error", "message": str(e)}

    async def unshare_job(self, job_id: str, owner_user_id: str, target_user_email: str) -> Dict[str, Any]:
        """
        Remove job sharing with a specific user.
        
        Args:
            job_id: ID of the job to unshare
            owner_user_id: ID of the user who owns the job
            target_user_email: Email of the user to unshare from
            
        Returns:
            Dict containing unshare result
        """
        try:
            # Get the job
            job = await self.repository.get_by_id(job_id)
            if not job:
                return {"status": "error", "message": "Job not found"}
            
            # Verify ownership
            if not _can_manage_sharing(job, owner_user_id):
                return {"status": "error", "message": "Access denied: not job owner"}
            
            # Remove share if exists
            if "shared_with" in job:
                original_count = len(job["shared_with"])
                removed_share = next(
                    (share for share in job["shared_with"] if share.get("user_email") == target_user_email),
                    None,
                )
                job["shared_with"] = [
                    share for share in job["shared_with"] 
                    if share.get("user_email") != target_user_email
                ]
                
                if len(job["shared_with"]) < original_count:
                    await self.repository.replace(job_id, job)
                    # Invalidate cache for this job and owner
                    try:
                        from .job_service import invalidate_job_cache
                        await invalidate_job_cache(job_id)
                    except JOB_SHARING_ERRORS as exc:
                        logger.debug(
                            "job_sharing.job_cache_invalidation_failed",
                            exc_info=True,
                            job_id=job_id,
                            error_type=type(exc).__name__,
                        )
                    try:
                        await _invalidate_shared_jobs_cache_for(
                            owner_user_id,
                            job.get("user_id"),
                            removed_share.get("user_id") if removed_share else None,
                        )
                    except JOB_SHARING_ERRORS as exc:
                        logger.debug(
                            "job_sharing.shared_jobs_cache_invalidation_failed",
                            exc_info=True,
                            owner_user_id=owner_user_id,
                            error_type=type(exc).__name__,
                        )
                    return {
                        "status": "success",
                        "message": f"Job unshared from {target_user_email}",
                        "shared_with_count": len(job["shared_with"])
                    }
                else:
                    return {"status": "error", "message": "Job was not shared with this user"}
            else:
                return {"status": "error", "message": "Job is not shared with anyone"}
                
        except DatabaseError as e:
            logger.error(
                "job_sharing.unshare_database_error",
                job_id=job_id,
                error=str(e),
                error_type=type(e).__name__,
            )
            return {"status": "error", "message": "Database service unavailable"}
        except JOB_SHARING_ERRORS as e:
            logger.error(
                "job_sharing.unshare_failed",
                job_id=job_id,
                error=str(e),
                error_type=type(e).__name__,
            )
            return {"status": "error", "message": str(e)}

    async def get_job_sharing_info(self, job_id: str, current_user: Any) -> Dict[str, Any]:
        """
        Get sharing information for a specific job.
        
        Args:
            job_id: ID of the job
            current_user_id: ID of the current user
            
        Returns:
            Dict containing job sharing information
        """
        try:
            # Get the job
            job = await self.repository.get_by_id(job_id)
            if not job:
                return {"status": "error", "message": "Job not found"}
            
            if isinstance(current_user, str):
                curr_id = current_user
            elif isinstance(current_user, dict):
                curr_id = current_user.get("id")
            else:
                curr_id = None

            # Check if user has access to this job
            is_owner = job.get("user_id") == curr_id
            has_shared_access = False

            if "shared_with" in job:
                def _matches_share(share: Dict[str, Any]) -> bool:
                    return bool(curr_id and share and share.get("user_id") == curr_id)

                has_shared_access = any(_matches_share(share) for share in job["shared_with"])
            
            if not (is_owner or has_shared_access):
                return {"status": "error", "message": "Access denied"}
            
            sharing_info = {
                "job_id": job_id,
                "is_owner": is_owner,
                "shared_with": job.get("shared_with", []),
                "shared_with_count": len(job.get("shared_with", [])),
                "is_shared": len(job.get("shared_with", [])) > 0
            }
            
            return {"status": "success", "sharing_info": sharing_info}
            
        except DatabaseError as e:
            logger.error(
                "job_sharing.info_database_error",
                job_id=job_id,
                error=str(e),
                error_type=type(e).__name__,
            )
            return {"status": "error", "message": "Database service unavailable"}
        except JOB_SHARING_ERRORS as e:
            logger.error(
                "job_sharing.info_failed",
                job_id=job_id,
                error=str(e),
                error_type=type(e).__name__,
            )
            return {"status": "error", "message": str(e)}

    async def get_shared_jobs(self, user_id: str) -> Dict[str, List[Dict[str, Any]]]:
        """
        Get all jobs shared with the current user and jobs owned by current user that are shared with others.
        
        Args:
            user_id: ID of the current user
            
        Returns:
            Dict with 'shared_jobs' (jobs shared with me) and 'owned_jobs_shared_with_others' (my jobs shared with others)
        """
        try:
            # Query for jobs shared with this user using EXISTS subquery for proper array matching
            # This approach works correctly with Cosmos DB's array containment semantics
            shared_query = """
            SELECT * FROM c
            WHERE c.type = 'job'
            AND EXISTS(
                SELECT VALUE s FROM s IN c.shared_with 
                WHERE s.user_id = @user_id OR s.user_email = @user_id
            )
            AND c.user_id != @user_id
            AND (NOT IS_DEFINED(c.deleted) OR c.deleted = false)
            """

            async def _compute_shared_jobs():
                shared_params = [{"name": "@user_id", "value": user_id}]

                async def fetch_shared_jobs():
                    return await self.repository.query(shared_query, shared_params)

                async def fetch_owned_shared_jobs():
                    # Query for jobs owned by current user that are shared with others
                    owned_shared_query = """
                    SELECT * FROM c
                    WHERE c.type = 'job'
                    AND c.user_id = @user_id
                    AND IS_DEFINED(c.shared_with)
                    AND ARRAY_LENGTH(c.shared_with) > 0
                    AND (NOT IS_DEFINED(c.deleted) OR c.deleted = false)
                    """
                    return await self.repository.query(owned_shared_query, shared_params)

                import asyncio
                shared_jobs, owned_shared_jobs = await asyncio.gather(fetch_shared_jobs(), fetch_owned_shared_jobs())

                # Enrich shared_jobs with per-user share metadata so frontend can display
                def _to_epoch_ms(val):
                    if val is None:
                        return None
                    if isinstance(val, int):
                        return val
                    # Try numeric string
                    try:
                        return int(val)
                    except JOB_SHARING_PARSE_ERRORS:
                        pass
                    # Try ISO parse
                    try:
                        dt = datetime.fromisoformat(val)
                        if dt.tzinfo is None:
                            # assume UTC
                            dt = dt.replace(tzinfo=UTC)
                        return int(dt.timestamp() * 1000)
                    except JOB_SHARING_PARSE_ERRORS:
                        return None

                # First pass - collect which sharer identities we need to resolve to a display name
                sharer_ids = set()
                sharer_emails = set()
                jobs_to_enrich: List[Dict[str, Any]] = []

                for job in shared_jobs:
                    shares = job.get("shared_with", [])
                    user_share = next(
                        (s for s in shares if s and (s.get("user_id") == user_id or s.get("user_email") == user_id)),
                        None
                    )
                    if user_share:
                        # Expose top-level convenience fields expected by frontend
                        job["permission_level"] = user_share.get("permission_level")
                        job["message"] = user_share.get("message")
                        job["shared_by_email"] = user_share.get("shared_by_email") or user_share.get("shared_by")
                        job["shared_at"] = _to_epoch_ms(user_share.get("shared_at"))
                        jobs_to_enrich.append({"job": job, "user_share": user_share})
                        sb_raw = user_share.get("shared_by")
                        sb_email = user_share.get("shared_by_email") or None
                        if sb_raw:
                            if isinstance(sb_raw, str) and "@" in sb_raw:
                                sharer_emails.add(sb_raw.lower())
                            else:
                                sharer_ids.add(sb_raw)
                        if sb_email and isinstance(sb_email, str):
                            sharer_emails.add(sb_email.lower())

                # Resolve sharer user documents in parallel (by id and by email)
                async def _resolve_users():
                    sharer_id_list = [user_id for user_id in sharer_ids if user_id]
                    sharer_email_list = [email for email in sharer_emails if email]
                    id_tasks = [self.user_repository.get_by_id(user_id) for user_id in sharer_id_list]
                    email_tasks = [self.user_repository.get_by_email(email) for email in sharer_email_list]
                    results = await asyncio.gather(*(id_tasks + email_tasks), return_exceptions=False) if (id_tasks or email_tasks) else []
                    # Map first N results to ids then emails
                    id_results = results[: len(id_tasks)] if id_tasks else []
                    email_results = results[len(id_tasks):] if email_tasks else []
                    id_map: Dict[str, Dict[str, Any]] = {}
                    email_map: Dict[str, Dict[str, Any]] = {}
                    for idx, doc in zip(sharer_id_list[: len(id_results)], id_results):
                        if doc:
                            id_map[idx] = doc
                    for email_key, doc in zip(sharer_email_list[: len(email_results)], email_results):
                        if doc:
                            email_map[email_key.lower()] = doc
                    return id_map, email_map

                try:
                    id_map, email_map = await _resolve_users()
                except JOB_SHARING_ERRORS:
                    id_map, email_map = {}, {}

                def _derive_name_from_userdoc(u: Optional[Dict[str, Any]]) -> Optional[str]:
                    if not u:
                        return None
                    return (
                        u.get("display_name")
                        or u.get("displayname")
                        or u.get("name")
                        or u.get("full_name")
                        or u.get("fullName")
                    )

                def _format_name_from_email(email: Optional[str]) -> Optional[str]:
                    if not email or "@" not in email:
                        return None
                    local = email.split("@")[0]
                    parts = re.split(r'[._+\-]', local)
                    parts = [p for p in parts if p]
                    if not parts:
                        return None
                    return " ".join([p.capitalize() for p in parts])

                # Second pass - attach shared_by_name where possible
                for entry in jobs_to_enrich:
                    job = entry["job"]
                    user_share = entry["user_share"]
                    shared_by_id = user_share.get("shared_by")
                    shared_by_email = (user_share.get("shared_by_email") or user_share.get("shared_by"))
                    name = None
                    if shared_by_id and shared_by_id in id_map:
                        name = _derive_name_from_userdoc(id_map.get(shared_by_id))
                    if not name and shared_by_email:
                        name = None
                        if isinstance(shared_by_email, str):
                            # try email_map lookup
                            doc = email_map.get(shared_by_email.lower())
                            if doc:
                                name = _derive_name_from_userdoc(doc)
                        if not name:
                            name = _format_name_from_email(shared_by_email)
                    # As a final fallback, if individual share stored a name, use it
                    if not name:
                        name = user_share.get("shared_by_name") or user_share.get("sharer_name")
                    if name:
                        job["shared_by_name"] = name

                # For owned jobs, provide a share count for convenience
                for job in owned_shared_jobs:
                    job["shared_with_count"] = len(job.get("shared_with", []))

                return {
                    "shared_jobs": shared_jobs,
                    "owned_jobs_shared_with_others": owned_shared_jobs,
                }

            # Use small TTL cache for shared job queries per user
            result = await _shared_jobs_cache.get_or_compute(f"shared:{user_id}", _compute_shared_jobs)
            return result
            
        except DatabaseError as e:
            logger.error(
                "job_sharing.shared_jobs_database_error",
                user_id=user_id,
                error=str(e),
                error_type=type(e).__name__,
            )
            raise
        except JOB_SHARING_ERRORS as e:
            logger.error(
                "job_sharing.shared_jobs_failed",
                user_id=user_id,
                error=str(e),
                error_type=type(e).__name__,
            )
            raise

    def close(self):
        logger.info("job_sharing.close")


def _can_manage_sharing(job: Dict[str, Any], user_id: str) -> bool:
    if job.get("user_id") == user_id:
        return True
    return any(
        share.get("user_id") == user_id and share.get("permission_level") == "admin"
        for share in job.get("shared_with") or []
    )


async def _invalidate_shared_jobs_cache_for(*user_ids: Optional[str]) -> None:
    for user_id in {candidate for candidate in user_ids if candidate}:
        await _shared_jobs_cache.invalidate(f"shared:{user_id}")


async def invalidate_job_cache(job_id: str):
    """Exported helper for tests to invalidate job cache.

    Delegates to job_service.invalidate_job_cache if available.
    """
    try:
        from .job_service import invalidate_job_cache as _inv
        await _inv(job_id)
    except JOB_SHARING_ERRORS:
        return
