from __future__ import annotations

import json
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError, field_validator


class EvidenceMap(BaseModel):
    sections: list[dict[str, Any]] = Field(default_factory=list)
    facts: list[dict[str, Any]] = Field(default_factory=list)
    decisions: list[dict[str, Any]] = Field(default_factory=list)
    actions: list[dict[str, Any]] = Field(default_factory=list)
    risks: list[dict[str, Any]] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)


class DraftResult(BaseModel):
    markdown: str

    @field_validator("markdown")
    @classmethod
    def markdown_required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("markdown is required")
        return value


class QAIssue(BaseModel):
    section: str = ""
    problem: str
    required_change: str = ""


class QAResult(BaseModel):
    status: Literal["pass", "revise", "fail"]
    issues: list[QAIssue] = Field(default_factory=list)


class MeetingTemplateWorkflowInput(BaseModel):
    transcript: str
    prompt_text: str
    prompt_metadata: dict[str, Any] = Field(default_factory=dict)
    session_data: Any = None
    instructions: str | None = None


class MeetingTemplateWorkflowResult(BaseModel):
    analysis_text: str
    evidence: EvidenceMap
    qa: QAResult
    revision_count: int = 0


class WorkflowValidationError(ValueError):
    pass


def model_from_json_text(model_type: type[BaseModel], text: str) -> BaseModel:
    try:
        payload = json.loads(_strip_json_fence(text))
        return model_type.model_validate(payload)
    except (json.JSONDecodeError, ValidationError, TypeError) as exc:
        raise WorkflowValidationError(f"Invalid {model_type.__name__} JSON") from exc


def _strip_json_fence(text: str) -> str:
    value = text.strip()
    if not value.startswith("```"):
        return value

    lines = value.splitlines()
    if lines and lines[0].strip().startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines).strip()
