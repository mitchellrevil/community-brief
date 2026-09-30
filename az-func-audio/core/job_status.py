"""
Canonical job status constants for Azure Functions pipeline.

This module defines the authoritative set of job statuses that must be used
throughout the Azure Functions app to ensure consistency with the backend API
and SSE streaming endpoints.

These values match the statuses defined in backend_app/app/models/job.py
and recognized by backend_app/app/routers/streaming_router.py.
"""
from typing import Set


class JobStatus:
    """
    Canonical job status constants.
    
    LIFECYCLE:
    1. UPLOADED - Job created, waiting for processing
    2. TRANSCRIBING - Audio transcription or text extraction in progress  
    3. TRANSCRIBED - Transcription/text extraction complete, ready for analysis
    4. ANALYSING - AI analysis in progress
    5. COMPLETED - Job fully processed (terminal state)
    6. FAILED - Job processing failed (terminal state)
    7. ERROR - Unexpected error during processing (terminal state)
    """
    
    # Lifecycle statuses
    UPLOADED = "uploaded"
    TRANSCRIBING = "transcribing"
    TRANSCRIBED = "transcribed"
    ANALYSING = "analysing"
    COMPLETED = "completed"
    FAILED = "failed"
    ERROR = "error"
    
    @classmethod
    def all_statuses(cls) -> Set[str]:
        """Return all valid job statuses."""
        return {
            cls.UPLOADED,
            cls.TRANSCRIBING,
            cls.TRANSCRIBED,
            cls.ANALYSING,
            cls.COMPLETED,
            cls.FAILED,
            cls.ERROR,
        }
    
    @classmethod
    def terminal_states(cls) -> Set[str]:
        """
        Return statuses that indicate job processing is complete.
        
        SSE streams close when jobs reach these states.
        """
        return {cls.COMPLETED, cls.FAILED, cls.ERROR}
    
    @classmethod
    def in_progress_states(cls) -> Set[str]:
        """Return statuses that indicate active processing."""
        return {cls.TRANSCRIBING, cls.TRANSCRIBED, cls.ANALYSING}
    
    @classmethod
    def is_terminal(cls, status: str) -> bool:
        """Check if a status indicates processing is complete."""
        return status in cls.terminal_states()
    
    @classmethod
    def is_in_progress(cls, status: str) -> bool:
        """Check if a status indicates active processing."""
        return status in cls.in_progress_states()
