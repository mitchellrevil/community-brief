from __future__ import annotations

import json
from collections.abc import AsyncIterator, Sequence
from typing import Any
from urllib.parse import urlparse

from ...core.errors.domain import PermissionError
from ...core.logging import get_logger
from ..storage.blob_service import StorageService
from .chatbot_service import ChatBotService
from .job_chat_history_service import JobChatHistoryService
from .job_permissions import check_job_access

logger = get_logger(__name__)

JOB_CHAT_STREAM_ERRORS = (RuntimeError, OSError, ValueError, TypeError, PermissionError)
MAX_ANALYSIS_PATCH_CHARS = 20_000
MAX_ANALYSIS_MARKDOWN_CHARS = 500_000


class JobAnalysisChatService:
    """Owns analysis chat context assembly and streaming workflow."""

    def __init__(
        self,
        chatbot_service: ChatBotService,
        chat_history_service: JobChatHistoryService,
        storage_service: StorageService,
    ) -> None:
        self.chatbot_service = chatbot_service
        self.chat_history_service = chat_history_service
        self.storage_service = storage_service

    async def stream_chat_response(
        self,
        *,
        job_id: str,
        message: str,
        conversation_history: Sequence[Any],
        max_tokens: int,
        current_user: dict[str, Any],
        ag_ui_messages: Sequence[dict[str, Any]] | None = None,
        thread_id: str | None = None,
        run_id: str | None = None,
        state: dict[str, Any] | None = None,
    ) -> AsyncIterator[str]:
        job = await self.chat_history_service.get_job(job_id)
        if not check_job_access(job, current_user, "view"):
            yield self._ag_ui_error_event("Access denied to job", thread_id or job_id, run_id)
            return

        logger.info(
            "job_chat_stream_requested",
            job_id=job_id,
            user_id=current_user.get("id"),
        )

        try:
            context_prompt = await self._build_context_prompt(job_id, job)
            messages = self._ag_ui_messages_for_request(
                message=message,
                conversation_history=conversation_history,
                ag_ui_messages=ag_ui_messages,
            )
            if not messages:
                raise ValueError("At least one chat message is required")

            agent = self.chatbot_service.build_agent(
                instructions=context_prompt,
                tools=self._build_agent_tools(job_id=job_id, current_user=current_user),
                max_tokens=max_tokens,
            )
            input_data: dict[str, Any] = {
                "thread_id": thread_id or job_id,
                "messages": messages,
            }
            if run_id:
                input_data["run_id"] = run_id
            if state:
                input_data["state"] = state

            logger.info(
                "job_chat_ag_ui_stream_started",
                job_id=job_id,
                message_count=len(messages),
            )

            try:
                from agent_framework_ag_ui import AgentFrameworkAgent
            except (ImportError, ModuleNotFoundError) as exc:  # pragma: no cover - runtime dependency guard
                raise RuntimeError("Microsoft Agent Framework AG-UI integration is not installed") from exc

            async for event in AgentFrameworkAgent(agent, require_confirmation=False).run(input_data):
                yield self._format_ag_ui_event(event)
        except JOB_CHAT_STREAM_ERRORS as exc:
            logger.error(
                "job_chat_ag_ui_generator_failed",
                job_id=job_id,
                error=str(exc),
                error_type=type(exc).__name__,
                exc_info=True,
            )
            yield self._ag_ui_error_event(str(exc), thread_id or job_id, run_id)

    def _build_agent_tools(self, *, job_id: str, current_user: dict[str, Any]) -> list[Any]:
        try:
            from agent_framework import tool
        except (ImportError, ModuleNotFoundError) as exc:  # pragma: no cover - runtime dependency guard
            raise RuntimeError("Microsoft Agent Framework is not installed") from exc

        @tool(
            name="read_transcription",
            description="Read the current job transcription. The job id is already scoped by the server.",
        )
        async def read_transcription() -> str:
            return await self.read_transcription(job_id=job_id, current_user=current_user)

        @tool(
            name="read_analysis_markdown",
            description="Read the current job analysis Markdown when it is stored as analysis.md.",
        )
        async def read_analysis_markdown() -> str:
            return await self.read_analysis_markdown(job_id=job_id, current_user=current_user)

        @tool(
            name="apply_patch",
            description=(
                "Patch the current job's analysis.md by replacing one exact old_text block with new_text. "
                "No file path is accepted; edits are scoped to this job's analysis Markdown blob."
            ),
        )
        async def apply_patch(old_text: str, new_text: str, occurrence: int = 1) -> dict[str, Any]:
            return await self.apply_analysis_patch(
                job_id=job_id,
                current_user=current_user,
                old_text=old_text,
                new_text=new_text,
                occurrence=occurrence,
            )

        return [read_transcription, read_analysis_markdown, apply_patch]

    async def read_transcription(self, *, job_id: str, current_user: dict[str, Any]) -> str:
        job = await self.chat_history_service.get_job(job_id)
        if not check_job_access(job, current_user, "view"):
            raise PermissionError("Access denied to job")

        transcription_text = await self._load_transcription_text(job_id, job)
        return transcription_text or "No transcription is available for this job."

    async def read_analysis_markdown(self, *, job_id: str, current_user: dict[str, Any]) -> str:
        job = await self.chat_history_service.get_job(job_id)
        if not check_job_access(job, current_user, "view"):
            raise PermissionError("Access denied to job")

        analysis_file_path = job.get("analysis_file_path", "")
        if self._is_markdown_analysis(analysis_file_path):
            analysis_text = await self.storage_service.download_text_from_blob(analysis_file_path)
            return analysis_text or job.get("analysis_text") or "analysis.md is empty."

        analysis_text = await self._load_analysis_text(job_id, job)
        if analysis_text:
            return (
                "This job analysis is not stored as Markdown, so it cannot be patched in place. "
                f"Current extracted analysis text:\n\n{analysis_text}"
            )
        return "No analysis Markdown is available for this job."

    async def apply_analysis_patch(
        self,
        *,
        job_id: str,
        current_user: dict[str, Any],
        old_text: str,
        new_text: str,
        occurrence: int = 1,
    ) -> dict[str, Any]:
        if not old_text:
            raise ValueError("old_text is required")
        if len(old_text) > MAX_ANALYSIS_PATCH_CHARS or len(new_text) > MAX_ANALYSIS_PATCH_CHARS:
            raise ValueError("Patch text is too large")

        job = await self.chat_history_service.get_job(job_id)
        if not check_job_access(job, current_user, "edit"):
            raise PermissionError("Edit permission is required to update analysis.md")

        analysis_file_path = job.get("analysis_file_path", "")
        if not self._is_markdown_analysis(analysis_file_path):
            return {
                "status": "unsupported",
                "message": "Analysis edits are only available for Markdown (.md) analysis files.",
            }

        current_text = await self.storage_service.download_text_from_blob(analysis_file_path)
        if current_text is None:
            current_text = job.get("analysis_text") or ""

        matches = current_text.count(old_text)
        if matches == 0:
            return {
                "status": "not_found",
                "message": "old_text was not found in analysis.md.",
            }
        if occurrence < 1 or occurrence > matches:
            return {
                "status": "invalid_occurrence",
                "message": f"occurrence must be between 1 and {matches}.",
                "matches": matches,
            }

        updated_text = self._replace_occurrence(current_text, old_text, new_text, occurrence)
        if len(updated_text) > MAX_ANALYSIS_MARKDOWN_CHARS:
            raise ValueError("Updated analysis.md would be too large")

        await self.storage_service.upload_text_to_blob(
            analysis_file_path,
            updated_text,
            content_type="text/markdown; charset=utf-8",
        )
        await self.chat_history_service.update_analysis_text(job_id, updated_text)

        return {
            "status": "applied",
            "message": "analysis.md updated.",
            "matches": matches,
            "analysis_length": len(updated_text),
        }

    async def _build_context_prompt(self, job_id: str, job: dict[str, Any]) -> str:
        context_parts: list[str] = []
        transcription_text = await self._load_transcription_text(job_id, job)
        if transcription_text:
            context_parts.append(f"TRANSCRIPTION:\n{transcription_text}")

        analysis_text = await self._load_analysis_text(job_id, job)
        if analysis_text:
            context_parts.append(f"ANALYSIS:\n{analysis_text}")

        job_context = "\n\n".join(context_parts)
        logger.info(
            "job_chat_context_injected",
            job_id=job_id,
            has_transcription=bool(transcription_text),
            has_analysis=bool(analysis_text),
            context_length=len(job_context),
        )

        if context_parts:
            return (
                "You are a helpful AI assistant specialized in analyzing audio recordings. "
                "You have access to the following information about the recording:\n\n"
                f"{job_context}\n\n"
                "Use this context to answer questions about the recording accurately and thoroughly. "
                "You can discuss what was said in the transcription and reference the analysis findings."
            )

        logger.warning("job_chat_context_missing", job_id=job_id)
        if job.get("status") == "completed":
            return (
                "You are a helpful AI assistant specialized in analyzing audio recordings. "
                "This recording has been transcribed and analyzed, but there was an issue loading the content. "
                "Let the user know that they can download the full transcription and analysis documents. "
                "You can help answer general questions about the recording based on the metadata available: "
                f"File: {job.get('file_name', 'unknown')}, "
                f"Duration: {job.get('audio_duration_seconds', 0):.1f} seconds, "
                f"Status: {job.get('status', 'unknown')}."
            )

        return (
            "You are a helpful AI assistant. "
            f"The recording data for job {job_id} is not yet available. "
            "Let the user know that transcription or analysis hasn't completed yet. "
            f"Current status: {job.get('status', 'unknown')}."
        )

    async def _load_transcription_text(self, job_id: str, job: dict[str, Any]) -> str | None:
        transcription_text = job.get("text_content")
        transcription_file_path = job.get("transcription_file_path")
        if not transcription_text and transcription_file_path:
            logger.info(
                "job_chat_transcription_download_started",
                job_id=job_id,
                transcription_url=transcription_file_path[:80],
            )
            transcription_text = await self.storage_service.download_text_from_blob(transcription_file_path)
        return transcription_text

    async def _load_analysis_text(self, job_id: str, job: dict[str, Any]) -> str | None:
        analysis_text = job.get("analysis_text")
        analysis_file_path = job.get("analysis_file_path", "")
        if analysis_text or not analysis_file_path:
            return analysis_text

        logger.info(
            "job_chat_analysis_download_started",
            job_id=job_id,
            analysis_url=analysis_file_path[:80],
        )
        if self._is_text_analysis(analysis_file_path):
            return await self.storage_service.download_text_from_blob(analysis_file_path)
        if self._blob_path_endswith(analysis_file_path, ".docx"):
            analysis_text = await self.storage_service.download_docx_text_from_blob(analysis_file_path)
            if analysis_text:
                logger.info(
                    "job_chat_docx_analysis_extracted",
                    job_id=job_id,
                    character_count=len(analysis_text),
                )
            else:
                logger.warning("job_chat_docx_analysis_empty", job_id=job_id)
            return analysis_text

        logger.warning(
            "job_chat_analysis_format_unsupported",
            job_id=job_id,
            file_suffix=analysis_file_path[-20:],
        )
        return None

    @staticmethod
    def _ag_ui_messages_for_request(
        *,
        message: str,
        conversation_history: Sequence[Any],
        ag_ui_messages: Sequence[dict[str, Any]] | None,
    ) -> list[dict[str, str]]:
        if ag_ui_messages:
            return [
                {"role": str(item.get("role", "user")), "content": str(item.get("content", ""))}
                for item in ag_ui_messages
                if item.get("content")
            ]

        messages = [
            {
                "role": str(JobAnalysisChatService._message_value(item, "role", "user")),
                "content": str(JobAnalysisChatService._message_value(item, "content", "")),
            }
            for item in conversation_history
            if JobAnalysisChatService._message_value(item, "content", None)
        ]
        if message:
            messages.append({"role": "user", "content": message})
        return messages

    @staticmethod
    def _message_value(message: Any, key: str, default: Any) -> Any:
        if isinstance(message, dict):
            return message.get(key, default)
        return getattr(message, key, default)

    @staticmethod
    def _format_ag_ui_event(event: Any) -> str:
        if hasattr(event, "model_dump_json"):
            payload = event.model_dump_json(by_alias=True, exclude_none=True)
        else:
            payload = json.dumps(event)
        return f"data: {payload}\n\n"

    @staticmethod
    def _ag_ui_error_event(message: str, thread_id: str, run_id: str | None) -> str:
        payload = {
            "type": "RUN_ERROR",
            "threadId": thread_id,
            "runId": run_id,
            "message": message,
        }
        return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    @staticmethod
    def _replace_occurrence(text: str, old_text: str, new_text: str, occurrence: int) -> str:
        start = -1
        search_from = 0
        for _ in range(occurrence):
            start = text.find(old_text, search_from)
            if start == -1:
                return text
            search_from = start + len(old_text)

        return text[:start] + new_text + text[start + len(old_text):]

    @staticmethod
    def _is_text_analysis(blob_url: str) -> bool:
        path = urlparse(blob_url).path.casefold()
        return path.endswith(".txt") or path.endswith(".md")

    @staticmethod
    def _is_markdown_analysis(blob_url: str) -> bool:
        return urlparse(blob_url).path.casefold().endswith(".md")

    @staticmethod
    def _blob_path_endswith(blob_url: str, suffix: str) -> bool:
        return urlparse(blob_url).path.casefold().endswith(suffix.casefold())
