"""Public job API contracts."""

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
