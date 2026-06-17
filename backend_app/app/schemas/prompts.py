"""Prompt API schemas."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from ..models.inference_config import (
    ENHANCED_REASONING_SUPPORTED_PROVIDERS,
    ReasoningLevel,
    SUPPORTED_ANALYSIS_MODELS,
    SUPPORTED_ANALYSIS_PROVIDERS,
    VerbosityLevel,
    get_provider_parameters,
    get_providers_for_model,
    validate_model_provider_combination,
)
from ..models.prompt_constraints import PromptConstraints
from ..models.prompt_visibility import DEFAULT_PROMPT_VISIBILITY, normalize_prompt_visibility
from ..utils.input_validation import InputValidator

class PromptKey(BaseModel):
    key: str
    prompt: str
    
    @field_validator('key', 'prompt')
    @classmethod
    def validate_fields(cls, v: str) -> str:
        if not v or len(v.strip()) == 0:
            raise ValueError('Field cannot be empty')
        if len(v) > 5000:
            raise ValueError('Field too long')
        if InputValidator.contains_dangerous_patterns(v):
            raise ValueError('Invalid characters detected')
        return v.strip()


class CategoryBase(BaseModel):
    name: str
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not v or len(v.strip()) == 0:
            raise ValueError('Category name is required')
        if len(v) > 255:
            raise ValueError('Category name cannot exceed 255 characters')
        if InputValidator.contains_dangerous_patterns(v):
            raise ValueError('Invalid characters in category name')
        return v.strip()


class CategoryCreate(CategoryBase):
    parent_category_id: Optional[str] = None


class CategoryUpdate(CategoryBase):
    parent_category_id: Optional[str] = None


class CategoryResponse(CategoryBase):
    id: str
    created_at: int
    updated_at: int
    parent_category_id: Optional[str] = None


class SubcategoryBase(BaseModel):
    name: str
    prompts: Dict[str, str]
    preSessionTalkingPoints: List[Dict[str, Any]] = Field(default_factory=list)
    inSessionTalkingPoints: List[Dict[str, Any]] = Field(default_factory=list)
    
    # Inference configuration fields (Phase 2: Analysis Config Renovation)
    analysis_model: Optional[str] = None
    analysis_reasoning: Optional[str] = None
    analysis_verbosity: Optional[str] = None
    analysis_provider: Optional[str] = None
    provider_parameters: Optional[Dict[str, Any]] = None
    prompt_visibility: Optional[str] = None
    visible_to_user_ids: Optional[List[str]] = None
    enhanced_reasoning_enabled: Optional[bool] = False
    prompt_constraints: Optional[Dict[str, PromptConstraints]] = None
    
    @field_validator('name')
    @classmethod
    def validate_subcategory_name(cls, v: str) -> str:
        if not v or len(v.strip()) == 0:
            raise ValueError('Subcategory name is required')
        if len(v) > 255:
            raise ValueError('Subcategory name cannot exceed 255 characters')
        if InputValidator.contains_dangerous_patterns(v):
            raise ValueError('Invalid characters in subcategory name')
        return v.strip()
    
    @field_validator('prompts')
    @classmethod
    def validate_prompts_dict(cls, v: Dict[str, str]) -> Dict[str, str]:
        if not isinstance(v, dict):
            raise ValueError('Prompts must be a dictionary')
        if len(v) > 50:
            raise ValueError('Too many prompts (max 50)')
        for key, value in v.items():
            if not isinstance(value, str):
                raise ValueError('Prompt values must be strings')
            if len(value) > 15000:
                raise ValueError('Max character limit of 15000 reached')
            if InputValidator.contains_dangerous_patterns(str(key) + value):
                raise ValueError('Invalid characters in prompts')
        return v
    
    @field_validator('analysis_model')
    @classmethod
    def validate_analysis_model(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if v not in SUPPORTED_ANALYSIS_MODELS:
            raise ValueError(
                f'Invalid analysis_model. Must be one of: {", ".join(SUPPORTED_ANALYSIS_MODELS)}'
            )
        return v
    
    @field_validator('analysis_reasoning')
    @classmethod
    def validate_analysis_reasoning(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        try:
            ReasoningLevel(v)
            return v
        except ValueError:
            valid_values = [level.value for level in ReasoningLevel]
            raise ValueError(
                f'Invalid analysis_reasoning. Must be one of: {", ".join(valid_values)}'
            )
    
    @field_validator('analysis_verbosity')
    @classmethod
    def validate_analysis_verbosity(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        try:
            VerbosityLevel(v)
            return v
        except ValueError:
            valid_values = [level.value for level in VerbosityLevel]
            raise ValueError(
                f'Invalid analysis_verbosity. Must be one of: {", ".join(valid_values)}'
            )
    
    @field_validator('analysis_provider')
    @classmethod
    def validate_analysis_provider(cls, v: Optional[str], info) -> Optional[str]:
        if v is None:
            return v
        if v not in SUPPORTED_ANALYSIS_PROVIDERS:
            raise ValueError(
                f'Invalid analysis_provider. Must be one of: {", ".join(SUPPORTED_ANALYSIS_PROVIDERS)}'
            )
        
        # Cross-validate with analysis_model if both are present
        model = info.data.get('analysis_model')
        if model and not validate_model_provider_combination(model, v):
            allowed_providers = get_providers_for_model(model)
            raise ValueError(
                f'Provider "{v}" is not compatible with model "{model}". '
                f'Allowed providers for this model: {", ".join(allowed_providers)}'
            )
        
        return v
    
    @field_validator('provider_parameters')
    @classmethod
    def validate_provider_parameters(cls, v: Optional[Dict[str, Any]], info) -> Optional[Dict[str, Any]]:
        if v is None or not v:
            return v
        
        if not isinstance(v, dict):
            raise ValueError('provider_parameters must be a dictionary')
        
        # Get the selected provider
        provider = info.data.get('analysis_provider')
        model = info.data.get('analysis_model')
        if not provider:
            # No provider selected yet; can't validate parameters
            # Allow storage but warn that validation will happen when provider is set
            return v
        
        # Validate parameters against provider schema
        provider_schema = get_provider_parameters(provider, model=model)
        
        for param_name, param_value in v.items():
            if param_name not in provider_schema:
                available_params = ", ".join(provider_schema.keys()) if provider_schema else "none"
                raise ValueError(
                    f'Parameter "{param_name}" is not supported by provider "{provider}". '
                    f'Available parameters: {available_params}'
                )
            
            # Validate parameter value against schema
            param_def = provider_schema[param_name]
            param_type = param_def.get("type")
            
            if param_type == "string" and "allowed_values" in param_def:
                if param_value not in param_def["allowed_values"]:
                    raise ValueError(
                        f'Invalid value "{param_value}" for parameter "{param_name}". '
                        f'Allowed values: {", ".join(param_def["allowed_values"])}'
                    )
            elif param_type == "float":
                try:
                    float_val = float(param_value)
                    if "min" in param_def and float_val < param_def["min"]:
                        raise ValueError(
                            f'Parameter "{param_name}" must be >= {param_def["min"]}'
                        )
                    if "max" in param_def and float_val > param_def["max"]:
                        raise ValueError(
                            f'Parameter "{param_name}" must be <= {param_def["max"]}'
                        )
                except (ValueError, TypeError):
                    raise ValueError(f'Parameter "{param_name}" must be a number')
            elif param_type == "integer":
                try:
                    int_val = int(param_value)
                    if "min" in param_def and int_val < param_def["min"]:
                        raise ValueError(
                            f'Parameter "{param_name}" must be >= {param_def["min"]}'
                        )
                    if "max" in param_def and int_val > param_def["max"]:
                        raise ValueError(
                            f'Parameter "{param_name}" must be <= {param_def["max"]}'
                        )
                except (ValueError, TypeError):
                    raise ValueError(f'Parameter "{param_name}" must be an integer')

            dependency = param_def.get("depends_on")
            if dependency:
                dependency_parameter = dependency.get("parameter")
                expected_value = dependency.get("value")
                effective_dependency_value = v.get(dependency_parameter)

                if (
                    effective_dependency_value is None
                    and dependency_parameter in provider_schema
                ):
                    effective_dependency_value = provider_schema[dependency_parameter].get("default")

                if effective_dependency_value != expected_value:
                    raise ValueError(
                        dependency.get(
                            "message",
                            f'Parameter "{param_name}" requires "{dependency_parameter}" to be "{expected_value}"',
                        )
                    )
        
        return v

    @field_validator('prompt_visibility')
    @classmethod
    def validate_prompt_visibility(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return normalize_prompt_visibility(v)

    @model_validator(mode='after')
    def validate_enhanced_reasoning(self):
        if self.enhanced_reasoning_enabled:
            provider = self.analysis_provider
            if provider and provider not in ENHANCED_REASONING_SUPPORTED_PROVIDERS:
                raise ValueError(
                    f'Enhanced reasoning requires a supported provider '
                    f'({", ".join(sorted(ENHANCED_REASONING_SUPPORTED_PROVIDERS))}), '
                    f'but "{provider}" was selected'
                )
        if self.prompt_constraints is not None and self.prompts:
            orphan_keys = set(self.prompt_constraints.keys()) - set(self.prompts.keys())
            if orphan_keys:
                raise ValueError(
                    f'prompt_constraints keys must be a subset of prompts keys. '
                    f'Unknown keys: {", ".join(sorted(orphan_keys))}'
                )
        return self


class SubcategoryCreate(SubcategoryBase):
    category_id: str


class SubcategoryUpdate(SubcategoryBase):
    pass


class SubcategoryResponse(SubcategoryBase):
    id: str
    category_id: str
    business_unit_id: Optional[str] = None
    created_at: int
    updated_at: int
    updated_by_user_id: Optional[str] = None
    updated_by_display_name: Optional[str] = None
    prompt_visibility: str = DEFAULT_PROMPT_VISIBILITY
    visible_to_user_ids: Optional[List[str]] = None


class PromptVersionMetadataResponse(BaseModel):
    id: str
    created_at: Optional[int] = None
    created_by_user_id: Optional[str] = None
    created_by_display_name: Optional[str] = None
    source_action: Optional[str] = None
    change_reason: Optional[str] = None


class PromptVersionListResponse(BaseModel):
    versions: List[PromptVersionMetadataResponse]
    total: int
    limit: int
    offset: int
    has_more: bool


class PromptVersionDetailResponse(PromptVersionMetadataResponse):
    subcategory_id: str
    snapshot: Dict[str, Any]


class PromptVersionDiffResponse(BaseModel):
    left: PromptVersionMetadataResponse
    right: PromptVersionMetadataResponse
    left_text: str
    right_text: str
    summary: Dict[str, int]


class PromptVersionRollbackRequest(BaseModel):
    reason: Optional[str] = None

class PromptSubcategoryResponse(BaseModel):
    subcategory_name: str
    subcategory_id: str
    prompts: Dict[str, str]
    preSessionTalkingPoints: Optional[list] = []
    inSessionTalkingPoints: Optional[list] = []
    analysis_model: Optional[str] = None
    analysis_reasoning: Optional[str] = None
    analysis_verbosity: Optional[str] = None
    analysis_provider: Optional[str] = None
    provider_parameters: Optional[Dict[str, Any]] = None
    prompt_visibility: str = DEFAULT_PROMPT_VISIBILITY


class PromptCategoryResponse(BaseModel):
    category_name: str
    category_id: str
    subcategories: List[PromptSubcategoryResponse]


class AllPromptsResponse(BaseModel):
    status: int
    data: List[PromptCategoryResponse]
