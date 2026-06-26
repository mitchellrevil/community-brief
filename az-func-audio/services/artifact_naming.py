from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime
from urllib.parse import urlparse

from services.file_processing_service import SYSTEM_GENERATED_TAG

def get_system_generated_tag() -> str:
    return SYSTEM_GENERATED_TAG


def is_system_generated_file(blob_name: str) -> bool:
    return get_system_generated_tag() in blob_name


def is_reprocess_artifact(blob_path: str) -> bool:
    blob_path_lower = blob_path.lower()
    has_reprocess_pattern = "_reprocess_" in blob_path_lower or "analysis" in blob_path_lower
    is_analysis_format = blob_path_lower.endswith((".docx", ".pdf", ".md"))
    return has_reprocess_pattern and is_analysis_format


def strip_container_path(blob_url: str) -> str:
    parsed = urlparse(blob_url)
    path = parsed.path.lstrip("/")
    parts = path.split("/", 1)
    return parts[1] if len(parts) == 2 else parts[0]


def build_analysis_blob_name(blob_url: str) -> str:
    relative_path = strip_container_path(blob_url)
    folder, filename = os.path.split(relative_path)
    base = os.path.splitext(filename)[0]
    tag = get_system_generated_tag()
    timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    suffix = uuid.uuid4().hex[:8]
    new_filename = f"{base}{tag}_reprocess_{timestamp}_{suffix}.md"
    return f"{folder}/{new_filename}" if folder else new_filename
