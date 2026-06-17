from __future__ import annotations

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .errors.domain import ApplicationError, AuthenticationError, ErrorCode, PermissionError
from .logging import get_logger
from .observability import capture_exception


logger = get_logger(__name__)


def error_response(request: Request, status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "request_id": getattr(request.state, "request_id", None),
            }
        },
    )


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApplicationError)
    async def handle_application_error(request: Request, exc: ApplicationError) -> JSONResponse:
        logger.warning(
            "http.application_error",
            code=exc.error_code.value,
            status_code=exc.status_code,
            path=request.url.path,
        )
        return error_response(request, exc.status_code, exc.error_code.value, exc.message)

    @app.exception_handler(HTTPException)
    async def handle_http_exception(request: Request, exc: HTTPException) -> JSONResponse:
        if exc.status_code == 401:
            error = AuthenticationError()
            code = error.error_code.value
            message = error.message
        elif exc.status_code == 403:
            error = PermissionError()
            code = error.error_code.value
            message = error.message
        elif exc.status_code == 404:
            code = ErrorCode.RESOURCE_NOT_FOUND.value
            message = "Resource not found"
        elif exc.status_code == 429:
            code = "RATE_LIMIT_EXCEEDED"
            message = str(exc.detail)
        elif 400 <= exc.status_code < 500:
            code = ErrorCode.INVALID_INPUT.value
            message = str(exc.detail)
        else:
            code = ErrorCode.INTERNAL_ERROR.value
            message = "Internal server error"

        logger.warning(
            "http.exception",
            code=code,
            status_code=exc.status_code,
            path=request.url.path,
        )
        response = error_response(request, exc.status_code, code, message)
        for name, value in (exc.headers or {}).items():
            response.headers[name] = value
        return response

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        logger.warning("http.validation_error", path=request.url.path, errors=exc.errors())
        return error_response(request, 422, ErrorCode.INVALID_INPUT.value, "Request validation failed")

    @app.exception_handler(Exception)
    async def handle_unexpected_exception(request: Request, exc: Exception) -> JSONResponse:
        logger.error(
            "http.unhandled_exception",
            path=request.url.path,
            method=request.method,
            exc_info=True,
        )
        capture_exception(exc, path=request.url.path, method=request.method)
        return error_response(request, 500, ErrorCode.INTERNAL_ERROR.value, "Internal server error")
