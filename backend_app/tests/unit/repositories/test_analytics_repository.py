from unittest.mock import MagicMock

import pytest
from azure.cosmos.exceptions import CosmosResourceNotFoundError

from app.repositories.analytics import (
    AnalyticsAuditRepository,
    AnalyticsPromptExportRepository,
    AnalyticsPromptRepository,
    AnalyticsReadRepository,
    AnalyticsSessionRepository,
    AnalyticsUserCountRepository,
)


def _async_items(items):
    async def iterator():
        for item in items:
            yield item

    return iterator()


def _repository_with_container(container):
    cosmos = MagicMock()
    cosmos.get_container.return_value = container
    return AnalyticsSessionRepository(cosmos)


def _read_repository_with_container(container):
    cosmos = MagicMock()
    cosmos.get_container.return_value = container
    return AnalyticsReadRepository(cosmos)


def _audit_repository_with_container(container):
    cosmos = MagicMock()
    cosmos.get_container.return_value = container
    return AnalyticsAuditRepository(cosmos)


def _prompt_repository_with_container(container):
    cosmos = MagicMock()
    cosmos.get_container.return_value = container
    return AnalyticsPromptRepository(cosmos)


def _prompt_export_repository_with_container(container):
    cosmos = MagicMock()
    cosmos.get_container.return_value = container
    return AnalyticsPromptExportRepository(cosmos)


def _user_count_repository_with_container(container):
    cosmos = MagicMock()
    cosmos.get_container.return_value = container
    return AnalyticsUserCountRepository(cosmos)


def test_read_repository_reports_unavailable_for_expected_container_failure():
    cosmos = MagicMock()
    cosmos.get_container.side_effect = ValueError("bad container config")

    assert AnalyticsReadRepository(cosmos).is_available() is False


def test_read_repository_propagates_unexpected_container_failure():
    cosmos = MagicMock()
    cosmos.get_container.side_effect = AssertionError("test bug")

    with pytest.raises(AssertionError, match="test bug"):
        AnalyticsReadRepository(cosmos).is_available()


@pytest.mark.asyncio
async def test_list_user_sessions_queries_session_documents_for_user():
    container = MagicMock()
    container.query_items.return_value = _async_items([{"id": "session-1"}])

    result = await _repository_with_container(container).list_user_sessions("user-1")

    assert result == [{"id": "session-1"}]
    call_kwargs = container.query_items.call_args.kwargs
    assert "c.type = 'session'" in call_kwargs["query"]
    assert call_kwargs["parameters"] == [{"name": "@user_id", "value": "user-1"}]


@pytest.mark.asyncio
async def test_list_recent_sessions_adds_optional_user_filter():
    container = MagicMock()
    container.query_items.return_value = _async_items([])

    await _repository_with_container(container).list_recent_sessions(
        start_time_iso="2024-01-01T00:00:00+00:00",
        user_id="user-1",
    )

    call_kwargs = container.query_items.call_args.kwargs
    assert "c.user_id = @user_id" in call_kwargs["query"]
    assert call_kwargs["parameters"] == [
        {"name": "@start_time", "value": "2024-01-01T00:00:00+00:00"},
        {"name": "@user_id", "value": "user-1"},
    ]


@pytest.mark.asyncio
async def test_get_session_by_partition_returns_none_when_missing():
    container = MagicMock()
    container.read_item.side_effect = CosmosResourceNotFoundError(message="missing")

    result = await _repository_with_container(container).get_session_by_partition(
        "session-1",
        "user-1",
    )

    assert result is None


@pytest.mark.asyncio
async def test_get_session_by_partition_propagates_unexpected_read_errors():
    container = MagicMock()
    container.read_item.side_effect = RuntimeError("storage failed")

    with pytest.raises(RuntimeError, match="storage failed"):
        await _repository_with_container(container).get_session_by_partition(
            "session-1",
            "user-1",
        )


@pytest.mark.asyncio
async def test_get_latest_transcription_timestamp_prefers_timestamp():
    container = MagicMock()
    container.query_items.return_value = _async_items([
        {"id": "a1", "timestamp": "2024-01-02T00:00:00Z", "created_at": "2024-01-01T00:00:00Z"}
    ])

    result = await _read_repository_with_container(container).get_latest_transcription_timestamp()

    assert result == "2024-01-02T00:00:00Z"
    call_kwargs = container.query_items.call_args.kwargs
    assert "ORDER BY c.timestamp DESC" in call_kwargs["query"]
    assert call_kwargs["partition_key"] == "transcription_analytics"


@pytest.mark.asyncio
async def test_list_user_transcription_records_filters_user_and_window():
    container = MagicMock()
    container.query_items.return_value = _async_items([{"id": "a1"}])

    result = await _read_repository_with_container(container).list_user_transcription_records(
        user_id="user-1",
        start_time_iso="2024-01-01T00:00:00+00:00",
        end_time_iso="2024-01-02T00:00:00+00:00",
    )

    assert result == [{"id": "a1"}]
    call_kwargs = container.query_items.call_args.kwargs
    assert "c.type = 'transcription_analytics'" in call_kwargs["query"]
    assert call_kwargs["parameters"] == [
        {"name": "@user_id", "value": "user-1"},
        {"name": "@start_time", "value": "2024-01-01T00:00:00+00:00"},
        {"name": "@end_time", "value": "2024-01-02T00:00:00+00:00"},
    ]


@pytest.mark.asyncio
async def test_list_user_duration_records_filters_to_duration_records():
    container = MagicMock()
    container.query_items.return_value = _async_items([{"id": "a1", "audio_duration_seconds": 60}])

    result = await _read_repository_with_container(container).list_user_duration_records(
        user_id="user-1",
        start_time_iso="2024-01-01T00:00:00+00:00",
        end_time_iso="2024-01-02T00:00:00+00:00",
    )

    assert result == [{"id": "a1", "audio_duration_seconds": 60}]
    call_kwargs = container.query_items.call_args.kwargs
    assert "IS_DEFINED(c.audio_duration_minutes)" in call_kwargs["query"]
    assert call_kwargs["parameters"] == [
        {"name": "@user_id", "value": "user-1"},
        {"name": "@start_date", "value": "2024-01-01T00:00:00+00:00"},
        {"name": "@end_date", "value": "2024-01-02T00:00:00+00:00"},
    ]


@pytest.mark.asyncio
async def test_count_user_analytics_records_counts_user_window():
    container = MagicMock()
    container.query_items.return_value = _async_items([3])

    result = await _read_repository_with_container(container).count_user_analytics_records(
        user_id="user-1",
        start_time_iso="2024-01-01T00:00:00+00:00",
        end_time_iso="2024-01-02T00:00:00+00:00",
    )

    assert result == 3
    call_kwargs = container.query_items.call_args.kwargs
    assert "SELECT VALUE COUNT(1)" in call_kwargs["query"]
    assert "IS_DEFINED(c.created_at)" in call_kwargs["query"]


@pytest.mark.asyncio
async def test_list_user_analytics_records_reads_user_window():
    container = MagicMock()
    container.query_items.return_value = _async_items([{"id": "a1"}])

    result = await _read_repository_with_container(container).list_user_analytics_records(
        user_id="user-1",
        start_time_iso="2024-01-01T00:00:00+00:00",
        end_time_iso="2024-01-02T00:00:00+00:00",
    )

    assert result == [{"id": "a1"}]
    call_kwargs = container.query_items.call_args.kwargs
    assert call_kwargs["query"].startswith("SELECT * FROM c")
    assert call_kwargs["parameters"] == [
        {"name": "@user_id", "value": "user-1"},
        {"name": "@start_time", "value": "2024-01-01T00:00:00+00:00"},
        {"name": "@end_time", "value": "2024-01-02T00:00:00+00:00"},
    ]


@pytest.mark.asyncio
async def test_list_user_audit_logs_scopes_user_cutoff_and_limit():
    container = MagicMock()
    container.query_items.return_value = _async_items([{"id": "audit-1"}])

    result = await _audit_repository_with_container(container).list_user_audit_logs(
        user_id="user-1",
        cutoff_time_iso="2024-01-01T00:00:00+00:00",
        limit=25,
    )

    assert result == [{"id": "audit-1"}]
    call_kwargs = container.query_items.call_args.kwargs
    assert "c.type = 'audit'" in call_kwargs["query"]
    assert "ORDER BY c.timestamp DESC" in call_kwargs["query"]
    assert call_kwargs["parameters"] == [
        {"name": "@user_id", "value": "user-1"},
        {"name": "@cutoff_time", "value": "2024-01-01T00:00:00+00:00"},
        {"name": "@limit", "value": 25},
    ]


@pytest.mark.asyncio
async def test_list_system_analytics_records_filters_window_without_categories():
    container = MagicMock()
    container.query_items.return_value = _async_items([{"id": "analytics-1"}])

    result = await _read_repository_with_container(container).list_system_analytics_records(
        start_time_iso="2024-01-01T00:00:00+00:00",
        end_time_iso="2024-01-02T00:00:00+00:00",
    )

    assert result == [{"id": "analytics-1"}]
    call_kwargs = container.query_items.call_args.kwargs
    assert "c.timestamp >= @start" in call_kwargs["query"]
    assert "prompt_category_id IN" not in call_kwargs["query"]
    assert call_kwargs["parameters"] == [
        {"name": "@start", "value": "2024-01-01T00:00:00+00:00"},
        {"name": "@end", "value": "2024-01-02T00:00:00+00:00"},
    ]


@pytest.mark.asyncio
async def test_list_system_analytics_records_filters_prompt_categories():
    container = MagicMock()
    container.query_items.return_value = _async_items([])

    await _read_repository_with_container(container).list_system_analytics_records(
        start_time_iso="2024-01-01T00:00:00+00:00",
        end_time_iso="2024-01-02T00:00:00+00:00",
        prompt_category_ids=["cat-b", "cat-a"],
    )

    call_kwargs = container.query_items.call_args.kwargs
    assert "c.prompt_category_id IN (@prompt_category_0, @prompt_category_1)" in call_kwargs["query"]
    assert call_kwargs["parameters"] == [
        {"name": "@start", "value": "2024-01-01T00:00:00+00:00"},
        {"name": "@end", "value": "2024-01-02T00:00:00+00:00"},
        {"name": "@prompt_category_0", "value": "cat-a"},
        {"name": "@prompt_category_1", "value": "cat-b"},
    ]


@pytest.mark.asyncio
async def test_list_prompt_usage_records_filters_window_and_prompt_categories():
    container = MagicMock()
    container.query_items.return_value = _async_items([{"prompt_subcategory_id": "sub-1"}])

    result = await _read_repository_with_container(container).list_prompt_usage_records(
        start_time_iso="2024-01-01T00:00:00+00:00",
        end_time_iso="2024-01-02T00:00:00+00:00",
        prompt_category_ids=["cat-b", "cat-a"],
    )

    assert result == [{"prompt_subcategory_id": "sub-1"}]
    call_kwargs = container.query_items.call_args.kwargs
    assert "IS_DEFINED(c.prompt_subcategory_id)" in call_kwargs["query"]
    assert "c.prompt_category_id IN (@prompt_category_0, @prompt_category_1)" in call_kwargs["query"]
    assert call_kwargs["parameters"] == [
        {"name": "@start_time", "value": "2024-01-01T00:00:00+00:00"},
        {"name": "@end_time", "value": "2024-01-02T00:00:00+00:00"},
        {"name": "@prompt_category_0", "value": "cat-a"},
        {"name": "@prompt_category_1", "value": "cat-b"},
    ]


@pytest.mark.asyncio
async def test_list_prompt_usage_records_empty_prompt_categories_skips_query():
    container = MagicMock()

    result = await _read_repository_with_container(container).list_prompt_usage_records(
        start_time_iso="2024-01-01T00:00:00+00:00",
        end_time_iso="2024-01-02T00:00:00+00:00",
        prompt_category_ids=[],
    )

    assert result == []
    container.query_items.assert_not_called()


@pytest.mark.asyncio
async def test_get_category_names_queries_each_unique_category_once():
    container = MagicMock()
    container.query_items.side_effect = [
        _async_items([{"id": "cat-a", "name": "Category A"}]),
        _async_items([{"id": "cat-b", "name": "Category B"}]),
    ]

    result = await _prompt_repository_with_container(container).get_category_names(
        ["cat-a", "cat-a", "cat-b"]
    )

    assert result == {"cat-a": "Category A", "cat-b": "Category B"}
    assert container.query_items.call_count == 2
    first_call = container.query_items.call_args_list[0].kwargs
    assert first_call["parameters"] == [{"name": "@cat_id", "value": "cat-a"}]


@pytest.mark.asyncio
async def test_list_category_ids_for_business_units_queries_each_unit():
    container = MagicMock()
    container.query_items.return_value = _async_items([
        {"id": "cat-a"},
        {"id": "cat-b"},
    ])

    result = await _prompt_repository_with_container(container).list_category_ids_for_business_units(
        ["bu-1", "bu-1", "bu-2"]
    )

    assert result == ["cat-a", "cat-b"]
    call_kwargs = container.query_items.call_args.kwargs
    assert "c.type = 'prompt_category'" in call_kwargs["query"]
    assert "c.business_unit_id = @business_unit_0" in call_kwargs["query"]
    assert "c.business_unit_id = @business_unit_1" in call_kwargs["query"]
    assert call_kwargs["parameters"] == [
        {"name": "@business_unit_0", "value": "bu-1"},
        {"name": "@business_unit_1", "value": "bu-2"},
    ]


@pytest.mark.asyncio
async def test_get_subcategory_name_map_returns_named_prompts():
    container = MagicMock()
    container.query_items.return_value = _async_items([
        {"id": "sub-1", "name": "Prompt One"},
        {"id": "sub-2"},
        {"name": "Missing ID"},
    ])

    result = await _prompt_export_repository_with_container(container).get_subcategory_name_map()

    assert result == {"sub-1": "Prompt One"}
    call_kwargs = container.query_items.call_args.kwargs
    assert "SELECT c.id, c.name" in call_kwargs["query"]


@pytest.mark.asyncio
async def test_list_active_user_ids_since_returns_distinct_user_ids():
    container = MagicMock()
    container.query_items.return_value = _async_items([
        {"user_id": "user-1"},
        {"user_id": "user-2"},
        {"other": "ignored"},
    ])

    result = await _repository_with_container(container).list_active_user_ids_since(
        "2024-01-01T00:00:00+00:00"
    )

    assert result == ["user-1", "user-2"]
    call_kwargs = container.query_items.call_args.kwargs
    assert "SELECT DISTINCT c.user_id" in call_kwargs["query"]
    assert call_kwargs["parameters"] == [{"name": "@recent_cutoff", "value": "2024-01-01T00:00:00+00:00"}]


@pytest.mark.asyncio
async def test_count_users_without_business_unit_filter_counts_all_users():
    container = MagicMock()
    container.query_items.return_value = _async_items([7])

    result = await _user_count_repository_with_container(container).count_users()

    assert result == 7
    assert container.query_items.call_args.kwargs == {
        "query": "SELECT VALUE COUNT(1) FROM c",
        "parameters": None,
    }


@pytest.mark.asyncio
async def test_count_users_filters_multiple_business_units():
    container = MagicMock()
    container.query_items.return_value = _async_items([3])

    result = await _user_count_repository_with_container(container).count_users(["bu-a", "bu-b"])

    assert result == 3
    call_kwargs = container.query_items.call_args.kwargs
    assert "ARRAY_CONTAINS(c.business_unit_ids, @bu_0)" in call_kwargs["query"]
    assert "ARRAY_CONTAINS(c.business_unit_ids, @bu_1)" in call_kwargs["query"]
    assert call_kwargs["parameters"] == [
        {"name": "@bu_0", "value": "bu-a"},
        {"name": "@bu_1", "value": "bu-b"},
    ]


@pytest.mark.asyncio
async def test_list_recent_jobs_applies_prompt_filter_and_limit():
    container = MagicMock()
    container.query_items.return_value = _async_items([{"id": "job-1"}])

    result = await _read_repository_with_container(container).list_recent_jobs(
        limit=5,
        prompt_id="prompt-1",
    )

    assert result == [{"id": "job-1"}]
    call_kwargs = container.query_items.call_args.kwargs
    assert "c.type = 'job'" in call_kwargs["query"]
    assert "c.prompt_id = @prompt_id" in call_kwargs["query"]
    assert "ORDER BY c.created_at DESC" in call_kwargs["query"]
    assert call_kwargs["parameters"] == [
        {"name": "@prompt_id", "value": "prompt-1"},
        {"name": "@offset", "value": 0},
        {"name": "@limit", "value": 5},
    ]
