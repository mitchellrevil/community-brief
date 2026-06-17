from __future__ import annotations

import time

from .config import CONFIG


def unique_name(prefix: str) -> str:
    return f"{prefix}-{CONFIG.run_id}-{int(time.time() * 1000)}"


def category_payload() -> dict[str, str]:
    return {"name": unique_name("locust-category")}


def subcategory_payload(category_id: str) -> dict[str, object]:
    return {
        "name": unique_name("locust-subcategory"),
        "category_id": category_id,
        "prompts": {
            "summary": "Write a concise summary for load test cleanup verification.",
        },
        "preSessionTalkingPoints": [],
        "inSessionTalkingPoints": [],
        "prompt_visibility": "all",
    }


def announcement_payload() -> dict[str, object]:
    now_ms = int(time.time() * 1000)
    return {
        "title": unique_name("Locust announcement"),
        "message": "Temporary load-test announcement. This should be deleted by cleanup.",
        "announcement_type": "info",
        "priority": 0,
        "is_active": False,
        "target_roles": [],
        "target_service_areas": [],
        "start_at": now_ms,
        "end_at": now_ms + 60_000,
    }
