from unittest.mock import AsyncMock, MagicMock

import pytest

from backend_app.app.api.v1.routes import analytics as export_mod


@pytest.mark.asyncio
async def test_export_system_csv_delegates_to_workflow():
    workflow = AsyncMock()
    workflow.export_system_csv.return_value = "response"

    result = await export_mod.export_system_csv(
        days=7,
        business_unit_id=None,
        current_user={"permission": "Admin"},
        export_workflow=workflow,
    )

    assert result == "response"
    workflow.export_system_csv.assert_awaited_once_with(
        days=7,
        business_unit_id=None,
        current_user={"permission": "Admin"},
    )


@pytest.mark.asyncio
async def test_export_system_prompts_delegates_to_workflow():
    workflow = AsyncMock()
    workflow.export_system_prompts.return_value = "response"

    result = await export_mod.export_system_prompts(
        days=30,
        business_unit_id="bu-1",
        current_user={"permission": "Admin"},
        export_workflow=workflow,
    )

    assert result == "response"
    workflow.export_system_prompts.assert_awaited_once_with(
        days=30,
        business_unit_id="bu-1",
        current_user={"permission": "Admin"},
    )


@pytest.mark.asyncio
async def test_export_users_delegates_to_workflow():
    workflow = MagicMock()
    workflow.export_users.return_value = "response"
    current_user = {"permission": "Editor", "business_unit_ids": ["bu-1"]}

    result = await export_mod.export_users(
        "csv",
        export_request={"filters": {"permission": "Admin"}},
        current_user=current_user,
        export_workflow=workflow,
    )

    assert result == "response"
    workflow.export_users.assert_called_once_with(
        format="csv",
        export_request={"filters": {"permission": "Admin"}},
        current_user=current_user,
    )


@pytest.mark.asyncio
async def test_export_user_pdf_delegates_to_workflow():
    workflow = AsyncMock()
    workflow.export_user_pdf.return_value = "response"
    current_user = {"permission": "Editor", "business_unit_ids": ["bu-1"]}

    result = await export_mod.export_user_pdf(
        user_id="u1",
        include_analytics=True,
        days=7,
        current_user=current_user,
        export_workflow=workflow,
    )

    assert result == "response"
    workflow.export_user_pdf.assert_awaited_once_with(
        user_id="u1",
        include_analytics=True,
        days=7,
        current_user=current_user,
    )
