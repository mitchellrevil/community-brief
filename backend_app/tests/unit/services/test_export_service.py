import asyncio
import os
from unittest.mock import AsyncMock, MagicMock
import pytest

from backend_app.app.core.errors.domain import ErrorCode
from backend_app.app.repositories.analytics import (
    AnalyticsPromptExportRepository,
    AnalyticsPromptRepository,
    AnalyticsReadRepository,
)
from backend_app.app.repositories.users import UserRepository
from backend_app.app.services.analytics.export_service import ExportService


def build_export_service(cosmos, analytics, *, user_repository=None, prompt_service=None):
    return ExportService(
        analytics_service=analytics,
        prompt_service=prompt_service,
        user_repository=user_repository or UserRepository(cosmos),
        analytics_repository=AnalyticsReadRepository(cosmos),
        prompt_export_repository=AnalyticsPromptExportRepository(cosmos),
        prompt_repository=AnalyticsPromptRepository(cosmos),
    )


@pytest.mark.asyncio
async def test_format_and_filter_helpers(tmp_path):
    svc = build_export_service(MagicMock(), MagicMock())

    assert svc._format_datetime(None) == 'N/A'

    # invalid format returns original
    assert svc._format_datetime('not-a-date') == 'not-a-date'

    # filter by date range
    users = [
        {'id': 'u1', 'created_at': '2023-01-01T00:00:00Z'},
        {'id': 'u2', 'created_at': '2024-01-01T00:00:00Z'},
        {'id': 'u3', 'created_at': None},
    ]

    filtered = svc._filter_by_date_range(users, '2023-06-01T00:00:00+00:00', '2024-06-01T00:00:00+00:00')
    assert len(filtered) == 1 and filtered[0]['id'] == 'u2'

    # apply filters permission + is_active
    users2 = [
        {'id': 'a', 'permission': 'admin', 'is_active': True, 'created_at': '2023-01-02T00:00:00Z'},
        {'id': 'b', 'permission': 'user', 'is_active': False, 'created_at': '2024-01-02T00:00:00Z'},
    ]

    out = svc._apply_user_filters(users2, {'permission': 'admin'})
    assert len(out) == 1 and out[0]['id'] == 'a'

    out2 = svc._apply_user_filters(users2, {'is_active': True})
    assert len(out2) == 1 and out2[0]['id'] == 'a'


def test_get_duration_and_resolve_names():
    svc = build_export_service(MagicMock(), MagicMock())

    assert svc._get_duration_minutes({'audio_duration_minutes': 2}) == 2.0
    assert round(svc._get_duration_minutes({'audio_duration_seconds': 120}), 2) == 2.0
    assert svc._get_duration_minutes({'audio_duration_minutes': 'bad'}) is None

    categories_map = {'c1': 'Cat One'}
    sub_map = {'s1': {'name': 'Prompt A', 'category_id': 'c1'}}
    prompt_name, cat_name = svc._resolve_prompt_and_category_names(record={'prompt_subcategory_id': 's1'}, categories_map=categories_map, subcategories_map=sub_map)
    assert prompt_name == 'Prompt A' and cat_name == 'Cat One'


@pytest.mark.asyncio
async def test_write_system_analytics_csv_and_pdf(tmp_path):
    cosmos = MagicMock()
    analytics = MagicMock()
    user_repository = MagicMock()
    user_repository.get_by_id = AsyncMock(return_value=None)
    svc = build_export_service(cosmos, analytics, user_repository=user_repository)

    records = [
        {'job_id': 'j1', 'user_id': 'u1', 'timestamp': 't', 'audio_duration_seconds': 60, 'file_name': 'f1', 'prompt_subcategory_id': 's1', 'prompt_category_id': 'c1'},
    ]

    users_map = {'u1': 'u1@example.com'}
    categories_map = {'c1': 'Cat'}
    sub_map = {'s1': {'name': 'Name1', 'category_id': 'c1'}}

    res = await svc._write_system_analytics_csv(records=records, users_map=users_map, categories_map=categories_map, subcategories_map=sub_map)
    assert res['status'] == 'success'
    assert os.path.exists(res['file_path'])

    # cleanup
    try:
        os.unlink(res['file_path'])
    except Exception:
        pass

    # export_user_details_pdf: user not found
    user_repository.get_by_id = AsyncMock(return_value=None)
    r = await svc.export_user_details_pdf('uX')
    assert r['status'] == 'error'

    # user exists -> should produce pdf
    user_repository.get_by_id = AsyncMock(return_value={'id': 'u1', 'email': 'a@b.com', 'full_name': 'A', 'created_at': '2023-01-01T00:00:00Z', 'last_login': None})
    analytics.get_user_analytics = AsyncMock(return_value={'analytics': {}})
    analytics.get_user_minutes_records = AsyncMock(return_value=[])

    r2 = await svc.export_user_details_pdf('u1')
    assert r2['status'] == 'success'
    assert os.path.exists(r2['file_path'])

    try:
        os.unlink(r2['file_path'])
    except Exception:
        pass


@pytest.mark.asyncio
async def test_export_users_and_stream_and_prompts(tmp_path):
    cosmos = MagicMock()
    analytics = MagicMock()
    user_repository = MagicMock()
    svc = build_export_service(cosmos, analytics, user_repository=user_repository)

    # export_users_csv
    user_repository.list = AsyncMock(return_value={"items": [{"id":"u1","email":"a@b.com","full_name":"A","permission":"admin","created_at":"2024-01-01T00:00:00Z","is_active":True}], "total": 1})
    r = await svc.export_users_csv()
    assert r["status"] == "success" and os.path.exists(r["file_path"])
    try:
        os.unlink(r["file_path"])
    except Exception:
        pass

    # stream users csv with filters
    async def users_iter():
        yield {"id":"u1","email":"a@b.com","permission":"admin","is_active":True, 'created_at': '2024-01-02T00:00:00Z'}
        yield {"id":"u2","email":"b@c.com","permission":"user","is_active":False, 'created_at': '2024-01-03T00:00:00Z'}

    user_repository.iter_all = users_iter
    chunks = []
    async for piece in svc.stream_users_csv(filters={"permission": "admin"}):
        chunks.append(piece)

    assert len(chunks) >= 2

    # export_prompts_csv path
    class Container:
        def __init__(self, items):
            self._items = items

        def query_items(self, query=None, parameters=None):
            async def it():
                for i in self._items:
                    yield i
            return it()

    # analytics container yields items with prompt_subcategory_id
    cosmos.get_container = lambda name: Container([{"prompt_subcategory_id": "s1"}])

    # voice_prompts container yields subcategory mapping
    # above lambda will return same Container for both containers, which is fine
    r2 = await svc.export_prompts_csv()
    assert r2["status"] == "success" and os.path.exists(r2["file_path"])
    try:
        os.unlink(r2["file_path"])
    except Exception:
        pass


@pytest.mark.asyncio
async def test_export_system_analytics_csv_and_batch_lookups(tmp_path):
    cosmos = MagicMock()
    analytics = MagicMock()
    svc = build_export_service(cosmos, analytics)

    analytics.get_system_analytics = AsyncMock(return_value={"analytics": {"records": [{"job_id":"j1","user_id":"u1","prompt_category_id":"c1","prompt_subcategory_id":"s1"}]}})

    # stub batch fetch to return maps
    svc._batch_fetch_export_lookups = AsyncMock(return_value=({'u1': 'a@b.com'}, {'c1': 'Cat'}, {'s1': {'name': 'Prompt', 'category_id': 'c1'}}))
    svc._write_system_analytics_csv = AsyncMock(return_value={'status':'success','file_path':'/tmp/x.csv','filename':'x.csv','content_type':'text/csv'})

    out = await svc.export_system_analytics_csv(days=1, business_unit_ids=['bu-1'])
    assert out['status'] == 'success'
    analytics.get_system_analytics.assert_awaited_once_with(days=1, business_unit_ids=['bu-1'])


@pytest.mark.asyncio
async def test_cleanup_and_pdf_analytics_failure(tmp_path):
    cosmos = MagicMock()
    analytics = MagicMock()
    user_repository = MagicMock()
    svc = build_export_service(cosmos, analytics, user_repository=user_repository)

    # create a temp file then cleanup
    fp = tmp_path / "temp.csv"
    fp.write_text("ok")
    await svc.cleanup_temp_file(str(fp))
    assert not fp.exists()

    # export_user_details_pdf where analytics service raises - should still succeed
    user_repository.get_by_id = AsyncMock(return_value={'id': 'u1', 'email': 'a@b.com', 'full_name': 'Name', 'created_at': '2024-01-01T00:00:00Z'})
    analytics.get_user_analytics = AsyncMock(side_effect=RuntimeError("fail"))
    analytics.get_user_minutes_records = AsyncMock(side_effect=RuntimeError("fail"))

    r = await svc.export_user_details_pdf('u1')
    assert r['status'] == 'success'
    try:
        os.unlink(r['file_path'])
    except Exception:
        pass


@pytest.mark.asyncio
async def test_stream_users_csv_filters_by_business_unit_scope():
    cosmos = MagicMock()
    analytics = MagicMock()
    user_repository = MagicMock()
    svc = build_export_service(cosmos, analytics, user_repository=user_repository)

    async def users_iter():
        yield {"id": "u1", "email": "a@b.com", "business_unit_ids": ["bu-1"]}
        yield {"id": "u2", "email": "b@c.com", "business_unit_ids": ["bu-2"]}

    user_repository.iter_all = users_iter

    chunks = []
    async for piece in svc.stream_users_csv(business_unit_ids=["bu-1"]):
        chunks.append(piece)

    csv_output = "".join(chunks)
    assert "u1" in csv_output
    assert "u2" not in csv_output


@pytest.mark.asyncio
async def test_export_user_details_pdf_rejects_out_of_scope_user():
    cosmos = MagicMock()
    analytics = MagicMock()
    user_repository = MagicMock()
    svc = build_export_service(cosmos, analytics, user_repository=user_repository)

    user_repository.get_by_id = AsyncMock(return_value={"id": "u2", "business_unit_ids": ["bu-2"]})

    result = await svc.export_user_details_pdf("u2", business_unit_ids=["bu-1"])

    assert result["status"] == "error"
    assert result["status_code"] == 403
    assert result["error_code"] == ErrorCode.FORBIDDEN


def test_check_user_matches_filters_small():
    svc = build_export_service(MagicMock(), MagicMock())
    user = {"id": "u1", "permission": "admin", "is_active": True, "created_at": '2024-01-02T00:00:00Z'}
    assert svc._check_user_matches_filters(user, {"permission": "admin"}) is True
    assert svc._check_user_matches_filters(user, {"is_active": False}) is False
