"""Dynamic inference catalog schema and seed conversion."""

from __future__ import annotations

from datetime import UTC, datetime
from copy import deepcopy
import json
import math
import re
from typing import Any, Dict, List, Literal, Optional

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from ..models.inference_config import (
    DEFAULT_ANALYSIS_MODEL,
    MODELS,
    get_provider_parameters,
)

CATALOG_ID = "inference_catalog"
# Community Brief owns request content, authentication and synchronous execution.
# Model options are otherwise data, including options added after this release.
RESERVED_REQUEST_FIELDS = {
    "model",
    "input",
    "messages",
    "instructions",
    "stream",
    "stream_options",
    "background",
    "previous_response_id",
    "conversation",
    "tools",
    "tool_choice",
    "extra_body",
    "extra_headers",
    "extra_query",
    "timeout",
    "api_key",
    "base_url",
    "azure_endpoint",
    "api_version",
    "__proto__",
    "constructor",
    "prototype",
}


def validate_request_options(values: Dict[str, Any]) -> None:
    for key in values:
        if not re.fullmatch(r"[a-z][a-z0-9_]*", key) or key in RESERVED_REQUEST_FIELDS:
            raise ValueError(f'Request field "{key}" is managed by Community Brief or invalid')
    try:
        encoded = json.dumps(values, allow_nan=False)
    except (ValueError, TypeError) as exc:
        raise ValueError("Model arguments must contain finite JSON values") from exc
    if len(encoded.encode("utf-8")) > 65536:
        raise ValueError("Model arguments must not exceed 64 KB")


class ParameterDependency(BaseModel):
    parameter: str
    value: Any
    message: Optional[str] = None


class CatalogParameter(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    kind: Literal["enum", "number", "integer", "boolean", "string", "object", "array"]
    label: str
    description: str
    default: Any = None
    values: Optional[List[Any]] = None
    min: Optional[float] = None
    max: Optional[float] = None
    depends_on: Optional[ParameterDependency] = None
    conflicts_with: List[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_definition(self) -> "CatalogParameter":
        if self.kind == "enum" and not self.values:
            raise ValueError("Enum parameters require values")
        if self.values and any(
            not isinstance(value, (str, int, float, bool)) for value in self.values
        ):
            raise ValueError("Enum options must be strings, numbers or booleans")
        if self.values:
            json.dumps(self.values, allow_nan=False)
        if self.min is not None and self.max is not None and self.min > self.max:
            raise ValueError("Parameter min cannot exceed max")
        if (
            self.default is not None
            and self.kind == "enum"
            and self.default not in (self.values or [])
        ):
            raise ValueError("Parameter default must be an allowed value")
        if self.default is not None:
            self.validate_value(self.default)
        return self

    def validate_value(self, value: Any) -> None:
        if self.kind == "enum":
            if not any(
                isinstance(value, bool) == isinstance(option, bool) and value == option
                for option in self.values or []
            ):
                raise ValueError("Value must be an allowed option")
        elif self.kind in {"number", "integer"}:
            if (
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(value)
            ):
                raise ValueError("Value must be a finite number")
            if self.kind == "integer" and not isinstance(value, int):
                raise ValueError("Value must be an integer")
            if self.min is not None and value < self.min:
                raise ValueError("Value is below its minimum")
            if self.max is not None and value > self.max:
                raise ValueError("Value exceeds its maximum")
        else:
            expected = {"boolean": bool, "string": str, "object": dict, "array": list}[
                self.kind
            ]
            if not isinstance(value, expected):
                raise ValueError(f"Value must be {self.kind}")


class ModelConnectionRequest(BaseModel):
    """A fixed probe against the application's configured Azure endpoint."""

    model_config = ConfigDict(extra="forbid")

    deployment: str = Field(
        min_length=1, max_length=128, pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_.-]*$"
    )
    provider: Literal["responses", "chat_completions"]


class ModelConnectionResult(BaseModel):
    status: Literal["success", "error"]
    message: str


class CatalogModel(BaseModel):
    key: str = Field(
        min_length=1, max_length=128, pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_.-]*$"
    )
    display_name: str = Field(min_length=1, max_length=128)
    deployment: str = Field(
        min_length=1, max_length=128, pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_.-]*$"
    )
    provider: Literal["responses", "chat_completions"]
    status: Literal["active", "deprecated", "disabled", "retired"] = "active"
    deprecates_at: Optional[AwareDatetime] = None
    retires_at: Optional[AwareDatetime] = None
    replacement_model_key: Optional[str] = None
    parameters: Dict[str, CatalogParameter] = Field(default_factory=dict)
    request_defaults: Dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_model(self) -> "CatalogModel":
        validate_request_options(self.request_defaults)
        validate_request_options(
            {name: definition.default for name, definition in self.parameters.items()}
        )
        for name, value in self.request_defaults.items():
            if name in self.parameters:
                self.parameters[name].validate_value(value)
        if (
            self.deprecates_at
            and self.retires_at
            and self.deprecates_at > self.retires_at
        ):
            raise ValueError("deprecates_at cannot be after retires_at")
        for name, definition in self.parameters.items():
            if (
                definition.depends_on
                and definition.depends_on.parameter not in self.parameters
            ):
                raise ValueError(f"{name} depends on an unknown parameter")
            if set(definition.conflicts_with) - set(self.parameters):
                raise ValueError(f"{name} conflicts with an unknown parameter")
        self.validate_parameters({})
        return self

    def validate_parameters(self, overrides: Dict[str, Any]) -> None:
        unsupported = set(overrides) - set(self.parameters)
        if unsupported:
            raise ValueError(
                f"Unsupported parameters: {', '.join(sorted(unsupported))}"
            )
        values = deepcopy(self.request_defaults)
        if self.provider == "responses":
            for alias, field, member in (
                ("reasoning_effort", "reasoning", "effort"),
                ("verbosity", "text", "verbosity"),
            ):
                if (
                    isinstance(overrides.get(field), dict)
                    and member in overrides[field]
                ):
                    values.pop(alias, None)
        values.update(overrides)
        validate_request_options(values)
        for name, definition in self.parameters.items():
            if name not in values:
                continue
            try:
                definition.validate_value(values[name])
            except ValueError as exc:
                raise ValueError(f'Parameter "{name}": {exc}') from exc
            dependency = definition.depends_on
            if dependency:
                effective = values.get(
                    dependency.parameter, self.parameters[dependency.parameter].default
                )
                for alias, field, member in (
                    ("reasoning_effort", "reasoning", "effort"),
                    ("verbosity", "text", "verbosity"),
                ):
                    if (
                        dependency.parameter == alias
                        and alias not in values
                        and isinstance(values.get(field), dict)
                    ):
                        effective = values[field].get(member, effective)
                if effective != dependency.value:
                    raise ValueError(
                        dependency.message
                        or f'Parameter "{name}" requires "{dependency.parameter}" to be "{dependency.value}"'
                    )
            for conflict in definition.conflicts_with:
                if conflict in values:
                    raise ValueError(
                        f'Parameters "{name}" and "{conflict}" cannot be used together'
                    )

    def effective_status(self, now: Optional[datetime] = None) -> str:
        now = now or datetime.now(UTC)
        if self.status in {"disabled", "retired"}:
            return self.status
        if self.retires_at and now >= self.retires_at:
            return "retired"
        if self.status == "deprecated" or (
            self.deprecates_at and now >= self.deprecates_at
        ):
            return "deprecated"
        return "active"


class InferenceCatalog(BaseModel):
    id: Literal[CATALOG_ID] = CATALOG_ID
    type: Literal[CATALOG_ID] = CATALOG_ID
    version: int = Field(ge=1)
    default_model: str
    models: List[CatalogModel]

    @model_validator(mode="after")
    def validate_catalog(self) -> "InferenceCatalog":
        keys = [model.key for model in self.models]
        if len(keys) != len(set(keys)):
            raise ValueError("Model keys must be unique")
        by_key = {model.key: model for model in self.models}
        default = by_key.get(self.default_model)
        if not default:
            raise ValueError("default_model must reference a model")
        for model in self.models:
            replacement = model.replacement_model_key
            if replacement and replacement not in by_key:
                raise ValueError(f"{model.key} references an unknown replacement")
            if replacement == model.key:
                raise ValueError(f"{model.key} cannot replace itself")
        return self

    def model(self, key: str) -> Optional[CatalogModel]:
        return next((model for model in self.models if model.key == key), None)

    def public_dict(self, now: Optional[datetime] = None) -> Dict[str, Any]:
        now = now or datetime.now(UTC)
        data = self.model_dump(mode="json")
        warnings = []
        for item, model in zip(data["models"], self.models):
            status = model.effective_status(now)
            item["effective_status"] = status
            lifecycle_dates = [
                value for value in (model.deprecates_at, model.retires_at) if value
            ]
            lifecycle_date = min(lifecycle_dates) if lifecycle_dates else None
            if status != "active" or (
                lifecycle_date and 0 <= (lifecycle_date - now).days <= 90
            ):
                warnings.append(
                    {
                        "model_key": model.key,
                        "display_name": model.display_name,
                        "effective_status": status,
                        "deprecates_at": model.deprecates_at.isoformat()
                        if model.deprecates_at
                        else None,
                        "retires_at": model.retires_at.isoformat()
                        if model.retires_at
                        else None,
                        "replacement_model_key": model.replacement_model_key,
                    }
                )
        data["lifecycle_warnings"] = sorted(
            warnings,
            key=lambda warning: warning["deprecates_at"]
            or warning["retires_at"]
            or "9999",
        )
        return data


def _parameter(name: str, definition: Dict[str, Any]) -> CatalogParameter:
    parameter_type = definition.get("type")
    values = definition.get("allowed_values")
    label = {
        "reasoning_effort": "Thinking Depth",
        "verbosity": "Response Detail",
        "temperature": "Creativity Level",
        "top_p": "Nucleus Sampling",
        "max_output_tokens": "Maximum Output Tokens",
        "max_tokens": "Maximum Output Tokens",
    }.get(name, name.replace("_", " ").title())
    conflicts = []
    if name == "temperature":
        conflicts = ["top_p"]
    elif name == "top_p":
        conflicts = ["temperature"]
    return CatalogParameter(
        kind="enum"
        if values
        else "integer"
        if parameter_type == "integer"
        else "number",
        label=label,
        description=definition.get("description", label),
        default=definition.get("default"),
        values=values,
        min=definition.get("min"),
        max=definition.get("max"),
        depends_on=definition.get("depends_on"),
        conflicts_with=conflicts,
    )


def initial_inference_catalog() -> InferenceCatalog:
    metadata = {
        "gpt-5.6-luna": {"display_name": "GPT-5.6 Luna"},
        "gpt-5.6-sol": {"display_name": "GPT-5.6 Sol"},
        "gpt-5-mini": {"display_name": "GPT-5 mini"},
        "gpt-5-nano": {"display_name": "GPT-5 nano"},
        "gpt-4o-mini": {"display_name": "GPT-4o mini"},
        "gpt-4o": {
            "display_name": "GPT-4o",
            "status": "deprecated",
            "retires_at": datetime(2026, 10, 1, tzinfo=UTC),
            "replacement_model_key": DEFAULT_ANALYSIS_MODEL,
        },
        "gpt-4.1": {
            "display_name": "GPT-4.1",
            "status": "deprecated",
            "retires_at": datetime(2026, 10, 14, tzinfo=UTC),
            "replacement_model_key": DEFAULT_ANALYSIS_MODEL,
        },
    }
    models = []
    for key, providers in MODELS.items():
        provider = providers[0]
        model_metadata = metadata.get(key, {}).copy()
        parameters = {
            name: _parameter(name, definition)
            for name, definition in get_provider_parameters(provider, key).items()
        }
        models.append(
            CatalogModel(
                key=key,
                display_name=model_metadata.pop("display_name", key),
                deployment=key,
                provider=provider,
                parameters=parameters,
                **model_metadata,
            )
        )
    return InferenceCatalog(
        version=1, default_model=DEFAULT_ANALYSIS_MODEL, models=models
    )


INITIAL_INFERENCE_CATALOG = initial_inference_catalog()
