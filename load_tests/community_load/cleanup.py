from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Callable

from locust.clients import HttpSession

LOGGER = logging.getLogger(__name__)


@dataclass
class CreatedResource:
    kind: str
    resource_id: str
    cleanup: Callable[[HttpSession, str], Any]


class CleanupRegistry:
    def __init__(self) -> None:
        self._resources: list[CreatedResource] = []

    def add(self, kind: str, resource_id: str, cleanup: Callable[[HttpSession, str], Any]) -> None:
        self._resources.append(CreatedResource(kind=kind, resource_id=resource_id, cleanup=cleanup))

    def cleanup_all(self, client: HttpSession) -> None:
        while self._resources:
            resource = self._resources.pop()
            try:
                resource.cleanup(client, resource.resource_id)
            except Exception:
                LOGGER.exception("cleanup failed", extra={"kind": resource.kind, "id": resource.resource_id})


def delete_prompt_subcategory(client: HttpSession, resource_id: str) -> None:
    client.delete(f"/api/v1/prompts/subcategories/{resource_id}", name="DELETE /api/v1/prompts/subcategories/{id}")


def delete_prompt_category(client: HttpSession, resource_id: str) -> None:
    client.delete(f"/api/v1/prompts/categories/{resource_id}", name="DELETE /api/v1/prompts/categories/{id}")


def delete_admin_announcement(client: HttpSession, resource_id: str) -> None:
    client.delete(f"/api/v1/admin/announcements/{resource_id}", name="DELETE /api/v1/admin/announcements/{id}")


def permanent_delete_job(client: HttpSession, resource_id: str) -> None:
    client.delete(f"/api/v1/admin/jobs/{resource_id}/permanent", name="DELETE /api/v1/admin/jobs/{id}/permanent")

