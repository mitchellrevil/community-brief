"""Shared aiohttp.ClientSession management for the FastAPI application."""
from __future__ import annotations

from functools import lru_cache
from typing import Optional

import aiohttp

from .logging import get_logger

logger = get_logger(__name__)

DEFAULT_TIMEOUT = 120.0  # seconds
DEFAULT_LIMIT = 200
DEFAULT_LIMIT_PER_HOST = 0  # unlimited per host by default


def _build_session(
    timeout: float = DEFAULT_TIMEOUT,
    limit: int = DEFAULT_LIMIT,
    limit_per_host: Optional[int] = DEFAULT_LIMIT_PER_HOST,
) -> aiohttp.ClientSession:
    timeout_cfg = aiohttp.ClientTimeout(total=timeout)
    connector = aiohttp.TCPConnector(
        limit=limit,
        limit_per_host=None if limit_per_host in (None, 0) else limit_per_host,
        ttl_dns_cache=300,
        enable_cleanup_closed=True,
    )
    logger.info(
        "aiohttp_client.session_created",
        limit=limit,
        limit_per_host=limit_per_host,
        timeout=timeout,
    )
    return aiohttp.ClientSession(timeout=timeout_cfg, connector=connector, trust_env=True)


@lru_cache(maxsize=1)
def _get_cached_session(
    timeout: float = DEFAULT_TIMEOUT,
    limit: int = DEFAULT_LIMIT,
    limit_per_host: Optional[int] = DEFAULT_LIMIT_PER_HOST,
) -> aiohttp.ClientSession:
    return _build_session(timeout=timeout, limit=limit, limit_per_host=limit_per_host)


def get_aiohttp_session(
    timeout: float = DEFAULT_TIMEOUT,
    limit: int = DEFAULT_LIMIT,
    limit_per_host: Optional[int] = DEFAULT_LIMIT_PER_HOST,
) -> aiohttp.ClientSession:
    """Return the process-wide aiohttp session, creating it if needed."""
    session = _get_cached_session(timeout, limit, limit_per_host)
    if session.closed:
        _get_cached_session.cache_clear()
        session = _get_cached_session(timeout, limit, limit_per_host)
    return session


async def startup(
    timeout: float = DEFAULT_TIMEOUT,
    limit: int = DEFAULT_LIMIT,
    limit_per_host: Optional[int] = DEFAULT_LIMIT_PER_HOST,
) -> aiohttp.ClientSession:
    """Warm the shared aiohttp session during application startup."""
    return get_aiohttp_session(timeout=timeout, limit=limit, limit_per_host=limit_per_host)


async def shutdown() -> None:
    """Close the shared aiohttp session on shutdown."""
    cache_info = _get_cached_session.cache_info()
    if cache_info.currsize:
        session = _get_cached_session()
        try:
            await session.close()
            logger.info("aiohttp_client.session_closed")
        finally:
            _get_cached_session.cache_clear()
