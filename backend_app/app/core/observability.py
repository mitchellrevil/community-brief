from __future__ import annotations

from typing import Any

from .logging import get_logger


logger = get_logger(__name__)


def capture_exception(exc: Exception, **context: Any) -> None:
    logger.error(
        "observability.exception_captured",
        exc_type=type(exc).__name__,
        error=str(exc),
        **context,
    )
