from typing import Protocol, Optional, Dict, Any

from ...repositories.sessions import SessionRepository


class SessionPersistenceAdapter(Protocol):
    async def upsert_session(self, session: Dict[str, Any]) -> None:
        ...

    async def get_session(self, session_id: str, user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        ...

    async def get_active_session(self, user_id: str) -> Optional[Dict[str, Any]]:
        ...

    async def delete_session(self, session_id: str) -> None:
        ...

    async def expire_stale_sessions(self, stale_before_iso: str) -> int:
        ...


class NoopSessionPersistence:
    """Noop adapter used when no session persistence is available (Cosmos disabled).

    Methods are intentionally no-ops and return sensible defaults.
    """

    async def upsert_session(self, session: Dict[str, Any]) -> None:
        return None

    async def get_session(self, session_id: str, user_id: Optional[str] = None):
        return None

    async def get_active_session(self, user_id: str):
        return None

    async def delete_session(self, session_id: str) -> None:
        return None

    async def expire_stale_sessions(self, stale_before_iso: str) -> int:
        return 0


class CosmosSessionPersistence:
    """Adapter that exposes session persistence to SessionTrackingService."""

    def __init__(self, container_or_repository):
        if isinstance(container_or_repository, SessionRepository):
            self._repository = container_or_repository
        else:
            self._repository = SessionRepository(container_or_repository)

    async def upsert_session(self, session: Dict[str, Any]) -> None:
        await self._repository.upsert_session(session)

    async def get_session(self, session_id: str, user_id: Optional[str] = None):
        return await self._repository.get_session(session_id, user_id=user_id)

    async def get_active_session(self, user_id: str):
        session = await self.get_session(user_id, user_id=user_id)
        if not session:
            return None
        return session if session.get("status") == "active" else None

    async def delete_session(self, session_id: str) -> None:
        session = await self.get_session(session_id)
        if not session:
            return None
        partition_key = session.get("partition_key") or session.get("user_id") or session_id
        await self._repository.delete_session(session_id=session_id, partition_key=partition_key)

    async def expire_stale_sessions(self, stale_before_iso: str) -> int:
        expired_count = 0
        for item in await self._repository.find_active_sessions_before(stale_before_iso):
            item["status"] = "expired"
            item["ended_at"] = stale_before_iso
            item["end_reason"] = "idle_timeout"
            await self._repository.upsert_session(item)
            expired_count += 1
        return expired_count


