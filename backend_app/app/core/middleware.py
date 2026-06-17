from __future__ import annotations

import time
import uuid

import structlog
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

from .logging import get_logger


logger = get_logger(__name__)


DEFAULT_CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: https:; "
    "connect-src 'self' https://api.openai.com https://*.azure.com; "
    "frame-ancestors 'none';"
)

DOCS_CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "img-src 'self' data: https:; "
    "connect-src 'self' https://api.openai.com https://*.azure.com; "
    "frame-ancestors 'none';"
)

DOCS_PATHS = {"/docs", "/redoc", "/openapi.json"}


def _content_security_policy_for_path(path: str) -> str:
    if path in DOCS_PATHS:
        return DOCS_CONTENT_SECURITY_POLICY
    return DEFAULT_CONTENT_SECURITY_POLICY


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            method=request.method,
            path=request.url.path,
        )

        started_at = time.perf_counter()
        response = await call_next(request)

        duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
        response.headers["X-Request-ID"] = request_id
        logger.info(
            "http.request.completed",
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=duration_ms,
        )
        return response


class InputValidationMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, dangerous_pattern):
        super().__init__(app)
        self.dangerous_pattern = dangerous_pattern

    async def dispatch(self, request: Request, call_next) -> Response:
        for name, value in request.query_params.items():
            if self.dangerous_pattern.search(str(value)):
                return JSONResponse(
                    status_code=400,
                    content={
                        "error": {
                            "code": "INVALID_INPUT",
                            "message": f"Invalid query parameter: {name}",
                            "request_id": getattr(request.state, "request_id", None),
                        }
                    },
                )

        if self.dangerous_pattern.search(str(request.url.path)):
            return JSONResponse(
                status_code=400,
                content={
                    "error": {
                        "code": "INVALID_INPUT",
                        "message": "Invalid path",
                        "request_id": getattr(request.state, "request_id", None),
                    }
                },
            )

        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = _content_security_policy_for_path(
            request.url.path
        )
        return response
