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


async def test_ttl_cache_prunes_expired_entries_on_write(monkeypatch):
    now = 100.0
    monkeypatch.setattr("app.utils.cache_utils.time.monotonic", lambda: now)
    cache = TTLCache[str](default_ttl=1.0, max_entries=1)

    await cache.set("expired", "old")
    now = 102.0
    await cache.set("current", "new")

    assert await cache.get("expired") is None
    assert await cache.get("current") == "new"
    assert len(cache._cache) == 1


async def test_ttl_cache_evicts_oldest_entry_at_capacity():
    cache = TTLCache[str](default_ttl=60.0, max_entries=2)

    await cache.set("first", "one", ttl=10.0)
    await cache.set("second", "two", ttl=20.0)
    await cache.set("third", "three", ttl=30.0)

    assert await cache.get("first") is None
    assert await cache.get("second") == "two"
    assert await cache.get("third") == "three"
