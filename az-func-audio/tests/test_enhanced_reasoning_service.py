import json
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest


class FakeAgent:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = []

    async def run(self, prompt):
        self.calls.append(json.loads(prompt))
        return SimpleNamespace(text=self._responses.pop(0))


def _planner_response(section_key: str = "summary") -> str:
    return json.dumps(
        {
            "sections": [
                {
                    "section_key": section_key,
                    "writer_brief": {
                        "task": "Write a concise summary",
                        "output_format": "prose",
                        "constraints": {
                            "format": "prose",
                            "max_items": None,
                            "max_words": 75,
                            "max_words_per_item": None,
                            "required_elements": [],
                            "tone": "neutral",
                        },
                    },
                    "critic_checklist": ["Is the section grounded in the transcript?"],
                }
            ]
        }
    )


def _critic_response(*, passed: bool, section_key: str = "summary") -> str:
    return json.dumps(
        {
            "all_pass": passed,
            "sections": {
                section_key: {
                    "pass": passed,
                    "checklist": {"Is the section grounded in the transcript?": passed},
                    "issues": [] if passed else ["Is the section grounded in the transcript?"],
                }
            },
        }
    )


@pytest.mark.asyncio
async def test_enhanced_reasoning_service_happy_path():
    import services.enhanced_reasoning.orchestration_service as orchestration_service

    planner = FakeAgent([_planner_response()])
    writer = FakeAgent([json.dumps({"summary": "Initial draft"})])
    critic = FakeAgent([_critic_response(passed=True)])
    rewriter = FakeAgent([])

    with patch.object(orchestration_service, "build_planner_agent", return_value=planner), \
         patch.object(orchestration_service, "build_writer_agent", return_value=writer), \
         patch.object(orchestration_service, "build_critic_agent", return_value=critic), \
         patch.object(orchestration_service, "build_rewriter_agent", return_value=rewriter):
        service = orchestration_service.EnhancedReasoningService(config=Mock())
        document, metadata = await service.run(
            transcript="Transcript text",
            prompts={"summary": "Summarise the meeting."},
            prompt_constraints_raw={"summary": {"max_words": 75}},
        )

    assert document == "## Summary\n\nInitial draft"
    assert metadata.iterations == 1
    assert metadata.flagged_sections == []
    assert planner.calls[0]["stored_constraints"]["summary"]["max_words"] == 75
    assert writer.calls[0]["work_plan"][0]["section_key"] == "summary"
    assert critic.calls[0]["draft"] == {"summary": "Initial draft"}
    assert rewriter.calls == []


@pytest.mark.asyncio
async def test_enhanced_reasoning_service_retries_failed_sections_once():
    import services.enhanced_reasoning.orchestration_service as orchestration_service

    planner = FakeAgent([_planner_response()])
    writer = FakeAgent([json.dumps({"summary": "Initial draft"})])
    critic = FakeAgent([
        _critic_response(passed=False),
        _critic_response(passed=True),
    ])
    rewriter = FakeAgent([json.dumps({"summary": "Corrected draft"})])

    with patch.object(orchestration_service, "build_planner_agent", return_value=planner), \
         patch.object(orchestration_service, "build_writer_agent", return_value=writer), \
         patch.object(orchestration_service, "build_critic_agent", return_value=critic), \
         patch.object(orchestration_service, "build_rewriter_agent", return_value=rewriter):
        service = orchestration_service.EnhancedReasoningService(config=Mock())
        document, metadata = await service.run(
            transcript="Transcript text",
            prompts={"summary": "Summarise the meeting."},
            prompt_constraints_raw=None,
        )

    assert document == "## Summary\n\nCorrected draft"
    assert metadata.iterations == 2
    assert metadata.flagged_sections == []
    assert len(critic.calls) == 2
    assert rewriter.calls[0]["verdict"]["sections"]["summary"]["pass"] is False


@pytest.mark.asyncio
async def test_enhanced_reasoning_service_flags_sections_after_max_retries():
    import services.enhanced_reasoning.orchestration_service as orchestration_service

    planner = FakeAgent([_planner_response()])
    writer = FakeAgent([json.dumps({"summary": "Initial draft"})])
    critic = FakeAgent([
        _critic_response(passed=False),
        _critic_response(passed=False),
    ])
    rewriter = FakeAgent([
        json.dumps({"summary": "First correction"}),
        json.dumps({"summary": "Second correction"}),
    ])

    with patch.object(orchestration_service, "build_planner_agent", return_value=planner), \
         patch.object(orchestration_service, "build_writer_agent", return_value=writer), \
         patch.object(orchestration_service, "build_critic_agent", return_value=critic), \
         patch.object(orchestration_service, "build_rewriter_agent", return_value=rewriter):
        service = orchestration_service.EnhancedReasoningService(config=Mock())
        document, metadata = await service.run(
            transcript="Transcript text",
            prompts={"summary": "Summarise the meeting."},
            prompt_constraints_raw=None,
        )

    assert document == "## Summary\n\nSecond correction"
    assert metadata.iterations == 2
    assert metadata.flagged_sections == ["summary"]
    assert len(rewriter.calls) == 2