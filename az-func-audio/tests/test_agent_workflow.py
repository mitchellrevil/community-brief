import pytest

from agent.models import WorkflowValidationError
from agent.workflow import run_meeting_template_workflow


def _agents(_config):
    return {"evidence": object(), "writer": object(), "qa": object()}


@pytest.mark.asyncio
async def test_workflow_passes_on_first_qa():
    responses = iter([
        '{"sections":[],"facts":[{"text":"fact"}],"decisions":[],"actions":[],"risks":[],"gaps":[]}',
        "# Note\n\nFact.",
        '{"status":"pass","issues":[]}',
    ])

    async def runner(_participants, _message):
        return next(responses)

    result = await run_meeting_template_workflow(
        config=object(),
        transcript="Transcript",
        prompt_text="# Template",
        prompt_metadata={"analysis_reasoning": "high"},
        agent_factory=_agents,
        runner=runner,
    )

    assert result.analysis_text == "# Note\n\nFact."
    assert result.revision_count == 0


@pytest.mark.asyncio
async def test_workflow_revises_once_then_passes():
    responses = iter([
        '{"sections":[],"facts":[],"decisions":[],"actions":[],"risks":[],"gaps":[]}',
        "# Draft",
        '{"status":"revise","issues":[{"section":"Actions","problem":"missing owner","required_change":"mark unclear"}]}',
        "# Revised",
        '{"status":"pass","issues":[]}',
    ])

    async def runner(_participants, _message):
        return next(responses)

    result = await run_meeting_template_workflow(
        config=object(),
        transcript="Transcript",
        prompt_text="# Template",
        prompt_metadata={"analysis_reasoning": "high"},
        agent_factory=_agents,
        runner=runner,
    )

    assert result.analysis_text == "# Revised"
    assert result.revision_count == 1


@pytest.mark.asyncio
async def test_workflow_fails_after_retry():
    responses = iter([
        '{"sections":[],"facts":[],"decisions":[],"actions":[],"risks":[],"gaps":[]}',
        "# Draft",
        '{"status":"revise","issues":[{"section":"Summary","problem":"unsupported","required_change":"remove"}]}',
        "# Revised",
        '{"status":"fail","issues":[{"section":"Summary","problem":"still unsupported","required_change":"human review"}]}',
    ])

    async def runner(_participants, _message):
        return next(responses)

    with pytest.raises(WorkflowValidationError):
        await run_meeting_template_workflow(
            config=object(),
            transcript="Transcript",
            prompt_text="# Template",
            prompt_metadata={"analysis_reasoning": "high"},
            agent_factory=_agents,
            runner=runner,
        )


@pytest.mark.asyncio
async def test_workflow_rejects_malformed_evidence_json():
    async def runner(_participants, _message):
        return "not json"

    with pytest.raises(WorkflowValidationError):
        await run_meeting_template_workflow(
            config=object(),
            transcript="Transcript",
            prompt_text="# Template",
            prompt_metadata={"analysis_reasoning": "high"},
            agent_factory=_agents,
            runner=runner,
        )
