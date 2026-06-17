"""Shared async HTTP client with explicit startup/shutdown hooks."""
from __future__ import annotations

from typing import Optional

import httpx
from azure.core.exceptions import AzureError

from .logging import get_logger


_logger = get_logger(__name__)
_http_client: Optional[httpx.AsyncClient] = None
_FUNCTION_ROUTE_PREFIX = "api"
_REPROCESS_ANALYSIS_ROUTE = "reprocess-analysis"


async def startup(*, timeout: float = 10.0) -> None:
    """Initialize the shared AsyncClient for outbound HTTP calls."""

    global _http_client  # noqa: PLW0603 - module-level cache
    if _http_client is None:
        _http_client = httpx.AsyncClient(timeout=timeout)
        _logger.info("http_client.started", timeout=timeout)


async def shutdown() -> None:
    """Dispose of the shared AsyncClient."""

    global _http_client  # noqa: PLW0603 - module-level cache
    if _http_client is not None:
        try:
            await _http_client.aclose()
        finally:
            _http_client = None
            _logger.info("http_client.closed")


async def validate_azure_functions_auth(client: httpx.AsyncClient, base_url: str, key: Optional[str] = None, *, timeout: float = 5.0) -> None:
    """Validate Azure Functions auth by calling the reprocess-analysis endpoint.

    Supports either function key or AAD token validation.

    Raises RuntimeError on auth failure or network errors.
    """
    if not base_url:
        raise ValueError("base_url is required for validation")

    test_url = f"{base_url.rstrip('/')}/{_FUNCTION_ROUTE_PREFIX}/{_REPROCESS_ANALYSIS_ROUTE}"

    headers = {}
    if key:
        headers["x-functions-key"] = key
    else:
        # Attempt AAD token via DefaultAzureCredential
        try:
            from azure.identity.aio import DefaultAzureCredential
            async with DefaultAzureCredential() as cred:
                token = await cred.get_token(f"{base_url.rstrip('/')}/.default")
                headers["Authorization"] = f"Bearer {token.token}"
        except ImportError as exc:
            raise RuntimeError("Azure identity dependencies are unavailable for Azure Functions validation") from exc
        except AzureError as exc:
            raise RuntimeError("Unable to acquire AAD token for Azure Functions validation") from exc

    try:
        resp = await client.options(test_url, headers=headers, timeout=timeout)
    except httpx.HTTPError as e:
        raise RuntimeError("Unable to contact Azure Functions") from e

    if resp.status_code == 401:
        raise RuntimeError("Azure Functions authentication failed (401 Unauthorized)")
    if resp.status_code >= 400:
        raise RuntimeError(f"Azure Functions returned unexpected status during auth check: {resp.status_code}")


def get_http_client() -> httpx.AsyncClient:
    """Return the shared AsyncClient, raising if startup has not run."""

    if _http_client is None:
        raise RuntimeError("HTTP client not initialized. Call startup() first.")
    return _http_client
