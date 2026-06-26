"""Public job API contracts."""

import re

from pydantic import BaseModel, field_validator

from ..utils.input_validation import InputValidator


class JobUpdateRequest(BaseModel):
    displayname: str

    @field_validator("displayname")
    @classmethod
    def validate_displayname(cls, value: str) -> str:
        if not value or len(value.strip()) == 0:
            raise ValueError("Display name is required")
        if len(value) > 255:
            raise ValueError("Display name cannot exceed 255 characters")
        if InputValidator.contains_dangerous_patterns(value):
            raise ValueError("Invalid characters in display name")
        return value.strip()


class SpeakerNamesUpdateRequest(BaseModel):
    speaker_names: dict[str, str]

    @field_validator("speaker_names")
    @classmethod
    def validate_speaker_names(cls, value: dict[str, str]) -> dict[str, str]:
        if not value:
            raise ValueError("At least one speaker name is required")
        if len(value) > 50:
            raise ValueError("Too many speakers")

        normalized: dict[str, str] = {}
        for speaker_id, display_name in value.items():
            clean_id = str(speaker_id).strip()
            clean_name = str(display_name).strip()
            if not re.fullmatch(r"\w{1,50}", clean_id):
                raise ValueError("Invalid speaker id")
            if len(clean_name) > 100:
                raise ValueError("Speaker name cannot exceed 100 characters")
            if "@" in clean_name or "\n" in clean_name or "\r" in clean_name:
                raise ValueError("Invalid characters in speaker name")
            if InputValidator.contains_dangerous_patterns(clean_name):
                raise ValueError("Invalid characters in speaker name")
            normalized[clean_id] = clean_name
        return normalized
