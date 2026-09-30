from __future__ import annotations

from typing import Any, Callable

from ...core.errors.domain import ValidationError
from .prompt_drafting import draft_structured_prompt_text


def build_prompt_agent_tools(
    service: Any,
    *,
    folder_id: str,
    template_id: str | None,
    current_user: dict[str, Any],
    on_prompt_update: Callable[[str, dict[str, Any]], None] | None = None,
) -> list[Any]:
    try:
        from agent_framework import tool
    except (ImportError, ModuleNotFoundError) as exc:  # pragma: no cover
        raise RuntimeError("Microsoft Agent Framework is not installed") from exc

    @tool(
        name="read_selected_folder",
        description="Read the selected prompt folder and the prompts already inside it. The folder is fixed by the server.",
    )
    async def read_selected_folder() -> dict[str, Any]:
        return await service.read_selected_folder(folder_id=folder_id, current_user=current_user)

    @tool(
        name="read_selected_prompt",
        description="Read the selected prompt for edit mode. Returns a clear message when no prompt was selected.",
    )
    async def read_selected_prompt() -> dict[str, Any] | str:
        if not template_id:
            return "No prompt is selected. Use create_prompt for this conversation."
        return await service.read_selected_prompt(
            folder_id=folder_id,
            template_id=template_id,
            current_user=current_user,
        )

    @tool(
        name="draft_structured_prompt",
        description=(
            "Generate concise Markdown prompt text. Pass a title and a plain-text list of section headers with "
            "the exact content wanted under each header."
        ),
    )
    async def draft_structured_prompt(title: str, section_briefs: str) -> str:
        return draft_structured_prompt_text(title, section_briefs)

    @tool(
        name="create_prompt",
        description=(
            "Create prompt text in the selected folder only. No folder id is accepted. "
            "Use add_pre_session_form_field and add_in_session_talking_point for forms."
        ),
        approval_mode="always_require",
    )
    async def create_prompt(name: str, prompt_content: str) -> dict[str, Any]:
        created = await service.create_prompt(
            folder_id=folder_id,
            name=name,
            prompt_content=prompt_content,
            current_user=current_user,
        )
        if on_prompt_update is not None:
            on_prompt_update("created", created)
        return service._prompt_summary(created)

    @tool(
        name="replace_selected_prompt",
        description=(
            "Replace only the selected prompt text. No prompt id, folder id, or form JSON is accepted. "
            "Use the form/talking-point tools for pre-session and in-session data."
        ),
        approval_mode="always_require",
    )
    async def replace_selected_prompt(name: str, prompt_content: str) -> dict[str, Any]:
        if not template_id:
            raise ValidationError("No selected prompt is available to edit")
        updated = await service.replace_selected_prompt(
            folder_id=folder_id,
            template_id=template_id,
            name=name,
            prompt_content=prompt_content,
            current_user=current_user,
        )
        if on_prompt_update is not None:
            on_prompt_update("updated", updated)
        return service._prompt_summary(updated)

    @tool(
        name="add_pre_session_form_field",
        description=(
            "Add one pre-session form field to the selected or newly created prompt. "
            "Pass prompt_id after create_prompt; omit it when editing the selected prompt. "
            "field_type must be text, date, markdown, checkbox, number, or select."
        ),
        approval_mode="always_require",
    )
    async def add_pre_session_form_field(
        label: str,
        field_type: str,
        reason: str,
        placeholder: str = "",
        required: bool = False,
        options: str = "",
        prompt_id: str = "",
    ) -> dict[str, Any]:
        updated = await service.add_pre_session_form_field(
            folder_id=folder_id,
            template_id=template_id,
            prompt_id=prompt_id,
            label=label,
            field_type=field_type,
            reason=reason,
            placeholder=placeholder,
            required=required,
            options=options,
            current_user=current_user,
        )
        if on_prompt_update is not None:
            on_prompt_update("updated", updated)
        return service._prompt_summary(updated)

    @tool(
        name="add_in_session_talking_point",
        description=(
            "Add one in-session talking point to the selected or newly created prompt. "
            "Pass prompt_id after create_prompt; omit it when editing the selected prompt. "
            "field_type must be markdown, text, date, or checkbox."
        ),
        approval_mode="always_require",
    )
    async def add_in_session_talking_point(
        title: str,
        instructions: str,
        reason: str,
        field_type: str = "markdown",
        prompt_id: str = "",
    ) -> dict[str, Any]:
        updated = await service.add_in_session_talking_point(
            folder_id=folder_id,
            template_id=template_id,
            prompt_id=prompt_id,
            title=title,
            instructions=instructions,
            reason=reason,
            field_type=field_type,
            current_user=current_user,
        )
        if on_prompt_update is not None:
            on_prompt_update("updated", updated)
        return service._prompt_summary(updated)

    return [
        read_selected_folder,
        read_selected_prompt,
        draft_structured_prompt,
        create_prompt,
        replace_selected_prompt,
        add_pre_session_form_field,
        add_in_session_talking_point,
    ]

