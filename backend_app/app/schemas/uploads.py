from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class UploadTokenRequest(BaseModel):
    filename: str = Field(..., min_length=1, max_length=512, description="Original filename including extension")
    content_type: Optional[str] = Field(None, description="MIME type of the file")
    file_size: Optional[int] = Field(None, ge=1, description="File size in bytes")


class UploadCompleteRequest(BaseModel):
    blob_url: str = Field(..., description="The blob URL returned by request-token")
    filename: str = Field(..., min_length=1, max_length=512, description="Original filename")
    prompt_category_id: Optional[str] = None
    prompt_subcategory_id: Optional[str] = None
    pre_session_form_data: Optional[Dict[str, Any]] = None
    audio_duration_seconds: Optional[float] = None
    audio_duration_minutes: Optional[float] = None
    recording_settings: Optional[Dict[str, Any]] = None
