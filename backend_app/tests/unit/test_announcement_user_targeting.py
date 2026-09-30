import time
import pytest
from unittest.mock import MagicMock

from backend_app.app.repositories.announcements import AnnouncementRepository
from backend_app.app.services.announcement_service import AnnouncementService


class DummyContainer:
    def __init__(self, items):
        self._items = items

    def query_items(self, query, parameters=None):
        # Emulate server-side filtering used by AnnouncementService SQL query
        params = {p["name"]: p["value"] for p in (parameters or [])}
        user_role = params.get("@user_role")
        user_id = params.get("@user_id")
        user_email = params.get("@user_email")
        now = params.get("@now", int(time.time() * 1000))

        async def _aiter():
            for item in self._items:
                # basic filters: must be announcement and active
                if item.get("type") != "announcement":
                    continue
                if not item.get("is_active", False):
                    continue

                # time window checks
                start_at = item.get("start_at")
                if start_at is not None and start_at > now:
                    continue
                end_at = item.get("end_at")
                if end_at is not None and end_at <= now:
                    continue

                # role-based visibility
                target_roles = item.get("target_roles") or []
                role_visible = (not target_roles) or (user_role in target_roles)

                # user-based visibility
                target_user_ids = item.get("target_user_ids") or []
                target_user_emails = item.get("target_user_emails") or []
                user_visible = (user_id in target_user_ids) or (user_email in target_user_emails)

                # If per-user targeting arrays are present (non-empty) they act as an allow-list.
                if target_user_ids or target_user_emails:
                    if user_visible:
                        yield item
                else:
                    if role_visible:
                        yield item

        return _aiter()


@pytest.mark.asyncio
async def test_targeted_announcement_visible_to_target_user():
    now_ms = int(time.time() * 1000)
    targeted = {
        "id": "a1",
        "type": "announcement",
        "is_active": True,
        "created_at": now_ms,
        "target_user_emails": ["target@example.com"],
    }

    admin_only = {
        "id": "a2",
        "type": "announcement",
        "is_active": True,
        "created_at": now_ms,
        "target_roles": ["ADMIN"],
    }

    cosmos = MagicMock()
    cosmos.get_container = MagicMock(return_value=DummyContainer([targeted, admin_only]))

    svc = AnnouncementService(AnnouncementRepository(cosmos))

    user = {"id": "u1", "email": "target@example.com", "permission": "USER"}
    results = await svc.get_active_announcements_for_user(user)

    assert any(a["id"] == "a1" for a in results)
    assert not any(a["id"] == "a2" for a in results)


@pytest.mark.asyncio
async def test_targeted_announcement_not_visible_to_other_user():
    now_ms = int(time.time() * 1000)
    targeted = {
        "id": "a1",
        "type": "announcement",
        "is_active": True,
        "created_at": now_ms,
        "target_user_emails": ["target@example.com"],
    }

    cosmos = MagicMock()
    cosmos.get_container = MagicMock(return_value=DummyContainer([targeted]))

    svc = AnnouncementService(AnnouncementRepository(cosmos))

    user = {"id": "u2", "email": "other@example.com", "permission": "USER"}
    results = await svc.get_active_announcements_for_user(user)

    assert not any(a["id"] == "a1" for a in results)
