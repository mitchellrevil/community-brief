"""
Tests for inference configuration fields on subcategory models.

Tests validation of analysis_model, analysis_reasoning, analysis_verbosity,
analysis_provider, and provider_parameters fields.
"""

import pytest
from pydantic import ValidationError

from backend_app.app.schemas.prompts import (
    SubcategoryBase,
    SubcategoryCreate,
    SubcategoryUpdate,
    SubcategoryResponse,
)


class TestSubcategoryInferenceFields:
    """Test inference configuration fields on subcategory Pydantic models."""

    def test_subcategory_base_accepts_valid_analysis_model(self):
        """SubcategoryBase should accept valid analysis_model from curated list."""
        data = {
            "name": "Test Subcategory",
            "prompts": {"key1": "prompt1"},
            "analysis_model": "gpt-4o",
        }
        subcat = SubcategoryBase(**data)
        assert subcat.analysis_model == "gpt-4o"

    def test_subcategory_base_rejects_invalid_analysis_model(self):
        """SubcategoryBase should reject analysis_model not in curated list."""
        data = {
            "name": "Test Subcategory",
            "prompts": {"key1": "prompt1"},
            "analysis_model": "unsupported-model-xyz",
        }
        with pytest.raises(ValidationError) as exc_info:
            SubcategoryBase(**data)
        
        errors = exc_info.value.errors()
        assert any("analysis_model" in str(e) for e in errors)

    def test_subcategory_base_accepts_valid_reasoning_level(self):
        """SubcategoryBase should accept valid reasoning levels."""
        for level in ["none", "low", "medium", "high", "xhigh"]:
            data = {
                "name": "Test Subcategory",
                "prompts": {"key1": "prompt1"},
                "analysis_reasoning": level,
            }
            subcat = SubcategoryBase(**data)
            assert subcat.analysis_reasoning == level

    def test_subcategory_base_rejects_invalid_reasoning_level(self):
        """SubcategoryBase should reject invalid reasoning levels."""
        data = {
            "name": "Test Subcategory",
            "prompts": {"key1": "prompt1"},
            "analysis_reasoning": "invalid_level",
        }
        with pytest.raises(ValidationError) as exc_info:
            SubcategoryBase(**data)
        
        errors = exc_info.value.errors()
        assert any("analysis_reasoning" in str(e) for e in errors)

    def test_subcategory_base_accepts_valid_verbosity_level(self):
        """SubcategoryBase should accept valid verbosity levels."""
        for level in ["low", "medium", "high"]:
            data = {
                "name": "Test Subcategory",
                "prompts": {"key1": "prompt1"},
                "analysis_verbosity": level,
            }
            subcat = SubcategoryBase(**data)
            assert subcat.analysis_verbosity == level

    def test_subcategory_base_rejects_invalid_verbosity_level(self):
        """SubcategoryBase should reject invalid verbosity levels."""
        data = {
            "name": "Test Subcategory",
            "prompts": {"key1": "prompt1"},
            "analysis_verbosity": "super_verbose",
        }
        with pytest.raises(ValidationError) as exc_info:
            SubcategoryBase(**data)
        
        errors = exc_info.value.errors()
        assert any("analysis_verbosity" in str(e) for e in errors)

    def test_subcategory_base_all_inference_fields_optional(self):
        """All inference fields should be optional (backward compatibility)."""
        data = {
            "name": "Test Subcategory",
            "prompts": {"key1": "prompt1"},
        }
        subcat = SubcategoryBase(**data)
        assert subcat.analysis_model is None
        assert subcat.analysis_reasoning is None
        assert subcat.analysis_verbosity is None

    def test_subcategory_base_all_inference_fields_together(self):
        """SubcategoryBase should accept all inference fields together."""
        data = {
            "name": "Test Subcategory",
            "prompts": {"key1": "prompt1"},
            "analysis_model": "gpt-4o-mini",
            "analysis_reasoning": "medium",
            "analysis_verbosity": "high",
        }
        subcat = SubcategoryBase(**data)
        assert subcat.analysis_model == "gpt-4o-mini"
        assert subcat.analysis_reasoning == "medium"
        assert subcat.analysis_verbosity == "high"

    def test_subcategory_create_inherits_inference_validation(self):
        """SubcategoryCreate should inherit inference field validation."""
        data = {
            "name": "Test Subcategory",
            "prompts": {"key1": "prompt1"},
            "category_id": "cat123",
            "analysis_model": "gpt-5.1",
            "analysis_reasoning": "low",
        }
        subcat = SubcategoryCreate(**data)
        assert subcat.analysis_model == "gpt-5.1"
        assert subcat.analysis_reasoning == "low"

    def test_subcategory_update_inherits_inference_validation(self):
        """SubcategoryUpdate should inherit inference field validation."""
        data = {
            "name": "Test Subcategory",
            "prompts": {"key1": "prompt1"},
            "analysis_model": "gpt-5-mini",
            "analysis_verbosity": "low",
        }
        subcat = SubcategoryUpdate(**data)
        assert subcat.analysis_model == "gpt-5-mini"
        assert subcat.analysis_verbosity == "low"

    def test_subcategory_response_inherits_inference_fields(self):
        """SubcategoryResponse should include inference fields in responses."""
        data = {
            "id": "sub123",
            "category_id": "cat123",
            "name": "Test Subcategory",
            "prompts": {"key1": "prompt1"},
            "created_at": 1234567890,
            "updated_at": 1234567890,
            "analysis_model": "gpt-4o",
            "analysis_reasoning": "high",
            "analysis_verbosity": "medium",
        }
        response = SubcategoryResponse(**data)
        assert response.analysis_model == "gpt-4o"
        assert response.analysis_reasoning == "high"
        assert response.analysis_verbosity == "medium"


class TestSubcategoryInferenceFieldsAllModelVariants:
    """Test all supported analysis models are accepted."""

    @pytest.mark.parametrize("model", [
        "gpt-5.5-sweden",
        "gpt-5.4",
        "gpt-5.1",
        "gpt-5-mini",
        "gpt-5-nano",
        "gpt-4.1",
        "gpt-4o",
        "gpt-4o-mini",
    ])
    def test_all_supported_models_accepted(self, model):
        """All models in SUPPORTED_ANALYSIS_MODELS should be valid."""
        data = {
            "name": "Test Subcategory",
            "prompts": {"key1": "prompt1"},
            "analysis_model": model,
        }
        subcat = SubcategoryBase(**data)
        assert subcat.analysis_model == model


class TestSubcategoryProviderFields:
    """Test analysis_provider and provider_parameters validation."""

    def test_subcategory_base_accepts_valid_provider(self):
        """SubcategoryBase should accept valid providers."""
        for provider in ["responses", "chat_completions"]:
            data = {
                "name": "Test Subcategory",
                "prompts": {"key1": "prompt1"},
                "analysis_provider": provider,
            }
            subcat = SubcategoryBase(**data)
            assert subcat.analysis_provider == provider

    def test_subcategory_base_rejects_invalid_provider(self):
        """SubcategoryBase should reject invalid providers."""
        data = {
            "name": "Test Subcategory",
            "prompts": {"key1": "prompt1"},
            "analysis_provider": "unsupported-provider",
        }
        with pytest.raises(ValidationError) as exc_info:
            SubcategoryBase(**data)
        
        errors = exc_info.value.errors()
        assert any("analysis_provider" in str(e) for e in errors)

    def test_subcategory_rejects_incompatible_model_provider_combination(self):
        """SubcategoryBase should reject model/provider combinations that don't work together."""
        data = {
            "name": "Test Subcategory",
            "prompts": {"key1": "prompt1"},
            "analysis_model": "gpt-5.1",  # Only works with 'responses'
            "analysis_provider": "chat_completions",  # Incompatible
        }
        with pytest.raises(ValidationError) as exc_info:
            SubcategoryBase(**data)
        
        errors = exc_info.value.errors()
        assert any("analysis_provider" in str(e) and "not compatible" in str(e) for e in errors)

    def test_subcategory_accepts_compatible_model_provider_combination(self):
        """SubcategoryBase should accept valid model/provider combinations."""
        data = {
            "name": "Test Subcategory",
            "prompts": {"key1": "prompt1"},
            "analysis_model": "gpt-4o",  # Chat Completions only
            "analysis_provider": "chat_completions",
        }
        subcat = SubcategoryBase(**data)
        assert subcat.analysis_model == "gpt-4o"
        assert subcat.analysis_provider == "chat_completions"

    def test_subcategory_accepts_valid_provider_parameters_for_responses(self):
        """SubcategoryBase should accept valid provider_parameters for responses provider."""
        data = {
            "name": "Test Subcategory",
            "prompts": {"key1": "prompt1"},
            "analysis_provider": "responses",
            "provider_parameters": {
                "reasoning_effort": "high",
                "verbosity": "medium"
            }
        }
        subcat = SubcategoryBase(**data)
        assert subcat.provider_parameters == {"reasoning_effort": "high", "verbosity": "medium"}

    def test_subcategory_accepts_gpt_5_4_xhigh_reasoning(self):
        """GPT-5.4 should accept the xhigh reasoning level from the latest-model guide."""
        data = {
            "name": "Test Subcategory",
            "prompts": {"key1": "prompt1"},
            "analysis_model": "gpt-5.4",
            "analysis_provider": "responses",
            "provider_parameters": {
                "reasoning_effort": "xhigh",
                "verbosity": "medium",
            },
        }

        subcat = SubcategoryBase(**data)

        assert subcat.provider_parameters == {
            "reasoning_effort": "xhigh",
            "verbosity": "medium",
        }

    def test_subcategory_accepts_gpt_5_5_xhigh_reasoning(self):
        """GPT-5.5 deployments should accept the xhigh reasoning level."""
        data = {
            "name": "Test Subcategory",
            "prompts": {"key1": "prompt1"},
            "analysis_model": "gpt-5.5-sweden",
            "analysis_provider": "responses",
            "provider_parameters": {
                "reasoning_effort": "xhigh",
                "verbosity": "medium",
            },
        }

        subcat = SubcategoryBase(**data)

        assert subcat.provider_parameters == {
            "reasoning_effort": "xhigh",
            "verbosity": "medium",
        }

    def test_subcategory_rejects_gpt_5_4_temperature_without_none_reasoning(self):
        """GPT-5.4 should reject temperature unless reasoning is none."""
        data = {
            "name": "Test Subcategory",
            "prompts": {"key1": "prompt1"},
            "analysis_model": "gpt-5.4",
            "analysis_provider": "responses",
            "provider_parameters": {
                "reasoning_effort": "medium",
                "temperature": 0.4,
            },
        }

        with pytest.raises(ValidationError) as exc_info:
            SubcategoryBase(**data)

        errors = exc_info.value.errors()
        assert any("temperature" in str(e) and "gpt-5.4" in str(e) for e in errors)

    def test_subcategory_rejects_gpt_5_5_temperature_without_none_reasoning(self):
        """GPT-5.5 deployments should reject temperature unless reasoning is none."""
        data = {
            "name": "Test Subcategory",
            "prompts": {"key1": "prompt1"},
            "analysis_model": "gpt-5.5-sweden",
            "analysis_provider": "responses",
            "provider_parameters": {
                "reasoning_effort": "medium",
                "temperature": 0.4,
            },
        }

        with pytest.raises(ValidationError) as exc_info:
            SubcategoryBase(**data)

        errors = exc_info.value.errors()
        assert any("temperature" in str(e) and "gpt-5.5-sweden" in str(e) for e in errors)

    def test_subcategory_accepts_gpt_5_4_temperature_with_default_none_reasoning(self):
        """GPT-5.4 should allow sampling parameters when reasoning_effort falls back to none."""
        data = {
            "name": "Test Subcategory",
            "prompts": {"key1": "prompt1"},
            "analysis_model": "gpt-5.4",
            "analysis_provider": "responses",
            "provider_parameters": {
                "temperature": 0.4,
                "top_p": 0.9,
            },
        }

        subcat = SubcategoryBase(**data)

        assert subcat.provider_parameters == {
            "temperature": 0.4,
            "top_p": 0.9,
        }

    def test_subcategory_accepts_valid_provider_parameters_for_chat_completions(self):
        """SubcategoryBase should accept valid provider_parameters for chat_completions provider."""
        data = {
            "name": "Test Subcategory",
            "prompts": {"key1": "prompt1"},
            "analysis_provider": "chat_completions",
            "provider_parameters": {
                "temperature": 0.8,
                "max_tokens": 1500
            }
        }
        subcat = SubcategoryBase(**data)
        assert subcat.provider_parameters == {"temperature": 0.8, "max_tokens": 1500}

    def test_subcategory_rejects_unsupported_parameter_for_provider(self):
        """SubcategoryBase should reject parameters not supported by the provider."""
        data = {
            "name": "Test Subcategory",
            "prompts": {"key1": "prompt1"},
            "analysis_provider": "responses",
            "provider_parameters": {
                "max_tokens": 1500  # Not supported by responses provider
            }
        }
        with pytest.raises(ValidationError) as exc_info:
            SubcategoryBase(**data)
        
        errors = exc_info.value.errors()
        assert any("provider_parameters" in str(e) and "not supported" in str(e) for e in errors)

    def test_subcategory_rejects_invalid_parameter_value(self):
        """SubcategoryBase should reject invalid parameter values."""
        data = {
            "name": "Test Subcategory",
            "prompts": {"key1": "prompt1"},
            "analysis_provider": "responses",
            "provider_parameters": {
                "reasoning_effort": "ultra-high"  # Not in allowed values
            }
        }
        with pytest.raises(ValidationError) as exc_info:
            SubcategoryBase(**data)
        
        errors = exc_info.value.errors()
        assert any("provider_parameters" in str(e) for e in errors)

    def test_subcategory_rejects_out_of_range_float_parameter(self):
        """SubcategoryBase should reject float parameters outside allowed range."""
        data = {
            "name": "Test Subcategory",
            "prompts": {"key1": "prompt1"},
            "analysis_provider": "chat_completions",
            "provider_parameters": {
                "temperature": 3.0  # Max is 2.0
            }
        }
        with pytest.raises(ValidationError) as exc_info:
            SubcategoryBase(**data)
        
        errors = exc_info.value.errors()
        assert any("provider_parameters" in str(e) for e in errors)

    def test_subcategory_provider_parameters_without_provider_accepted(self):
        """SubcategoryBase should allow provider_parameters without provider (can't validate yet)."""
        data = {
            "name": "Test Subcategory",
            "prompts": {"key1": "prompt1"},
            "provider_parameters": {
                "reasoning_effort": "high"
            }
        }
        # Should not raise - validation will happen when provider is set
        subcat = SubcategoryBase(**data)
        assert subcat.provider_parameters == {"reasoning_effort": "high"}

    def test_subcategory_all_provider_fields_optional(self):
        """All provider fields should be optional (backward compatibility)."""
        data = {
            "name": "Test Subcategory",
            "prompts": {"key1": "prompt1"},
        }
        subcat = SubcategoryBase(**data)
        assert subcat.analysis_provider is None
        assert subcat.provider_parameters is None

    def test_subcategory_response_includes_provider_fields(self):
        """SubcategoryResponse should include provider fields in responses."""
        data = {
            "id": "sub123",
            "category_id": "cat123",
            "name": "Test Subcategory",
            "prompts": {"key1": "prompt1"},
            "created_at": 1234567890,
            "updated_at": 1234567890,
            "analysis_provider": "responses",
            "provider_parameters": {"reasoning_effort": "high", "verbosity": "low"}
        }
        response = SubcategoryResponse(**data)
        assert response.analysis_provider == "responses"
        assert response.provider_parameters == {"reasoning_effort": "high", "verbosity": "low"}
