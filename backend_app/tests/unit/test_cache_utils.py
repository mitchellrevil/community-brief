import asyncio

import pytest

from app.utils.cache_utils import TTLCache


pytestmark = pytest.mark.asyncio


async def test_ttl_cache_coalesces_concurrent_misses():
    cache = TTLCache[str](default_ttl=1.0)
    started = asyncio.Event()
    release = asyncio.Event()
    calls = 0

    async def computer() -> str:
        nonlocal calls
        calls += 1
        started.set()
        await release.wait()
        return "computed-value"

    first = asyncio.create_task(cache.get_or_compute("key", computer))
    await started.wait()
    second = asyncio.create_task(cache.get_or_compute("key", computer))
    release.set()

    assert await first == "computed-value"
    assert await second == "computed-value"
    assert calls == 1
