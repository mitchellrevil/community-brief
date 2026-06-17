import asyncio
import time
from typing import Any, Dict, Optional, Tuple, TypeVar, Generic, Callable, Awaitable
from app.core.logging import get_logger

T = TypeVar("T")

logger = get_logger(__name__)

TTL_CACHE_ERRORS = (RuntimeError, ValueError, TypeError)

class TTLCache(Generic[T]):
    """
    A simple async-safe in-memory cache with TTL.
    """
    def __init__(self, default_ttl: float = 60.0):
        self._cache: Dict[str, Tuple[float, T]] = {}
        self._inflight: Dict[str, asyncio.Future[T]] = {}
        self._lock = asyncio.Lock()
        self.default_ttl = default_ttl

    async def get(self, key: str) -> Optional[T]:
        """Get a value from the cache if it exists and hasn't expired."""
        async with self._lock:
            entry = self._cache.get(key)
            if not entry:
                return None
            
            expiry, value = entry
            if time.monotonic() > expiry:
                del self._cache[key]
                return None
            
            return value

    async def set(self, key: str, value: T, ttl: Optional[float] = None) -> None:
        """Set a value in the cache with an optional TTL."""
        expiry = time.monotonic() + (ttl if ttl is not None else self.default_ttl)
        async with self._lock:
            self._cache[key] = (expiry, value)

    async def get_or_compute(
        self, 
        key: str, 
        computer: Callable[[], Awaitable[T]], 
        ttl: Optional[float] = None
    ) -> T:
        """
        Get a value from cache, or compute it if missing/expired.
        """
        value = await self.get(key)
        if value is not None:
            return value

        loop = asyncio.get_running_loop()
        async with self._lock:
            entry = self._cache.get(key)
            if entry:
                expiry, cached_value = entry
                if time.monotonic() <= expiry:
                    return cached_value
                del self._cache[key]

            inflight = self._inflight.get(key)
            if inflight is not None and inflight.get_loop() is not loop:
                if inflight.done():
                    try:
                        return inflight.result()
                    except Exception:
                        pass
                else:
                    inflight.cancel()
                self._inflight.pop(key, None)
                inflight = None

            if inflight is None:
                inflight = loop.create_future()
                self._inflight[key] = inflight
                owner = True
            else:
                owner = False

        if not owner:
            return await inflight

        try:
            value = await computer()
        except asyncio.CancelledError:
            async with self._lock:
                future = self._inflight.pop(key, None)
                if future is not None and not future.done():
                    future.cancel()
            raise
        except TTL_CACHE_ERRORS as exc:
            async with self._lock:
                future = self._inflight.pop(key, None)
                if future is not None and not future.done():
                    future.set_exception(exc)
            logger.error("ttl_cache_compute_failed", cache_key=key, error=str(exc), exc_info=True)
            raise

        await self.set(key, value, ttl)
        async with self._lock:
            future = self._inflight.pop(key, None)
            if future is not None and not future.done():
                future.set_result(value)
        return value

    async def clear(self) -> None:
        """Clear all entries from the cache."""
        async with self._lock:
            self._cache.clear()
            for future in self._inflight.values():
                if not future.done():
                    future.cancel()
            self._inflight.clear()

    async def invalidate(self, key_prefix: str) -> None:
        """Invalidate all keys starting with the given prefix."""
        async with self._lock:
            keys_to_remove = [k for k in self._cache.keys() if k.startswith(key_prefix)]
            for k in keys_to_remove:
                del self._cache[k]
            inflight_keys = [k for k in self._inflight.keys() if k.startswith(key_prefix)]
            for k in inflight_keys:
                future = self._inflight.pop(k, None)
                if future is not None and not future.done():
                    future.cancel()
