"""Strict validation at the catalog write boundary; legacy read conversion stays tolerant."""

from datetime import date
from math import isfinite
from typing import Any

FIELD_TYPES = {"text", "textarea", "markdown", "date", "checkbox", "number", "select"}


def validate_form_definition(sections: list[dict[str, Any]]) -> None:
    names: set[str] = set()
    for section_index, section in enumerate(sections):
        location = f"Section {section_index + 1}"
        if not isinstance(section, dict) or not isinstance(section.get("fields"), list):
            raise ValueError(f"{location}: fields must be a list")
        if not section["fields"]:
            raise ValueError(f"{location}: add a field or remove the empty section")
        for field_index, field in enumerate(section["fields"]):
            location = f"Section {section_index + 1}, field {field_index + 1}"
            if not isinstance(field, dict):
                raise ValueError(f"{location}: field must be an object")
            label = field.get("label")
            if label is None:
                label = field.get("title", field.get("name", ""))
            if not isinstance(label, str) or not label.strip():
                raise ValueError(f"{location}: enter a label or title")
            name = field.get("name", "")
            if not isinstance(name, str):
                raise ValueError(f"{location}: name must be text")
            name = name.strip() or label.strip()[:64]
            if name in names:
                raise ValueError(f"{location}: field names must be unique across sections")
            names.add(name)
            kind = field.get("type", "text")
            if not isinstance(kind, str) or kind not in FIELD_TYPES:
                raise ValueError(f"{location}: unsupported field type")
            if "required" in field and not isinstance(field["required"], bool):
                raise ValueError(f"{location}: required must be true or false")
            options = field.get("options") or []
            if kind == "select":
                if isinstance(options, str):
                    options = [option.strip() for option in options.split(",") if option.strip()]
                elif isinstance(options, list) and all(isinstance(option, str) for option in options):
                    options = [option.strip() for option in options]
                else:
                    raise ValueError(f"{location}: choices must be text")
                if not options or any(not option for option in options) or len(set(options)) != len(options):
                    raise ValueError(f"{location}: add non-empty, distinct choices")
            value = field.get("value")
            if value is None or value == "":
                continue
            if kind == "number":
                try:
                    valid = not isinstance(value, bool) and isfinite(float(value))
                except (TypeError, ValueError, OverflowError):
                    valid = False
                if not valid:
                    raise ValueError(f"{location}: default must be a valid number")
            elif kind == "date":
                try:
                    valid = isinstance(value, str) and date.fromisoformat(value).isoformat() == value
                except ValueError:
                    valid = False
                if not valid:
                    raise ValueError(f"{location}: default must be a valid date")
            elif kind == "checkbox" and not isinstance(value, bool):
                raise ValueError(f"{location}: default must be checked or unchecked")
            elif kind == "select" and value not in options:
                raise ValueError(f"{location}: default must be one of the available choices")
