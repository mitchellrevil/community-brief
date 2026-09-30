from unittest.mock import AsyncMock, MagicMock

import pytest
from pydantic import ValidationError as PydanticValidationError

from app.core.errors.domain import PermissionError, ValidationError
from app.schemas.prompt_catalog import MAX_PROMPT_CONTENT_CHARS, PromptTemplateCreate
from app.services.prompts.prompt_agent_service import (
    PROMPT_AGENT_INSTRUCTIONS,
    PromptAgentService,
)
from app.services.prompts.prompt_drafting import draft_structured_prompt_text
from app.services.prompts.talking_points_service import TalkingPointsService


pytestmark = pytest.mark.unit


def test_prompt_agent_instructions_keep_chat_text_only():
    assert "text-only" in PROMPT_AGENT_INSTRUCTIONS
    assert (
        "Never ask users to upload or provide images, screenshots, or other visual files."
        in PROMPT_AGENT_INSTRUCTIONS
    )
    assert "describe the relevant information in text instead" in PROMPT_AGENT_INSTRUCTIONS


def _service(template: dict | None = None):
    catalog = MagicMock()
    catalog.get_template = AsyncMock(return_value=template)
    catalog.update_template = AsyncMock()
    catalog.create_template = AsyncMock()
    catalog.talking_points_service = TalkingPointsService()
    catalog.store = MagicMock()
    return PromptAgentService(chatbot_service=MagicMock(), prompt_catalog=catalog), catalog


def test_prompt_content_limit_is_25000_characters():
    content = "x" * MAX_PROMPT_CONTENT_CHARS
    assert PromptTemplateCreate(
        folder_id="folder-1", name="Prompt", prompts={"system": content}
    )
    PromptAgentService._validate_write_inputs("Prompt", content)

    with pytest.raises(PydanticValidationError):
        PromptTemplateCreate(
            folder_id="folder-1", name="Prompt", prompts={"system": content + "x"}
        )
    with pytest.raises(ValidationError):
        PromptAgentService._validate_write_inputs("Prompt", content + "x")


def test_draft_structured_prompt_writes_instruction_under_each_header():
    prompt = draft_structured_prompt_text(
        "Case Review",
        "Actions: Include owner, task, and deadline only.\nRisks: Include blockers.",
    )
    assert "## Actions\nInclude owner, task, and deadline only." in prompt
    assert "## Risks\nInclude blockers." in prompt


@pytest.mark.asyncio
async def test_replace_selected_prompt_uses_catalog_partial_patch():
    existing = {
        "id": "template-1",
        "folder_id": "folder-1",
        "name": "Existing",
        "prompts": {"Existing": "Old"},
        "pre_session_talking_points": [{"fields": []}],
        "in_session_talking_points": [{"fields": []}],
    }
    service, catalog = _service(existing)
    catalog.update_template.return_value = {**existing, "name": "Updated"}

    await service.replace_selected_prompt(
        folder_id="folder-1",
        template_id="template-1",
        name="Updated",
        prompt_content="New text",
        current_user={"id": "editor-1", "permission": "editor"},
    )

    patch = catalog.update_template.await_args.kwargs["patch"]
    assert patch.model_dump(exclude_unset=True) == {
        "name": "Updated",
        "prompts": {"Updated": "New text"},
    }


@pytest.mark.asyncio
async def test_form_tool_updates_only_the_target_collection():
    existing = {
        "id": "template-1",
        "folder_id": "folder-1",
        "name": "Client Review",
        "prompts": {"Client Review": "Summarise it."},
        "pre_session_talking_points": [],
        "in_session_talking_points": [],
    }
    service, catalog = _service(existing)
    catalog.update_template.return_value = existing

    await service.add_in_session_talking_point(
        folder_id="folder-1",
        template_id="template-1",
        prompt_id="",
        title="Decisions",
        instructions="Capture decisions and owners.",
        reason="makes the output actionable",
        field_type="markdown",
        current_user={"id": "editor-1", "permission": "editor"},
    )

    patch = catalog.update_template.await_args.kwargs["patch"]
    values = patch.model_dump(exclude_unset=True)
    assert "pre_session_talking_points" not in values
    assert values["in_session_talking_points"][0]["fields"][0]["name"] == "Decisions"


@pytest.mark.asyncio
async def test_selected_template_must_belong_to_selected_folder():
    service, _ = _service(
        {"id": "template-1", "folder_id": "other-folder", "prompts": {}}
    )

    with pytest.raises(PermissionError):
        await service.replace_selected_prompt(
            folder_id="selected-folder",
            template_id="template-1",
            name="Updated",
            prompt_content="Updated text",
            current_user={"id": "editor-1", "permission": "editor"},
        )
