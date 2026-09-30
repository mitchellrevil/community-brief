from __future__ import annotations

from collections.abc import AsyncIterator, Sequence
from typing import Any

from ...core.errors.domain import ApplicationError, PermissionError, ValidationError
from ...core.logging import get_logger
from ...schemas.prompt_catalog import (
    MAX_PROMPT_CONTENT_CHARS,
    PromptTemplateCreate,
    PromptTemplatePatch,
)
from ..agent_chat.ag_ui_events import ag_ui_sse_event, json_sse_event, run_error_sse_event
from ..agent_chat.ag_ui_messages import normalize_ag_ui_messages
from ..agent_chat.streaming import stream_agent_chat_events
from ..jobs.chatbot_service import ChatBotService
from .prompt_agent_fields import in_session_field, pre_session_field
from .prompt_agent_tools import build_prompt_agent_tools
from .prompt_catalog import PromptCatalog

logger = get_logger(__name__)

PROMPT_AGENT_STREAM_ERRORS = (RuntimeError, OSError, ValueError, TypeError, ApplicationError)
PROMPT_AGENT_INSTRUCTIONS = """\
You are CommunityBriefPromptAgent, a Microsoft Agent Framework agent that helps editors create concise Community Brief prompt templates.

This chat is text-only. Never ask users to upload or provide images, screenshots, or other visual files. Ask them to describe the relevant information in text instead.

Work over multiple turns. Before creating or editing a prompt, learn:
- what the user wants the meeting/report output to do
- what sections or headers they need
- what they like in previous prompts or examples
- what they dislike, especially verbosity, duplicated sections, vague instructions, or missing output constraints

Keep generated prompts short. For structured templates, write Markdown headers and place a direct instruction under each header that says exactly what content belongs there. Do not fill prompts with generic quality rules.

You can also create pre-session form fields and in-session talking points when they would help the meeting flow. Use add_pre_session_form_field for pre-session data and add_in_session_talking_point for live-session guidance; never put form JSON inside prompt text. Explain the reason for each field or talking point in the reason argument.

You are scoped to one selected folder supplied by the server. Do not ask for another location and do not claim you can write outside it.
If a selected prompt is supplied, edit only that selected prompt. Otherwise create a new prompt only in the selected folder.

Use tools for folder reads, draft generation, and writes. Ask for confirmation before using create_prompt, replace_selected_prompt, add_pre_session_form_field, or add_in_session_talking_point unless the user has clearly asked you to save it now.\
"""


class PromptAgentService:
    def __init__(
        self,
        *,
        chatbot_service: ChatBotService,
        prompt_catalog: PromptCatalog,
    ) -> None:
        self.chatbot_service = chatbot_service
        self.prompt_catalog = prompt_catalog

    async def stream_prompt_agent(
        self,
        *,
        folder_id: str,
        template_id: str | None,
        max_tokens: int,
        current_user: dict[str, Any],
        ag_ui_messages: Sequence[dict[str, Any]] | None = None,
        thread_id: str | None = None,
        run_id: str | None = None,
        state: dict[str, Any] | None = None,
        resume: Any | None = None,
    ) -> AsyncIterator[str]:
        prompt_update: dict[str, Any] | None = None

        def set_prompt_update(action: str, prompt: dict[str, Any]) -> None:
            nonlocal prompt_update
            prompt_update = {"action": action, "prompt": prompt}

        try:
            await self._require_folder_access(folder_id, current_user)
            if template_id:
                await self._require_selected_template(
                    folder_id=folder_id,
                    template_id=template_id,
                    current_user=current_user,
                )

            messages = self._ag_ui_messages_for_request(
                ag_ui_messages=ag_ui_messages,
                resume=resume,
            )
            if not messages:
                raise ValueError("At least one chat message is required")

            agent = self.chatbot_service.build_agent(
                name="CommunityBriefPromptAgent",
                instructions=await self._build_context_prompt(folder_id, template_id),
                tools=build_prompt_agent_tools(
                    self,
                    folder_id=folder_id,
                    template_id=template_id,
                    current_user=current_user,
                    on_prompt_update=set_prompt_update,
                ),
                max_tokens=max_tokens,
                allow_multiple_tool_calls=False,
            )
            resolved_thread_id = thread_id or f"prompt-agent:{folder_id}:{template_id or 'new'}"
            runner_key = (
                "prompt",
                str(current_user.get("id") or ""),
                resolved_thread_id,
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
                if prompt_update is not None:
                    yield self._prompt_changed_event(prompt_update["action"], prompt_update["prompt"])
                    prompt_update = None

            if prompt_update is not None:
                yield self._prompt_changed_event(prompt_update["action"], prompt_update["prompt"])
        except Exception as exc:
            logger.error(
                "prompt_agent_stream_failed",
                folder_id=folder_id,
                template_id=template_id,
                error=str(exc),
                error_type=type(exc).__name__,
                exc_info=True,
            )
            if prompt_update is not None:
                yield self._prompt_changed_event(prompt_update["action"], prompt_update["prompt"])
            yield run_error_sse_event(str(exc), thread_id or folder_id, run_id)

    async def read_selected_folder(self, *, folder_id: str, current_user: dict[str, Any]) -> dict[str, Any]:
        folder = await self._require_folder_access(folder_id, current_user)
        prompts: list[dict[str, Any]] = []
        offset = 0
        while True:
            page = await self.prompt_catalog.list_templates(
                folder_id=folder_id,
                view="management",
                limit=100,
                offset=offset,
                current_user=current_user,
            )
            prompts.extend(self._prompt_summary(item) for item in page["items"])
            if not page["has_more"]:
                break
            offset += len(page["items"])
        return {
            "folder": {
                "id": folder.get("id"),
                "name": folder.get("name"),
                "business_unit_id": folder.get("business_unit_id"),
            },
            "prompts": prompts,
        }

    async def read_selected_prompt(
        self,
        *,
        folder_id: str,
        template_id: str,
        current_user: dict[str, Any],
    ) -> dict[str, Any]:
        prompt = await self._require_selected_template(
            folder_id=folder_id,
            template_id=template_id,
            current_user=current_user,
        )
        return {
            **self._prompt_summary(prompt),
            "prompts": prompt.get("prompts") or {},
            "pre_session_talking_points": prompt.get("pre_session_talking_points") or [],
            "in_session_talking_points": prompt.get("in_session_talking_points") or [],
        }

    async def create_prompt(
        self,
        *,
        folder_id: str,
        name: str,
        prompt_content: str,
        current_user: dict[str, Any],
    ) -> dict[str, Any]:
        self._validate_write_inputs(name, prompt_content)
        return await self.prompt_catalog.create_template(
            PromptTemplateCreate(
                folder_id=folder_id,
                name=name,
                prompts={name: prompt_content},
                pre_session_talking_points=[],
                in_session_talking_points=[],
            ),
            current_user=current_user,
        )

    async def replace_selected_prompt(
        self,
        *,
        folder_id: str,
        template_id: str,
        name: str,
        prompt_content: str,
        current_user: dict[str, Any],
    ) -> dict[str, Any]:
        self._validate_write_inputs(name, prompt_content)
        existing = await self._require_selected_template(
            folder_id=folder_id,
            template_id=template_id,
            current_user=current_user,
        )
        return await self._update_prompt(
            existing=existing,
            template_id=template_id,
            name=name,
            prompts={name: prompt_content},
            current_user=current_user,
        )

    async def add_pre_session_form_field(
        self,
        *,
        folder_id: str,
        template_id: str | None,
        prompt_id: str,
        label: str,
        field_type: str,
        reason: str,
        placeholder: str,
        required: bool,
        options: str,
        current_user: dict[str, Any],
    ) -> dict[str, Any]:
        existing = await self._require_write_prompt(
            folder_id=folder_id,
            template_id=template_id,
            prompt_id=prompt_id,
            current_user=current_user,
        )
        pre_session = list(existing.get("pre_session_talking_points") or [])
        pre_session.append({
            "fields": [
                pre_session_field(
                    label=label,
                    field_type=field_type,
                    reason=reason,
                    placeholder=placeholder,
                    required=required,
                    options=options,
                    talking_points_service=self.prompt_catalog.talking_points_service,
                )
            ]
        })
        return await self._update_prompt(
            existing=existing,
            template_id=str(existing["id"]),
            pre_session=pre_session,
            current_user=current_user,
        )

    async def add_in_session_talking_point(
        self,
        *,
        folder_id: str,
        template_id: str | None,
        prompt_id: str,
        title: str,
        instructions: str,
        reason: str,
        field_type: str,
        current_user: dict[str, Any],
    ) -> dict[str, Any]:
        existing = await self._require_write_prompt(
            folder_id=folder_id,
            template_id=template_id,
            prompt_id=prompt_id,
            current_user=current_user,
        )
        in_session = list(existing.get("in_session_talking_points") or [])
        in_session.append({"fields": [in_session_field(title, instructions, reason, field_type)]})
        return await self._update_prompt(
            existing=existing,
            template_id=str(existing["id"]),
            in_session=in_session,
            current_user=current_user,
        )

    async def _update_prompt(
        self,
        *,
        existing: dict[str, Any],
        template_id: str,
        current_user: dict[str, Any],
        name: str | None = None,
        prompts: dict[str, str] | None = None,
        pre_session: list[dict[str, Any]] | None = None,
        in_session: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        patch_fields: dict[str, Any] = {}
        if name is not None:
            patch_fields["name"] = name
        if prompts is not None:
            patch_fields["prompts"] = prompts
        if pre_session is not None:
            patch_fields["pre_session_talking_points"] = pre_session
        if in_session is not None:
            patch_fields["in_session_talking_points"] = in_session
        return await self.prompt_catalog.update_template(
            template_id,
            patch=PromptTemplatePatch(**patch_fields),
            current_user=current_user,
        )

    async def _build_context_prompt(self, folder_id: str, template_id: str | None) -> str:
        folder = await self.prompt_catalog.store.get_folder(folder_id)
        selected_prompt = await self.prompt_catalog.store.get_template(template_id) if template_id else None
        scope_lines = [
            f"Selected folder: {folder.get('name') if folder else 'Unknown'} ({folder_id}).",
        ]
        if selected_prompt:
            scope_lines.append(f"Selected prompt for editing: {selected_prompt.get('name')} ({template_id}).")
        else:
            scope_lines.append("Mode: create a new prompt in the selected folder.")
        return f"{PROMPT_AGENT_INSTRUCTIONS}\n\n" + "\n".join(scope_lines)

    async def _require_folder_access(self, folder_id: str, current_user: dict[str, Any]) -> dict[str, Any]:
        try:
            return await self.prompt_catalog.get_folder(
                folder_id, view="management", current_user=current_user
            )
        except ApplicationError as exc:
            raise PermissionError(
                "You can only generate prompts inside folders in your own business unit"
            ) from exc

    async def _require_selected_template(
        self,
        *,
        folder_id: str,
        template_id: str,
        current_user: dict[str, Any],
    ) -> dict[str, Any]:
        prompt = await self.prompt_catalog.get_template(
            template_id, view="management", current_user=current_user
        )
        if prompt.get("folder_id") != folder_id:
            raise PermissionError("Selected prompt is outside the selected folder")
        return prompt

    async def _require_write_prompt(
        self,
        *,
        folder_id: str,
        template_id: str | None,
        prompt_id: str,
        current_user: dict[str, Any],
    ) -> dict[str, Any]:
        target_id = (prompt_id or template_id or "").strip()
        if not target_id:
            raise ValidationError("Create or select a prompt before adding form data")
        return await self._require_selected_template(
            folder_id=folder_id,
            template_id=target_id,
            current_user=current_user,
        )

    @staticmethod
    def _validate_write_inputs(name: str, prompt_content: str) -> None:
        if not name or not name.strip():
            raise ValidationError("Prompt name is required")
        if not prompt_content or not prompt_content.strip():
            raise ValidationError("Prompt content is required")
        if len(prompt_content) > MAX_PROMPT_CONTENT_CHARS:
            raise ValidationError("Prompt content is too long")

    @staticmethod
    def _prompt_summary(prompt: dict[str, Any]) -> dict[str, Any]:
        prompt_map = prompt.get("prompts") or {}
        first_key = next(iter(prompt_map), "")
        first_text = prompt_map.get(first_key, "") if first_key else ""
        return {
            "id": prompt.get("id"),
            "name": prompt.get("name"),
            "folder_id": prompt.get("folder_id"),
            "business_unit_id": prompt.get("business_unit_id"),
            "prompt_keys": list(prompt_map.keys()),
            "character_count": len(first_text),
        }

    @staticmethod
    def _ag_ui_messages_for_request(
        *,
        ag_ui_messages: Sequence[dict[str, Any]] | None,
        resume: Any | None = None,
    ) -> list[dict[str, Any]]:
        return normalize_ag_ui_messages(ag_ui_messages, preserve_tool_history=resume is not None)

    @staticmethod
    def _prompt_changed_event(action: str, prompt: dict[str, Any]) -> str:
        return json_sse_event({
            "type": "PROMPT_CHANGED",
            "action": action,
            "promptId": prompt.get("id"),
            "folderId": prompt.get("folder_id"),
            "promptName": prompt.get("name"),
            "prompt": prompt,
        })

