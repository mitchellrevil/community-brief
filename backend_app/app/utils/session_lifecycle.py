from datetime import UTC, datetime, timedelta
from typing import Optional

DATE_PARSE_ERRORS = (ValueError, TypeError)


def compute_expires_at(timestamp: Optional[datetime] = None, *, timeout_minutes: int = 15) -> str:
    """Return an ISO8601 expires_at timestamp given a base timestamp and timeout."""
    if timestamp is None:
        timestamp = datetime.now(UTC)
    expires = timestamp + timedelta(minutes=timeout_minutes)
    return expires.isoformat()


def is_expired(expires_at_iso: str) -> bool:
    """Return True if the provided ISO timestamp is in the past."""
    try:
        # support naive Z suffix
        dt = datetime.fromisoformat(expires_at_iso.replace("Z", "+00:00"))
    except DATE_PARSE_ERRORS:
        return True
    return dt < datetime.now(UTC)


def heartbeat_threshold_minutes(default: int = 15) -> int:
    """Return standard heartbeat inactivity window in minutes (configurable point)."""
    return default
