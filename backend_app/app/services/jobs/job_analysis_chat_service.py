from __future__ import annotations

from collections.abc import AsyncIterator, Sequence
from typing import Any

from ...core.logging import get_logger
from ..storage.blob_service import StorageService
from .chatbot_service import ChatBotService
from .job_chat_history_service import JobChatHistoryService

logger = get_logger(__name__)

JOB_CHAT_STREAM_ERRORS = (RuntimeError, OSError, ValueError, TypeError)


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
    ) -> AsyncIterator[str]:
        job = await self.chat_history_service.get_job(job_id)
        logger.info(
            "job_chat_stream_requested",
            job_id=job_id,
            user_id=current_user.get("id"),
        )

        try:
            context_prompt = await self._build_context_prompt(job_id, job)
            original_prompt = self.chatbot_service.system_prompt
            self.chatbot_service.system_prompt = context_prompt
            previous_response_id = job.get("chat_response_id")
            response_id_holder: dict[str, str | None] = {"value": None}

            def capture_response_id(response_id: str) -> None:
                response_id_holder["value"] = response_id

            try:
                history = self._conversation_history_for_request(
                    previous_response_id=previous_response_id,
                    conversation_history=conversation_history,
                )
                logger.info(
                    "job_chat_stream_started",
                    job_id=job_id,
                    has_previous_response=bool(previous_response_id),
                    previous_response_id=previous_response_id,
                    history_count=len(history),
                )

                async for chunk in self.chatbot_service.chat_stream(
                    message=message,
                    conversation_history=history,
                    max_tokens=max_tokens,
                    previous_response_id=previous_response_id,
                    on_response_id=capture_response_id,
                ):
                    if chunk:
                        yield f"data: {chunk}\n\n"

                if response_id_holder["value"]:
                    await self.chat_history_service.store_response_id(job_id, response_id_holder["value"])

                yield "data: [DONE]\n\n"
            finally:
                self.chatbot_service.system_prompt = original_prompt
        except JOB_CHAT_STREAM_ERRORS as exc:
            logger.error(
                "job_chat_sse_generator_failed",
                job_id=job_id,
                error=str(exc),
                error_type=type(exc).__name__,
                exc_info=True,
            )
            yield f"data: [ERROR] {str(exc)}\n\n"

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
        if analysis_file_path.endswith(".txt"):
            return await self.storage_service.download_text_from_blob(analysis_file_path)
        if analysis_file_path.endswith(".docx"):
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
    def _conversation_history_for_request(
        *,
        previous_response_id: str | None,
        conversation_history: Sequence[Any],
    ) -> list[dict[str, str]]:
        if previous_response_id:
            return []
        return [
            {"role": message.role, "content": message.content}
            for message in conversation_history
        ]
