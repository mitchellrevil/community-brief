from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional

import httpx

from ...core.config import AppConfig
from ...core.errors.domain import ApplicationError, ErrorCode
from ...core.http_client import get_http_client
from ...core.logging import get_logger

logger = get_logger(__name__)

AZURE_FUNCTION_ROUTE_PREFIX = "api"
REPROCESS_ANALYSIS_ROUTE = "reprocess-analysis"


AuthHeadersFactory = Callable[..., Dict[str, str]]
HttpClientFactory = Callable[[], Any]


@dataclass(frozen=True)
class JobReprocessResult:
    status_code: int
    payload: Dict[str, Any]


def build_azure_function_url(base_url: str, route: str) -> str:
    if not base_url:
        raise ValueError("base_url is required")

    normalized_route = route.strip("/")
    return f"{base_url.rstrip('/')}/{AZURE_FUNCTION_ROUTE_PREFIX}/{normalized_route}"


def get_azure_functions_auth_headers(base_url: str, function_key: Optional[str] = None) -> dict[str, str]:
    if function_key:
        logger.info(
            "azure_functions_auth.key_auth_configured",
            key_length=len(function_key),
        )
        return {"x-functions-key": function_key}

    logger.warning(
        "azure_functions_auth.key_missing",
        base_url=base_url,
    )
    return {}


class JobReprocessService:
    """Owns backend-to-Function job analysis reprocess workflow."""

    def __init__(
        self,
        config: AppConfig,
        *,
        http_client_factory: HttpClientFactory = get_http_client,
        auth_headers_factory: AuthHeadersFactory = get_azure_functions_auth_headers,
        timeout_seconds: float = 5.0,
    ) -> None:
        self.config = config
        self.http_client_factory = http_client_factory
        self.auth_headers_factory = auth_headers_factory
        self.timeout_seconds = timeout_seconds

    async def reprocess_job_analysis(
        self,
        *,
        job_id: str,
        request_payload: Dict[str, Any],
        job: Dict[str, Any],
        current_user: Dict[str, Any] | str,
    ) -> JobReprocessResult:
        payload = self._build_payload(
            job_id=job_id,
            request_payload=request_payload,
            job=job,
            current_user=current_user,
        )
        user_id = payload.get("user_id")
        correlation_id = str(uuid.uuid4())
        base_url = str(self.config.azure_functions_base_url).rstrip("/")
        function_url = build_azure_function_url(base_url, REPROCESS_ANALYSIS_ROUTE)
        headers = self._build_auth_headers(base_url)
        headers["x-correlation-id"] = correlation_id

        logger.info(
            "job_reprocess_function_call_started",
            job_id=job_id,
            correlation_id=correlation_id,
            function_url=function_url,
            user_id=user_id,
        )

        try:
            response = await self.http_client_factory().post(
                function_url,
                json=payload,
                headers=headers,
                timeout=self.timeout_seconds,
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            return self._handle_http_status_error(exc, job_id=job_id)
        except httpx.ReadTimeout:
            logger.warning(
                "job_reprocess_function_read_timeout",
                job_id=job_id,
                correlation_id=correlation_id,
            )
            return JobReprocessResult(
                status_code=202,
                payload={
                    "status": "accepted",
                    "message": "Azure Functions request timed out; processing may have started.",
                    "job_id": job_id,
                },
            )
        except httpx.RequestError as exc:
            raise ApplicationError(
                "Failed to reprocess job analysis",
                error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
                status_code=502,
                details={"job_id": job_id, "error": str(exc)},
            ) from exc

        response_payload = response.json()
        logger.info(
            "job_reprocess_function_call_completed",
            job_id=job_id,
            correlation_id=correlation_id,
            status_code=response.status_code,
            attempt_number=response_payload.get("attempt_number"),
        )
        return JobReprocessResult(status_code=response.status_code, payload=response_payload)

    def _build_auth_headers(self, base_url: str) -> Dict[str, str]:
        if self.auth_headers_factory is get_azure_functions_auth_headers:
            return self.auth_headers_factory(base_url, self.config.azure_functions_key)
        return self.auth_headers_factory(base_url)

    @staticmethod
    def _build_payload(
        *,
        job_id: str,
        request_payload: Dict[str, Any],
        job: Dict[str, Any],
        current_user: Dict[str, Any] | str,
    ) -> Dict[str, Any]:
        payload = dict(request_payload)
        payload["job_id"] = job_id

        user_id = current_user if isinstance(current_user, str) else current_user.get("id")
        user_email: Optional[str] = None
        if isinstance(current_user, dict):
            user_email = current_user.get("email")

        payload["user_id"] = user_id
        if user_email:
            payload["user_email"] = user_email
        payload["displayname"] = job.get("displayname") or job.get("file_name")
        return payload

    @staticmethod
    def _handle_http_status_error(exc: httpx.HTTPStatusError, *, job_id: str) -> JobReprocessResult:
        status_code = exc.response.status_code if exc.response else None
        body_text = exc.response.text if exc.response else None
        if status_code == 401:
            logger.error(
                "job_reprocess_function_auth_failed",
                job_id=job_id,
                function_body=body_text[:200] if body_text else None,
            )
            return JobReprocessResult(
                status_code=502,
                payload={
                    "status": "error",
                    "message": (
                        "Azure Functions authentication failed (401). Please verify "
                        "function app authentication and identity permissions."
                    ),
                    "details": {"azure_status_code": status_code},
                },
            )

        raise ApplicationError(
            "Failed to reprocess job analysis",
            error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
            status_code=502,
            details={
                "job_id": job_id,
                "azure_status_code": status_code,
                "azure_body": body_text,
            },
        ) from exc
