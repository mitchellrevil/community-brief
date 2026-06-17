"""Structured logging utilities for the Azure Function worker."""
from __future__ import annotations

import logging
import sys
from typing import Any, Optional

import structlog
from structlog.typing import Processor


def setup_logging(level: str = "INFO", format_json: bool = True) -> None:
    """Configure structlog and stdlib logging for Azure Functions."""
    log_level = getattr(logging, level.upper(), logging.INFO)
    renderer: Processor
    if format_json:
        renderer = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer(
            colors=False,
            exception_formatter=structlog.dev.plain_traceback,
        )

    shared_processors: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
    ]
    if format_json:
        shared_processors.append(structlog.processors.format_exc_info)

    foreign_pre_chain: list[Processor] = [
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.ExtraAdder(),
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
    ]
    if format_json:
        foreign_pre_chain.append(structlog.processors.format_exc_info)

    formatter = structlog.stdlib.ProcessorFormatter(
        processor=renderer,
        foreign_pre_chain=foreign_pre_chain,
    )

    root_logger = logging.getLogger()
    stream_handlers = [
        handler
        for handler in root_logger.handlers
        if isinstance(handler, logging.StreamHandler)
    ]
    if not stream_handlers:
        stream_handlers = [logging.StreamHandler(sys.stdout)]
        root_logger.handlers = [*root_logger.handlers, *stream_handlers]

    for handler in stream_handlers:
        handler.setFormatter(formatter)
        handler.setLevel(log_level)

    root_logger.setLevel(log_level)

    for noisy_logger in (
        "azure",
        "azure.core.pipeline.policies.http_logging_policy",
        "azure.storage.blob",
        "urllib3",
    ):
        logging.getLogger(noisy_logger).setLevel(logging.WARNING)

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> Any:
    return structlog.get_logger(name)


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
