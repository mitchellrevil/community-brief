"""Small logging helpers for the Azure Function worker."""
from __future__ import annotations

import json
import logging
import sys
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Optional

_active_function_name: ContextVar[str | None] = ContextVar(
    "active_function_name",
    default=None,
)


class AppLogger:
    def __init__(self, name: str) -> None:
        self._logger = logging.getLogger(name)
        self._source = name

    def debug(self, event: str, **fields: Any) -> None:
        self._log(logging.DEBUG, event, fields)

    def info(self, event: str, **fields: Any) -> None:
        self._log(logging.INFO, event, fields)

    def warning(self, event: str, **fields: Any) -> None:
        self._log(logging.WARNING, event, fields)

    def error(self, event: str, **fields: Any) -> None:
        self._log(logging.ERROR, event, fields)

    def exception(self, event: str, **fields: Any) -> None:
        fields["exc_info"] = True
        self._log(logging.ERROR, event, fields)

    def _log(self, level: int, event: str, fields: dict[str, Any]) -> None:
        exc_info = fields.pop("exc_info", None)
        stack_info = fields.pop("stack_info", False)
        message_fields = {"source": self._source, **fields}
        active_function_name = _active_function_name.get()
        logger = (
            logging.getLogger()
            if active_function_name
            else self._logger
        )
        logger.log(
            level,
            _format_event(event, message_fields),
            exc_info=exc_info,
            stack_info=stack_info,
        )


def setup_logging(level: str = "INFO", format_json: bool = False) -> None:
    """Configure stdlib logging without replacing Azure Functions host handlers."""
    log_level = getattr(logging, level.upper(), logging.INFO)
    root_logger = logging.getLogger()

    if not root_logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter("%(message)s"))
        root_logger.addHandler(handler)

    root_logger.setLevel(log_level)
    for handler in root_logger.handlers:
        handler.setLevel(log_level)

    for noisy_logger in (
        "azure",
        "azure.core.pipeline.policies.http_logging_policy",
        "azure.storage.blob",
        "urllib3",
    ):
        logging.getLogger(noisy_logger).setLevel(logging.WARNING)


def get_logger(name: str) -> AppLogger:
    return AppLogger(name)


@contextmanager
def function_invocation_logs(function_name: str):
    token = _active_function_name.set(function_name)
    try:
        yield
    finally:
        _active_function_name.reset(token)


def _format_event(event: str, fields: dict[str, Any]) -> str:
    extras = " ".join(
        f"{key}={_format_value(value)}"
        for key, value in fields.items()
        if value is not None
    )
    return f"{event} {extras}".rstrip()


def _format_value(value: Any) -> str:
    if isinstance(value, str):
        return value if _is_plain_value(value) else repr(value)
    try:
        return json.dumps(value, default=str, sort_keys=True)
    except TypeError:
        return repr(value)


def _is_plain_value(value: str) -> bool:
    return bool(value) and all(ch not in value for ch in " \t\r\n=")


def redact(value: Optional[str], keep: int = 6) -> str:
    if not value:
        return value or ""
    if len(value) <= keep:
        return "[redacted]"
    return value[:keep] + "…[redacted]"


def preview(text: Optional[str], n: int = 120) -> str:
    if not text:
        return text or ""

    normalized = text.replace("\n", " ").replace("\r", " ")
    while "  " in normalized:
        normalized = normalized.replace("  ", " ")
    normalized = normalized.strip()

    if len(normalized) <= n:
        return normalized
    return normalized[:n] + "…"


def sanitize_log_extra(extra: dict[str, Any]) -> dict[str, Any]:
    sanitized = extra.copy()
    sensitive_keys = {
        "token",
        "key",
        "secret",
        "password",
        "sas",
        "authorization",
        "api_key",
        "bearer",
        "credential",
    }

    for key, value in list(sanitized.items()):
        key_lower = key.lower()
        if any(sensitive in key_lower for sensitive in sensitive_keys):
            if isinstance(value, str):
                sanitized[key] = redact(value)
        elif isinstance(value, str) and len(value) > 200:
            sanitized[key] = preview(value, n=150)

    return sanitized
