"""Build recording-consent job metadata at the authentication boundary."""

from datetime import UTC, datetime
from typing import Any, Dict, Optional


def build_recording_consent_metadata(
    recording_consent: Optional[Dict[str, Any]],
    current_user: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Keep acceptance facts and derive the actor from server authentication."""
    if recording_consent is None:
        return None

    return {
        "accepted": True,
        "policy_version": recording_consent["policy_version"],
        "accepted_at": recording_consent["accepted_at"],
        "accepted_by_user_id": current_user.get("id"),
        "recorded_at": datetime.now(UTC).isoformat(),
    }
