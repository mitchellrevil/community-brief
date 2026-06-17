from __future__ import annotations

from inspect import isawaitable
from typing import Any, Dict, List, Optional

from azure.core.exceptions import AzureError
from azure.cosmos.exceptions import CosmosHttpResponseError, CosmosResourceNotFoundError

from ..core.cosmos import CosmosService


def _container_is_available(cosmos_service: CosmosService, container_name: str) -> bool:
    try:
        container = cosmos_service.get_container(container_name)
    except RuntimeError:
        return hasattr(cosmos_service, "get_container")
    except (AzureError, CosmosHttpResponseError, TypeError, ValueError):
        return False

    if isawaitable(container):
        close = getattr(container, "close", None)
        if callable(close):
            close()
        return True

    return container is not None


class AnalyticsReadRepository:
    """Cosmos reads for persisted analytics records."""

    def __init__(self, cosmos_service: CosmosService):
        self.cosmos = cosmos_service

    @property
    def container(self):
        return self.cosmos.get_container("analytics")

    def is_available(self) -> bool:
        return _container_is_available(self.cosmos, "analytics")

    def query_items(
        self,
        *,
        query: str,
        parameters: Optional[List[Dict[str, Any]]] = None,
        **kwargs: Any,
    ):
        return self.container.query_items(query=query, parameters=parameters, **kwargs)

    async def _collect_query(
        self,
        *,
        query: str,
        parameters: Optional[List[Dict[str, Any]]] = None,
        **kwargs: Any,
    ) -> List[Dict[str, Any]]:
        iterator = self.query_items(query=query, parameters=parameters, **kwargs)
        if isawaitable(iterator):
            iterator = await iterator
        return [item async for item in iterator]

    async def get_latest_transcription_timestamp(self) -> Optional[str]:
        query = (
            "SELECT TOP 1 c.id, c.timestamp, c.created_at FROM c "
            "WHERE c.type = @type ORDER BY c.timestamp DESC"
        )
        parameters = [{"name": "@type", "value": "transcription_analytics"}]
        items = await self._collect_query(
            query=query,
            parameters=parameters,
            partition_key="transcription_analytics",
        )
        if not items:
            return None
        latest_item = items[0]
        return latest_item.get("timestamp") or latest_item.get("created_at")

    async def list_user_transcription_records(
        self,
        *,
        user_id: str,
        start_time_iso: str,
        end_time_iso: str,
    ) -> List[Dict[str, Any]]:
        query = (
            "SELECT * FROM c "
            "WHERE c.type = 'transcription_analytics' "
            "AND c.user_id = @user_id "
            "AND c.timestamp >= @start_time AND c.timestamp <= @end_time"
        )
        parameters = [
            {"name": "@user_id", "value": user_id},
            {"name": "@start_time", "value": start_time_iso},
            {"name": "@end_time", "value": end_time_iso},
        ]
        return await self._collect_query(query=query, parameters=parameters)

    async def list_user_duration_records(
        self,
        *,
        user_id: str,
        start_time_iso: str,
        end_time_iso: str,
    ) -> List[Dict[str, Any]]:
        query = (
            "SELECT * "
            "FROM c WHERE c.user_id = @user_id AND c.timestamp >= @start_date AND c.timestamp <= @end_date AND c.type = 'transcription_analytics' "
            "AND (IS_DEFINED(c.audio_duration_minutes) OR IS_DEFINED(c.audio_duration_seconds))"
        )
        parameters = [
            {"name": "@user_id", "value": user_id},
            {"name": "@start_date", "value": start_time_iso},
            {"name": "@end_date", "value": end_time_iso},
        ]
        return await self._collect_query(query=query, parameters=parameters)

    def _user_analytics_window_filter(self) -> str:
        return (
            "((IS_DEFINED(c.timestamp) AND c.timestamp >= @start_time AND c.timestamp <= @end_time) "
            "OR (IS_DEFINED(c.created_at) AND c.created_at >= @start_time AND c.created_at <= @end_time))"
        )

    def _user_analytics_window_parameters(
        self,
        *,
        user_id: str,
        start_time_iso: str,
        end_time_iso: str,
    ) -> List[Dict[str, Any]]:
        return [
            {"name": "@user_id", "value": user_id},
            {"name": "@start_time", "value": start_time_iso},
            {"name": "@end_time", "value": end_time_iso},
        ]

    async def count_user_analytics_records(
        self,
        *,
        user_id: str,
        start_time_iso: str,
        end_time_iso: str,
    ) -> int:
        query = (
            "SELECT VALUE COUNT(1) FROM c WHERE c.user_id = @user_id AND "
            + self._user_analytics_window_filter()
        )
        items = await self._collect_query(
            query=query,
            parameters=self._user_analytics_window_parameters(
                user_id=user_id,
                start_time_iso=start_time_iso,
                end_time_iso=end_time_iso,
            ),
        )
        return int(items[0]) if items else 0

    async def list_user_analytics_records(
        self,
        *,
        user_id: str,
        start_time_iso: str,
        end_time_iso: str,
    ) -> List[Dict[str, Any]]:
        query = (
            "SELECT * FROM c WHERE c.user_id = @user_id AND "
            + self._user_analytics_window_filter()
        )
        return await self._collect_query(
            query=query,
            parameters=self._user_analytics_window_parameters(
                user_id=user_id,
                start_time_iso=start_time_iso,
                end_time_iso=end_time_iso,
            ),
        )

    async def list_system_analytics_records(
        self,
        *,
        start_time_iso: str,
        end_time_iso: str,
        prompt_category_ids: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        query = (
            "SELECT * FROM c WHERE "
            "((IS_DEFINED(c.timestamp) AND c.timestamp >= @start AND c.timestamp <= @end) "
            "OR (IS_DEFINED(c.created_at) AND c.created_at >= @start AND c.created_at <= @end))"
        )
        parameters = [
            {"name": "@start", "value": start_time_iso},
            {"name": "@end", "value": end_time_iso},
        ]

        if prompt_category_ids is not None:
            if prompt_category_ids:
                placeholders: List[str] = []
                for index, category_id in enumerate(sorted(prompt_category_ids)):
                    param = f"@prompt_category_{index}"
                    placeholders.append(param)
                    parameters.append({"name": param, "value": category_id})
                query += f" AND c.prompt_category_id IN ({', '.join(placeholders)})"
            else:
                query += " AND false"

        return await self._collect_query(query=query, parameters=parameters)

    async def list_prompt_usage_records(
        self,
        *,
        start_time_iso: str,
        end_time_iso: str,
        prompt_category_ids: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        if prompt_category_ids == []:
            return []

        query = (
            "SELECT * FROM c WHERE "
            "((IS_DEFINED(c.timestamp) AND c.timestamp >= @start_time AND c.timestamp <= @end_time) "
            "OR (IS_DEFINED(c.created_at) AND c.created_at >= @start_time AND c.created_at <= @end_time)) "
            "AND IS_DEFINED(c.prompt_subcategory_id)"
        )
        parameters = [
            {"name": "@start_time", "value": start_time_iso},
            {"name": "@end_time", "value": end_time_iso},
        ]

        if prompt_category_ids is not None:
            placeholders: List[str] = []
            for index, category_id in enumerate(sorted(prompt_category_ids)):
                param = f"@prompt_category_{index}"
                placeholders.append(param)
                parameters.append({"name": param, "value": category_id})
            query += f" AND c.prompt_category_id IN ({', '.join(placeholders)})"

        return await self._collect_query(query=query, parameters=parameters)

    async def list_recent_jobs(
        self,
        *,
        limit: int,
        prompt_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        query = """
                SELECT * FROM c 
                WHERE c.type = 'job'
                AND (NOT IS_DEFINED(c.deleted) OR c.deleted = false)
            """
        parameters: List[Dict[str, Any]] = []
        if prompt_id:
            query += " AND c.prompt_id = @prompt_id"
            parameters.append({"name": "@prompt_id", "value": prompt_id})
        query += " ORDER BY c.created_at DESC OFFSET @offset LIMIT @limit"
        parameters.extend([
            {"name": "@offset", "value": 0},
            {"name": "@limit", "value": int(limit)},
        ])
        return await self._collect_query(query=query, parameters=parameters)


class AnalyticsEventRepository:
    """Cosmos mutations for persisted analytics events."""

    def __init__(self, cosmos_service: CosmosService):
        self.cosmos = cosmos_service

    @property
    def container(self):
        return self.cosmos.get_container("analytics")

    def is_available(self) -> bool:
        return _container_is_available(self.cosmos, "analytics")

    async def create_record(self, record: Dict[str, Any]) -> Dict[str, Any]:
        return await self.container.create_item(body=record)


class AnalyticsSessionRepository:
    """Cosmos reads for user session records used by analytics."""

    def __init__(self, cosmos_service: CosmosService):
        self.cosmos = cosmos_service

    @property
    def container(self):
        return self.cosmos.get_container("user_sessions")

    def is_available(self) -> bool:
        return _container_is_available(self.cosmos, "user_sessions")

    def query_items(
        self,
        *,
        query: str,
        parameters: Optional[List[Dict[str, Any]]] = None,
    ):
        return self.container.query_items(query=query, parameters=parameters)

    async def read_item(self, *, item: str, partition_key: str) -> Dict[str, Any]:
        return await self.container.read_item(item=item, partition_key=partition_key)

    async def _collect_query(
        self,
        *,
        query: str,
        parameters: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        iterator = self.query_items(query=query, parameters=parameters)
        if isawaitable(iterator):
            iterator = await iterator
        return [item async for item in iterator]

    async def list_user_sessions(self, user_id: str) -> List[Dict[str, Any]]:
        params = [{"name": "@user_id", "value": user_id}]
        query = "SELECT * FROM c WHERE c.type = 'session' AND c.user_id = @user_id"
        return await self._collect_query(query=query, parameters=params)

    async def list_user_sessions_by_user_id(self, user_id: str) -> List[Dict[str, Any]]:
        params = [{"name": "@user_id", "value": user_id}]
        query = "SELECT * FROM c WHERE c.user_id = @user_id"
        return await self._collect_query(query=query, parameters=params)

    async def get_session_by_partition(self, session_id: str, partition_key: str) -> Optional[Dict[str, Any]]:
        try:
            return await self.read_item(item=session_id, partition_key=partition_key)
        except CosmosResourceNotFoundError:
            return None

    async def list_recent_sessions(
        self,
        *,
        start_time_iso: str,
        user_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        filters = [
            "c.type = 'session'",
            "(c.last_activity >= @start_time OR c.last_heartbeat >= @start_time OR c.created_at >= @start_time)",
        ]
        params = [{"name": "@start_time", "value": start_time_iso}]

        if user_id:
            filters.append("c.user_id = @user_id")
            params.append({"name": "@user_id", "value": user_id})

        query = f"SELECT * FROM c WHERE {' AND '.join(filters)}"
        return await self._collect_query(query=query, parameters=params)

    async def list_active_user_ids_since(self, cutoff_time_iso: str) -> List[str]:
        query = (
            "SELECT DISTINCT c.user_id FROM c WHERE "
            "((IS_DEFINED(c.last_activity) AND c.last_activity >= @recent_cutoff) "
            "OR (IS_DEFINED(c.last_heartbeat) AND c.last_heartbeat >= @recent_cutoff))"
        )
        parameters = [{"name": "@recent_cutoff", "value": cutoff_time_iso}]
        items = await self._collect_query(query=query, parameters=parameters)
        return [item["user_id"] for item in items if item.get("user_id")]


class AnalyticsAuditRepository:
    """Cosmos reads for audit records used by analytics views."""

    def __init__(self, cosmos_service: CosmosService):
        self.cosmos = cosmos_service

    @property
    def container(self):
        return self.cosmos.get_container("audit_logs")

    def is_available(self) -> bool:
        return _container_is_available(self.cosmos, "audit_logs")

    def query_items(
        self,
        *,
        query: str,
        parameters: Optional[List[Dict[str, Any]]] = None,
    ):
        return self.container.query_items(query=query, parameters=parameters)

    async def _collect_query(
        self,
        *,
        query: str,
        parameters: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        iterator = self.query_items(query=query, parameters=parameters)
        if isawaitable(iterator):
            iterator = await iterator
        return [item async for item in iterator]

    async def list_user_audit_logs(
        self,
        *,
        user_id: str,
        cutoff_time_iso: str,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        query = (
            "SELECT * FROM c WHERE c.type = 'audit' AND c.user_id = @user_id "
            "AND c.timestamp >= @cutoff_time ORDER BY c.timestamp DESC OFFSET 0 LIMIT @limit"
        )
        parameters = [
            {"name": "@user_id", "value": user_id},
            {"name": "@cutoff_time", "value": cutoff_time_iso},
            {"name": "@limit", "value": int(limit)},
        ]
        return await self._collect_query(query=query, parameters=parameters)


class AnalyticsPromptRepository:
    """Cosmos reads for prompt metadata needed by analytics summaries."""

    def __init__(self, cosmos_service: CosmosService):
        self.cosmos = cosmos_service

    @property
    def container(self):
        return self.cosmos.get_container("prompts")

    def is_available(self) -> bool:
        return _container_is_available(self.cosmos, "prompts")

    def query_items(
        self,
        *,
        query: str,
        parameters: Optional[List[Dict[str, Any]]] = None,
    ):
        return self.container.query_items(query=query, parameters=parameters)

    async def get_category_names(self, category_ids: List[str]) -> Dict[str, str]:
        category_names: Dict[str, str] = {}
        for category_id in [cat_id for cat_id in dict.fromkeys(category_ids) if cat_id]:
            query = "SELECT c.id, c.name FROM c WHERE c.id = @cat_id"
            parameters = [{"name": "@cat_id", "value": category_id}]
            iterator = self.query_items(query=query, parameters=parameters)
            if isawaitable(iterator):
                iterator = await iterator
            async for item in iterator:
                category_names[category_id] = item.get("name", category_id)
                break
        return category_names

    async def list_category_ids_for_business_units(self, business_unit_ids: List[str]) -> List[str]:
        unique_business_unit_ids = [bu_id for bu_id in dict.fromkeys(business_unit_ids) if bu_id]
        if not unique_business_unit_ids:
            return []

        query_parts: List[str] = []
        parameters: List[Dict[str, Any]] = []
        for index, business_unit_id in enumerate(unique_business_unit_ids):
            param_name = f"@business_unit_{index}"
            query_parts.append(f"c.business_unit_id = {param_name}")
            parameters.append({"name": param_name, "value": business_unit_id})

        query = (
            "SELECT c.id FROM c "
            "WHERE c.type = 'prompt_category' AND (" + " OR ".join(query_parts) + ")"
        )
        iterator = self.query_items(query=query, parameters=parameters)
        if isawaitable(iterator):
            iterator = await iterator

        category_ids: List[str] = []
        async for item in iterator:
            category_id = item.get("id") if isinstance(item, dict) else item
            if category_id:
                category_ids.append(str(category_id))
        return category_ids


class AnalyticsPromptExportRepository:
    """Cosmos reads for prompt metadata needed by export reports."""

    def __init__(self, cosmos_service: CosmosService):
        self.cosmos = cosmos_service

    @property
    def container(self):
        return self.cosmos.get_container("voice_prompts")

    def is_available(self) -> bool:
        return _container_is_available(self.cosmos, "voice_prompts")

    def query_items(
        self,
        *,
        query: str,
        parameters: Optional[List[Dict[str, Any]]] = None,
    ):
        return self.container.query_items(query=query, parameters=parameters)

    async def _collect_query(
        self,
        *,
        query: str,
        parameters: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        iterator = self.query_items(query=query, parameters=parameters)
        if isawaitable(iterator):
            iterator = await iterator
        return [item async for item in iterator]

    async def get_subcategory_name_map(self) -> Dict[str, str]:
        items = await self._collect_query(
            query="SELECT c.id, c.name FROM c WHERE IS_DEFINED(c.name)",
            parameters=[],
        )
        return {
            item["id"]: item["name"]
            for item in items
            if item.get("id") and item.get("name")
        }


class AnalyticsUserCountRepository:
    """Cosmos reads for user counts needed by system analytics."""

    def __init__(self, cosmos_service: CosmosService):
        self.cosmos = cosmos_service

    @property
    def container(self):
        return self.cosmos.get_container("auth")

    def is_available(self) -> bool:
        return _container_is_available(self.cosmos, "auth")

    def query_items(
        self,
        *,
        query: str,
        parameters: Optional[List[Dict[str, Any]]] = None,
    ):
        return self.container.query_items(query=query, parameters=parameters)

    async def _collect_query(
        self,
        *,
        query: str,
        parameters: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Any]:
        iterator = self.query_items(query=query, parameters=parameters)
        if isawaitable(iterator):
            iterator = await iterator
        return [item async for item in iterator]

    async def count_users(self, business_unit_ids: Optional[List[str]] = None) -> int:
        if business_unit_ids:
            if len(business_unit_ids) == 1:
                query = "SELECT VALUE COUNT(1) FROM c WHERE ARRAY_CONTAINS(c.business_unit_ids, @bu_id)"
                parameters = [{"name": "@bu_id", "value": business_unit_ids[0]}]
            else:
                placeholders = []
                parameters = []
                for index, business_unit_id in enumerate(business_unit_ids):
                    param = f"@bu_{index}"
                    placeholders.append(f"ARRAY_CONTAINS(c.business_unit_ids, {param})")
                    parameters.append({"name": param, "value": business_unit_id})
                query = f"SELECT VALUE COUNT(1) FROM c WHERE ({' OR '.join(placeholders)})"
        else:
            query = "SELECT VALUE COUNT(1) FROM c"
            parameters = None

        items = await self._collect_query(query=query, parameters=parameters)
        return int(items[0]) if items else 0
