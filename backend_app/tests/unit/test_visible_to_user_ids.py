"""Tests for per-user meeting type visibility (visible_to_user_ids allowlist)."""
import pytest
from unittest.mock import AsyncMock, MagicMock

from backend_app.app.models.prompt_visibility import (
    can_user_access_subcategory,
    normalize_prompt_visibility,
    normalize_visible_to_user_ids,
)
from backend_app.app.api.v1.routes import prompts as prompts_mod


# ─── Unit tests for normalize_visible_to_user_ids ─────────────────────

class TestNormalizeVisibleToUserIds:
    def test_none_returns_none(self):
        assert normalize_visible_to_user_ids(None) is None

    def test_empty_list_returns_none(self):
        assert normalize_visible_to_user_ids([]) is None

    def test_whitespace_only_entries_returns_none(self):
        assert normalize_visible_to_user_ids(["", "  ", ""]) is None

    def test_deduplicates(self):
        result = normalize_visible_to_user_ids(["user1", "user2", "user1", "user2"])
        assert result == ["user1", "user2"]

    def test_strips_whitespace(self):
        result = normalize_visible_to_user_ids(["  user1  ", "user2 "])
        assert result == ["user1", "user2"]

    def test_preserves_order(self):
        result = normalize_visible_to_user_ids(["b", "a", "c"])
        assert result == ["b", "a", "c"]


class TestNormalizePromptVisibility:
    def test_accepts_current_values(self):
        assert normalize_prompt_visibility("all") == "all"
        assert normalize_prompt_visibility("only_editors") == "only_editors"
        assert normalize_prompt_visibility("nobody") == "nobody"

    def test_defaults_missing_values_to_all(self):
        assert normalize_prompt_visibility(None) == "all"
        assert normalize_prompt_visibility("") == "all"
        assert normalize_prompt_visibility("   ") == "all"

    @pytest.mark.parametrize(
        "value",
        ["editors_only", "only editors", "none", "archive", "archived", "random"],
    )
    def test_rejects_old_aliases_and_unknown_values(self, value):
        with pytest.raises(ValueError, match="Invalid prompt_visibility"):
            normalize_prompt_visibility(value)


# ─── Unit tests for can_user_access_subcategory ───────────────────────

class TestCanUserAccessSubcategory:
    def test_no_user_returns_false(self):
        subcategory = {"prompt_visibility": "all"}
        assert can_user_access_subcategory(None, subcategory) is False

    def test_nobody_visibility_blocks(self):
        subcategory = {"prompt_visibility": "nobody"}
        user = {"id": "u1", "permission": "admin"}
        assert can_user_access_subcategory(user, subcategory) is False

    def test_only_editors_blocks_user(self):
        subcategory = {"prompt_visibility": "only_editors"}
        user = {"id": "u1", "permission": "user"}
        assert can_user_access_subcategory(user, subcategory) is False

    def test_only_editors_allows_editor(self):
        subcategory = {"prompt_visibility": "only_editors"}
        user = {"id": "u1", "permission": "editor"}
        assert can_user_access_subcategory(user, subcategory) is True

    def test_only_editors_allows_allowlisted_user(self):
        subcategory = {"prompt_visibility": "only_editors", "visible_to_user_ids": ["u1"]}
        user = {"id": "u1", "permission": "user"}
        assert can_user_access_subcategory(user, subcategory) is True

    def test_all_visibility_no_allowlist_allows(self):
        subcategory = {"prompt_visibility": "all"}
        user = {"id": "u1", "permission": "user"}
        assert can_user_access_subcategory(user, subcategory) is True

    def test_allowlist_blocks_non_listed_user(self):
        subcategory = {"prompt_visibility": "all", "visible_to_user_ids": ["allowed_user"]}
        user = {"id": "blocked_user", "permission": "user"}
        assert can_user_access_subcategory(user, subcategory) is False

    def test_allowlist_allows_listed_user(self):
        subcategory = {"prompt_visibility": "all", "visible_to_user_ids": ["allowed_user"]}
        user = {"id": "allowed_user", "permission": "user"}
        assert can_user_access_subcategory(user, subcategory) is True

    def test_allowlist_allows_listed_email(self):
        subcategory = {"prompt_visibility": "all", "visible_to_user_ids": ["user@example.org"]}
        user = {"id": "user_1771620194780", "email": "User@example.org", "permission": "user"}
        assert can_user_access_subcategory(user, subcategory) is True

    def test_allowlist_allows_listed_internal_id_when_user_id_field_is_email(self):
        subcategory = {"prompt_visibility": "all", "visible_to_user_ids": ["user_1771620194780"]}
        user = {
            "id": "user_1771620194780",
            "user_id": "user@example.org",
            "email": "user@example.org",
            "permission": "user",
        }
        assert can_user_access_subcategory(user, subcategory) is True

    def test_empty_allowlist_means_unrestricted(self):
        subcategory = {"prompt_visibility": "all", "visible_to_user_ids": []}
        user = {"id": "any_user", "permission": "user"}
        assert can_user_access_subcategory(user, subcategory) is True

    def test_none_allowlist_means_unrestricted(self):
        subcategory = {"prompt_visibility": "all", "visible_to_user_ids": None}
        user = {"id": "any_user", "permission": "user"}
        assert can_user_access_subcategory(user, subcategory) is True

    def test_nobody_visibility_comes_before_allowlist(self):
        # Even if user is in allowlist, nobody visibility blocks
        subcategory = {"prompt_visibility": "nobody", "visible_to_user_ids": ["u1"]}
        user = {"id": "u1", "permission": "admin"}
        assert can_user_access_subcategory(user, subcategory) is False

    def test_business_unit_access_checked_when_service_provided(self):
        perm_service = MagicMock()
        perm_service.has_business_unit_access = MagicMock(return_value=False)
        subcategory = {"prompt_visibility": "all"}
        user = {"id": "u1", "permission": "user"}
        assert can_user_access_subcategory(
            user, subcategory, permission_service=perm_service, business_unit_id="bu1"
        ) is False
        perm_service.has_business_unit_access.assert_called_once_with(user, "bu1")

    def test_business_unit_access_passes_when_allowed(self):
        perm_service = MagicMock()
        perm_service.has_business_unit_access = MagicMock(return_value=True)
        subcategory = {"prompt_visibility": "all"}
        user = {"id": "u1", "permission": "user"}
        assert can_user_access_subcategory(
            user, subcategory, permission_service=perm_service, business_unit_id="bu1"
        ) is True

    def test_business_unit_access_uses_current_user_when_no_service_provided(self):
        subcategory = {"prompt_visibility": "all"}
        user = {"id": "u1", "permission": "user", "business_unit_ids": ["bu2"]}
        assert can_user_access_subcategory(user, subcategory, business_unit_id="bu1") is False


# ─── Router-level tests for retrieve_prompts filtering ────────────────

@pytest.mark.asyncio
async def test_retrieve_prompts_filters_by_allowlist():
    """retrieve_prompts should hide subcategories where user is not in visible_to_user_ids."""
    mock_prompt_service = AsyncMock()
    mock_prompt_service.retrieve_prompts_hierarchy.return_value = [
        {
            "category_name": "Cat1",
            "category_id": "cat1",
            "subcategories": [
                {"subcategory_name": "Open", "subcategory_id": "s1", "prompt_visibility": "all", "visible_to_user_ids": None},
                {"subcategory_name": "Restricted", "subcategory_id": "s2", "prompt_visibility": "all", "visible_to_user_ids": ["other_user"]},
                {"subcategory_name": "Allowed", "subcategory_id": "s3", "prompt_visibility": "all", "visible_to_user_ids": ["test_user"]},
            ],
        }
    ]

    result = await prompts_mod.retrieve_prompts(
        current_user={"id": "test_user", "permission": "user"},
        auth_context="user",
        prompt_service=mock_prompt_service,
    )

    subcategory_ids = [s["subcategory_id"] for s in result["data"][0]["subcategories"]]
    assert "s1" in subcategory_ids  # unrestricted
    assert "s2" not in subcategory_ids  # user not in allowlist
    assert "s3" in subcategory_ids  # user in allowlist


@pytest.mark.asyncio
async def test_retrieve_prompts_empty_allowlist_means_unrestricted():
    """Empty visible_to_user_ids should not filter anyone out."""
    mock_prompt_service = AsyncMock()
    mock_prompt_service.retrieve_prompts_hierarchy.return_value = [
        {
            "category_name": "Cat1",
            "category_id": "cat1",
            "subcategories": [
                {"subcategory_name": "Open", "subcategory_id": "s1", "prompt_visibility": "all", "visible_to_user_ids": []},
            ],
        }
    ]

    result = await prompts_mod.retrieve_prompts(
        current_user={"id": "any_user", "permission": "user"},
        auth_context="user",
        prompt_service=mock_prompt_service,
    )

    assert len(result["data"][0]["subcategories"]) == 1


# ─── Router-level tests for list_subcategories filtering ──────────────

@pytest.mark.asyncio
async def test_list_subcategories_filters_by_allowlist():
    """list_subcategories without include_hidden should filter by allowlist."""
    mock_prompt_service = AsyncMock()
    mock_prompt_service.list_subcategories.return_value = {
        "items": [
            {"id": "s1", "name": "Open", "prompt_visibility": "all", "visible_to_user_ids": None},
            {"id": "s2", "name": "Restricted", "prompt_visibility": "all", "visible_to_user_ids": ["other"]},
        ],
        "total": 2,
        "limit": 50,
        "offset": 0,
    }
    mock_talking_points_service = MagicMock()
    mock_talking_points_service.ensure_talking_points_structure = lambda x: x

    result = await prompts_mod.list_subcategories(
        category_id=None,
        limit=50,
        offset=0,
        include_hidden=False,
        current_user={"id": "test_user", "permission": "user"},
        auth_context="user",
        prompt_service=mock_prompt_service,
        talking_points_service=mock_talking_points_service,
    )

    assert len(result["subcategories"]) == 1
    assert result["subcategories"][0]["id"] == "s1"


@pytest.mark.asyncio
async def test_list_subcategories_include_hidden_returns_all_for_editor():
    """list_subcategories with include_hidden=True returns all items for editors."""
    mock_prompt_service = AsyncMock()
    mock_prompt_service.list_subcategories.return_value = {
        "items": [
            {"id": "s1", "name": "Open", "prompt_visibility": "all", "visible_to_user_ids": None},
            {"id": "s2", "name": "Restricted", "prompt_visibility": "all", "visible_to_user_ids": ["other"]},
        ],
        "total": 2,
        "limit": 50,
        "offset": 0,
    }
    mock_talking_points_service = MagicMock()
    mock_talking_points_service.ensure_talking_points_structure = lambda x: x

    result = await prompts_mod.list_subcategories(
        category_id=None,
        limit=50,
        offset=0,
        include_hidden=True,
        current_user={"id": "editor_user", "permission": "editor"},
        auth_context="editor",
        prompt_service=mock_prompt_service,
        talking_points_service=mock_talking_points_service,
    )

    assert len(result["subcategories"]) == 2


@pytest.mark.asyncio
async def test_list_subcategories_include_hidden_still_filters_cross_business_unit_for_editor():
    mock_prompt_service = AsyncMock()
    mock_prompt_service.list_subcategories.return_value = {
        "items": [
            {"id": "s1", "category_id": "cat1", "name": "Own BU", "prompt_visibility": "all", "visible_to_user_ids": ["other"]},
            {"id": "s2", "category_id": "cat2", "name": "Other BU", "prompt_visibility": "all", "visible_to_user_ids": None},
        ],
        "total": 2,
        "limit": 50,
        "offset": 0,
    }
    mock_prompt_service.get_business_unit_id_from_category = AsyncMock(side_effect=["bu1", "bu2"])
    mock_talking_points_service = MagicMock()
    mock_talking_points_service.ensure_talking_points_structure = lambda x: x

    result = await prompts_mod.list_subcategories(
        category_id=None,
        limit=50,
        offset=0,
        include_hidden=True,
        current_user={"id": "editor_user_bu_filter", "permission": "editor", "business_unit_ids": ["bu1"]},
        auth_context="editor",
        prompt_service=mock_prompt_service,
        talking_points_service=mock_talking_points_service,
    )

    assert [item["id"] for item in result["subcategories"]] == ["s1"]


@pytest.mark.asyncio
async def test_list_subcategories_include_hidden_still_filters_for_non_editor():
    """Non-editors cannot bypass visibility filtering by passing include_hidden=True."""
    mock_prompt_service = AsyncMock()
    mock_prompt_service.list_subcategories.return_value = {
        "items": [
            {"id": "s1", "name": "Open", "prompt_visibility": "all", "visible_to_user_ids": None},
            {"id": "s2", "name": "Restricted", "prompt_visibility": "all", "visible_to_user_ids": ["other"]},
            {"id": "s3", "name": "Editors Only", "prompt_visibility": "only_editors", "visible_to_user_ids": None},
        ],
        "total": 3,
        "limit": 50,
        "offset": 0,
    }
    mock_talking_points_service = MagicMock()
    mock_talking_points_service.ensure_talking_points_structure = lambda x: x

    result = await prompts_mod.list_subcategories(
        category_id=None,
        limit=50,
        offset=0,
        include_hidden=True,
        current_user={"id": "test_user", "permission": "user"},
        auth_context="user",
        prompt_service=mock_prompt_service,
        talking_points_service=mock_talking_points_service,
    )

    # Only s1 is accessible: s2 is allowlisted to "other", s3 requires editor role.
    assert len(result["subcategories"]) == 1
    assert result["subcategories"][0]["id"] == "s1"


# ─── Upload enforcement test ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_upload_validate_rejects_non_allowlisted_user():
    """validate_prompt_subcategory_usage should reject user not in visible_to_user_ids."""
    from backend_app.app.services.uploads.upload_workflow_service import validate_prompt_subcategory_usage
    from backend_app.app.core.errors.domain import ApplicationError

    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_subcategory.return_value = {
        "id": "sub1",
        "category_id": "cat1",
        "prompt_visibility": "all",
        "visible_to_user_ids": ["allowed_user"],
    }

    with pytest.raises(ApplicationError) as exc_info:
        await validate_prompt_subcategory_usage(
            prompt_service=mock_prompt_service,
            current_user={"id": "blocked_user", "permission": "user"},
            prompt_subcategory_id="sub1",
        )

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_upload_validate_allows_allowlisted_user():
    """validate_prompt_subcategory_usage should allow user in visible_to_user_ids."""
    from backend_app.app.services.uploads.upload_workflow_service import validate_prompt_subcategory_usage

    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_subcategory.return_value = {
        "id": "sub1",
        "category_id": "cat1",
        "prompt_visibility": "all",
        "visible_to_user_ids": ["allowed_user"],
    }

    # Should not raise
    await validate_prompt_subcategory_usage(
        prompt_service=mock_prompt_service,
        current_user={"id": "allowed_user", "permission": "user"},
        prompt_subcategory_id="sub1",
    )


@pytest.mark.asyncio
async def test_upload_validate_unrestricted_when_no_allowlist():
    """validate_prompt_subcategory_usage allows any user when no allowlist set."""
    from backend_app.app.services.uploads.upload_workflow_service import validate_prompt_subcategory_usage

    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_subcategory.return_value = {
        "id": "sub1",
        "category_id": "cat1",
        "prompt_visibility": "all",
        "visible_to_user_ids": None,
    }

    # Should not raise
    await validate_prompt_subcategory_usage(
        prompt_service=mock_prompt_service,
        current_user={"id": "any_user", "permission": "user"},
        prompt_subcategory_id="sub1",
    )


@pytest.mark.asyncio
async def test_upload_validate_rejects_cross_business_unit_user():
    from backend_app.app.services.uploads.upload_workflow_service import validate_prompt_subcategory_usage
    from backend_app.app.core.errors.domain import ApplicationError

    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_subcategory.return_value = {
        "id": "sub1",
        "category_id": "cat1",
        "prompt_visibility": "all",
        "visible_to_user_ids": None,
    }
    mock_prompt_service.get_business_unit_id_from_category.return_value = "bu2"

    with pytest.raises(ApplicationError) as exc_info:
        await validate_prompt_subcategory_usage(
            prompt_service=mock_prompt_service,
            current_user={"id": "user_1", "permission": "user", "business_unit_ids": ["bu1"]},
            prompt_subcategory_id="sub1",
        )

    assert exc_info.value.status_code == 403
