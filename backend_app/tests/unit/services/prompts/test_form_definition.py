import pytest

from app.services.prompts.form_definition import validate_form_definition
from app.services.prompts.talking_points_service import TalkingPointsService


def sections(**changes):
    return [{"fields": [{"name": "existing_key", "label": "Question", "type": "text", **changes}]}]


@pytest.mark.parametrize("changes", [
    {"label": " "}, {"type": "unknown"}, {"required": "false"},
    {"type": "number", "value": "invalid"}, {"type": "number", "value": float("inf")},
    {"type": "number", "value": True}, {"type": "date", "value": "2026-02-30"},
    {"type": "checkbox", "value": "false"}, {"type": "select", "options": []},
    {"type": "select", "options": ["A", " A "]},
    {"type": "select", "options": ["A", ""]},
    {"type": "select", "options": ["A"], "value": "B"},
])
def test_rejects_invalid_definitions_with_field_location(changes):
    with pytest.raises(ValueError, match="Section 1, field 1"):
        validate_form_definition(sections(**changes))


def test_rejects_duplicate_keys_across_sections():
    with pytest.raises(ValueError, match="unique"):
        validate_form_definition(sections() + sections())


def test_rejects_empty_section_but_allows_no_form():
    validate_form_definition([])
    with pytest.raises(ValueError, match="empty section"):
        validate_form_definition([{"fields": []}])


@pytest.mark.parametrize("field", [
    {"name": "legacy title", "type": "markdown", "value": "Guidance"},
    {"title": "Imported title", "type": "text"},
    {"name": "old_key", "label": "Renamed", "type": "textarea"},
    {"name": "choice", "type": "select", "options": "A, B", "value": "A"},
    {"name": "choice", "type": "select", "options": ["A, with comma", "B"], "value": "A, with comma"},
    {"name": "count", "type": "number", "value": 0},
    {"name": "count", "type": "number", "value": "1e3"},
    {"name": "count", "type": "number", "value": ""},
    {"name": "confirmed", "type": "checkbox", "value": False},
])
def test_legacy_and_new_fields_round_trip(field):
    payload = [{"fields": [field]}]
    validate_form_definition(payload)
    service = TalkingPointsService()
    saved = service.validate_talking_points_structure(payload)
    restored = service.convert_talking_points_to_response(saved)
    validate_form_definition(restored)
    if field.get("name"):
        assert restored[0]["fields"][0]["name"] == field["name"]
    if field.get("type") == "select":
        assert restored[0]["fields"][0]["options"] == field["options"]
    if field.get("value") is False:
        assert restored[0]["fields"][0]["value"] is False
    if field.get("value") == "1e3":
        assert restored[0]["fields"][0]["value"] == 1000
