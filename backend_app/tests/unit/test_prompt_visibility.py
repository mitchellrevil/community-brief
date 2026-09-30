import pytest

from app.models.prompt_visibility import (
    can_user_access_template,
    normalize_prompt_visibility,
    normalize_visible_to_user_ids,
)


pytestmark = pytest.mark.unit


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, None),
        ([], None),
        (["", "  "], None),
        ([" user1 ", "user2", "user1"], ["user1", "user2"]),
    ],
)
def test_normalize_visible_to_user_ids(value, expected):
    assert normalize_visible_to_user_ids(value) == expected


@pytest.mark.parametrize("value", [None, "", "   "])
def test_missing_visibility_defaults_to_all(value):
    assert normalize_prompt_visibility(value) == "all"


@pytest.mark.parametrize("value", ["editors_only", "archive", "random"])
def test_unknown_visibility_is_rejected(value):
    with pytest.raises(ValueError, match="Invalid prompt_visibility"):
        normalize_prompt_visibility(value)


def test_nobody_is_hidden_even_from_allowlisted_admin():
    assert not can_user_access_template(
        {"id": "u1", "permission": "admin"},
        {"visibility": "nobody", "visible_to_user_ids": ["u1"]},
    )


def test_allowlist_can_grant_editor_only_item_to_user():
    assert can_user_access_template(
        {"id": "u1", "permission": "user"},
        {"visibility": "only_editors", "visible_to_user_ids": ["u1"]},
    )


def test_allowlist_matches_email_case_insensitively():
    assert can_user_access_template(
        {"id": "internal", "email": "User@Example.test", "permission": "user"},
        {"visibility": "all", "visible_to_user_ids": ["user@example.test"]},
    )


def test_business_unit_assignment_does_not_restrict_template_use():
    assert can_user_access_template(
        {"id": "u1", "permission": "user", "business_unit_ids": ["bu-1"]},
        {
            "visibility": "all",
            "visible_to_user_ids": ["u1"],
            "business_unit_id": "bu-2",
        },
    )
