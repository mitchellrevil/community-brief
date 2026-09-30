import hashlib
import re
from typing import Dict, Any
from fastapi import UploadFile

from app.core.config import AppConfig
from app.core.errors.domain import ApplicationError, ErrorCode, ValidationError
from app.core.logging import get_logger

try:
    import magic
except ImportError:
    magic = None  # python-magic not available in all environments; fallback will be used

logger = get_logger(__name__)

MIME_DETECTION_ERRORS = (RuntimeError, OSError, ValueError, TypeError)
if magic is not None and hasattr(magic, "MagicException"):
    MIME_DETECTION_ERRORS = (*MIME_DETECTION_ERRORS, magic.MagicException)


class FileSecurityService:
    DANGEROUS_PATTERNS = [
        b"<script",
        b"javascript:",
        b"<?php",
        b"eval(",
        b"exec(",
        b"MZ\x90\x00",
    ]

    def __init__(self, config: AppConfig):
        self.max_size_bytes = int(config.max_upload_size_mb) * 1024 * 1024
        allowed = getattr(config, "allowed_file_types_list", []) or []
        self.allowed_exts = set(allowed)

    async def validate(self, file: UploadFile) -> Dict[str, Any]:
        if not file or not file.filename:
            raise ValidationError("No file provided")

        safe_name = self._sanitize_filename(file.filename)
        if not safe_name:
            raise ValidationError("Invalid filename", field="filename")

        chunk_size = 64 * 1024
        total = 0
        hasher = hashlib.sha256()
        mime = None
        head = b""

        max_pat_len = max(len(pat) for pat in self.DANGEROUS_PATTERNS)
        tail = b""

        while True:
            chunk = await file.read(chunk_size)
            if not chunk:
                break

            if not head:
                head = chunk[:4096]

            total += len(chunk)
            if total > self.max_size_bytes:
                await file.seek(0)
                raise ApplicationError("File too large", ErrorCode.INVALID_INPUT, status_code=413)

            hasher.update(chunk)

            scan = (tail + chunk).lower()
            for pat in self.DANGEROUS_PATTERNS:
                if pat.lower() in scan:
                    await file.seek(0)
                    raise ValidationError("File contains disallowed content")

            if max_pat_len > 1:
                tail = scan[-(max_pat_len - 1):]
            else:
                tail = b""

        await file.seek(0)

        if magic and head:
            try:
                mime = magic.from_buffer(head, mime=True)
            except MIME_DETECTION_ERRORS as e:
                # Magic library errors are non-critical - fallback to extension-based validation
                logger.debug(
                    "file_security_mime_detection_failed",
                    exc_info=True,
                    error_type=type(e).__name__,
                )
                mime = None

        ext = ("." + safe_name.split(".")[-1].lower()) if '.' in safe_name else ''
        if mime:
            if ext not in self.allowed_exts:
                raise ValidationError(f"File extension {ext} not allowed", field="filename")
        else:
            if ext not in self.allowed_exts:
                raise ValidationError(f"File extension {ext} not allowed", field="filename")

        file_hash = hasher.hexdigest()

        return {
            "safe_filename": safe_name,
            "content_type": mime or "application/octet-stream",
            "file_hash": file_hash,
            "size": total,
        }

    def _sanitize_filename(self, filename: str) -> str:
        name = filename.split('/')[-1].split('\\')[-1]
        name = re.sub(r'[^A-Za-z0-9_.-]', '', name)
        if not name or name.startswith('.'):
            return ''
        return name[:255]
