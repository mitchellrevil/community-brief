"""
Test data factories for creating consistent, reusable test fixtures.

These factories follow a simple pattern:
- Each factory returns a complete, valid document with sensible defaults
- All fields can be overridden via kwargs
- IDs are auto-generated if not provided

Usage:
    # Create a user with defaults
    user = user_factory()
    
    # Create a user with custom fields
    admin = user_factory(id="admin-1", permission="admin", email="admin@test.com")
    
    # Create a job owned by a user
    job = job_factory(user_id=user["id"], status="transcribed")
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def generate_id() -> str:
    """Generate a unique ID for test documents."""
    return str(uuid.uuid4())


def now_iso() -> str:
    """Get current timestamp in ISO format."""
    return datetime.now(timezone.utc).isoformat()


# ============================================================================
# USER FACTORIES
# ============================================================================

def user_factory(
    *,
    id: Optional[str] = None,
    email: Optional[str] = None,
    name: Optional[str] = None,
    permission: str = "user",
    permission_level: Optional[int] = None,
    business_unit_id: Optional[str] = None,
    business_unit_ids: Optional[List[str]] = None,
    business_unit_names: Optional[List[str]] = None,
    hashed_password: Optional[str] = None,
    created_at: Optional[str] = None,
    updated_at: Optional[str] = None,
    **kwargs,
) -> Dict[str, Any]:
    """
    Create a user document for testing.
    
    Args:
        id: User ID (auto-generated if not provided)
        email: User email (generated from ID if not provided)
        name: Display name
        permission: Permission level ("user", "admin", "superuser")
        permission_level: Numeric permission level
        business_unit_id: Primary business unit ID
        business_unit_ids: List of business unit IDs
        business_unit_names: List of business unit names
        hashed_password: Hashed password (optional)
        created_at: Creation timestamp
        updated_at: Last update timestamp
        **kwargs: Additional fields to merge
    
    Returns:
        Complete user document
    """
    user_id = id or generate_id()
    
    # Map permission to permission_level if not explicitly provided
    if permission_level is None:
        permission_levels = {
            "user": 1,
            "admin": 2,
            "superuser": 3,
        }
        permission_level = permission_levels.get(permission, 1)
    
    user = {
        "id": user_id,
        "type": "user",
        "email": email or f"user-{user_id[:8]}@test.example.com",
        "name": name or f"Test User {user_id[:8]}",
        "permission": permission,
        "permission_level": permission_level,
        "business_unit_id": business_unit_id,
        "business_unit_ids": business_unit_ids or [],
        "business_unit_names": business_unit_names or [],
        "created_at": created_at or now_iso(),
        "updated_at": updated_at or now_iso(),
    }
    
    if hashed_password:
        user["hashed_password"] = hashed_password
    
    # Merge any additional fields
    user.update(kwargs)
    
    return user


def create_test_user(
    *,
    name: str = "Test User",
    permission: str = "user",
    **kwargs,
) -> Dict[str, Any]:
    """
    Convenience wrapper for creating a test user with common defaults.
    
    This is a simpler interface for tests that just need a basic user.
    """
    return user_factory(
        email=email,
        name=name,
        permission=permission,
        **kwargs,
    )


def admin_user_factory(**kwargs) -> Dict[str, Any]:
    """Create an admin user with sensible defaults."""
    defaults = {
        "permission": "admin",
        "name": "Admin User",
    }
    defaults.update(kwargs)
    return user_factory(**defaults)


def superuser_factory(**kwargs) -> Dict[str, Any]:
    """Create a superuser with sensible defaults."""
    defaults = {
        "permission": "superuser",
        "name": "Super User",
    }
    defaults.update(kwargs)
    return user_factory(**defaults)


# ============================================================================
# JOB FACTORIES
# ============================================================================

def job_factory(
    *,
    id: Optional[str] = None,
    user_id: Optional[str] = None,
    user_email: Optional[str] = None,
    file_name: str = "test_recording.wav",
    file_path: Optional[str] = None,
    displayname: Optional[str] = None,
    status: str = "uploaded",
    created_at: Optional[str] = None,
    updated_at: Optional[str] = None,
    transcription_file_path: Optional[str] = None,
    analysis_file_path: Optional[str] = None,
    shared_with: Optional[List[Dict[str, Any]]] = None,
    deleted: bool = False,
    **kwargs,
) -> Dict[str, Any]:
    """
    Create a job document for testing.
    
    Args:
        id: Job ID (auto-generated if not provided)
        user_id: Owner user ID (auto-generated if not provided)
        user_email: Owner email
        file_name: Original file name
        file_path: Blob storage URL for the file
        displayname: Display name for the job
        status: Job status ("uploaded", "transcribing", "transcribed", "analysing", "complete", "error")
        created_at: Creation timestamp
        updated_at: Last update timestamp
        transcription_file_path: Blob URL for transcription file
        analysis_file_path: Blob URL for analysis file
        shared_with: List of sharing entries
        deleted: Whether the job is soft-deleted
        **kwargs: Additional fields to merge
    
    Returns:
        Complete job document
    """
    job_id = id or generate_id()
    owner_id = user_id or generate_id()
    
    job = {
        "id": job_id,
        "type": "job",
        "user_id": owner_id,
        "user_email": user_email or f"user-{owner_id[:8]}@test.example.com",
        "file_name": file_name,
        "file_path": file_path or f"https://fakeaccount.blob.core.windows.net/uploads/2024-01-01/{file_name}",
        "displayname": displayname or file_name,
        "status": status,
        "created_at": created_at or now_iso(),
        "updated_at": updated_at or now_iso(),
        "shared_with": shared_with or [],
        "deleted": deleted,
    }
    
    if transcription_file_path:
        job["transcription_file_path"] = transcription_file_path
    
    if analysis_file_path:
        job["analysis_file_path"] = analysis_file_path
    
    # Merge any additional fields
    job.update(kwargs)
    
    return job


def create_test_job(
    *,
    user_id: Optional[str] = None,
    status: str = "uploaded",
    file_name: str = "test_recording.wav",
    **kwargs,
) -> Dict[str, Any]:
    """
    Convenience wrapper for creating a test job with common defaults.
    
    This is a simpler interface for tests that just need a basic job.
    """
    return job_factory(
        user_id=user_id,
        status=status,
        file_name=file_name,
        **kwargs,
    )


def completed_job_factory(user_id: Optional[str] = None, **kwargs) -> Dict[str, Any]:
    """Create a completed job with transcription and analysis."""
    job_id = kwargs.pop("id", None) or generate_id()
    
    defaults = {
        "id": job_id,
        "user_id": user_id,
        "status": "complete",
        "transcription_file_path": f"https://fakeaccount.blob.core.windows.net/uploads/transcription_{job_id}.txt",
        "analysis_file_path": f"https://fakeaccount.blob.core.windows.net/uploads/analysis_{job_id}.docx",
    }
    defaults.update(kwargs)
    return job_factory(**defaults)


def shared_job_factory(
    owner_id: str,
    shared_with_user_ids: List[str],
    **kwargs,
) -> Dict[str, Any]:
    """Create a job that is shared with other users."""
    shared_with = [
        {
            "user_id": uid,
            "shared_at": now_iso(),
            "permission": "view",
        }
        for uid in shared_with_user_ids
    ]
    
    return job_factory(
        user_id=owner_id,
        shared_with=shared_with,
        **kwargs,
    )


# ============================================================================
# PROMPT FACTORIES
# ============================================================================

def prompt_factory(
    *,
    id: Optional[str] = None,
    name: str = "Test Prompt",
    content: str = "Analyze the following transcription and provide insights.",
    description: Optional[str] = None,
    category: str = "general",
    is_default: bool = False,
    is_active: bool = True,
    created_by: Optional[str] = None,
    created_at: Optional[str] = None,
    updated_at: Optional[str] = None,
    **kwargs,
) -> Dict[str, Any]:
    """
    Create a prompt document for testing.
    
    Args:
        id: Prompt ID (auto-generated if not provided)
        name: Prompt name
        content: Prompt content/template
        description: Optional description
        category: Prompt category
        is_default: Whether this is a default prompt
        is_active: Whether the prompt is active
        created_by: User ID of creator
        created_at: Creation timestamp
        updated_at: Last update timestamp
        **kwargs: Additional fields to merge
    
    Returns:
        Complete prompt document
    """
    prompt_id = id or generate_id()
    
    prompt = {
        "id": prompt_id,
        "type": "prompt",
        "name": name,
        "content": content,
        "description": description or f"Description for {name}",
        "category": category,
        "is_default": is_default,
        "is_active": is_active,
        "created_by": created_by or generate_id(),
        "created_at": created_at or now_iso(),
        "updated_at": updated_at or now_iso(),
    }
    
    # Merge any additional fields
    prompt.update(kwargs)
    
    return prompt


# ============================================================================
# SESSION / AUDIT FACTORIES
# ============================================================================

def session_factory(
    *,
    id: Optional[str] = None,
    user_id: Optional[str] = None,
    token: Optional[str] = None,
    created_at: Optional[str] = None,
    expires_at: Optional[str] = None,
    is_active: bool = True,
    **kwargs,
) -> Dict[str, Any]:
    """Create a user session document for testing."""
    session_id = id or generate_id()
    
    session = {
        "id": session_id,
        "type": "session",
        "user_id": user_id or generate_id(),
        "token": token or f"session_token_{session_id[:8]}",
        "created_at": created_at or now_iso(),
        "expires_at": expires_at or now_iso(),
        "is_active": is_active,
    }
    
    session.update(kwargs)
    return session


def audit_log_factory(
    *,
    id: Optional[str] = None,
    action: str = "user_login",
    actor_id: Optional[str] = None,
    resource_type: str = "user",
    resource_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    timestamp: Optional[str] = None,
    **kwargs,
) -> Dict[str, Any]:
    """Create an audit log entry for testing."""
    log_id = id or generate_id()
    
    log = {
        "id": log_id,
        "type": "audit_log",
        "action": action,
        "actor_id": actor_id or generate_id(),
        "resource_type": resource_type,
        "resource_id": resource_id or generate_id(),
        "details": details or {},
        "timestamp": timestamp or now_iso(),
    }
    
    log.update(kwargs)
    return log


# ============================================================================
# BATCH FACTORIES
# ============================================================================

def create_user_batch(count: int, **common_kwargs) -> List[Dict[str, Any]]:
    """Create multiple users with optional common properties."""
    return [user_factory(**common_kwargs) for _ in range(count)]


def create_job_batch(count: int, user_id: Optional[str] = None, **common_kwargs) -> List[Dict[str, Any]]:
    """Create multiple jobs with optional common properties."""
    return [job_factory(user_id=user_id, **common_kwargs) for _ in range(count)]


# ============================================================================
# SCENARIO FACTORIES
# ============================================================================

def create_user_with_jobs(
    user_kwargs: Optional[Dict[str, Any]] = None,
    job_count: int = 3,
    job_statuses: Optional[List[str]] = None,
) -> tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Create a user with multiple jobs in different states.
    
    Returns:
        Tuple of (user, list of jobs)
    """
    user = user_factory(**(user_kwargs or {}))
    
    if job_statuses is None:
        job_statuses = ["uploaded", "transcribed", "complete"]
    
    jobs = []
    for i, status in enumerate(job_statuses[:job_count]):
        job = job_factory(
            user_id=user["id"],
            user_email=user["email"],
            status=status,
            file_name=f"recording_{i + 1}.wav",
        )
        jobs.append(job)
    
    # Fill remaining jobs with "uploaded" status if needed
    for i in range(len(jobs), job_count):
        job = job_factory(
            user_id=user["id"],
            user_email=user["email"],
            status="uploaded",
            file_name=f"recording_{i + 1}.wav",
        )
        jobs.append(job)
    
    return user, jobs


def create_shared_job_scenario() -> tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
    """
    Create a scenario with an owner, a shared user, and a shared job.
    
    Returns:
        Tuple of (owner_user, shared_user, shared_job)
    """
    owner = user_factory(name="Job Owner")
    shared_user = user_factory(name="Shared User")
    
    job = shared_job_factory(
        owner_id=owner["id"],
        shared_with_user_ids=[shared_user["id"]],
        status="complete",
    )
    
    return owner, shared_user, job
