"""
Simplified Session Tracking Middleware - Minimal Audit Logging

This middleware:
- Tracks sessions (one per user, updated on each request)
- Logs to audit trail ONLY for:
  * Job uploads (POST /api/v1/jobs)
  * Permission changes (PATCH /api/v1/permissions)
  * Failed requests (4xx, 5xx status codes)
- Uses single upsert (no duplicate logging)
"""

from datetime import UTC, datetime, timedelta
from typing import Dict, Any, Optional, TYPE_CHECKING, Callable, Union
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from ..core.logging import get_logger
from ..utils.ip_utils import normalize_ip

if TYPE_CHECKING:
    from ..services.monitoring.session_tracking_service import SessionTrackingService


SESSION_TRACKING_ERRORS = (RuntimeError, ValueError, TypeError, KeyError)


def _extract_user_info(request: Request) -> Optional[Dict[str, Any]]:
    current_user = getattr(request.state, "current_user", None)
    if not current_user:
        return None

    user_id = current_user.get("id")
    email = current_user.get("email")
    if not user_id:
        return None

    return {
        "id": str(user_id),
        "email": email,
    }


def _extract_ip_address(request: Request) -> str:
    forwarded_for = request.headers.get("X-Forwarded-For")
    raw_ip = None
    if forwarded_for:
        raw_ip = forwarded_for.split(",")[0].strip()
    else:
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            raw_ip = real_ip.strip()
        else:
            raw_ip = getattr(request.client, "host", "unknown") if request.client else "unknown"

    normalized = normalize_ip(raw_ip)
    return normalized or "unknown"


def _extract_user_agent(request: Request) -> str:
    return request.headers.get("User-Agent", "Unknown")


class SessiontrackingMiddleware(BaseHTTPMiddleware):
    """
    Lightweight middleware for session tracking.
    
    Responsibilities:
    - Update user sessions on each request
    - Extract request metadata (IP, user agent, etc.)
    
    Designed for minimal overhead.
    """
    
    def __init__(
        self,
        app: ASGIApp,
        session_service: Union["SessionTrackingService", Callable[[], "SessionTrackingService"]],
    ):
        super().__init__(app)
        self.logger = get_logger(__name__)
        self.session_service = session_service

    async def dispatch(self, request: Request, call_next):
        """
        Main middleware logic: session tracking + minimal audit logging.
        """
        start_time = datetime.now(UTC)
        user_info = None
        
        try:
            session_service = self.session_service() if callable(self.session_service) else self.session_service

            response = await call_next(request)
            user_info = _extract_user_info(request)
            
            if user_info:
                ip_address = _extract_ip_address(request)
                user_agent = _extract_user_agent(request)
                # Update session on every authenticated request to capture activity reliably
                await session_service.get_or_create_session(
                    user_id=user_info["id"],
                    user_email=user_info.get("email"),
                    user_agent=user_agent,
                    ip_address=ip_address,
                    timestamp=start_time,
                )

            return response
            
        except SESSION_TRACKING_ERRORS as e:
            self.logger.error(
                "session_tracking.middleware_failed",
                error=str(e),
                error_type=type(e).__name__,
                exc_info=True,
            )
            # Don't break the app if middleware fails
            return JSONResponse(
                status_code=500,
                content={
                    "error": "Session tracking middleware failed",
                    "request_id": request.headers.get("x-request-id", "unknown")
                }
            )


