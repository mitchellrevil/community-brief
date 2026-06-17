"""
Unit tests for TalkingPointsService (talking_points_service.py)

Tests for talking points validation and conversion including:
- Field type validation
- Field value conversion
- Structure validation
- Legacy format migration
"""

import pytest
from typing import Dict, Any, List


# Mark all tests as unit tests
pytestmark = pytest.mark.unit


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def talking_points_service():
    """Create a TalkingPointsService instance."""
    from app.services.prompts.talking_points_service import TalkingPointsService
    return TalkingPointsService()


# ============================================================================
# TEST: validate_field_type
# ============================================================================

class TestValidateFieldType:
    """Tests for field type validation."""
    
    def test_accepts_valid_field_types(self, talking_points_service):
        """Given valid field type, when validating, then returns True."""
        valid_types = ["text", "date", "markdown", "checkbox", "number", "select"]
        
        for field_type in valid_types:
            assert talking_points_service.validate_field_type(field_type) is True
    
    def test_rejects_invalid_field_types(self, talking_points_service):
        """Given invalid field type, when validating, then returns False."""
        invalid_types = ["invalid", "string", "boolean", "integer", "dropdown"]
        
        for field_type in invalid_types:
            assert talking_points_service.validate_field_type(field_type) is False


# ============================================================================
# TEST: validate_field_value
# ============================================================================

class TestValidateFieldValue:
    """Tests for field value validation and conversion."""
    
    def test_handles_none_value(self, talking_points_service):
        """Given None value, when validating, then returns None."""
        result = talking_points_service.validate_field_value("text", None)
        assert result is None
    
    def test_converts_checkbox_boolean(self, talking_points_service):
        """Given boolean, when validating checkbox, then returns boolean."""
        assert talking_points_service.validate_field_value("checkbox", True) is True
        assert talking_points_service.validate_field_value("checkbox", False) is False
    
    def test_converts_checkbox_string(self, talking_points_service):
        """Given string, when validating checkbox, then converts to boolean."""
        assert talking_points_service.validate_field_value("checkbox", "true") is True
        assert talking_points_service.validate_field_value("checkbox", "false") is False
        assert talking_points_service.validate_field_value("checkbox", "yes") is True
        assert talking_points_service.validate_field_value("checkbox", "1") is True
    
    def test_converts_number_integer(self, talking_points_service):
        """Given integer string, when validating number, then returns int."""
        assert talking_points_service.validate_field_value("number", "42") == 42
        assert talking_points_service.validate_field_value("number", 42) == 42
    
    def test_converts_number_float(self, talking_points_service):
        """Given float string, when validating number, then returns float."""
        assert talking_points_service.validate_field_value("number", "3.14") == 3.14
        assert talking_points_service.validate_field_value("number", 3.14) == 3.14
    
    def test_handles_invalid_number(self, talking_points_service):
        """Given invalid number, when validating, then returns 0."""
        assert talking_points_service.validate_field_value("number", "not a number") == 0
    
    def test_strips_text_value(self, talking_points_service):
        """Given text with whitespace, when validating, then strips it."""
        result = talking_points_service.validate_field_value("text", "  hello  ")
        assert result == "hello"
    
    def test_strips_markdown_value(self, talking_points_service):
        """Given markdown with whitespace, when validating, then strips it."""
        result = talking_points_service.validate_field_value("markdown", "  # Header  ")
        assert result == "# Header"
    
    def test_converts_select_to_string(self, talking_points_service):
        """Given select value, when validating, then converts to string."""
        result = talking_points_service.validate_field_value("select", "option1")
        assert result == "option1"
    
    def test_strips_date_value(self, talking_points_service):
        """Given date string, when validating, then strips whitespace."""
        result = talking_points_service.validate_field_value("date", " 2024-01-15 ")
        assert result == "2024-01-15"


# ============================================================================
# TEST: validate_talking_points_structure
# ============================================================================

class TestValidateTalkingPointsStructure:
    """Tests for talking points structure validation."""
    
    def test_validates_valid_structure(self, talking_points_service):
        """Given valid structure, when validating, then succeeds."""
        talking_points = [
            {
                "fields": [
                    {"name": "summary", "type": "text", "value": "Test"}
                ]
            }
        ]
        
        result = talking_points_service.validate_talking_points_structure(talking_points)
        
        assert len(result) == 1
        assert len(result[0]["fields"]) == 1
        assert result[0]["fields"][0]["name"] == "summary"
    
    def test_raises_error_for_non_dict_section(self, talking_points_service):
        """Given non-dict section, when validating, then raises ValueError."""
        talking_points = ["not a dict"]
        
        with pytest.raises(ValueError, match="must be a dictionary"):
            talking_points_service.validate_talking_points_structure(talking_points)
    
    def test_raises_error_for_non_list_fields(self, talking_points_service):
        """Given non-list fields, when validating, then raises ValueError."""
        talking_points = [{"fields": "not a list"}]
        
        with pytest.raises(ValueError, match="fields must be a list"):
            talking_points_service.validate_talking_points_structure(talking_points)
    
    def test_raises_error_for_invalid_field_type(self, talking_points_service):
        """Given invalid field type, when validating, then raises ValueError."""
        talking_points = [
            {
                "fields": [
                    {"name": "test", "type": "invalid_type", "value": "x"}
                ]
            }
        ]
        
        with pytest.raises(ValueError, match="Invalid field type"):
            talking_points_service.validate_talking_points_structure(talking_points)
    
    def test_skips_empty_field_names(self, talking_points_service):
        """Given field with empty name, when validating, then skips it."""
        talking_points = [
            {
                "fields": [
                    {"name": "", "type": "text", "value": "Test"}
                ]
            }
        ]
        
        result = talking_points_service.validate_talking_points_structure(talking_points)
        
        # Empty section should be excluded
        assert len(result) == 0
    
    def test_adds_default_field_properties(self, talking_points_service):
        """Given minimal field, when validating, then adds defaults."""
        talking_points = [
            {
                "fields": [
                    {"name": "test", "type": "text", "value": "Value"}
                ]
            }
        ]
        
        result = talking_points_service.validate_talking_points_structure(talking_points)
        
        field = result[0]["fields"][0]
        assert "label" in field
        assert "placeholder" in field
        assert "description" in field
        assert "required" in field
        assert "options" in field


# ============================================================================
# TEST: convert_talking_points_to_response
# ============================================================================

class TestConvertTalkingPointsToResponse:
    """Tests for converting database format to response format."""
    
    def test_converts_valid_structure(self, talking_points_service):
        """Given valid database format, when converting, then returns response format."""
        db_format = [
            {
                "fields": [
                    {"name": "field1", "type": "text", "value": "Test"}
                ]
            }
        ]
        
        result = talking_points_service.convert_talking_points_to_response(db_format)
        
        assert len(result) == 1
        assert result[0]["fields"][0]["name"] == "field1"
    
    def test_skips_non_dict_sections(self, talking_points_service):
        """Given non-dict section, when converting, then skips it."""
        db_format = ["not a dict", {"fields": [{"name": "test", "type": "text"}]}]
        
        result = talking_points_service.convert_talking_points_to_response(db_format)
        
        assert len(result) == 1
    
    def test_converts_checkbox_to_boolean(self, talking_points_service):
        """Given checkbox field, when converting, then value is boolean."""
        db_format = [
            {
                "fields": [
                    {"name": "agreed", "type": "checkbox", "value": 1}
                ]
            }
        ]
        
        result = talking_points_service.convert_talking_points_to_response(db_format)
        
        assert result[0]["fields"][0]["value"] is True
    
    def test_handles_empty_input(self, talking_points_service):
        """Given empty list, when converting, then returns empty list."""
        result = talking_points_service.convert_talking_points_to_response([])
        assert result == []


# ============================================================================
# TEST: normalize_talking_points_sections
# ============================================================================

class TestNormalizeTalkingPointsSections:
    """Tests for normalizing talking points into structured sections."""
    
    def test_migrates_string_points(self, talking_points_service):
        """Given list of strings, when normalizing, then creates structured format."""
        points = ["Point 1", "Point 2"]
        
        result = talking_points_service.normalize_talking_points_sections(points)
        
        assert len(result) == 2
        assert result[0]["fields"][0]["value"] == "Point 1"
        assert result[0]["fields"][0]["type"] == "text"
    
    def test_preserves_already_migrated_format(self, talking_points_service):
        """Given already structured format, when normalizing, then preserves it."""
        structured_points = [
            {
                "fields": [
                    {"name": "existing", "type": "text", "value": "Test"}
                ]
            }
        ]
        
        result = talking_points_service.normalize_talking_points_sections(structured_points)
        
        assert len(result) == 1
        assert result[0]["fields"][0]["name"] == "existing"
    
    def test_handles_mixed_format(self, talking_points_service):
        """Given mixed format, when normalizing, then handles both."""
        mixed = [
            "Simple string",
            {"fields": [{"name": "structured", "type": "text", "value": "Test"}]}
        ]
        
        result = talking_points_service.normalize_talking_points_sections(mixed)
        
        assert len(result) == 2
    
    def test_skips_empty_strings(self, talking_points_service):
        """Given empty string, when normalizing, then skips it."""
        points = ["", "  ", "Valid"]
        
        result = talking_points_service.normalize_talking_points_sections(points)
        
        # Only "Valid" should be migrated
        assert len(result) == 1
        assert result[0]["fields"][0]["value"] == "Valid"


# ============================================================================
# TEST: ensure_talking_points_structure
# ============================================================================

class TestEnsureTalkingPointsStructure:
    """Tests for ensuring subcategory talking points are properly formatted."""
    
    def test_normalizes_string_pre_session(self, talking_points_service):
        """Given string pre-session points, when ensuring, then normalizes them."""
        subcategory = {
            "preSessionTalkingPoints": ["Point 1", "Point 2"],
            "inSessionTalkingPoints": []
        }
        
        result = talking_points_service.ensure_talking_points_structure(subcategory)
        
        assert len(result["preSessionTalkingPoints"]) == 2
        assert "fields" in result["preSessionTalkingPoints"][0]
    
    def test_normalizes_string_in_session(self, talking_points_service):
        """Given string in-session points, when ensuring, then normalizes them."""
        subcategory = {
            "preSessionTalkingPoints": [],
            "inSessionTalkingPoints": ["In session point"]
        }
        
        result = talking_points_service.ensure_talking_points_structure(subcategory)
        
        assert len(result["inSessionTalkingPoints"]) == 1
        assert "fields" in result["inSessionTalkingPoints"][0]
    
    def test_preserves_already_structured(self, talking_points_service):
        """Given structured points, when ensuring, then preserves format."""
        subcategory = {
            "preSessionTalkingPoints": [
                {"fields": [{"name": "test", "type": "text", "value": "Test"}]}
            ],
            "inSessionTalkingPoints": []
        }
        
        result = talking_points_service.ensure_talking_points_structure(subcategory)
        
        assert result["preSessionTalkingPoints"][0]["fields"][0]["name"] == "test"
    
    def test_handles_empty_talking_points(self, talking_points_service):
        """Given empty talking points, when ensuring, then returns empty lists."""
        subcategory = {
            "preSessionTalkingPoints": [],
            "inSessionTalkingPoints": []
        }
        
        result = talking_points_service.ensure_talking_points_structure(subcategory)
        
        assert result["preSessionTalkingPoints"] == []
        assert result["inSessionTalkingPoints"] == []


# ============================================================================
# TEST: get_field_type_info
# ============================================================================

class TestGetFieldTypeInfo:
    """Tests for field type information retrieval."""
    
    def test_returns_all_field_types(self, talking_points_service):
        """Given call, when getting field type info, then returns all types."""
        result = talking_points_service.get_field_type_info()
        
        expected_types = ["text", "date", "markdown", "checkbox", "number", "select"]
        for field_type in expected_types:
            assert field_type in result
    
    def test_includes_required_properties(self, talking_points_service):
        """Given call, when getting field type info, then includes properties."""
        result = talking_points_service.get_field_type_info()
        
        for field_type, info in result.items():
            assert "description" in info
            assert "value_type" in info
            assert "validation" in info


# ============================================================================
# TEST: Pydantic Model Validation
# ============================================================================

class TestPydanticModelValidation:
    """Tests for Pydantic model validation."""
    
    def test_validates_valid_sections(self, talking_points_service):
        """Given valid data, when validating with Pydantic, then succeeds."""
        talking_points = [
            {
                "fields": [
                    {"name": "test", "type": "text", "value": "Test value"}
                ]
            }
        ]
        
        result = talking_points_service.validate_pydantic_models(talking_points)
        
        assert len(result) == 1
        assert len(result[0].fields) == 1
    
    def test_raises_on_invalid_data(self, talking_points_service):
        """Given invalid data, when validating with Pydantic, then raises."""
        from pydantic import ValidationError
        
        # Field name is required and must be non-empty
        talking_points = [
            {
                "fields": [
                    {"name": "", "type": "text"}  # Empty name should fail
                ]
            }
        ]
        
        with pytest.raises(ValidationError):
            talking_points_service.validate_pydantic_models(talking_points)
