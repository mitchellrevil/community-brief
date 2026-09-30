from __future__ import annotations

from collections.abc import AsyncIterator, Sequence
from typing import Any
from urllib.parse import urlparse

from ...core.errors.domain import PermissionError
from ...core.logging import get_logger
from ..agent_chat.ag_ui_events import ag_ui_sse_event, json_sse_event, run_error_sse_event
from ..agent_chat.ag_ui_messages import legacy_chat_messages, normalize_ag_ui_messages
from ..agent_chat.streaming import stream_agent_chat_events
from ..storage.blob_service import StorageService
from .chatbot_service import ChatBotService
from .job_analysis_tools import build_job_analysis_tools
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
        resume: Any | None = None,
    ) -> AsyncIterator[str]:
        job = await self.chat_history_service.get_job(job_id)
        if not check_job_access(job, current_user, "view"):
            yield run_error_sse_event("Access denied to job", thread_id or job_id, run_id)
            return

        logger.info(
            "job_chat_stream_requested",
            job_id=job_id,
            user_id=current_user.get("id"),
        )
        analysis_update: str | None = None

        def set_analysis_update(text: str) -> None:
            nonlocal analysis_update
            analysis_update = text

        try:
            context_prompt = await self._build_context_prompt(job_id, job)
            messages = self._ag_ui_messages_for_request(
                message=message,
                conversation_history=conversation_history,
                ag_ui_messages=ag_ui_messages,
                resume=resume,
            )
            if not messages:
                raise ValueError("At least one chat message is required")

            agent = self.chatbot_service.build_agent(
                instructions=context_prompt,
                tools=build_job_analysis_tools(
                    self,
                    job_id=job_id,
                    current_user=current_user,
                    on_analysis_update=set_analysis_update,
                ),
                max_tokens=max_tokens,
            )
            resolved_thread_id = thread_id or job_id
            runner_key = (
                "job-analysis",
                str(current_user.get("id") or ""),
                job_id,
            )

            logger.info(
                "job_chat_ag_ui_stream_started",
                job_id=job_id,
                message_count=len(messages),
            )

            async for event in stream_agent_chat_events(
                runner_key=runner_key,
                agent=agent,
                thread_id=resolved_thread_id,
                messages=messages,
                run_id=run_id,
                state=state,
                resume=resume,
            ):
                yield ag_ui_sse_event(event)
                if analysis_update is not None:
                    yield self._analysis_updated_event(job_id, analysis_update)
                    analysis_update = None
            if analysis_update is not None:
                yield self._analysis_updated_event(job_id, analysis_update)
        except Exception as exc:
            logger.error(
                "job_chat_ag_ui_generator_failed",
                job_id=job_id,
                error=str(exc),
                error_type=type(exc).__name__,
                exc_info=True,
            )
            if analysis_update is not None:
                yield self._analysis_updated_event(job_id, analysis_update)
            yield run_error_sse_event(str(exc), thread_id or job_id, run_id)

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
            "analysis_text": updated_text,
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
        resume: Any | None = None,
    ) -> list[dict[str, Any]]:
        if ag_ui_messages:
            return normalize_ag_ui_messages(ag_ui_messages, preserve_tool_history=resume is not None)

        return legacy_chat_messages(conversation_history, message)

    @staticmethod
    def _analysis_updated_event(job_id: str, analysis_text: str) -> str:
        return json_sse_event({
            "type": "ANALYSIS_UPDATED",
            "jobId": job_id,
            "analysisText": analysis_text,
        })

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
