"""Prompt catalog HTTP contract."""

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from ..models.inference_config import ReasoningLevel, VerbosityLevel
from ..models.prompt_visibility import DEFAULT_PROMPT_VISIBILITY, normalize_prompt_visibility
from ..utils.input_validation import InputValidator


MAX_PROMPT_CONTENT_CHARS = 25_000
PromptCatalogView = Literal["runtime", "management"]


def _validated_name(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("Name is required")
    if len(value) > 255:
        raise ValueError("Name cannot exceed 255 characters")
    if InputValidator.contains_dangerous_patterns(value):
        raise ValueError("Invalid characters in name")
    return value


def _validated_id(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    if not value:
        raise ValueError("ID cannot be empty")
    return value


def _validated_prompts(value: Dict[str, str]) -> Dict[str, str]:
    if len(value) > 50:
        raise ValueError("Too many prompts (max 50)")
    for key, prompt in value.items():
        if not isinstance(prompt, str):
            raise ValueError("Prompt values must be strings")
        if len(prompt) > MAX_PROMPT_CONTENT_CHARS:
            raise ValueError(
                f"Max character limit of {MAX_PROMPT_CONTENT_CHARS} reached"
            )
        if InputValidator.contains_dangerous_patterns(str(key) + prompt):
            raise ValueError("Invalid characters in prompts")
    return value


class PromptFolderCreate(BaseModel):
    name: str
    parent_id: Optional[str] = None

    _name = field_validator("name")(_validated_name)
    _parent_id = field_validator("parent_id")(_validated_id)


class PromptFolderPatch(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[str] = None

    @field_validator("name", mode="before")
    @classmethod
    def reject_null_name(cls, value: Any) -> Any:
        if value is None:
            raise ValueError("Name cannot be null")
        return value

    _name = field_validator("name")(_validated_name)
    _parent_id = field_validator("parent_id")(_validated_id)

    @model_validator(mode="after")
    def reject_empty_patch(self):
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        return self


class PromptFolderResponse(BaseModel):
    id: str
    name: str
    created_at: int
    updated_at: int
    parent_id: Optional[str] = None
    business_unit_id: Optional[str] = None
    is_business_unit: bool = False


class PromptMetadata(BaseModel):
    development: bool = False
    test: bool = False


class PromptTemplateFields(BaseModel):
    name: str
    prompts: Dict[str, str]
    pre_session_talking_points: List[Dict[str, Any]] = Field(default_factory=list)
    in_session_talking_points: List[Dict[str, Any]] = Field(default_factory=list)
    analysis_model: Optional[str] = None
    analysis_reasoning: Optional[str] = None
    analysis_verbosity: Optional[str] = None
    analysis_provider: Optional[str] = None
    provider_parameters: Optional[Dict[str, Any]] = None
    analysis_workflow: Literal["standard", "structured_review"] = "standard"
    visibility: str = DEFAULT_PROMPT_VISIBILITY
    visible_to_user_ids: Optional[List[str]] = None
    speaker_identification_enabled: bool = False
    prompt_metadata: Optional[PromptMetadata] = None
    recording_disclaimer_enabled: bool = False
    recording_disclaimer: Optional[str] = None

    _name = field_validator("name")(_validated_name)
    _prompts = field_validator("prompts")(_validated_prompts)

    @field_validator("visibility")
    @classmethod
    def validate_visibility(cls, value: str) -> str:
        return normalize_prompt_visibility(value)

    @field_validator("analysis_reasoning")
    @classmethod
    def validate_reasoning(cls, value: Optional[str]) -> Optional[str]:
        if value is not None:
            ReasoningLevel(value)
        return value

    @field_validator("analysis_verbosity")
    @classmethod
    def validate_verbosity(cls, value: Optional[str]) -> Optional[str]:
        if value is not None:
            VerbosityLevel(value)
        return value

    @field_validator("recording_disclaimer")
    @classmethod
    def validate_disclaimer(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if not value:
            return None
        if len(value) > 2000:
            raise ValueError("Recording disclaimer cannot exceed 2000 characters")
        if InputValidator.contains_dangerous_patterns(value):
            raise ValueError("Invalid characters in recording disclaimer")
        return value


class PromptTemplateCreate(PromptTemplateFields):
    folder_id: str

    _folder_id = field_validator("folder_id")(_validated_id)


class PromptTemplatePatch(BaseModel):
    name: Optional[str] = None
    folder_id: Optional[str] = None
    prompts: Optional[Dict[str, str]] = None
    pre_session_talking_points: Optional[List[Dict[str, Any]]] = None
    in_session_talking_points: Optional[List[Dict[str, Any]]] = None
    analysis_model: Optional[str] = None
    analysis_reasoning: Optional[str] = None
    analysis_verbosity: Optional[str] = None
    analysis_provider: Optional[str] = None
    provider_parameters: Optional[Dict[str, Any]] = None
    analysis_workflow: Optional[Literal["standard", "structured_review"]] = None
    visibility: Optional[str] = None
    visible_to_user_ids: Optional[List[str]] = None
    speaker_identification_enabled: Optional[bool] = None
    prompt_metadata: Optional[PromptMetadata] = None
    recording_disclaimer_enabled: Optional[bool] = None
    recording_disclaimer: Optional[str] = None

    @field_validator(
        "name",
        "folder_id",
        "prompts",
        "pre_session_talking_points",
        "in_session_talking_points",
        "analysis_workflow",
        "visibility",
        "speaker_identification_enabled",
        "recording_disclaimer_enabled",
        mode="before",
    )
    @classmethod
    def reject_null_required_values(cls, value: Any) -> Any:
        if value is None:
            raise ValueError("Field cannot be null")
        return value

    _name = field_validator("name")(_validated_name)
    _folder_id = field_validator("folder_id")(_validated_id)
    _prompts = field_validator("prompts")(_validated_prompts)

    @field_validator("visibility")
    @classmethod
    def validate_visibility(cls, value: Optional[str]) -> Optional[str]:
        return normalize_prompt_visibility(value) if value is not None else None

    @model_validator(mode="after")
    def reject_empty_patch(self):
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        return self


class PromptTemplateResponse(PromptTemplateFields):
    id: str
    folder_id: str
    business_unit_id: Optional[str] = None
    created_at: int
    updated_at: int
    updated_by_user_id: Optional[str] = None
    updated_by_display_name: Optional[str] = None


class PromptVersionMetadataResponse(BaseModel):
    id: str
    created_at: Optional[int] = None
    created_by_user_id: Optional[str] = None
    created_by_display_name: Optional[str] = None
    source_action: Optional[str] = None
    change_reason: Optional[str] = None


class PromptVersionDetailResponse(PromptVersionMetadataResponse):
    template_id: str
    snapshot: Dict[str, Any]


class PromptVersionDiffResponse(BaseModel):
    left: PromptVersionMetadataResponse
    right: PromptVersionMetadataResponse
    left_text: str
    right_text: str
    summary: Dict[str, int]


class PromptVersionRestoreRequest(BaseModel):
    version_id: str
    reason: Optional[str] = None

    _version_id = field_validator("version_id")(_validated_id)
