"""Resolve catalogue arguments into a provider request without model-name rules."""

from copy import deepcopy
import json
import math
import re
from typing import Any


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


def validate_options(options: dict[str, Any]) -> None:
    for name in options:
        if (
            not re.fullmatch(r"[a-z][a-z0-9_]*", name)
            or name in RESERVED_REQUEST_FIELDS
        ):
            raise ValueError(f'Request field "{name}" is managed by Community Brief or invalid')
    if len(json.dumps(options, allow_nan=False).encode("utf-8")) > 65536:
        raise ValueError("Model arguments must not exceed 64 KB")


def merge_options(defaults: dict, overrides: dict) -> dict:
    result = deepcopy(defaults)
    for name, value in overrides.items():
        if isinstance(value, dict) and isinstance(result.get(name), dict):
            result[name] = merge_options(result[name], value)
        else:
            result[name] = deepcopy(value)
    return result


def resolve_model_options(model: dict, overrides: dict) -> dict:
    definitions = model.get("parameters") or {}
    unknown = set(overrides) - set(definitions)
    if unknown:
        raise ValueError(
            f"Unsupported provider parameters: {', '.join(sorted(unknown))}"
        )
    defaults = deepcopy(model.get("request_defaults") or {})
    if model.get("provider", "responses") == "responses":
        for alias, field, member in (
            ("reasoning_effort", "reasoning", "effort"),
            ("verbosity", "text", "verbosity"),
        ):
            if isinstance(overrides.get(field), dict) and member in overrides[field]:
                defaults.pop(alias, None)
    values = merge_options(defaults, overrides)
    validate_options(values)
    for name, value in values.items():
        definition = definitions.get(name, {})
        kind = definition.get("kind")
        if kind == "enum" and not any(
            isinstance(value, bool) == isinstance(option, bool) and value == option
            for option in definition.get("values", [])
        ):
            raise ValueError(f'Invalid value for "{name}"')
        if kind in {"number", "integer"}:
            if (
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(value)
            ):
                raise ValueError(f'Parameter "{name}" must be a finite number')
            if kind == "integer" and not isinstance(value, int):
                raise ValueError(f'Parameter "{name}" must be an integer')
            if definition.get("min") is not None and value < definition["min"]:
                raise ValueError(f'Parameter "{name}" is below its minimum')
            if definition.get("max") is not None and value > definition["max"]:
                raise ValueError(f'Parameter "{name}" exceeds its maximum')
        expected = {"boolean": bool, "string": str, "object": dict, "array": list}.get(
            kind
        )
        if expected and not isinstance(value, expected):
            raise ValueError(f'Parameter "{name}" must be {kind}')
        dependency = definition.get("depends_on")
        if dependency:
            effective = values.get(
                dependency["parameter"],
                definitions[dependency["parameter"]].get("default"),
            )
            for alias, field, member in (
                ("reasoning_effort", "reasoning", "effort"),
                ("verbosity", "text", "verbosity"),
            ):
                if (
                    dependency["parameter"] == alias
                    and alias not in values
                    and isinstance(values.get(field), dict)
                ):
                    effective = values[field].get(member, effective)
            if effective != dependency["value"]:
                raise ValueError(
                    dependency.get("message") or f'Invalid dependency for "{name}"'
                )
        for conflict in definition.get("conflicts_with", []):
            if conflict in values:
                raise ValueError(
                    f'Parameters "{name}" and "{conflict}" cannot be used together'
                )
    return values


def provider_request_options(parameters: dict, provider: str) -> dict:
    """Keep legacy aliases; send new API fields as JSON through the SDK."""
    validate_options(parameters)
    body = deepcopy(parameters)
    if provider == "responses":
        for alias, field, member in (
            ("reasoning_effort", "reasoning", "effort"),
            ("verbosity", "text", "verbosity"),
        ):
            if alias in body:
                value = body.pop(alias)
                if field in body and not isinstance(body[field], dict):
                    raise ValueError(f'Parameter "{field}" must be an object')
                body.setdefault(field, {})[member] = value
        known = {"reasoning", "text", "max_output_tokens", "temperature", "top_p"}
    else:
        known = {"temperature", "max_tokens", "top_p"}
    result = {name: value for name, value in body.items() if name in known}
    extra = {name: value for name, value in body.items() if name not in known}
    if extra:
        result["extra_body"] = extra
    return result
