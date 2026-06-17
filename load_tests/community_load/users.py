from __future__ import annotations

import logging
import random
from io import BytesIO
from typing import Any

from locust import HttpUser, between, events, task

from .auth import authenticate
from .cleanup import (
    CleanupRegistry,
    delete_admin_announcement,
    delete_prompt_category,
    delete_prompt_subcategory,
    permanent_delete_job,
)
from .config import CONFIG
from .data import announcement_payload, category_payload, subcategory_payload
from .openapi import load_schema, write_endpoint_artifacts

LOGGER = logging.getLogger(__name__)


@events.init.add_listener
def on_locust_init(environment: Any, **_: Any) -> None:
    try:
        schema = load_schema()
        json_path, md_path = write_endpoint_artifacts(schema)
        LOGGER.info("endpoint map refreshed: %s and %s", json_path, md_path)
    except Exception:
        LOGGER.exception("endpoint map refresh failed")


class CommunityApiUser(HttpUser):
    abstract = True
    host = CONFIG.host
    wait_time = between(1, 4)

    def on_start(self) -> None:
        self.cleanup_registry = CleanupRegistry()
        self.current_user = authenticate(self.client)
        self.category_ids: list[str] = []
        self.subcategory_ids: list[str] = []
        self.job_ids: list[str] = []
        self.announcement_ids: list[str] = []

    def on_stop(self) -> None:
        self.cleanup_registry.cleanup_all(self.client)

    def _json(self, response: Any) -> dict[str, Any]:
        try:
            payload = response.json()
        except Exception:
            return {}
        return payload if isinstance(payload, dict) else {}

    def _remember_from_list(self, payload: dict[str, Any]) -> None:
        for key, target in (
            ("jobs", self.job_ids),
            ("items", self.announcement_ids),
            ("announcements", self.announcement_ids),
            ("business_units", []),
            ("categories", self.category_ids),
            ("subcategories", self.subcategory_ids),
        ):
            value = payload.get(key)
            if not isinstance(value, list):
                continue
            for item in value[: CONFIG.endpoint_sample_limit]:
                if isinstance(item, dict):
                    item_id = item.get("id") or item.get("category_id") or item.get("subcategory_id")
                    if isinstance(item_id, str) and item_id not in target:
                        target.append(item_id)

        data = payload.get("data")
        if isinstance(data, list):
            for category in data[: CONFIG.endpoint_sample_limit]:
                if not isinstance(category, dict):
                    continue
                category_id = category.get("category_id")
                if isinstance(category_id, str) and category_id not in self.category_ids:
                    self.category_ids.append(category_id)
                for subcategory in category.get("subcategories", [])[: CONFIG.endpoint_sample_limit]:
                    if isinstance(subcategory, dict):
                        subcategory_id = subcategory.get("subcategory_id")
                        if isinstance(subcategory_id, str) and subcategory_id not in self.subcategory_ids:
                            self.subcategory_ids.append(subcategory_id)

    def get_json(self, path: str, name: str, **params: Any) -> dict[str, Any]:
        response = self.client.get(path, params=params or None, name=name, catch_response=True)
        with response:
            if response.status_code >= 500:
                response.failure(f"server error HTTP {response.status_code}")
                return {}
            payload = self._json(response)
            self._remember_from_list(payload)
            response.success()
            return payload

    def _write_flow_enabled(self, flow: str, *, requires_admin: bool = False) -> bool:
        if not CONFIG.enable_writes or flow not in CONFIG.allowed_write_flows:
            return False
        if requires_admin and not CONFIG.enable_admin_writes:
            return False
        return True

    def _create_uploaded_job(self, path: str, name: str) -> None:
        response = self.client.post(
            path,
            files={
                "file": (
                    "locust-load-test.bin",
                    BytesIO(b"Community Brief load test data"),
                    "application/octet-stream",
                )
            },
            data={"pre_session_form_data": '{"source":"locust"}'},
            name=name,
            catch_response=True,
        )
        with response:
            if response.status_code >= 400:
                response.failure(f"job create failed: HTTP {response.status_code}")
                return
            payload = self._json(response)
            job_id = payload.get("id")
            if not isinstance(job_id, str):
                response.failure("job create response did not include id")
                return
            self.cleanup_registry.add("job", job_id, permanent_delete_job)
            response.success()


class ReadOnlyApiUser(CommunityApiUser):
    weight = 8

    @task(4)
    def list_jobs(self) -> None:
        self.get_json("/api/v1/jobs", "GET /api/v1/jobs", limit=12, offset=0)

    @task(3)
    def prompt_catalogue(self) -> None:
        self.get_json("/api/v1/prompts/categories", "GET /api/v1/prompts/categories", limit=50, offset=0)
        self.get_json("/api/v1/prompts/subcategories", "GET /api/v1/prompts/subcategories", limit=50, offset=0)
        self.get_json("/api/v1/prompts/retrieve_prompts", "GET /api/v1/prompts/retrieve_prompts")

    @task(2)
    def auth_and_permissions(self) -> None:
        self.get_json("/api/v1/auth/me", "GET /api/v1/auth/me")
        self.get_json("/api/v1/auth/users/me/permissions", "GET /api/v1/auth/users/me/permissions")

    @task(2)
    def business_units_and_announcements(self) -> None:
        self.get_json("/api/v1/business-units", "GET /api/v1/business-units", limit=50, offset=0)
        self.get_json("/api/v1/announcements", "GET /api/v1/announcements")

    @task(1)
    def health(self) -> None:
        self.client.get("/health/live", name="GET /health/live")
        self.client.get("/health/ready", name="GET /health/ready")

    @task(1)
    def sampled_detail_reads(self) -> None:
        if self.category_ids:
            category_id = random.choice(self.category_ids)
            self.get_json(f"/api/v1/prompts/categories/{category_id}", "GET /api/v1/prompts/categories/{id}")
        if self.subcategory_ids:
            subcategory_id = random.choice(self.subcategory_ids)
            self.get_json(f"/api/v1/prompts/subcategories/{subcategory_id}", "GET /api/v1/prompts/subcategories/{id}")
            self.get_json(
                f"/api/v1/prompts/subcategories/{subcategory_id}/versions",
                "GET /api/v1/prompts/subcategories/{id}/versions",
                limit=10,
                offset=0,
            )
        if self.job_ids:
            job_id = random.choice(self.job_ids)
            self.get_json(f"/api/v1/jobs/{job_id}", "GET /api/v1/jobs/{id}")


class WriteCleanupApiUser(CommunityApiUser):
    weight = 1
    wait_time = between(4, 9)

    @task(3)
    def create_prompt_category_and_subcategory(self) -> None:
        if not self._write_flow_enabled("prompts"):
            return

        response = self.client.post(
            "/api/v1/prompts/categories",
            json=category_payload(),
            name="POST /api/v1/prompts/categories",
            catch_response=True,
        )
        with response:
            if response.status_code >= 400:
                response.failure(f"category create failed: HTTP {response.status_code}")
                return
            category = self._json(response)
            category_id = category.get("id")
            if not isinstance(category_id, str):
                response.failure("category create response did not include id")
                return
            self.cleanup_registry.add("prompt-category", category_id, delete_prompt_category)
            response.success()

        response = self.client.post(
            "/api/v1/prompts/subcategories",
            json=subcategory_payload(category_id),
            name="POST /api/v1/prompts/subcategories",
            catch_response=True,
        )
        with response:
            if response.status_code >= 400:
                response.failure(f"subcategory create failed: HTTP {response.status_code}")
                return
            subcategory = self._json(response)
            subcategory_id = subcategory.get("id")
            if not isinstance(subcategory_id, str):
                response.failure("subcategory create response did not include id")
                return
            self.cleanup_registry.add("prompt-subcategory", subcategory_id, delete_prompt_subcategory)
            response.success()

    @task(2)
    def create_job_via_jobs_route(self) -> None:
        if not self._write_flow_enabled("jobs", requires_admin=True):
            return

        self._create_uploaded_job("/api/v1/jobs", "POST /api/v1/jobs")

    @task(2)
    def create_job_via_upload_route(self) -> None:
        if not self._write_flow_enabled("upload", requires_admin=True):
            return

        self._create_uploaded_job("/api/v1/upload/job", "POST /api/v1/upload/job")

    @task(1)
    def create_admin_announcement(self) -> None:
        if not self._write_flow_enabled("announcements", requires_admin=True):
            return

        response = self.client.post(
            "/api/v1/admin/announcements",
            json=announcement_payload(),
            name="POST /api/v1/admin/announcements",
            catch_response=True,
        )
        with response:
            if response.status_code in {401, 403, 404}:
                response.success()
                return
            if response.status_code >= 400:
                response.failure(f"announcement create failed: HTTP {response.status_code}")
                return
            payload = self._json(response)
            announcement = payload.get("announcement")
            announcement_id = announcement.get("id") if isinstance(announcement, dict) else None
            if not isinstance(announcement_id, str):
                response.failure("announcement create response did not include id")
                return
            self.cleanup_registry.add("announcement", announcement_id, delete_admin_announcement)
            response.success()
