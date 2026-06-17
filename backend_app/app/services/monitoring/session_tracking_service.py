"""
Session Tracking Service - per-session tracking (multiple sessions per user)
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Dict, Any, Optional, List
import time

from azure.cosmos.exceptions import CosmosHttpResponseError

from ...core.logging import get_logger
from ...config.audit_config import DEFAULT_SESSION_TIMEOUT_MINUTES
from ...utils.ip_utils import normalize_ip_prefix
from ...utils.session_lifecycle import compute_expires_at, heartbeat_threshold_minutes

SESSION_TRACKING_RUNTIME_ERRORS = (RuntimeError, TypeError, ValueError, KeyError)


def _coerce_count(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


class SessionTrackingService:
    def __init__(
        self,
        persistence_adapter,  # implements SessionPersistenceAdapter protocol
        session_timeout_minutes: int = DEFAULT_SESSION_TIMEOUT_MINUTES
    ):
        self._persistence = persistence_adapter
        self.logger = get_logger(__name__)
        self.session_timeout_minutes = session_timeout_minutes
        self._last_update_by_user: Dict[str, float] = {}
        self._last_session_id_by_user: Dict[str, str] = {}
        self._min_heartbeat_seconds = 60

    def _ensure_ranges(self, session_item: Dict[str, Any]) -> List[Dict[str, Any]]:
        ranges = session_item.get("session_ranges")
        if not isinstance(ranges, list):
            ranges = []
        session_item["session_ranges"] = ranges
        return ranges

    def _get_latest_range(self, session_item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        ranges = self._ensure_ranges(session_item)
        return ranges[-1] if ranges else None

    def _start_new_range(
        self,
        session_item: Dict[str, Any],
        *,
        timestamp: datetime,
        user_agent: str,
        normalized_ip: Optional[str],
    ) -> Dict[str, Any]:
        ranges = self._ensure_ranges(session_item)
        range_item = {
            "range_id": str(uuid.uuid4()),
            "start_time": timestamp.isoformat(),
            "end_time": None,
            "status": "active",
            "end_reason": None,
            "last_activity": timestamp.isoformat(),
            "last_heartbeat": timestamp.isoformat(),
            "activity_count": 1,
            "total_requests": 1,
            "ip_addresses": [normalized_ip] if normalized_ip else [],
            "ip_address": normalized_ip,
            "user_agent": user_agent,
        }
        ranges.append(range_item)
        return range_item

    def _update_active_range(
        self,
        range_item: Dict[str, Any],
        *,
        timestamp: datetime,
        user_agent: str,
        normalized_ip: Optional[str],
    ) -> None:
        range_item["last_activity"] = timestamp.isoformat()
        range_item["last_heartbeat"] = timestamp.isoformat()
        range_item["status"] = "active"
        range_item["end_reason"] = None

        ips = range_item.get("ip_addresses", [])
        MAX_IP_ADDRESSES = 10
        if normalized_ip:
            if normalized_ip not in ips:
                ips.append(normalized_ip)
                if len(ips) > MAX_IP_ADDRESSES:
                    ips = ips[-MAX_IP_ADDRESSES:]
            range_item["ip_addresses"] = ips
            range_item["ip_address"] = normalized_ip

        range_item["activity_count"] = _coerce_count(range_item.get("activity_count")) + 1
        range_item["total_requests"] = _coerce_count(range_item.get("total_requests")) + 1
        range_item["user_agent"] = user_agent

    async def get_or_create_session(
        self,
        user_id: str,
        user_email: Optional[str] = None,
        user_agent: str = "",
        ip_address: str = "",
        timestamp: Optional[datetime] = None
    ) -> Optional[str]:
        # If persistence adapter is a noop or missing, just skip session persistence
        if self._persistence is None:
            self.logger.debug("Session persistence not configured, skipping session tracking")
            return None
            
        if timestamp is None:
            timestamp = datetime.now(UTC)

        # Lightweight throttle: avoid read/write on every request
        now_monotonic = time.monotonic()
        last_update = self._last_update_by_user.get(user_id)
        if last_update is not None and (now_monotonic - last_update) < self._min_heartbeat_seconds:
            return self._last_session_id_by_user.get(user_id)

        active_session: Optional[Dict[str, Any]] = None
        session_item: Optional[Dict[str, Any]] = None
        try:
            active_session = await self._persistence.get_active_session(user_id)

            if active_session and self._is_expired(active_session, timestamp):
                await self._expire_session(active_session, timestamp, reason="idle_timeout")
                active_session = None

            session_item = active_session
            if session_item is None:
                session_item = await self._persistence.get_session(user_id, user_id=user_id)

            normalized_ip = normalize_ip_prefix(ip_address) if ip_address else None

            if session_item is None:
                session_item = {
                    "id": user_id,
                    "user_id": user_id,
                    "user_email": user_email or user_id,
                    "partition_key": user_id,
                    "type": "session",
                    "status": "active",
                    "created_at": timestamp.isoformat(),
                    "last_activity": timestamp.isoformat(),
                    "last_heartbeat": timestamp.isoformat(),
                    "user_agent": user_agent,
                    "ip_address": normalized_ip,
                    "expires_at": compute_expires_at(timestamp, timeout_minutes=self.session_timeout_minutes),
                    "activity_count": 1,
                    "total_requests": 1,
                    "ip_addresses": [normalized_ip] if normalized_ip else [],
                    "session_ranges": [],
                }
                self._start_new_range(
                    session_item,
                    timestamp=timestamp,
                    user_agent=user_agent,
                    normalized_ip=normalized_ip,
                )
                self.logger.info("session.created", user_id=user_id)
            else:
                # Force canonical document shape (single record per user)
                session_item["id"] = user_id
                session_item["partition_key"] = user_id

                session_item.pop("last_endpoint", None)
                session_item.pop("endpoints_accessed", None)
                session_item.pop("session_metadata", None)

                ranges = session_item.get("session_ranges") or []
                for range_item in ranges:
                    range_item.pop("last_endpoint", None)
                    range_item.pop("endpoints_accessed", None)
                    range_item["activity_count"] = _coerce_count(range_item.get("activity_count"))
                    range_item["total_requests"] = _coerce_count(range_item.get("total_requests"))
                session_item["session_ranges"] = ranges

                if not session_item.get("created_at"):
                    session_item["created_at"] = timestamp.isoformat()

                latest_range = self._get_latest_range(session_item)
                if latest_range and latest_range.get("status") == "active":
                    self._update_active_range(
                        latest_range,
                        timestamp=timestamp,
                        user_agent=user_agent,
                        normalized_ip=normalized_ip,
                    )
                else:
                    self._start_new_range(
                        session_item,
                        timestamp=timestamp,
                        user_agent=user_agent,
                        normalized_ip=normalized_ip,
                    )

                session_item["last_activity"] = timestamp.isoformat()
                session_item["last_heartbeat"] = timestamp.isoformat()
                session_item["user_agent"] = user_agent
                session_item["status"] = "active"
                session_item["expires_at"] = compute_expires_at(timestamp, timeout_minutes=self.session_timeout_minutes)

                ips = session_item.get("ip_addresses", [])
                MAX_IP_ADDRESSES = 10
                if normalized_ip:
                    if normalized_ip not in ips:
                        ips.append(normalized_ip)
                        if len(ips) > MAX_IP_ADDRESSES:
                            ips = ips[-MAX_IP_ADDRESSES:]
                    session_item["ip_addresses"] = ips
                    session_item["ip_address"] = normalized_ip

                session_item["activity_count"] = _coerce_count(session_item.get("activity_count")) + 1
                session_item["total_requests"] = _coerce_count(session_item.get("total_requests")) + 1

                self.logger.debug("session_heartbeat_updated", user_id=user_id)

            # Atomic upsert via the persistence adapter
            await self._persistence.upsert_session(session_item)
            session_id = session_item.get("id")
            if session_id:
                self._last_update_by_user[user_id] = now_monotonic
                self._last_session_id_by_user[user_id] = session_id
            return session_id
            
        except CosmosHttpResponseError as e:
            self.logger.error(
                "Failed to upsert session in Cosmos DB",
                exc_info=True,
                user_id=user_id,
                status_code=e.status_code,
                error_message=str(e),
            )
            return None
        except SESSION_TRACKING_RUNTIME_ERRORS:
            self.logger.error(
                "Unexpected error upserting session",
                exc_info=True,
                user_id=user_id,
            )
            return None

    async def _get_session(self, session_id: str, user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Get session by user_id (which is also the session ID).
        
        Returns:
            Session document if exists, None otherwise
        """
        try:
            result = await self._persistence.get_session(session_id, user_id=user_id)
            return result
        except (CosmosHttpResponseError, *SESSION_TRACKING_RUNTIME_ERRORS):
            self.logger.error(
                "Unexpected error reading session",
                exc_info=True,
                session_id=session_id,
                user_id=user_id,
            )
            return None

    def _is_expired(self, session_item: Dict[str, Any], timestamp: datetime) -> bool:
        try:
            expires_at = session_item.get("expires_at")
            comparison_time = timestamp
            if comparison_time.tzinfo is None:
                comparison_time = comparison_time.replace(tzinfo=UTC)
            if expires_at:
                expires_dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
                if expires_dt < comparison_time:
                    return True
            last_heartbeat = session_item.get("last_heartbeat") or session_item.get("last_activity")
            if not last_heartbeat:
                return False
            last_dt = datetime.fromisoformat(last_heartbeat.replace("Z", "+00:00"))
            minutes_since = (comparison_time - last_dt).total_seconds() / 60.0
            return minutes_since > heartbeat_threshold_minutes(self.session_timeout_minutes)
        except (TypeError, ValueError):
            return False

    async def _expire_session(self, session_item: Dict[str, Any], timestamp: datetime, *, reason: str) -> None:
        session_item["status"] = "expired"
        session_item["ended_at"] = timestamp.isoformat()
        session_item["end_reason"] = reason
        latest_range = self._get_latest_range(session_item)
        if latest_range and latest_range.get("status") == "active":
            latest_range["status"] = "expired"
            latest_range["end_time"] = timestamp.isoformat()
            latest_range["end_reason"] = reason
        await self._persistence.upsert_session(session_item)

    async def deactivate_session(self, user_id: str) -> bool:
        """
        Mark a session as inactive (user logout only).
        
        Note: Stale/expired sessions are handled by Azure Function cleanup.
        This method is only for explicit user logout actions.
        
        Args:
            session_id: Session identifier (user_id)
            
        Returns:
            True if successful, False otherwise
        """
        if self._persistence is None:
            return False

        session_item: Optional[Dict[str, Any]] = None
        try:
            session_item = await self._persistence.get_active_session(user_id)
            if not session_item:
                self.logger.debug("active_session_not_found", user_id=user_id)
                return False

            # Only close if user explicitly logs out
            session_item["status"] = "closed"
            session_item["ended_at"] = datetime.now(UTC).isoformat()
            session_item["end_reason"] = "user_logout"

            latest_range = self._get_latest_range(session_item)
            if latest_range and latest_range.get("status") == "active":
                latest_range["status"] = "closed"
                latest_range["end_time"] = session_item["ended_at"]
                latest_range["end_reason"] = "user_logout"

            await self._persistence.upsert_session(session_item)
            self.logger.info("session.deactivated", user_id=user_id)
            return True
            
        except CosmosHttpResponseError as e:
            self.logger.error(
                "Failed to deactivate session in Cosmos DB",
                exc_info=True,
                session_id=session_item.get("id") if session_item else None,
                status_code=e.status_code,
            )
            return False
        except SESSION_TRACKING_RUNTIME_ERRORS:
            self.logger.error(
                "Unexpected error deactivating session",
                exc_info=True,
                session_id=session_item.get("id") if session_item else None,
                user_id=user_id,
            )
            return False

    async def get_session_info(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get current session information for a user.
        
        Args:
            user_id: User identifier
            
        Returns:
            Session information if exists, None otherwise
        """
        return await self._persistence.get_active_session(user_id)

    async def is_session_active(self, user_id: str) -> bool:
        """
        Check if user has an active session.
        
        Args:
            user_id: User identifier
            
        Returns:
            True if active session exists, False otherwise
        """
        session = await self._persistence.get_active_session(user_id)
        if not session:
            return False
        
        # Check status
        if session.get("status") != "active":
            return False
        
        # Check expiration
        try:
            expires_at = datetime.fromisoformat(session["expires_at"].replace('Z', '+00:00'))
            if expires_at < datetime.now(UTC):
                return False
        except (ValueError, KeyError):
            return False
        
        return True

    async def expire_stale_sessions(self, *, stale_before_iso: str) -> int:
        """Expire stale sessions before the provided ISO timestamp.

        Returns the number of sessions expired.
        """
        if self._persistence is None:
            return 0
        try:
            return await self._persistence.expire_stale_sessions(stale_before_iso)
        except (CosmosHttpResponseError, *SESSION_TRACKING_RUNTIME_ERRORS):
            self.logger.debug("Failed to expire stale sessions", exc_info=True)
            return 0
