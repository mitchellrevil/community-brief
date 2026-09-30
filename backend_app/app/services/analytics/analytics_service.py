import uuid
import asyncio
from datetime import UTC, datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Set
from azure.cosmos.exceptions import CosmosHttpResponseError, CosmosResourceNotFoundError

from ...core.logging import get_logger
from ...core.errors.database import ConnectionError as DatabaseConnectionError
from ...repositories.analytics import (
    AnalyticsAuditRepository,
    AnalyticsEventRepository,
    AnalyticsPromptRepository,
    AnalyticsReadRepository,
    AnalyticsSessionRepository,
    AnalyticsUserCountRepository,
)
from ...repositories.users import UserRepository


logger = get_logger(__name__)

ANALYTICS_PARSE_ERRORS = (TypeError, ValueError)
ANALYTICS_SESSION_PARSE_ERRORS = (TypeError, ValueError, KeyError)
ANALYTICS_READ_ERRORS = (
    CosmosHttpResponseError,
    DatabaseConnectionError,
    RuntimeError,
    ValueError,
    TypeError,
)
ANALYTICS_WRITE_ERRORS = (DatabaseConnectionError, RuntimeError, ValueError, TypeError)
USER_LOOKUP_ERRORS = (
    CosmosHttpResponseError,
    DatabaseConnectionError,
    RuntimeError,
    ValueError,
    TypeError,
)


async def resolve_prompt_category_ids_for_business_units(
    prompt_repository: AnalyticsPromptRepository,
    business_unit_ids: Optional[List[str]],
    logger: Any,
) -> List[str]:
    """Resolve prompt category IDs that belong to the given business units."""
    if not business_unit_ids:
        return []

    unique_business_unit_ids = [bu_id for bu_id in dict.fromkeys(business_unit_ids) if bu_id]
    if not unique_business_unit_ids:
        return []

    # Business units are stored as root prompt_category documents. Some analytics
    # records are tagged directly with that root category id, so include it in
    # addition to child categories that carry business_unit_id.
    category_ids = set(unique_business_unit_ids)

    if not prompt_repository.is_available():
        logger.debug(
            "analytics.business_unit_prompt_scope_unavailable",
            business_unit_ids=business_unit_ids,
        )
        return sorted(category_ids)

    try:
        category_ids.update(
            await prompt_repository.list_category_ids_for_business_units(unique_business_unit_ids)
        )
        return sorted(category_ids)
    except CosmosHttpResponseError as exc:
        logger.warning(
            "analytics.business_unit_prompt_scope_query_failed",
            business_unit_ids=unique_business_unit_ids,
            status_code=exc.status_code,
        )
        return sorted(category_ids)


class AnalyticsService:
    def __init__(
        self,
        *,
        user_repository: UserRepository,
        analytics_read_repository: AnalyticsReadRepository,
        analytics_event_repository: AnalyticsEventRepository,
        analytics_session_repository: AnalyticsSessionRepository,
        analytics_audit_repository: AnalyticsAuditRepository,
        analytics_prompt_repository: AnalyticsPromptRepository,
        analytics_user_count_repository: AnalyticsUserCountRepository,
    ):
        self.user_repository = user_repository
        self.analytics_reads = analytics_read_repository
        self.analytics_events = analytics_event_repository
        self.session_reads = analytics_session_repository
        self.audit_reads = analytics_audit_repository
        self.prompt_reads = analytics_prompt_repository
        self.user_counts = analytics_user_count_repository
        self.logger = get_logger(__name__)

        self._analytics_records_available = self.analytics_reads.is_available()
        self._session_records_available = self.session_reads.is_available()


    def close(self):
        self.logger.info("analytics_service.closed")

    async def track_event(self, event_type: str, user_id: str, metadata: Optional[Dict[str, Any]] = None, job_id: Optional[str] = None) -> str:
        # Events container is deprecated; skip event storage
        return ""

    async def track_job_event(self, job_id: str, user_id: str, event_type: str, metadata: Optional[Dict[str, Any]] = None) -> str:
        event_meta = {**(metadata or {}), "job_id": job_id}
        event_id = await self.track_event(event_type=event_type, user_id=user_id, metadata=event_meta, job_id=job_id)

        resolved_user_email: Optional[str] = None
        try:
            user_doc = await self.user_repository.get_by_id(user_id)
            if user_doc:
                resolved_user_email = user_doc.get("email") or user_doc.get("preferred_username")
        except USER_LOOKUP_ERRORS:
            resolved_user_email = None

        try:
            if self._analytics_records_available and (event_type in ("job_created", "job_uploaded") or any(k in (metadata or {}) for k in ("audio_duration_seconds", "audio_duration_minutes", "file_name", "prompt_category_id", "prompt_subcategory_id"))):
                ts_iso = datetime.now(UTC).isoformat()
                ts_ms = int(datetime.now(UTC).timestamp() * 1000)
                analytics_id = f"analytics_job_{ts_ms}"

                audio_seconds = None
                audio_minutes = None
                if metadata:
                    audio_seconds = metadata.get("audio_duration_seconds") or metadata.get("audio_duration")
                    audio_minutes = metadata.get("audio_duration_minutes")

                # If only seconds provided, compute minutes
                if audio_minutes is None and audio_seconds is not None:
                    try:
                        audio_minutes = float(audio_seconds) / 60.0
                    except ANALYTICS_PARSE_ERRORS as exc:
                        self.logger.debug(
                            "analytics.job_event_duration_conversion_failed",
                            job_id=job_id,
                            user_id=user_id,
                            error=str(exc),
                            exc_info=True,
                        )
                        audio_minutes = None

                analytics_doc = {
                    "id": analytics_id,
                    "type": "transcription_analytics",
                    "user_id": user_id,
                    "job_id": job_id,
                    "event_type": event_type,
                    "timestamp": ts_iso,
                    "audio_duration_minutes": float(audio_minutes) if audio_minutes is not None else None,
                    "audio_duration_seconds": float(audio_seconds) if audio_seconds is not None else None,
                    "file_name": (metadata.get("file_name") if metadata else None),
                    "file_extension": (metadata.get("file_extension") if metadata else None),
                    "prompt_category_id": (metadata.get("prompt_category_id") if metadata else None),
                    "prompt_subcategory_id": (metadata.get("prompt_subcategory_id") if metadata else None),
                    "partition_key": user_id,
                }

                if resolved_user_email:
                    analytics_doc["email"] = resolved_user_email

                # Remove keys with None to keep documents compact
                analytics_doc = {k: v for k, v in analytics_doc.items() if v is not None}

                try:
                    await self.analytics_events.create_record(analytics_doc)
                except CosmosHttpResponseError as e:
                    self.logger.warning(
                        "analytics.job_event_record_store_failed",
                        analytics_id=analytics_id,
                        job_id=job_id,
                        user_id=user_id,
                        status_code=e.status_code,
                    )
                except ANALYTICS_WRITE_ERRORS as e:
                    self.logger.error(
                        "analytics.job_event_record_store_unexpected_error",
                        analytics_id=analytics_id,
                        job_id=job_id,
                        error=str(e),
                        exc_info=True,
                    )

        except CosmosHttpResponseError as e:
            # Non-fatal; we already created the lightweight event
            self.logger.warning(
                "analytics.job_event_record_create_cosmos_failed",
                job_id=job_id,
                user_id=user_id,
                status_code=e.status_code,
            )
        except ANALYTICS_WRITE_ERRORS as e:
            # Non-fatal; we already created the lightweight event
            self.logger.error(
                "analytics.job_event_record_create_unexpected_error",
                job_id=job_id,
                user_id=user_id,
                error=str(e),
                exc_info=True,
            )

        return event_id

    def _parse_iso(self, value: Optional[str]) -> Optional[datetime]:
        if not value:
            return None
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                return parsed.replace(tzinfo=timezone.utc)
            return parsed
        except ANALYTICS_PARSE_ERRORS:
            return None

    async def _get_latest_analytics_timestamp(self) -> Optional[str]:
        if not self._analytics_records_available:
            return None

        try:
            return await self.analytics_reads.get_latest_transcription_timestamp()
        except ANALYTICS_READ_ERRORS:
            self.logger.debug("analytics.latest_timestamp_query_failed", exc_info=True)
            return None

    def _session_activity_sort_key(self, doc: Dict[str, Any]) -> datetime:
        for key in ("last_activity", "last_heartbeat", "created_at", "ended_at"):
            dt = self._parse_iso(doc.get(key))
            if dt:
                return dt
        return datetime.min.replace(tzinfo=timezone.utc)

    def _select_canonical_session_doc(self, docs: List[Dict[str, Any]], user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        if not docs:
            return None
        if user_id:
            for doc in docs:
                if doc.get("id") == user_id:
                    return doc
        return max(docs, key=self._session_activity_sort_key)

    def _extract_ip_address(self, session: Dict[str, Any]) -> str:
        ip_address = session.get("ip_address")
        if ip_address:
            return ip_address
        ip_addresses = session.get("ip_addresses") or []
        return ip_addresses[0] if ip_addresses else "Unknown"

    def _parse_platform(self, user_agent: Optional[str]) -> str:
        if not user_agent:
            return "Unknown"
        ua = user_agent.lower()
        if "windows" in ua:
            return "Windows"
        if "iphone" in ua or "ipad" in ua or "ios" in ua:
            return "iOS"
        if "mac" in ua:
            return "macOS"
        if "linux" in ua:
            return "Linux"
        if "android" in ua:
            return "Android"
        return "Unknown"

    def _parse_browser(self, user_agent: Optional[str]) -> str:
        if not user_agent:
            return "Unknown"
        ua = user_agent.lower()
        if "edg" in ua:
            return "Edge"
        if "chrome" in ua and "safari" in ua:
            return "Chrome"
        if "safari" in ua and "chrome" not in ua:
            return "Safari"
        if "firefox" in ua:
            return "Firefox"
        if "msie" in ua or "trident" in ua:
            return "Internet Explorer"
        return "Unknown"

    async def _resolve_session_user_ids(self, user_id: str) -> List[str]:
        candidates = [user_id]
        try:
            user_doc = await self.user_repository.get_by_id(user_id)
        except USER_LOOKUP_ERRORS:
            user_doc = None

        if user_doc:
            for key in ("email", "preferred_username"):
                value = user_doc.get(key)
                if value and value not in candidates:
                    candidates.append(value)

        return candidates

    async def _get_session_docs_for_user(self, user_id: str) -> List[Dict[str, Any]]:
        identifiers = await self._resolve_session_user_ids(user_id)
        for identifier in identifiers:
            items = await self.session_reads.list_user_sessions(identifier)

            if not items:
                items = await self.session_reads.list_user_sessions_by_user_id(identifier)

            if not items:
                direct_item = await self.session_reads.get_session_by_partition(
                    session_id=identifier,
                    partition_key=identifier,
                )
                if direct_item:
                    items = [direct_item]

            if items:
                return items

        return []

    def _normalize_session_ranges(
        self,
        session_doc: Dict[str, Any],
        *,
        stale_cutoff: Optional[datetime] = None,
    ) -> List[Dict[str, Any]]:
        ranges = session_doc.get("session_ranges") or []
        if not ranges:
            ranges = [
                {
                    "range_id": session_doc.get("id"),
                    "start_time": session_doc.get("created_at"),
                    "end_time": session_doc.get("ended_at"),
                    "status": session_doc.get("status"),
                    "end_reason": session_doc.get("end_reason"),
                    "last_activity": session_doc.get("last_activity"),
                    "last_heartbeat": session_doc.get("last_heartbeat"),
                    "activity_count": session_doc.get("activity_count", 0),
                    "total_requests": session_doc.get("total_requests", 0),
                    "ip_addresses": session_doc.get("ip_addresses", []),
                    "ip_address": session_doc.get("ip_address"),
                    "user_agent": session_doc.get("user_agent"),
                }
            ]

        normalized: List[Dict[str, Any]] = []
        for range_item in ranges:
            start_time = range_item.get("start_time") or session_doc.get("created_at")
            last_activity = range_item.get("last_activity") or session_doc.get("last_activity")
            last_heartbeat = range_item.get("last_heartbeat") or session_doc.get("last_heartbeat")
            end_time = range_item.get("end_time") or session_doc.get("ended_at")
            end_ts = end_time or last_activity or last_heartbeat or start_time

            status = range_item.get("status") or session_doc.get("status")
            if not status:
                if session_doc.get("is_active") is True:
                    status = "active"
                elif session_doc.get("is_active") is False:
                    status = "closed"
                else:
                    status = "unknown"
            end_reason = range_item.get("end_reason") or session_doc.get("end_reason")

            if status == "active" and stale_cutoff and last_heartbeat:
                last_dt = self._parse_iso(last_heartbeat)
                if last_dt and last_dt < stale_cutoff:
                    status = "expired"
                    end_reason = end_reason or "idle_timeout"

            duration_minutes = 0.0
            start_dt = self._parse_iso(start_time)
            end_dt = self._parse_iso(end_ts) if end_ts else start_dt
            if start_dt and end_dt:
                duration_minutes = max((end_dt - start_dt).total_seconds() / 60.0, 0.0)

            ip_address = range_item.get("ip_address") or session_doc.get("ip_address")
            ip_addresses = range_item.get("ip_addresses") or session_doc.get("ip_addresses") or []
            user_agent = range_item.get("user_agent") or session_doc.get("user_agent")

            normalized.append(
                {
                    "id": range_item.get("range_id") or session_doc.get("id"),
                    "user_id": session_doc.get("user_id"),
                    "user_email": session_doc.get("user_email"),
                    "status": status,
                    "created_at": start_time,
                    "last_activity": last_activity,
                    "last_heartbeat": last_heartbeat,
                    "ended_at": end_time,
                    "end_reason": end_reason,
                    "ip_address": ip_address,
                    "ip_addresses": ip_addresses,
                    "user_agent": user_agent,
                    "activity_count": range_item.get("activity_count", 0),
                    "total_requests": range_item.get("total_requests", 0),
                    "duration_minutes": round(duration_minutes, 2),
                }
            )

        return normalized

    async def get_user_analytics(self, user_id: str, days: int = 30) -> Dict[str, Any]:
        """
        Get user analytics from persisted analytics records.
        
        IMPORTANT: This queries persisted analytics records, which do NOT have TTL.
        Do not fall back to job documents, which expire and would corrupt analytics history.
        """
        end_dt = datetime.now(UTC)
        start_dt = end_dt - timedelta(days=days)
        minutes_total = 0.0
        jobs_count = 0

        if not self._analytics_records_available:
            self.logger.warning(
                "analytics.user_records_unavailable",
                user_id=user_id,
                days=days,
            )
            return {
                "user_id": user_id,
                "period_days": days,
                "start_date": start_dt.isoformat(),
                "end_date": end_dt.isoformat(),
                "analytics": {
                    "transcription_stats": {
                        "total_minutes": 0.0,
                        "total_jobs": 0,
                        "average_job_duration": 0.0,
                    }
                },
            }

        try:
            items = await self.analytics_reads.list_user_transcription_records(
                user_id=user_id,
                start_time_iso=start_dt.isoformat(),
                end_time_iso=end_dt.isoformat(),
            )
            
            for it in items:
                m = it.get("audio_duration_minutes")
                if m is None and it.get("audio_duration_seconds") is not None:
                    try:
                        m = float(it.get("audio_duration_seconds")) / 60.0
                    except (TypeError, ValueError):
                        m = None
                if isinstance(m, (int, float)):
                    minutes_total += float(m)
                    jobs_count += 1
        except CosmosHttpResponseError as e:
            self.logger.error(
                "analytics.user_summary_query_failed",
                user_id=user_id,
                days=days,
                status_code=e.status_code,
            )
        except ANALYTICS_READ_ERRORS as e:
            self.logger.error(
                "analytics.user_summary_query_unexpected_error",
                user_id=user_id,
                days=days,
                error=str(e),
                exc_info=True,
            )

        avg = (minutes_total / jobs_count) if jobs_count > 0 else 0.0
        return {
            "user_id": user_id,
            "period_days": days,
            "start_date": start_dt.isoformat(),
            "end_date": end_dt.isoformat(),
            "analytics": {
                "transcription_stats": {
                    "total_minutes": float(minutes_total),
                    "total_jobs": int(jobs_count),
                    "average_job_duration": float(avg),
                }
            },
        }

    async def get_admin_sessions(
        self,
        *,
        days: int,
        status: Optional[str],
        user_id: Optional[str],
        limit: int,
        offset: int,
    ) -> Dict[str, Any]:
        if not self._session_records_available:
            return {
                "period_days": days,
                "start_date": None,
                "end_date": None,
                "summary": {
                    "total_sessions": 0,
                    "active_sessions": 0,
                    "expired_sessions": 0,
                    "closed_sessions": 0,
                },
                "items": [],
                "total": 0,
                "limit": limit,
                "offset": offset,
            }

        end_time = datetime.now(UTC)
        start_time = end_time - timedelta(days=days)

        from ...utils.session_lifecycle import heartbeat_threshold_minutes

        stale_minutes = heartbeat_threshold_minutes()
        stale_cutoff_dt = end_time - timedelta(minutes=stale_minutes)

        session_docs = await self.session_reads.list_recent_sessions(
            start_time_iso=start_time.isoformat(),
            user_id=user_id,
        )

        docs_by_user: Dict[str, List[Dict[str, Any]]] = {}
        for doc in session_docs:
            uid = doc.get("user_id")
            if not uid:
                continue
            docs_by_user.setdefault(uid, []).append(doc)

        canonical_docs: List[Dict[str, Any]] = []
        for uid, docs in docs_by_user.items():
            canonical_doc = self._select_canonical_session_doc(docs, user_id=uid)
            if canonical_doc:
                canonical_docs.append(canonical_doc)

        ranges: List[Dict[str, Any]] = []
        for doc in canonical_docs:
            ranges.extend(self._normalize_session_ranges(doc, stale_cutoff=stale_cutoff_dt))

        def _in_window(item: Dict[str, Any]) -> bool:
            end_ts = item.get("ended_at") or item.get("last_activity") or item.get("last_heartbeat") or item.get("created_at")
            end_dt = self._parse_iso(end_ts)
            start_dt = self._parse_iso(item.get("created_at"))
            if end_dt and end_dt < start_time:
                return False
            if start_dt and start_dt > end_time:
                return False
            return True

        ranges = [item for item in ranges if _in_window(item)]

        summary = {
            "total_sessions": len(ranges),
            "active_sessions": len([r for r in ranges if r.get("status") == "active"]),
            "expired_sessions": len([r for r in ranges if r.get("status") == "expired"]),
            "closed_sessions": len([r for r in ranges if r.get("status") == "closed"]),
        }

        if status:
            ranges = [r for r in ranges if r.get("status") == status]

        ranges.sort(
            key=lambda r: self._parse_iso(r.get("created_at")) or datetime.min,
            reverse=True,
        )

        total = len(ranges)
        items = ranges[int(offset): int(offset) + int(limit)]

        return {
            "period_days": days,
            "start_date": start_time.isoformat(),
            "end_date": end_time.isoformat(),
            "summary": summary,
            "items": items,
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    async def get_user_analytics_details(
        self,
        *,
        user_id: str,
        days: int,
        limit: int,
        offset: int,
    ) -> Dict[str, Any]:
        """Return paginated analytics records and aggregates for a single user."""
        end_time = datetime.now(UTC)
        start_time = end_time - timedelta(days=days)

        if not self._analytics_records_available:
            return {
                "user_id": user_id,
                "period_days": days,
                "start_date": start_time.isoformat(),
                "end_date": end_time.isoformat(),
                "analytics": {"total_jobs": 0, "total_minutes": 0.0, "period_days": days},
                "items": [],
                "total": 0,
                "limit": limit,
                "offset": offset,
            }

        start_time_iso = start_time.isoformat()
        end_time_iso = end_time.isoformat()
        count_task = self.analytics_reads.count_user_analytics_records(
            user_id=user_id,
            start_time_iso=start_time_iso,
            end_time_iso=end_time_iso,
        )
        data_task = self.analytics_reads.list_user_analytics_records(
            user_id=user_id,
            start_time_iso=start_time_iso,
            end_time_iso=end_time_iso,
        )

        total_records, items = await asyncio.gather(count_task, data_task)

        items.sort(
            key=lambda item: self._parse_iso(item.get("timestamp") or item.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )
        items = items[int(offset): int(offset) + int(limit)]

        total_minutes = 0.0
        total_jobs = 0
        for item in items:
            minutes = item.get("audio_duration_minutes")
            if isinstance(minutes, (int, float)):
                total_minutes += float(minutes)
            total_jobs += 1

        analytics_summary = {
            "total_jobs": total_jobs,
            "total_minutes": round(total_minutes, 2),
            "period_days": days,
        }

        return {
            "user_id": user_id,
            "period_days": days,
            "start_date": start_time.isoformat(),
            "end_date": end_time.isoformat(),
            "analytics": analytics_summary,
            "items": items,
            "total": total_records,
            "limit": limit,
            "offset": offset,
        }

    async def get_user_session_summary(
        self,
        *,
        user_id: str,
        days: int,
        limit: int,
        offset: int,
    ) -> Dict[str, Any]:
        """Return aggregated session metrics for a user."""
        if not self._session_records_available:
            now = datetime.now(UTC)
            return {
                "user_id": user_id,
                "period_days": days,
                "summary": {
                    "total_sessions": 0,
                    "active_sessions": 0,
                    "total_activity_events": 0,
                    "total_requests": 0,
                    "average_session_duration": 0.0,
                },
                "query_timestamp": now.isoformat(),
            }

        cutoff_time = datetime.now(UTC) - timedelta(days=days)
        cutoff_iso = cutoff_time.isoformat()

        items = await self._get_session_docs_for_user(user_id)

        if not items:
            return {
                "user_id": user_id,
                "period_days": days,
                "summary": {
                    "total_sessions": 0,
                    "active_sessions": 0,
                    "total_activity_events": 0,
                    "total_requests": 0,
                    "average_session_duration": 0.0,
                },
                "query_timestamp": datetime.now(UTC).isoformat(),
            }

        canonical_doc = self._select_canonical_session_doc(items, user_id=user_id)
        if not canonical_doc:
            return {
                "user_id": user_id,
                "period_days": days,
                "summary": {
                    "total_sessions": 0,
                    "active_sessions": 0,
                    "total_activity_events": 0,
                    "total_requests": 0,
                    "average_session_duration": 0.0,
                },
                "query_timestamp": datetime.now(UTC).isoformat(),
            }

        from ...utils.session_lifecycle import heartbeat_threshold_minutes

        stale_cutoff_dt = datetime.now(UTC) - timedelta(minutes=heartbeat_threshold_minutes())
        ranges = self._normalize_session_ranges(canonical_doc, stale_cutoff=stale_cutoff_dt)

        def _in_window(item: Dict[str, Any]) -> bool:
            end_ts = item.get("ended_at") or item.get("last_activity") or item.get("last_heartbeat") or item.get("created_at")
            end_dt = self._parse_iso(end_ts)
            start_dt = self._parse_iso(item.get("created_at"))
            if end_dt and end_dt < cutoff_time:
                return False
            if start_dt and start_dt > datetime.now(UTC):
                return False
            return True

        ranges = [item for item in ranges if _in_window(item)]

        total_sessions = len(ranges)
        active_sessions = len([r for r in ranges if r.get("status") == "active"])
        total_activity = sum(r.get("activity_count", 0) for r in ranges)
        total_requests = sum(r.get("total_requests", 0) for r in ranges)
        session_durations = [r.get("duration_minutes", 0.0) for r in ranges if r.get("duration_minutes") is not None]

        avg_duration = sum(session_durations) / len(session_durations) if session_durations else 0.0

        return {
            "user_id": user_id,
            "period_days": days,
            "summary": {
                "total_sessions": total_sessions,
                "active_sessions": active_sessions,
                "total_activity_events": total_activity,
                "total_requests": total_requests,
                "average_session_duration": round(avg_duration, 2),
            },
            "query_timestamp": datetime.now(UTC).isoformat(),
        }

    async def get_user_session_analytics(self, *, user_id: str, days: int, limit: int, offset: int) -> Dict[str, Any]:
        """Compute comprehensive session analytics for a user. Extracted from router logic."""
        if not self._session_records_available:
            return {
                "user_id": user_id,
                "period_days": days,
                "total_sessions": 0,
                "fetched_sessions": 0,
                "session_timeline": [],
                "security_insights": {},
                "performance_metrics": {},
                "usage_analytics": {},
                "engagement_metrics": {}
            }

        cutoff_time = datetime.now(UTC) - timedelta(days=days)

        items = await self._get_session_docs_for_user(user_id)

        if not items:
            return {
                "user_id": user_id,
                "period_days": days,
                "total_sessions": 0,
                "fetched_sessions": 0,
                "session_timeline": [],
                "security_insights": {},
                "performance_metrics": {},
                "usage_analytics": {},
                "engagement_metrics": {},
            }

        canonical_doc = self._select_canonical_session_doc(items, user_id=user_id)
        if not canonical_doc:
            return {
                "user_id": user_id,
                "period_days": days,
                "total_sessions": 0,
                "fetched_sessions": 0,
                "session_timeline": [],
                "security_insights": {},
                "performance_metrics": {},
                "usage_analytics": {},
                "engagement_metrics": {},
            }

        from ...utils.session_lifecycle import heartbeat_threshold_minutes

        stale_cutoff_dt = datetime.now(UTC) - timedelta(minutes=heartbeat_threshold_minutes())
        ranges_all = self._normalize_session_ranges(canonical_doc, stale_cutoff=stale_cutoff_dt)

        def _in_window(item: Dict[str, Any]) -> bool:
            end_ts = item.get("ended_at") or item.get("last_activity") or item.get("last_heartbeat") or item.get("created_at")
            end_dt = self._parse_iso(end_ts)
            start_dt = self._parse_iso(item.get("created_at"))
            if end_dt and end_dt < cutoff_time:
                return False
            if start_dt and start_dt > datetime.now(UTC):
                return False
            return True

        ranges_all = [item for item in ranges_all if _in_window(item)]
        ranges_all.sort(
            key=lambda r: self._parse_iso(r.get("created_at")) or datetime.min,
            reverse=True,
        )

        total_count = len(ranges_all)
        sessions = ranges_all[int(offset): int(offset) + int(limit)]

        analytics = {
            "user_id": user_id,
            "period_days": days,
            "total_sessions": total_count,
            "fetched_sessions": len(sessions),
            "session_timeline": [],
            "security_insights": {
                "unique_ip_addresses": set(),
                "unique_browsers": set(),
                "unique_platforms": set(),
                "potential_security_events": []
            },
            "performance_metrics": {
                "total_requests": 0,
                "total_activity_events": 0,
                "average_session_duration": 0,
                "longest_session_duration": 0,
                "shortest_session_duration": float('inf'),
                "sessions_by_status": {}
            },
            "usage_analytics": {
                "hourly_distribution": {},
                "daily_distribution": {},
                "browser_distribution": {},
                "platform_distribution": {}
            },
            "engagement_metrics": {
                "highly_active_sessions": 0,
                "medium_active_sessions": 0,
                "brief_sessions": 0,
                "session_consistency_score": 0
            }
        }

        session_durations = []
        last_session_time = None
        session_gaps = []

        for session in sessions:
            try:
                created_at = session.get("created_at")
                last_heartbeat = session.get("last_heartbeat") or session.get("last_activity")
                if not created_at:
                    continue
                created_dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                last_dt = datetime.fromisoformat(last_heartbeat.replace('Z', '+00:00')) if last_heartbeat else created_dt
                duration_minutes = (last_dt - created_dt).total_seconds() / 60
                session_durations.append(duration_minutes)

                user_agent = session.get("user_agent")
                ip_address = self._extract_ip_address(session)
                browser = self._parse_browser(user_agent)
                platform = self._parse_platform(user_agent)

                analytics["security_insights"]["unique_ip_addresses"].add(ip_address)
                analytics["security_insights"]["unique_browsers"].add(browser)
                analytics["security_insights"]["unique_platforms"].add(platform)

                analytics["performance_metrics"]["total_requests"] += session.get("total_requests", 0)
                analytics["performance_metrics"]["total_activity_events"] += session.get("activity_count", 0)

                status = session.get("status", "unknown")
                analytics["performance_metrics"]["sessions_by_status"][status] = analytics["performance_metrics"]["sessions_by_status"].get(status, 0) + 1

                hour = created_dt.hour
                date_str = created_dt.date().isoformat()
                analytics["usage_analytics"]["hourly_distribution"][hour] = analytics["usage_analytics"]["hourly_distribution"].get(hour, 0) + 1
                analytics["usage_analytics"]["daily_distribution"][date_str] = analytics["usage_analytics"]["daily_distribution"].get(date_str, 0) + 1

                analytics["usage_analytics"]["browser_distribution"][browser] = analytics["usage_analytics"]["browser_distribution"].get(browser, 0) + 1
                analytics["usage_analytics"]["platform_distribution"][platform] = analytics["usage_analytics"]["platform_distribution"].get(platform, 0) + 1

                if duration_minutes > 30:
                    analytics["engagement_metrics"]["highly_active_sessions"] += 1
                elif duration_minutes > 5:
                    analytics["engagement_metrics"]["medium_active_sessions"] += 1
                else:
                    analytics["engagement_metrics"]["brief_sessions"] += 1

                timeline_entry = {
                    "session_id": session.get("id"),
                    "start_time": session.get("created_at"),
                    "end_time": last_heartbeat,
                    "duration_minutes": round(duration_minutes, 2),
                    "status": status,
                    "activity_count": session.get("activity_count", 0),
                    "client_info": {"browser": browser, "platform": platform, "ip_address": ip_address}
                }
                analytics["session_timeline"].append(timeline_entry)

                if last_session_time:
                    gap_hours = (last_session_time - created_dt).total_seconds() / 3600
                    session_gaps.append(gap_hours)
                last_session_time = created_dt

                if duration_minutes > 480:
                    analytics["security_insights"]["potential_security_events"].append({"type": "extended_session", "session_id": session.get("id"), "timestamp": session.get("created_at"), "details": f"Session lasted {duration_minutes:.1f} minutes"})

            except ANALYTICS_SESSION_PARSE_ERRORS as exc:
                self.logger.debug(
                    "analytics.session_timeline_entry_skipped",
                    session_id=session.get("id"),
                    user_id=user_id,
                    exc_info=True,
                )
                continue

        if session_durations:
            analytics["performance_metrics"]["average_session_duration"] = round(sum(session_durations) / len(session_durations), 2)
            analytics["performance_metrics"]["longest_session_duration"] = round(max(session_durations), 2)
            analytics["performance_metrics"]["shortest_session_duration"] = round(min(session_durations), 2)

        analytics["security_insights"]["unique_ip_addresses"] = list(analytics["security_insights"]["unique_ip_addresses"])
        analytics["security_insights"]["unique_browsers"] = list(analytics["security_insights"]["unique_browsers"])
        analytics["security_insights"]["unique_platforms"] = list(analytics["security_insights"]["unique_platforms"])

        if session_gaps:
            avg_gap = sum(session_gaps) / len(session_gaps)
            consistency_score = max(0, 100 - min(100, avg_gap * 2))
            analytics["engagement_metrics"]["session_consistency_score"] = round(consistency_score, 1)

        return analytics

    async def get_user_sessions(
        self,
        *,
        user_id: str,
        days: int,
        status: Optional[str],
        limit: int,
        offset: int,
    ) -> Dict[str, Any]:
        if not self._session_records_available:
            return {
                "user_id": user_id,
                "period_days": days,
                "start_date": None,
                "end_date": None,
                "summary": {
                    "total_sessions": 0,
                    "active_sessions": 0,
                    "expired_sessions": 0,
                    "closed_sessions": 0,
                },
                "items": [],
                "total": 0,
                "limit": limit,
                "offset": offset,
            }

        end_time = datetime.now(UTC)
        start_time = end_time - timedelta(days=days)

        session_docs = await self._get_session_docs_for_user(user_id)

        canonical_doc = self._select_canonical_session_doc(session_docs, user_id=user_id)
        if not canonical_doc:
            return {
                "user_id": user_id,
                "period_days": days,
                "start_date": start_time.isoformat(),
                "end_date": end_time.isoformat(),
                "summary": {
                    "total_sessions": 0,
                    "active_sessions": 0,
                    "expired_sessions": 0,
                    "closed_sessions": 0,
                },
                "items": [],
                "total": 0,
                "limit": limit,
                "offset": offset,
            }

        from ...utils.session_lifecycle import heartbeat_threshold_minutes

        stale_cutoff_dt = end_time - timedelta(minutes=heartbeat_threshold_minutes())
        ranges = self._normalize_session_ranges(canonical_doc, stale_cutoff=stale_cutoff_dt)

        def _in_window(item: Dict[str, Any]) -> bool:
            end_ts = item.get("ended_at") or item.get("last_activity") or item.get("last_heartbeat") or item.get("created_at")
            end_dt = self._parse_iso(end_ts)
            start_dt = self._parse_iso(item.get("created_at"))
            if end_dt and end_dt < start_time:
                return False
            if start_dt and start_dt > end_time:
                return False
            return True

        ranges = [item for item in ranges if _in_window(item)]

        summary = {
            "total_sessions": len(ranges),
            "active_sessions": len([r for r in ranges if r.get("status") == "active"]),
            "expired_sessions": len([r for r in ranges if r.get("status") == "expired"]),
            "closed_sessions": len([r for r in ranges if r.get("status") == "closed"]),
        }

        if status:
            ranges = [r for r in ranges if r.get("status") == status]

        ranges.sort(
            key=lambda r: self._parse_iso(r.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )

        total = len(ranges)
        items = ranges[int(offset): int(offset) + int(limit)]

        return {
            "user_id": user_id,
            "period_days": days,
            "start_date": start_time.isoformat(),
            "end_date": end_time.isoformat(),
            "summary": summary,
            "items": items,
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    async def get_user_detailed_sessions(self, *, user_id: str, days: int = 7, limit: int = 50, include_audit: bool = True) -> Dict[str, Any]:
        """Return detailed sessions and optional audit timeline for a user."""
        if not self._session_records_available:
            return {"user_id": user_id, "period_days": days, "detailed_sessions": [], "audit_timeline": [], "summary": {}}

        cutoff_time = datetime.now(UTC) - timedelta(days=days)
        items = await self.session_reads.list_user_sessions(user_id)

        if not items:
            return {"user_id": user_id, "period_days": days, "detailed_sessions": [], "audit_timeline": [], "summary": {}}

        canonical_doc = self._select_canonical_session_doc(items, user_id=user_id)
        if not canonical_doc:
            return {"user_id": user_id, "period_days": days, "detailed_sessions": [], "audit_timeline": [], "summary": {}}

        from ...utils.session_lifecycle import heartbeat_threshold_minutes

        stale_cutoff_dt = datetime.now(UTC) - timedelta(minutes=heartbeat_threshold_minutes())
        ranges_all = self._normalize_session_ranges(canonical_doc, stale_cutoff=stale_cutoff_dt)

        def _in_window(item: Dict[str, Any]) -> bool:
            end_ts = item.get("ended_at") or item.get("last_activity") or item.get("last_heartbeat") or item.get("created_at")
            end_dt = self._parse_iso(end_ts)
            start_dt = self._parse_iso(item.get("created_at"))
            if end_dt and end_dt < cutoff_time:
                return False
            if start_dt and start_dt > datetime.now(UTC):
                return False
            return True

        ranges_all = [item for item in ranges_all if _in_window(item)]
        ranges_all.sort(
            key=lambda r: self._parse_iso(r.get("created_at")) or datetime.min,
            reverse=True,
        )

        sessions = ranges_all[: int(limit)]

        detailed_sessions = []
        for session in sessions:
            try:
                created_at = session.get("created_at")
                last_heartbeat = session.get("last_heartbeat") or session.get("last_activity")
                if not created_at or not last_heartbeat:
                    continue
                created_dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                last_dt = datetime.fromisoformat(last_heartbeat.replace('Z', '+00:00'))
                duration_minutes = (last_dt - created_dt).total_seconds() / 60
                user_agent = session.get("user_agent")
                ip_address = self._extract_ip_address(session)
                browser = self._parse_browser(user_agent)
                platform = self._parse_platform(user_agent)
                detailed_sessions.append({
                    "session_id": session.get("id"),
                    "created_at": created_at,
                    "last_heartbeat": last_heartbeat,
                    "status": session.get("status", "unknown"),
                    "duration_minutes": round(duration_minutes, 2),
                    "activity_count": session.get("activity_count", 0),
                    "client_info": {
                        "browser": browser,
                        "platform": platform,
                        "ip_address": ip_address,
                        "user_agent": user_agent or "Unknown"
                    },
                    "total_requests": session.get("total_requests", 0),
                    "is_active": session.get("status") == "active"
                })
            except ANALYTICS_SESSION_PARSE_ERRORS as exc:
                self.logger.debug(
                    "analytics.detailed_session_entry_skipped",
                    session_id=session.get("id"),
                    user_id=user_id,
                    exc_info=True,
                )
                continue

        audit_timeline = []
        if include_audit and self.audit_reads.is_available():
            try:
                audit_logs = await self.audit_reads.list_user_audit_logs(
                    user_id=user_id,
                    cutoff_time_iso=cutoff_time.isoformat(),
                    limit=100,
                )
                for audit in audit_logs:
                    audit_timeline.append({
                        "id": audit.get("id"),
                        "timestamp": audit.get("timestamp"),
                        "event_type": audit.get("event_type"),
                        "resource": audit.get("resource"),
                        "details": audit.get("details", {}),
                        "ip_address": audit.get("ip_address"),
                        "user_agent": audit.get("user_agent")
                    })
            except ANALYTICS_READ_ERRORS as exc:
                self.logger.warning(
                    "analytics.audit_timeline_load_failed",
                    user_id=user_id,
                    days=days,
                    error=str(exc),
                    exc_info=True,
                )
                audit_timeline = []

        summary = {
            "total_activity_events": sum(s.get("activity_count", 0) for s in sessions),
            "total_session_duration": sum(s.get("duration_minutes", 0) for s in detailed_sessions),
            "unique_browsers": len(set(s.get("client_info", {}).get("browser") for s in detailed_sessions)),
            "unique_ip_addresses": len(set(s.get("client_info", {}).get("ip_address") for s in detailed_sessions)),
        }

        return {
            "user_id": user_id,
            "period_days": days,
            "query_limit": limit,
            "total_sessions_returned": len(detailed_sessions),
            "total_audit_entries": len(audit_timeline),
            "detailed_sessions": detailed_sessions,
            "audit_timeline": audit_timeline,
            "summary": summary
        }

    async def get_user_minutes_response(self, user_id: str, days: int = 30) -> Dict[str, Any]:
        """Return minutes processed for a user in the UserMinutesResponse structure."""
        return await self.get_user_minutes_records(user_id=user_id, days=days)

    async def get_user_minutes_records(self, user_id: str, days: int = 30) -> Dict[str, Any]:
        end_dt = datetime.now(UTC)
        start_dt = end_dt - timedelta(days=days)
        records: List[Dict[str, Any]] = []
        # Query only analytics persistence for transcription analytics records. Do not
        # fall back to job documents; analytics must come from persisted analytics records.
        if self._analytics_records_available:
            try:
                analytics_records = await self.analytics_reads.list_user_duration_records(
                    user_id=user_id,
                    start_time_iso=start_dt.isoformat(),
                    end_time_iso=end_dt.isoformat(),
                )
                for it in analytics_records:
                    minutes = it.get("audio_duration_minutes")
                    if minutes is None and it.get("audio_duration_seconds") is not None:
                        try:
                            minutes = float(it.get("audio_duration_seconds")) / 60.0
                        except ANALYTICS_PARSE_ERRORS as exc:
                            self.logger.debug(
                                "analytics.user_minutes_duration_conversion_failed",
                                user_id=user_id,
                                job_id=it.get("job_id"),
                                error=str(exc),
                                exc_info=True,
                            )
                            minutes = None
                    if minutes is None:
                        continue
                    records.append(
                        {
                            "job_id": it.get("job_id"),
                            "timestamp": it.get("timestamp"),
                            "event_type": it.get("event_type"),
                            "audio_duration_minutes": float(minutes),
                            "file_name": it.get("file_name"),
                            "prompt_category_id": it.get("prompt_category_id"),
                            "prompt_subcategory_id": it.get("prompt_subcategory_id"),
                        }
                    )
            except CosmosHttpResponseError as e:
                    # If analytics record query fails, return empty records (no jobs fallback)
                self.logger.warning(
                    "analytics.user_minutes_query_failed",
                    user_id=user_id,
                    days=days,
                    status_code=e.status_code,
                )
            except ANALYTICS_READ_ERRORS as e:
                self.logger.error(
                    "analytics.user_minutes_query_unexpected_error",
                    user_id=user_id,
                    days=days,
                    error=str(e),
                    exc_info=True,
                )

        total_minutes = sum(r.get("audio_duration_minutes", 0.0) for r in records)
        records.sort(key=lambda r: r.get("timestamp") or "", reverse=True)
        return {"user_id": user_id, "period_days": days, "start_date": start_dt.isoformat(), "end_date": end_dt.isoformat(), "total_minutes": total_minutes, "total_records": len(records), "records": records}

    async def get_system_analytics(self, days: int = 30, business_unit_ids: Optional[List[str]] = None) -> Dict[str, Any]:
        """Return comprehensive system-level analytics including:
        - Raw analytics records
        - User activity aggregation (with user_ids)
        - Prompt usage leaderboard (with category names fetched)
        - Recent jobs (formatted with user emails and prompt names)
        - Active users count (from sessions in last 24h)
        - Peak active users
        """
        end_dt = datetime.now(UTC)
        start_dt = end_dt - timedelta(days=days)
        records: List[Dict[str, Any]] = []
        total_minutes = 0.0
        total_jobs = 0
        latest_available_timestamp: Optional[str] = None
        allowed_prompt_category_ids: Set[str] = set()

        if business_unit_ids:
            allowed_prompt_category_ids = set(
                await resolve_prompt_category_ids_for_business_units(
                    self.prompt_reads,
                    business_unit_ids,
                    self.logger,
                )
            )
            if not allowed_prompt_category_ids:
                allowed_prompt_category_ids = {bu_id for bu_id in business_unit_ids if bu_id}

        try:
            if self._analytics_records_available:
                analytics_records = await self.analytics_reads.list_system_analytics_records(
                    start_time_iso=start_dt.isoformat(),
                    end_time_iso=end_dt.isoformat(),
                    prompt_category_ids=sorted(allowed_prompt_category_ids) if business_unit_ids else None,
                )

                for it in analytics_records:
                    minutes = it.get('audio_duration_minutes')
                    if minutes is None and it.get('audio_duration_seconds') is not None:
                        try:
                            minutes = float(it.get('audio_duration_seconds')) / 60.0
                        except ANALYTICS_PARSE_ERRORS as exc:
                            self.logger.debug(
                                "analytics.system_duration_conversion_failed",
                                record_id=it.get("id"),
                                error=str(exc),
                                exc_info=True,
                            )
                            minutes = None
                    # Include record even without duration for comprehensive data
                    record = {
                        'id': it.get('id'),
                        'job_id': it.get('job_id') or it.get('id'),
                        'user_id': it.get('user_id'),
                        'timestamp': it.get('timestamp') or it.get('created_at'),
                        'audio_duration_minutes': float(minutes) if minutes is not None else 0.0,
                        'file_name': it.get('file_name'),
                        'prompt_category_id': it.get('prompt_category_id'),
                        'prompt_subcategory_id': it.get('prompt_subcategory_id'),
                        'prompt_id': it.get('prompt_id'),  # Fallback field
                    }
                    records.append(record)
                    if minutes is not None:
                        total_minutes += float(minutes)
                        total_jobs += 1
        except CosmosHttpResponseError as e:
            # Non-fatal: we'll try fallback below
            self.logger.warning(
                "analytics.system_records_query_failed",
                days=days,
                status_code=e.status_code,
            )
        except ANALYTICS_READ_ERRORS as e:
            self.logger.error(
                "analytics.system_records_query_unexpected_error",
                days=days,
                error=str(e),
                exc_info=True,
            )

        # DO NOT FALL BACK TO JOB DOCUMENTS.
        # They expire, so using them would corrupt analytics history.
        # If analytics records are not in analytics persistence, they should not be retrieved
        # as using expired job data would invalidate the analytics feature.
        # All transcription events should be stored as analytics records by track_job_event().
        if not records:
            latest_available_timestamp = await self._get_latest_analytics_timestamp()
            if latest_available_timestamp:
                self.logger.info(
                    "analytics.system_records_period_empty",
                    days=days,
                    business_unit_ids=business_unit_ids,
                    start_date=start_dt.isoformat(),
                    end_date=end_dt.isoformat(),
                    latest_available_timestamp=latest_available_timestamp,
                )
            else:
                self.logger.warning(
                    "analytics.system_records_empty",
                    days=days,
                    business_unit_ids=business_unit_ids,
                    start_date=start_dt.isoformat(),
                    end_date=end_dt.isoformat(),
                )

        # Aggregate user activity
        user_activity = {}
        for item in records:
            user_id = item.get("user_id")
            if user_id:
                if user_id not in user_activity:
                    user_activity[user_id] = {
                        "user_id": user_id,
                        "total_jobs": 0,
                        "total_minutes": 0.0,
                    }
                user_activity[user_id]["total_jobs"] += 1
                minutes = item.get("audio_duration_minutes", 0)
                if isinstance(minutes, (int, float)):
                    user_activity[user_id]["total_minutes"] += minutes

        users_list = sorted(user_activity.values(), key=lambda x: x["total_jobs"], reverse=True)

        # Aggregate prompt usage
        prompt_usage = {}
        for item in records:
            prompt_id = item.get("prompt_category_id") or item.get("prompt_id")
            if prompt_id:
                if prompt_id not in prompt_usage:
                    prompt_usage[prompt_id] = {
                        "prompt_id": prompt_id,
                        "total_jobs": 0,
                        "total_minutes": 0.0,
                    }
                prompt_usage[prompt_id]["total_jobs"] += 1
                minutes = item.get("audio_duration_minutes", 0)
                if isinstance(minutes, (int, float)):
                    prompt_usage[prompt_id]["total_minutes"] += minutes

        prompts_list = sorted(prompt_usage.values(), key=lambda x: x["total_jobs"], reverse=True)

        # Fetch category names for prompts
        category_name_map = {}
        try:
            if self.prompt_reads.is_available():
                category_ids = [p["prompt_id"] for p in prompts_list if p.get("prompt_id")]
                category_name_map = await self.prompt_reads.get_category_names(category_ids)
        except ANALYTICS_READ_ERRORS as e:
            self.logger.warning(
                "analytics.category_names_fetch_failed",
                error=str(e),
                error_type=type(e).__name__,
            )

        # Add names to prompts and convert to final format
        for prompt in prompts_list:
            prompt["prompt_name"] = category_name_map.get(prompt["prompt_id"], prompt["prompt_id"])
            del prompt["prompt_id"]

        # Resolve user emails via repository point reads to avoid cross-partition query pitfalls.
        user_email_map: Dict[str, str] = {}
        # Only resolve emails for records that don't have one yet (or have a known-bad fallback)
        user_ids_all = sorted(
            {
                item.get("user_id")
                for item in records
                if item.get("user_id")
                and (not item.get("email") or item.get("email") == item.get("user_id"))
            }
        )
        if user_ids_all:
            max_concurrent_user_lookups = 10
            semaphore = asyncio.Semaphore(min(max_concurrent_user_lookups, len(user_ids_all)))

            async def _lookup_user_email(user_id: str) -> Optional[tuple[str, str]]:
                async with semaphore:
                    try:
                        user_doc = await self.user_repository.get_by_id(user_id)
                        if not user_doc:
                            return (user_id, user_id)
                        email = user_doc.get("email") or user_doc.get("preferred_username")
                        return (user_id, email or user_id)
                    except USER_LOOKUP_ERRORS as exc:
                        self.logger.debug(
                            "analytics.system_user_email_resolve_failed",
                            user_id=user_id,
                            error=str(exc),
                            exc_info=True,
                        )
                        return (user_id, user_id)

            try:
                results = await asyncio.gather(*(_lookup_user_email(uid) for uid in user_ids_all))
                for pair in results:
                    if not pair:
                        continue
                    uid, email = pair
                    user_email_map[uid] = email
            except ANALYTICS_READ_ERRORS as exc:
                self.logger.warning(
                    "analytics.system_user_email_batch_lookup_failed",
                    error=str(exc),
                    exc_info=True,
                )

        # Attach email to each record for client display
        for item in records:
            uid = item.get("user_id")
            if not uid:
                continue
            existing_email = item.get("email")
            if not existing_email or existing_email == uid:
                item["email"] = user_email_map.get(uid, uid)

        # Get recent jobs (last 10)
        recent_jobs_raw = sorted(records, key=lambda x: x.get("timestamp", ""), reverse=True)[:10]

        # Format recent jobs
        recent_jobs = [
            {
                "id": str(item.get("id", "")),
                "job_id": str(item.get("job_id", "") or item.get("id", "")),
                "user_id": str(item.get("user_id", "")),
                "email": user_email_map.get(item.get("user_id"), item.get("user_id", "")),
                "timestamp": item.get("timestamp", ""),
                "file_name": item.get("file_name", ""),
                "audio_duration_minutes": float(item.get("audio_duration_minutes", 0)) if item.get("audio_duration_minutes") else 0,
                "prompt_id": str(item.get("prompt_category_id", "")) if item.get("prompt_category_id") else str(item.get("prompt_id", "")) if item.get("prompt_id") else None,
                "prompt_name": category_name_map.get(
                    item.get("prompt_category_id") or item.get("prompt_id"),
                    item.get("prompt_category_id") or item.get("prompt_id") or "Unknown"
                ),
            }
            for item in recent_jobs_raw
        ]

        # Calculate active users (last 24 hours) - filter by business units if specified
        active_user_set = set()
        try:
            if self.session_reads.is_available():
                recent_cutoff = datetime.now(UTC) - timedelta(hours=24)
                active_user_set.update(
                    await self.session_reads.list_active_user_ids_since(recent_cutoff.isoformat())
                )
        except CosmosHttpResponseError as e:
            self.logger.warning(
                "analytics.active_users_query_failed",
                status_code=e.status_code,
            )
        except ANALYTICS_READ_ERRORS as e:
            self.logger.error(
                "analytics.active_users_query_unexpected_error",
                error=str(e),
                exc_info=True,
            )

        active_users = len(active_user_set)
        
        # Calculate total users in the filtered business units
        total_users_count = 0
        try:
            if self.user_counts.is_available():
                total_users_count = await self.user_counts.count_users(business_unit_ids)
        except CosmosHttpResponseError as e:
            self.logger.warning(
                "analytics.total_users_query_failed",
                status_code=e.status_code,
            )
        except ANALYTICS_READ_ERRORS as e:
            self.logger.error(
                "analytics.total_users_query_unexpected_error",
                error=str(e),
                exc_info=True,
            )

        return {
            'period_days': days,
            'start_date': start_dt.isoformat(),
            'end_date': end_dt.isoformat(),
            'analytics': {
                'records': records,
                'total_minutes': total_minutes,
                'total_jobs': total_jobs,
                'active_users': active_users,
                'total_users': total_users_count,
                'users': users_list,
                'unique_user_count': len(user_activity),
                'prompts': prompts_list,
                'unique_prompt_count': len(prompt_usage),
                'recent_jobs': recent_jobs,
                'has_historical_data': latest_available_timestamp is not None,
                'latest_available_timestamp': latest_available_timestamp,
            }
        }

    async def get_recent_jobs(self, limit: int = 10, prompt_id: Optional[str] = None) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        if not self._analytics_records_available:
            return results
        try:
            results.extend(
                await self.analytics_reads.list_recent_jobs(
                    limit=limit,
                    prompt_id=prompt_id,
                )
            )
        except CosmosHttpResponseError as e:
            self.logger.warning(
                "analytics.recent_jobs_query_failed",
                limit=limit,
                prompt_id=prompt_id,
                status_code=e.status_code,
            )
            return []
        except ANALYTICS_READ_ERRORS as e:
            self.logger.error(
                "analytics.recent_jobs_query_unexpected_error",
                limit=limit,
                prompt_id=prompt_id,
                error=str(e),
                exc_info=True,
            )
            return []
        return results
