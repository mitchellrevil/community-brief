# Secure Input Validation Utilities
import re
from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status
from pathlib import Path
import html
from app.core.logging import get_logger

logger = get_logger(__name__)

class InputValidator:
    """Centralized input validation and sanitization"""
    
    EMAIL_PATTERN = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
    UUID_PATTERN = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.IGNORECASE)
    FILENAME_PATTERN = re.compile(r'^[a-zA-Z0-9._\-\s()]+$')
    
    DANGEROUS_PATTERNS = [
        r'<script[^>]*>.*?</script>',
        r'javascript:',
        r'vbscript:',
        r'on\w+\s*=',
        r'<\s*iframe',
        r'<\s*object',
        r'<\s*embed',
        r'<\s*applet',
        r'<\s*meta',
        r'<\s*link',
        r'<\s*style',
        r'\.\./|\.\\\.',
        r'[/\\]etc[/\\]passwd',
        r'[/\\]proc[/\\]',
        r'\\\\[a-zA-Z$]',
        r'union\s+select',
        r'insert\s+into',
        r'delete\s+from',
        r'drop\s+table',
        r'exec\s*\(',
        r'eval\s*\(',
        r'system\s*\(',
        r'shell_exec\s*\(',
        r'passthru\s*\(',
        r'__import__',
        r'subprocess',
        r'os\.system',
        r'file_get_contents',
        r'include\s*\(',
        r'require\s*\(',
    ]
    
    @classmethod
    def validate_email(cls, email: str) -> bool:
        if not email or len(email) > 254:
            return False
        return bool(cls.EMAIL_PATTERN.match(email))
    
    @classmethod
    def validate_uuid(cls, uuid_str: str) -> bool:
        if not uuid_str:
            return False
        return bool(cls.UUID_PATTERN.match(uuid_str))
    
    @classmethod
    def validate_filename(cls, filename: str) -> bool:
        if not filename or len(filename) > 255:
            return False
        if cls.contains_dangerous_patterns(filename):
            return False
        return bool(cls.FILENAME_PATTERN.match(filename))
    
    @classmethod
    def sanitize_filename(cls, filename: str) -> str:
        if not filename:
            return "unnamed"
        
        filename = Path(filename).name
        
        sanitized = re.sub(r'[^\w\-_\.\s]', '_', filename)
        
        if len(sanitized) > 100:
            name, ext = Path(sanitized).stem, Path(sanitized).suffix
            sanitized = name[:95] + ext
        
        return sanitized or "unnamed"
    
    @classmethod
    def contains_dangerous_patterns(cls, text: str) -> bool:
        if not text:
            return False
        
        text_lower = text.lower()
        for pattern in cls.DANGEROUS_PATTERNS:
            if re.search(pattern, text_lower, re.IGNORECASE):
                logger.warning("input_validation.dangerous_pattern_detected", pattern=pattern)
                return True
        return False
    
    @classmethod
    def sanitize_html(cls, text: str) -> str:
        if not text:
            return ""
        return html.escape(text)
    
    @classmethod
    def validate_json_size(cls, data: Dict[str, Any], max_keys: int = 100, max_depth: int = 10) -> bool:
        def count_keys_and_depth(obj, current_depth=0):
            if current_depth > max_depth:
                return float('inf'), current_depth
            
            key_count = 0
            max_child_depth = current_depth
            
            if isinstance(obj, dict):
                key_count += len(obj)
                for value in obj.values():
                    child_keys, child_depth = count_keys_and_depth(value, current_depth + 1)
                    key_count += child_keys
                    max_child_depth = max(max_child_depth, child_depth)
            elif isinstance(obj, list):
                for item in obj:
                    child_keys, child_depth = count_keys_and_depth(item, current_depth + 1)
                    key_count += child_keys
                    max_child_depth = max(max_child_depth, child_depth)
            
            return key_count, max_child_depth
        
        total_keys, depth = count_keys_and_depth(data)
        return total_keys <= max_keys and depth <= max_depth
    
    @classmethod
    def validate_string_length(cls, text: str, min_length: int = 0, max_length: int = 1000) -> bool:
        if not isinstance(text, str):
            return False
        return min_length <= len(text) <= max_length
    
    @classmethod
    def validate_and_sanitize_user_input(cls, data: Dict[str, Any]) -> Dict[str, Any]:
        sanitized = {}
        
        for key, value in data.items():
            if cls.contains_dangerous_patterns(key):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid field name: {key}"
                )
            
            if isinstance(value, str):
                if cls.contains_dangerous_patterns(value):
                    logger.warning(
                        "input_validation.dangerous_field_value_detected",
                        field=key,
                        value_preview=value[:100],
                    )
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Invalid content in field: {key}"
                    )
                sanitized[key] = cls.sanitize_html(value)
            elif isinstance(value, dict):
                sanitized[key] = cls.validate_and_sanitize_user_input(value)
            elif isinstance(value, list):
                sanitized[key] = [
                    cls.validate_and_sanitize_user_input(item) if isinstance(item, dict)
                    else cls.sanitize_html(str(item)) if isinstance(item, str)
                    else item
                    for item in value
                ]
            else:
                sanitized[key] = value
        
        return sanitized

def validate_uuid_param(param_name: str = "id"):
    def decorator(func):
        def wrapper(*args, **kwargs):
            param_value = kwargs.get(param_name)
            if param_value and not InputValidator.validate_uuid(param_value):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid {param_name} format"
                )
            return func(*args, **kwargs)
        return wrapper
    return decorator

def validate_email_param(param_name: str = "email"):
    def decorator(func):
        def wrapper(*args, **kwargs):
            param_value = kwargs.get(param_name)
            if param_value and not InputValidator.validate_email(param_value):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid {param_name} format"
                )
            return func(*args, **kwargs)
        return wrapper
    return decorator
