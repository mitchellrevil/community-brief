"""
Talking Points Service

Handles validation, conversion, and normalization of talking points data
for the prompt management system.
"""

from typing import Dict, Any, List, Union, Optional
from pydantic import BaseModel, Field, ValidationError

from ...core.logging import get_logger
from ..interfaces import TalkingPointsServiceInterface


class TalkingPointField(BaseModel):
    name: str = Field(..., description="Field name/identifier", min_length=1)
    type: str = Field(..., description="Field type: text, date, markdown, checkbox, number, select")
    value: Union[str, bool, float, None] = Field(None, description="Field value")
    label: Optional[str] = Field(None, description="Display label for the field")
    placeholder: Optional[str] = Field(None, description="Placeholder text for input fields")
    description: Optional[str] = Field(None, description="Help text describing the field")
    required: Optional[bool] = Field(False, description="Whether the field is required")
    options: Optional[str] = Field(None, description="Comma-separated options for select fields")

    class Config:
        extra = "ignore"


class TalkingPointSection(BaseModel):
    fields: List[TalkingPointField] = Field(
        default_factory=list, 
        description="List of fields in this section"
    )

    class Config:
        extra = "ignore"



class TalkingPointsService(TalkingPointsServiceInterface):
    VALID_FIELD_TYPES = {"text", "date", "markdown", "checkbox", "number", "select"}

    TALKING_POINTS_ERRORS = (RuntimeError, ValueError, TypeError, KeyError)
    
    def __init__(self):
        self.logger = get_logger(__name__)

    @staticmethod
    def _looks_canonical_sections(value: Any) -> bool:
        if not isinstance(value, list) or not value:
            return False

        for section in value:
            if not isinstance(section, dict):
                return False
            fields = section.get("fields")
            if not isinstance(fields, list):
                return False
            if fields and not all(isinstance(field, dict) for field in fields):
                return False

        return True
    
    def validate_field_type(self, field_type: str) -> bool:
        return field_type in self.VALID_FIELD_TYPES
    
    def validate_field_value(self, field_type: str, value: Any) -> Any:
        if value is None:
            return None
            
        try:
            if field_type == "checkbox":
                if isinstance(value, bool):
                    return value
                elif isinstance(value, str):
                    return value.lower() in ("true", "1", "yes", "on")
                else:
                    return bool(value)
                    
            elif field_type == "date":
                if isinstance(value, str):
                    return value.strip()
                return str(value)
                
            elif field_type == "number":
                try:
                    if isinstance(value, (int, float)):
                        return value
                    elif isinstance(value, str) and value.strip():
                        if '.' in value:
                            return float(value)
                        else:
                            return int(value)
                    else:
                        return 0
                except (ValueError, TypeError):
                    self.logger.warning(
                        "talking_points.invalid_number_value",
                        value=value,
                    )
                    return 0
                    
            elif field_type == "select":
                return str(value).strip() if value else ""
                
            elif field_type in ("text", "markdown"):
                return str(value).strip() if value else ""
                
            else:
                # Fallback to string conversion
                return str(value)
                
        except (TypeError, ValueError) as e:
            self.logger.warning(
                "talking_points.field_value_validation_failed",
                field_type=field_type,
                error=str(e),
                error_type=type(e).__name__,
            )
            return str(value) if value is not None else ""
    
    def validate_talking_points_structure(
        self, 
        talking_points: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Validate and convert talking points to database format
        
        Args:
            talking_points: List of talking point sections from frontend
            
        Returns:
            List of validated talking point sections
            
        Raises:
            ValueError: If validation fails
        """
        validated_points = []
        
        try:
            for section_idx, section in enumerate(talking_points):
                if not isinstance(section, dict):
                    raise ValueError(f"Section {section_idx} must be a dictionary")
                
                fields = section.get("fields", [])
                if not isinstance(fields, list):
                    raise ValueError(f"Section {section_idx} fields must be a list")
                
                validated_fields = []
                
                for field_idx, field in enumerate(fields):
                    if not isinstance(field, dict):
                        raise ValueError(
                            f"Section {section_idx}, field {field_idx} must be a dictionary"
                        )
                    
                    # Extract field data
                    field_name = field.get("name", "").strip()
                    field_type = field.get("type", "text").strip().lower()
                    field_value = field.get("value")
                    # Preserve imported records that used `title` as a field key.
                    # Prefer explicit `label`/`value` when provided.
                    field_label = field.get("label") or field.get("title", "")
                    field_placeholder = field.get("placeholder", "")
                    field_description = field.get("description", "")
                    field_required = field.get("required", False)
                    field_options = field.get("options", "")
                    
                    # Validate field name; if missing, derive a stable fallback
                    # from the title/label.
                    if not field_name:
                        # Don't use the field value as a fallback for the name; prefer explicit label/title
                        fallback_name = (field_label or field.get("title", ""))
                        if fallback_name:
                            field_name = fallback_name.strip()[:64]
                        else:
                            self.logger.warning(
                                "talking_points.empty_field_name",
                                section_index=section_idx,
                                field_index=field_idx,
                            )
                            continue  # Skip empty field names
                    
                    # Validate field type
                    if not self.validate_field_type(field_type):
                        raise ValueError(
                            f"Invalid field type '{field_type}' in section {section_idx}, "
                            f"field {field_idx}. Must be one of: {', '.join(self.VALID_FIELD_TYPES)}"
                        )
                    
                    # If an imported `title` payload has no explicit `value`, use
                    # the title as the field value fallback.
                    if field_value is None and "title" in field:
                        field_value = field.get("title")

                    # Validate and convert field value
                    validated_value = self.validate_field_value(field_type, field_value)
                    
                    validated_fields.append({
                        "name": field_name,
                        "type": field_type,
                        "value": validated_value,
                        "label": field_label,
                        "placeholder": field_placeholder,
                        "description": field_description,
                        "required": bool(field_required),
                        "options": field_options
                    })
                
                # Only add sections with valid fields
                if validated_fields:
                    validated_points.append({
                        "fields": validated_fields
                    })
        
        except self.TALKING_POINTS_ERRORS as e:
            self.logger.error(
                "talking_points.structure_validation_failed",
                error=str(e),
                error_type=type(e).__name__,
            )
            raise ValueError(f"Invalid talking points structure: {e}")
        
        return validated_points
    
    def convert_talking_points_to_response(
        self, 
        talking_points_data: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Convert database talking points to response format
        
        Args:
            talking_points_data: Talking points from database
            
        Returns:
            Formatted talking points for frontend
        """
        try:
            sections = []
            
            for section_data in talking_points_data:
                if not isinstance(section_data, dict):
                    continue
                
                fields = []
                for field_data in section_data.get("fields", []):
                    if not isinstance(field_data, dict):
                        continue
                    
                    field = {
                        "name": field_data.get("name", ""),
                        "type": field_data.get("type", "text"),
                        "value": field_data.get("value"),
                        "label": field_data.get("label", ""),
                        "placeholder": field_data.get("placeholder", ""),
                        "description": field_data.get("description", ""),
                        "required": field_data.get("required", False),
                        "options": field_data.get("options", "")
                    }
                    
                    # Ensure value is properly typed
                    if field["type"] == "checkbox" and field["value"] is not None:
                        field["value"] = bool(field["value"])
                    
                    fields.append(field)
                
                if fields:  # Only add sections with fields
                    sections.append({"fields": fields})
            
            return sections
            
        except self.TALKING_POINTS_ERRORS as e:
            self.logger.error(
                "talking_points.response_conversion_failed",
                error=str(e),
                error_type=type(e).__name__,
            )
            return []
    
    def normalize_talking_points_sections(
        self, 
        talking_points: List[Any]
    ) -> List[Dict[str, Any]]:
        """
        Normalize talking points into structured sections.
        
        Args:
            talking_points: List of strings or structured section dictionaries
            
        Returns:
            List of structured talking point sections
        """
        normalized_points = []
        
        try:
            for i, point in enumerate(talking_points):
                if isinstance(point, str) and point.strip():
                    normalized_points.append({
                        "fields": [
                            {
                                "name": f"Point {i + 1}",
                                "type": "text",
                                "value": point.strip(),
                                "label": f"Point {i + 1}",
                                "placeholder": "",
                                "description": "",
                                "required": False,
                                "options": ""
                            }
                        ]
                    })
                elif isinstance(point, dict) and "fields" in point:
                    normalized_fields = []
                    for field in point.get("fields", []):
                        normalized_field = {
                            "name": field.get("name", f"Field {len(normalized_fields) + 1}"),
                            "type": field.get("type", "text"),
                            "value": field.get("value", ""),
                            "label": field.get("label", field.get("name", f"Field {len(normalized_fields) + 1}")),
                            "placeholder": field.get("placeholder", ""),
                            "description": field.get("description", ""),
                            "required": field.get("required", False),
                            "options": field.get("options", "")
                        }
                        normalized_fields.append(normalized_field)
                    if normalized_fields:
                        normalized_points.append({"fields": normalized_fields})
                elif point and not isinstance(point, str):  # Non-empty non-string format
                    # Convert to string
                    normalized_points.append({
                        "fields": [
                            {
                                "name": f"Point {i + 1}",
                                "type": "text",
                                "value": str(point),
                                "label": f"Point {i + 1}",
                                "placeholder": "",
                                "description": "",
                                "required": False,
                                "options": ""
                            }
                        ]
                    })
        
        except self.TALKING_POINTS_ERRORS as e:
            self.logger.error(
                "talking_points.structure_migration_failed",
                error=str(e),
                error_type=type(e).__name__,
            )
            # Return empty list on error to avoid breaking the system
            return []
        
        return normalized_points
    
    def ensure_talking_points_structure(
        self, 
        subcategory_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Ensure talking points are in the correct response format.
        
        Args:
            subcategory_data: Subcategory data from database
            
        Returns:
            Subcategory data with properly formatted talking points
        """
        try:
            # Handle pre-session talking points
            pre_session = subcategory_data.get("preSessionTalkingPoints", [])
            if pre_session:
                if self._looks_canonical_sections(pre_session):
                    pre_session = []
                elif isinstance(pre_session[0], str):
                    self.logger.info("talking_points.pre_session_structure_normalized")
                    subcategory_data["preSessionTalkingPoints"] = self.normalize_talking_points_sections(pre_session)
                else:
                    # Ensure proper format
                    subcategory_data["preSessionTalkingPoints"] = self.convert_talking_points_to_response(pre_session)
            
            # Handle in-session talking points
            in_session = subcategory_data.get("inSessionTalkingPoints", [])
            if in_session:
                if self._looks_canonical_sections(in_session):
                    in_session = []
                elif isinstance(in_session[0], str):
                    self.logger.info("talking_points.in_session_structure_normalized")
                    subcategory_data["inSessionTalkingPoints"] = self.normalize_talking_points_sections(in_session)
                else:
                    # Ensure proper format
                    subcategory_data["inSessionTalkingPoints"] = self.convert_talking_points_to_response(in_session)
        
        except self.TALKING_POINTS_ERRORS as e:
            self.logger.error(
                "talking_points.structure_normalization_failed",
                error=str(e),
                error_type=type(e).__name__,
            )
            # Set to empty lists on error to prevent breaking the response
            subcategory_data["preSessionTalkingPoints"] = []
            subcategory_data["inSessionTalkingPoints"] = []
        
        return subcategory_data
    
    def validate_pydantic_models(
        self, 
        talking_points: List[Dict[str, Any]]
    ) -> List[TalkingPointSection]:
        """
        Validate talking points using Pydantic models
        
        Args:
            talking_points: Raw talking points data
            
        Returns:
            List of validated TalkingPointSection objects
            
        Raises:
            ValidationError: If validation fails
        """
        try:
            sections = []
            for section_data in talking_points:
                section = TalkingPointSection(**section_data)
                sections.append(section)
            return sections
        except ValidationError as e:
            self.logger.error(
                "talking_points.pydantic_validation_failed",
                error=str(e),
                error_type=type(e).__name__,
            )
            raise
    
    def get_field_type_info(self) -> Dict[str, Dict[str, Any]]:
        """
        Get information about supported field types
        
        Returns:
            Dictionary with field type information
        """
        return {
            "text": {
                "description": "Single-line text input",
                "value_type": "string",
                "validation": "String, max 1000 characters",
                "form_builder": True
            },
            "date": {
                "description": "Date input field",
                "value_type": "string",
                "validation": "Date string in YYYY-MM-DD format",
                "form_builder": True
            },
            "markdown": {
                "description": "Multi-line markdown text",
                "value_type": "string",
                "validation": "Markdown formatted text, max 5000 characters",
                "form_builder": True
            },
            "checkbox": {
                "description": "Boolean checkbox",
                "value_type": "boolean",
                "validation": "True or false value",
                "form_builder": True
            },
            "number": {
                "description": "Numeric input field",
                "value_type": "number",
                "validation": "Integer or decimal number",
                "form_builder": True
            },
            "select": {
                "description": "Dropdown selection",
                "value_type": "string",
                "validation": "Selected option from predefined list",
                "form_builder": True
            }
        }
