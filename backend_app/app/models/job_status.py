"""
Canonical job status constants used throughout the application.

These values must be kept in sync with the Az Functions pipeline 
(az-func-audio/core/job_status.py) to ensure SSE streaming works correctly.
"""

from typing import Set, Literal

# Valid job status values.
JobStatusType = Literal[
    "uploaded",
    "transcribing", 
    "transcribed",
    "analysing",
    "completed",
    "failed",
    "error"
]

# Canonical status values
UPLOADED = "uploaded"
TRANSCRIBING = "transcribing"
TRANSCRIBED = "transcribed"
ANALYSING = "analysing"
COMPLETED = "completed"
FAILED = "failed"
ERROR = "error"

# Status sets
VALID_STATUSES: Set[str] = {
    UPLOADED,
    TRANSCRIBING,
    TRANSCRIBED,
    ANALYSING,
    COMPLETED,
    FAILED,
    ERROR,
}

TERMINAL_STATUSES: Set[str] = {
    COMPLETED,
    FAILED,
    ERROR,
}

IN_PROGRESS_STATUSES: Set[str] = {
    TRANSCRIBING,
    TRANSCRIBED,
    ANALYSING,
}


def is_valid_status(status: str) -> bool:
    """Check if a status value is in the canonical set."""
    return status in VALID_STATUSES


def is_terminal_status(status: str) -> bool:
    """Check if a status indicates the job is done processing."""
    return status in TERMINAL_STATUSES


def is_in_progress_status(status: str) -> bool:
    """Check if a status indicates active processing."""
    return status in IN_PROGRESS_STATUSES
