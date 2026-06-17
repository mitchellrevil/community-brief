import pytest
from unittest.mock import AsyncMock, MagicMock

from backend_app.app.api.v1.routes import prompts as prompts_mod
from backend_app.app.core.errors.domain import ValidationError, ApplicationError, ResourceNotFoundError


@pytest.mark.asyncio
async def test_create_subcategory_invalid_talking_points_raises():
    svc = MagicMock()
    svc.validate_talking_points_structure.side_effect = ValueError("bad structure")

    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_category = AsyncMock(return_value={"id": "cat_1", "business_unit_id": "bu1"})

    perm = MagicMock()
    perm.set_prompt_service = MagicMock()
    perm.can_edit_category = AsyncMock(return_value=True)

    talking_svc = MagicMock()
    talking_svc.validate_talking_points_structure.side_effect = ValueError("invalid")

    from backend_app.app.schemas.prompts import SubcategoryCreate

    sub = SubcategoryCreate(
        category_id="cat_1",
        name="sub",
        prompts={"system": "x"},
        preSessionTalkingPoints=[{"a": 1}],
        inSessionTalkingPoints=[],
    )

    with pytest.raises(ValidationError):
        await prompts_mod.create_subcategory(
            subcategory=sub,
            current_user={"id": "u1"},
            auth_context="editor",
            prompt_service=mock_prompt_service,
            perm_service=perm,
            talking_points_service=talking_svc,
            prompt_version_service=MagicMock(),
        )


@pytest.mark.asyncio
async def test_move_subcategory_failure_raises_application_error():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_subcategory.return_value = {"id": "sub1", "business_unit_id": "bu1"}
    mock_prompt_service.get_category.return_value = {"id": "cat2", "business_unit_id": "bu1"}
    mock_prompt_service.move_subcategory.return_value = None

    perm = MagicMock()
    perm.set_prompt_service = MagicMock()
    perm.can_edit_prompt = AsyncMock(return_value=True)
    perm.can_edit_category = AsyncMock(return_value=True)

    talking_svc = MagicMock()

    with pytest.raises(ApplicationError):
        await prompts_mod.move_subcategory(
            subcategory_id="sub1",
            new_category_id="cat2",
            current_user={"id": "u1"},
            auth_context="editor",
            prompt_service=mock_prompt_service,
            perm_service=perm,
            talking_points_service=talking_svc,
            prompt_version_service=MagicMock(),
        )


@pytest.mark.asyncio
async def test_delete_subcategory_permission_denied_raises():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_subcategory.return_value = {"id": "sub1", "business_unit_id": "bu_xyz"}

    perm = MagicMock()
    perm.set_prompt_service = MagicMock()
    perm.can_edit_prompt = AsyncMock(return_value=False)

    with pytest.raises(ApplicationError) as exc:
        await prompts_mod.delete_subcategory(
            subcategory_id="sub1",
            current_user={"id": "u1"},
            auth_context="editor",
            prompt_service=mock_prompt_service,
            perm_service=perm,
            talking_points_service=MagicMock(),
            prompt_version_service=MagicMock(),
        )

    assert exc.value.status_code == 403
