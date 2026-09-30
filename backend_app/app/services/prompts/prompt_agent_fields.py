from __future__ import annotations

import re
from typing import Any

from ...core.errors.domain import ValidationError


def pre_session_field(
    *,
    label: str,
    field_type: str,
    reason: str,
    placeholder: str,
    required: bool,
    options: str,
    talking_points_service: Any,
) -> dict[str, Any]:
    label = label.strip()
    reason = reason.strip()
    field_type = field_type.strip().lower()
    if not label:
        raise ValidationError("Pre-session field label is required")
    if not reason:
        raise ValidationError("Pre-session field reason is required")
    if not talking_points_service.validate_field_type(field_type):
        raise ValidationError("Invalid pre-session field type")
    if field_type == "select" and not options.strip():
        raise ValidationError("Select pre-session fields require options")
    return {
        "name": field_name_from_label(label),
        "label": label,
        "type": field_type,
        "value": "",
        "placeholder": placeholder.strip(),
        "description": reason_description(reason),
        "required": required,
        "options": options.strip(),
    }


def in_session_field(title: str, instructions: str, reason: str, field_type: str) -> dict[str, Any]:
    title = title.strip()
    instructions = instructions.strip()
    reason = reason.strip()
    field_type = field_type.strip().lower()
    if not title:
        raise ValidationError("Talking point title is required")
    if not instructions:
        raise ValidationError("Talking point instructions are required")
    if not reason:
        raise ValidationError("Talking point reason is required")
    if field_type not in {"markdown", "text", "date", "checkbox"}:
        raise ValidationError("Invalid in-session talking point type")
    return {
        "name": title,
        "label": title,
        "type": field_type,
        "value": instructions,
        "description": reason_description(reason),
        "placeholder": "",
        "required": False,
        "options": "",
    }


def field_name_from_label(label: str) -> str:
    name = re.sub(r"[^a-z0-9]+", "_", label.strip().lower())
    return re.sub(r"_+", "_", name).strip("_") or "field"


def reason_description(reason: str) -> str:
    return reason if reason.lower().startswith("reason:") else f"Reason: {reason}"

