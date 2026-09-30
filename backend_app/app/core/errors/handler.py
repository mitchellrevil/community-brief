from abc import ABC, abstractmethod
from typing import Any, Callable, Dict, NoReturn, Optional

from .domain import ApplicationError, ErrorCode
from ..logging import get_logger


LoggerFactory = Callable[[], Any]


class ErrorHandler(ABC):
    """Abstraction for logging and surfacing application errors."""

    @abstractmethod
    def raise_internal(
        self,
        action: str,
        exc: Exception,
        *,
        message: Optional[str] = None,
        error_code: ErrorCode = ErrorCode.INTERNAL_ERROR,
        status_code: int = 500,
        context: Optional[Dict[str, Any]] = None,
    ) -> NoReturn:
        """Log an unexpected failure and raise an ``ApplicationError``.

        Args:
            action: Human readable description of the attempted action.
            exc: The original exception.
            message: Optional override for the end-user message.
            error_code: High level error classification.
            status_code: HTTP status code to surface.
            context: Additional structured fields to attach.
        """


class DefaultErrorHandler(ErrorHandler):
    """Production implementation that records structured logs before raising."""

    def __init__(
        self,
        logger_factory: Optional[LoggerFactory] = None,
        *,
        base_context: Optional[Dict[str, Any]] = None,
    ) -> None:
        self._logger_factory: LoggerFactory = logger_factory or (lambda: get_logger("community_brief.errors"))
        self._base_context = base_context or {}

    def raise_internal(
        self,
        action: str,
        exc: Exception,
        *,
        message: Optional[str] = None,
        error_code: ErrorCode = ErrorCode.INTERNAL_ERROR,
        status_code: int = 500,
        context: Optional[Dict[str, Any]] = None,
    ) -> NoReturn:
        logger = self._logger_factory()

        log_context: Dict[str, Any] = {
            "action": action,
            "error": str(exc),
            "error_type": type(exc).__name__,
        }
        log_context.update(self._base_context)
        if context:
            log_context.update(context)

        logger.exception("internal_action_failed", exc_info=True, **log_context)

        raise ApplicationError(
            message or f"Failed to {action}",
            error_code,
            status_code=status_code,
            details=log_context,
        )
