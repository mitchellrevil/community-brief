from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Dict, List

from ...core.errors.domain import ResourceNotFoundError
from ...repositories.jobs import JobRepository


class JobChatHistoryService:
    """Owns chat-history persistence for job analysis conversations."""

    def __init__(self, job_repository: JobRepository):
        self.repository = job_repository

    async def get_job(self, job_id: str) -> Dict[str, Any]:
        job = await self.repository.get_by_id(job_id)
        if not job:
            raise ResourceNotFoundError("Job", job_id)
        return job

    async def _resolve_job(self, job_id: str, job: Dict[str, Any] | None) -> Dict[str, Any]:
        return job if job is not None else await self.get_job(job_id)

    async def save_message(
        self,
        job_id: str,
        *,
        role: str,
        content: str,
        job: Dict[str, Any] | None = None,
    ) -> int:
        job = await self._resolve_job(job_id, job)
        chat_history = job.setdefault("chat_history", [])
        chat_history.append(
            {
                "role": role,
                "content": content,
                "timestamp": datetime.now(UTC).isoformat(),
            }
        )
        await self.repository.replace(job_id, job)
        return len(chat_history)

    async def get_history(self, job_id: str, *, job: Dict[str, Any] | None = None) -> List[Dict[str, Any]]:
        job = await self._resolve_job(job_id, job)
        return job.get("chat_history", [])

    async def clear_history(self, job_id: str, *, job: Dict[str, Any] | None = None) -> None:
        job = await self._resolve_job(job_id, job)
        job["chat_history"] = []
        job.pop("chat_response_id", None)
        await self.repository.replace(job_id, job)

    async def store_response_id(self, job_id: str, response_id: str) -> None:
        job = await self.get_job(job_id)
        job["chat_response_id"] = response_id
        await self.repository.replace(job_id, job)

    async def update_analysis_text(self, job_id: str, analysis_text: str) -> None:
        job = await self.get_job(job_id)
        job["analysis_text"] = analysis_text
        await self.repository.replace(job_id, job)
