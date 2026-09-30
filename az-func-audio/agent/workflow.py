from __future__ import annotations

import asyncio
import json
from typing import Any, Callable, Sequence

from .client import build_template_agents
from .models import (
    DraftResult,
    EvidenceMap,
    MeetingTemplateWorkflowInput,
    MeetingTemplateWorkflowResult,
    QAResult,
    WorkflowValidationError,
    model_from_json_text,
)


async def run_meeting_template_workflow(
    *,
    config: Any,
    transcript: str,
    prompt_text: str,
    prompt_metadata: dict[str, Any],
    session_data: Any = None,
    instructions: str | None = None,
    inference_settings: dict[str, Any] | None = None,
    agent_factory: Callable[..., dict[str, Any]] = build_template_agents,
    runner: Callable[[Sequence[Any], str], Any] | None = None,
) -> MeetingTemplateWorkflowResult:
    workflow_input = MeetingTemplateWorkflowInput(
        transcript=transcript,
        prompt_text=prompt_text,
        prompt_metadata=prompt_metadata,
        session_data=session_data,
        instructions=instructions,
    )
    agents = (
        agent_factory(config, inference_settings=inference_settings)
        if inference_settings is not None
        else agent_factory(config)
    )
    run_sequence = runner or _run_sequence

    evidence_text = await run_sequence(
        [agents["evidence"]],
        _initial_payload(workflow_input),
    )
    evidence = model_from_json_text(EvidenceMap, evidence_text)

    draft = await _write_and_check(
        agents=agents,
        run_sequence=run_sequence,
        workflow_input=workflow_input,
        evidence=evidence,
    )
    if draft.qa.status == "pass":
        return draft
    if draft.qa.status == "fail":
        raise WorkflowValidationError("Template QA failed")

    revised = await _write_and_check(
        agents=agents,
        run_sequence=run_sequence,
        workflow_input=workflow_input,
        evidence=evidence,
        previous_markdown=draft.analysis_text,
        qa=draft.qa,
    )
    if revised.qa.status == "pass":
        return revised.model_copy(update={"revision_count": 1})

    raise WorkflowValidationError("Template QA did not pass after revision")


def run_meeting_template_workflow_sync(**kwargs: Any) -> MeetingTemplateWorkflowResult:
    return asyncio.run(run_meeting_template_workflow(**kwargs))


async def _write_and_check(
    *,
    agents: dict[str, Any],
    run_sequence: Callable[[Sequence[Any], str], Any],
    workflow_input: MeetingTemplateWorkflowInput,
    evidence: EvidenceMap,
    previous_markdown: str | None = None,
    qa: QAResult | None = None,
) -> MeetingTemplateWorkflowResult:
    draft_text = await run_sequence(
        [agents["writer"]],
        _writer_payload(
            workflow_input,
            evidence,
            previous_markdown=previous_markdown,
            qa=qa,
        ),
    )
    draft = DraftResult(markdown=draft_text)
    qa_text = await run_sequence(
        [agents["qa"]],
        _qa_payload(workflow_input, evidence, draft.markdown),
    )
    qa_result = model_from_json_text(QAResult, qa_text)
    return MeetingTemplateWorkflowResult(
        analysis_text=draft.markdown,
        evidence=evidence,
        qa=qa_result,
    )


async def _run_sequence(participants: Sequence[Any], message: str) -> str:
    try:
        from agent_framework import AgentResponse
        from agent_framework.orchestrations import SequentialBuilder
    except (ImportError, ModuleNotFoundError) as exc:
        raise RuntimeError(
            "Microsoft Agent Framework orchestrations are not installed"
        ) from exc

    workflow = SequentialBuilder(participants=list(participants)).build()
    events = await workflow.run(message)
    outputs = events.get_outputs()
    if not outputs:
        raise WorkflowValidationError("Agent workflow returned no output")

    output = outputs[-1]
    if isinstance(output, AgentResponse):
        return str(output.text).strip()
    text = getattr(output, "text", None)
    if text is not None:
        return str(text).strip()
    return str(output).strip()


def _initial_payload(workflow_input: MeetingTemplateWorkflowInput) -> str:
    return json.dumps(workflow_input.model_dump(), ensure_ascii=False, indent=2)


def _writer_payload(
    workflow_input: MeetingTemplateWorkflowInput,
    evidence: EvidenceMap,
    *,
    previous_markdown: str | None = None,
    qa: QAResult | None = None,
) -> str:
    payload: dict[str, Any] = {
        "prompt_text": workflow_input.prompt_text,
        "session_data": workflow_input.session_data,
        "instructions": workflow_input.instructions,
        "evidence": evidence.model_dump(),
    }
    if previous_markdown and qa:
        payload["previous_markdown"] = previous_markdown
        payload["qa_issues"] = qa.model_dump()
    return json.dumps(payload, ensure_ascii=False, indent=2)


def _qa_payload(
    workflow_input: MeetingTemplateWorkflowInput,
    evidence: EvidenceMap,
    markdown: str,
) -> str:
    return json.dumps(
        {
            "prompt_text": workflow_input.prompt_text,
            "transcript": workflow_input.transcript,
            "evidence": evidence.model_dump(),
            "markdown": markdown,
        },
        ensure_ascii=False,
        indent=2,
    )
