from __future__ import annotations

import time
from math import ceil
from typing import Optional

import redis.asyncio as redis
from fastapi import HTTPException, Request, Response
from fastapi_limiter import FastAPILimiter
from fastapi_limiter.depends import RateLimiter
from starlette.status import HTTP_429_TOO_MANY_REQUESTS

from .logging import get_logger


logger = get_logger(__name__)


class InMemoryRateLimitStore:
    def __init__(self) -> None:
        self._records: dict[str, tuple[int, float]] = {}

    async def script_load(self, script: str) -> str:
        return "in-memory-fastapi-limiter"

    async def evalsha(self, sha: str, keys_count: int, key: str, limit: str, expire_ms: str) -> int:
        now = time.monotonic()
        max_requests = int(limit)
        ttl_seconds = int(expire_ms) / 1000
        count, expires_at = self._records.get(key, (0, now + ttl_seconds))

        if expires_at <= now:
            count = 0
            expires_at = now + ttl_seconds

        if count + 1 > max_requests:
            return max(1, ceil((expires_at - now) * 1000))

        self._records[key] = (count + 1, expires_at)
        return 0

    async def close(self) -> None:
        self._records.clear()


async def rate_limit_callback(request: Request, response: Response, pexpire: int) -> None:
    retry_after = str(ceil(pexpire / 1000))
    raise HTTPException(
        status_code=HTTP_429_TOO_MANY_REQUESTS,
        detail="Too Many Requests",
        headers={"Retry-After": retry_after},
    )


async def init_rate_limiter(redis_url: Optional[str], *, prefix: str = "community-brief") -> None:
    if redis_url:
        redis_client = redis.from_url(redis_url, encoding="utf-8", decode_responses=True)
        backend = redis_client
        logger.info("rate_limit.redis_configured", redis_url_configured=True)
    else:
        backend = InMemoryRateLimitStore()
        logger.warning("rate_limit.memory_store_configured")

    await FastAPILimiter.init(
        backend,
        prefix=prefix,
        http_callback=rate_limit_callback,
    )


async def close_rate_limiter() -> None:
    if FastAPILimiter.redis is not None:
        await FastAPILimiter.close()
        FastAPILimiter.redis = None


def limiter(times: int, seconds: int) -> RateLimiter:
    return RateLimiter(times=times, seconds=seconds)


login_limit = limiter(times=5, seconds=60)
auth_mutation_limit = limiter(times=20, seconds=60)
upload_limit = limiter(times=10, seconds=60)
expensive_operation_limit = limiter(times=20, seconds=60)
admin_mutation_limit = limiter(times=30, seconds=60)
standard_rate_limit = limiter(times=100, seconds=60)