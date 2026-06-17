"""
Inference configuration constants for analysis operations.

This module defines supported models, providers, and their capabilities
for AI-powered analysis of transcripts within the Community Brief system.
"""

from copy import deepcopy
from enum import Enum
from typing import List, Dict, Any, Set, Optional


# =============================================================================
# Provider Capability Definitions
# =============================================================================

class ReasoningLevel(str, Enum):
    """Level of reasoning/chain-of-thought to apply during analysis."""
    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    XHIGH = "xhigh"


class VerbosityLevel(str, Enum):
    """Verbosity level for analysis output."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


# Provider metadata: describes each API's capabilities and supported parameters
PROVIDERS: Dict[str, Dict[str, Any]] = {
    "responses": {
        "name": "Azure OpenAI Responses API",
        "description": "Supports reasoning, verbosity, temperature, and token limits",
        "parameters": {
            "reasoning_effort": {
                "type": "string",
                "allowed_values": [level.value for level in ReasoningLevel],
                "description": "Reasoning effort level for chain-of-thought processing",
                "default": None,  # No default; omit unless explicitly set
            },
            "verbosity": {
                "type": "string",
                "allowed_values": [level.value for level in VerbosityLevel],
                "description": "Output verbosity level",
                "default": None,
            },
            "temperature": {
                "type": "float",
                "min": 0.0,
                "max": 2.0,
                "description": "Sampling temperature (0.0=deterministic, 2.0=random)",
                "default": None,
            },
            "max_output_tokens": {
                "type": "integer",
                "min": 1,
                "max": 64000,
                "description": "Maximum output tokens including reasoning tokens",
                "default": None,
            },
            "top_p": {
                "type": "float",
                "min": 0.0,
                "max": 1.0,
                "description": "Nucleus sampling parameter",
                "default": None,
            },
        },
    },
    "chat_completions": {
        "name": "Azure OpenAI Chat Completions API",
        "description": "Standard chat completions with temperature and token limits",
        "parameters": {
            "temperature": {
                "type": "float",
                "min": 0.0,
                "max": 2.0,
                "description": "Sampling temperature (0.0=deterministic, 2.0=random)",
                "default": None,
            },
            "max_tokens": {
                "type": "integer",
                "min": 1,
                "max": 128000,
                "description": "Maximum tokens in response",
                "default": None,
            },
            "top_p": {
                "type": "float",
                "min": 0.0,
                "max": 1.0,
                "description": "Nucleus sampling parameter",
                "default": None,
            },
        },
    },
}


MODEL_PARAMETER_OVERRIDES: Dict[str, Dict[str, Dict[str, Dict[str, Any]]]] = {
    "gpt-5.5-sweden": {
        "responses": {
            "reasoning_effort": {
                "allowed_values": [level.value for level in ReasoningLevel],
                "default": "medium",
                "description": "Reasoning effort level for GPT-5.5 (defaults to medium)",
            },
            "verbosity": {
                "default": "medium",
                "description": "Output verbosity level for GPT-5.5 (defaults to medium)",
            },
            "temperature": {
                "depends_on": {
                    "parameter": "reasoning_effort",
                    "value": "none",
                    "message": 'Parameter "temperature" is only supported for model "gpt-5.5-sweden" when "reasoning_effort" is "none"',
                }
            },
            "top_p": {
                "depends_on": {
                    "parameter": "reasoning_effort",
                    "value": "none",
                    "message": 'Parameter "top_p" is only supported for model "gpt-5.5-sweden" when "reasoning_effort" is "none"',
                }
            },
        }
    },
    "gpt-5.4": {
        "responses": {
            "reasoning_effort": {
                "allowed_values": [level.value for level in ReasoningLevel],
                "default": "none",
                "description": "Reasoning effort level for GPT-5.4 (defaults to none)",
            },
            "verbosity": {
                "default": "medium",
                "description": "Output verbosity level for GPT-5.4 (defaults to medium)",
            },
            "temperature": {
                "depends_on": {
                    "parameter": "reasoning_effort",
                    "value": "none",
                    "message": 'Parameter "temperature" is only supported for model "gpt-5.4" when "reasoning_effort" is "none"',
                }
            },
            "top_p": {
                "depends_on": {
                    "parameter": "reasoning_effort",
                    "value": "none",
                    "message": 'Parameter "top_p" is only supported for model "gpt-5.4" when "reasoning_effort" is "none"',
                }
            },
        }
    }
}


# Model-to-provider mappings: which providers support which models
MODELS: Dict[str, List[str]] = {
    "gpt-5.5-sweden": ["responses"],
    "gpt-5.4": ["responses"],
    "gpt-5.1": ["responses"],
    "gpt-5-mini": ["responses"],
    "gpt-5-nano": ["responses"],
    "gpt-4.1": ["chat_completions"],
    "gpt-4o": ["chat_completions"],
    "gpt-4o-mini": ["chat_completions"],
}


SUPPORTED_ANALYSIS_MODELS: List[str] = sorted(MODELS.keys())
SUPPORTED_ANALYSIS_PROVIDERS: List[str] = sorted(PROVIDERS.keys())

# Models that support reasoning (via responses provider)
REASONING_CAPABLE_MODELS: Set[str] = {
    model for model, providers in MODELS.items()
    if "responses" in providers and "reasoning_effort" in PROVIDERS["responses"]["parameters"]
}

# Models that support verbosity (via responses provider)
VERBOSITY_CAPABLE_MODELS: Set[str] = {
    model for model, providers in MODELS.items()
    if "responses" in providers and "verbosity" in PROVIDERS["responses"]["parameters"]
}


# =============================================================================
# Helper Functions
# =============================================================================

def get_supported_models() -> List[str]:
    """Get list of all supported model names."""
    return SUPPORTED_ANALYSIS_MODELS


def get_supported_providers() -> List[str]:
    """Get list of all supported provider names."""
    return SUPPORTED_ANALYSIS_PROVIDERS


def get_providers_for_model(model: str) -> List[str]:
    """Get list of providers that support a given model.
    
    Args:
        model: Model name (e.g., "gpt-5.1")
        
    Returns:
        List of provider names that can handle this model, or empty list if unknown
    """
    return MODELS.get(model, [])


def get_provider_parameters(provider: str, model: Optional[str] = None) -> Dict[str, Any]:
    """Get parameter schema for a provider.
    
    Args:
        provider: Provider name (e.g., "responses")
        model: Optional model name for model-specific overrides
        
    Returns:
        Dict of parameter definitions, or empty dict if provider unknown
    """
    provider_parameters = deepcopy(PROVIDERS.get(provider, {}).get("parameters", {}))
    if not provider_parameters or not model:
        return provider_parameters

    model_overrides = MODEL_PARAMETER_OVERRIDES.get(model, {}).get(provider, {})
    for parameter_name, override_values in model_overrides.items():
        if parameter_name in provider_parameters:
            provider_parameters[parameter_name].update(override_values)
        else:
            provider_parameters[parameter_name] = deepcopy(override_values)

    return provider_parameters


# =============================================================================
# Enhanced Reasoning Constants
# =============================================================================

ENHANCED_REASONING_SUPPORTED_PROVIDERS: Set[str] = {"responses"}

ENHANCED_REASONING_MODELS: Dict[str, str] = {
    "planner":  "gpt-5.4-nano",
    "writer":   "gpt-5.5",
    "critic":   "gpt-5.4",
    "rewriter": "gpt-5.5",
}


def validate_model_provider_combination(model: Optional[str], provider: Optional[str]) -> bool:
    """Check if a model/provider combination is valid.
    
    Args:
        model: Model name (can be None to skip model validation)
        provider: Provider name (can be None to skip provider validation)
        
    Returns:
        True if combination is valid or either is None; False otherwise
    """
    if model is None or provider is None:
        return True  # Can't validate incomplete combination
    
    allowed_providers = get_providers_for_model(model)
    return provider in allowed_providers
