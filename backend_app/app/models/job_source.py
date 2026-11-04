"""Persisted provenance, shared by direct uploads, multipart uploads and job responses."""

from typing import Literal

from pydantic import BaseModel, Field


class TeamsJobSource(BaseModel):
    kind: Literal["teams"] = "teams"
    event_id: str = Field(min_length=1, max_length=2048)


def teams_source_metadata(event_id: str | None) -> dict:
    if not event_id:
        return {}
    # Retain the original field for clients released before source provenance.
    return {
        "teams_event_id": event_id,
        "source": TeamsJobSource(event_id=event_id).model_dump(),
    }
