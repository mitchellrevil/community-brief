"""Agent Framework builders and execution helpers for the enhanced reasoning pipeline."""
from __future__ import annotations

import json
from typing import Any

from config import AppConfig
from services.enhanced_reasoning.models import (
    ENHANCED_REASONING_MODELS,
    CriticVerdict,
        PromptConstraints,
    SectionDraft,
        SectionPlan,
    SectionVerdict,
    WorkPlan,
        WriterBrief,
)

PLANNER_SYSTEM_PROMPT = """\
You are a document planning assistant. You receive a dictionary of prompt keys and their instruction text, plus any pre-authored constraints.

For each key produce a section plan containing:
- writer_brief: { task, output_format ("bullets"|"prose"|"table"|"unspecified"), constraints (merge stored constraints with anything implied by the prompt text) }
- critic_checklist: a list of binary yes/no questions an editor uses to audit the section

Where stored constraints are provided use them directly. Where absent infer from the prompt text.
If the prompt text states no constraints produce a checklist covering only transcript fidelity and completeness.

Return JSON only:
{
    "sections": [
        {
            "section_key": "...",
            "writer_brief": {
                "task": "...",
                "output_format": "...",
                "constraints": {
                    "format": null,
                    "max_items": null,
                    "max_words": null,
                    "max_words_per_item": null,
                    "required_elements": [],
                    "tone": null
                }
            },
            "critic_checklist": ["...", "..."]
        }
    ]
}
Preserve key order exactly as given. Do not invent section keys.\
"""

WRITER_SYSTEM_PROMPT = """\
You are a structured report writer. You receive a transcript and a work plan.
For each section follow its writer_brief exactly:
- Use the specified output_format (bullets, prose, table).
- Honour all constraints (max_items, max_words, max_words_per_item, tone, required_elements).
- Ground every claim in the transcript. Do not infer or invent.
- Do not pad. Do not repeat content across sections.
Return JSON: { "<section_key>": "<draft_text>", ... } in work_plan order.\
"""


def _get_foundry_client_class() -> Any:
    """Import FoundryChatClient lazily so tests can stub it and the app can fail clearly."""
    try:
        from agent_framework import FoundryChatClient
    except (ImportError, ModuleNotFoundError) as exc:  # pragma: no cover - exercised indirectly at runtime
        raise ImportError(
            "Enhanced reasoning requires the Microsoft Agent Framework package "
            "(agent-framework>=1.0.0)."
        ) from exc
    return FoundryChatClient


def _get_credential(credential: Any = None) -> Any:
    if credential is not None:
        return credential

    try:
        from azure.identity import DefaultAzureCredential
    except (ImportError, ModuleNotFoundError) as exc:  # pragma: no cover - defensive runtime guard
        raise ValueError("Managed identity authentication requires azure.identity") from exc

    return DefaultAzureCredential()


def _build_agent(
    *,
    name: str,
    instructions: str,
    model: str,
    config: AppConfig,
    credential: Any = None,
) -> Any:
    """Create an Agent Framework agent via FoundryChatClient.as_agent().

    Uses AZURE_OPENAI_ENDPOINT as the Foundry project endpoint — the same
    cognitiveservices endpoint already configured for the function app.
    """
    FoundryChatClient = _get_foundry_client_class()

    endpoint = (config.azure_openai_endpoint or "").rstrip("/")
    if not endpoint:
        raise ValueError("Azure OpenAI endpoint is not configured (AZURE_OPENAI_ENDPOINT)")

    client = FoundryChatClient(
        project_endpoint=endpoint,
        model=model,
        credential=_get_credential(credential),
    )
    return client.as_agent(name=name, instructions=instructions)


def _read_response_text(result: Any, stage: str) -> str:
    text = getattr(result, "text", None)
    if not isinstance(text, str) or not text.strip():
        raise ValueError(f"{stage} agent returned an empty response")
    return text


def _serialise_constraints(constraints: PromptConstraints) -> dict[str, Any]:
    return {
        "format": constraints.format,
        "max_items": constraints.max_items,
        "max_words": constraints.max_words,
        "max_words_per_item": constraints.max_words_per_item,
        "required_elements": constraints.required_elements,
        "tone": constraints.tone,
    }


def build_planner_agent(config: AppConfig, credential: Any = None) -> Any:
    return _build_agent(
        name="Planner",
        instructions=PLANNER_SYSTEM_PROMPT,
        model=ENHANCED_REASONING_MODELS["planner"],
        config=config,
        credential=credential,
    )


def build_writer_agent(config: AppConfig, credential: Any = None) -> Any:
    return _build_agent(
        name="Writer",
        instructions=WRITER_SYSTEM_PROMPT,
        model=ENHANCED_REASONING_MODELS["writer"],
        config=config,
        credential=credential,
    )


def build_critic_agent(config: AppConfig, credential: Any = None) -> Any:
    return _build_agent(
        name="Critic",
        instructions=CRITIC_SYSTEM_PROMPT,
        model=ENHANCED_REASONING_MODELS["critic"],
        config=config,
        credential=credential,
    )


def build_rewriter_agent(config: AppConfig, credential: Any = None) -> Any:
    return _build_agent(
        name="Rewriter",
        instructions=REWRITER_SYSTEM_PROMPT,
        model=ENHANCED_REASONING_MODELS["rewriter"],
        config=config,
        credential=credential,
    )


def _serialise_work_plan(work_plan: WorkPlan) -> list[dict]:
    """Convert the work plan to a JSON-serialisable list."""
    result = []
    for sp in work_plan:
        result.append({
            "section_key": sp.section_key,
            "writer_brief": {
                "task": sp.writer_brief.task,
                "output_format": sp.writer_brief.output_format,
                "constraints": _serialise_constraints(sp.writer_brief.constraints),
            },
            "critic_checklist": sp.critic_checklist,
        })
    return result


async def build_work_plan(
    planner_agent: Any,
    prompts: dict[str, str],
    prompt_constraints: dict[str, PromptConstraints] | None,
) -> WorkPlan:
    """Run the planner agent and convert its JSON response into typed section plans."""
    user_payload: dict[str, Any] = {"prompts": prompts}
    if prompt_constraints:
        user_payload["stored_constraints"] = {
            key: _serialise_constraints(constraints)
            for key, constraints in prompt_constraints.items()
        }

    result = await planner_agent.run(json.dumps(user_payload, ensure_ascii=False))
    parsed = json.loads(_read_response_text(result, "Planner"))

    sections: list[SectionPlan] = []
    for entry in parsed["sections"]:
        brief_data = entry["writer_brief"]
        constraints_data = brief_data.get("constraints", {})
        constraints = PromptConstraints(
            format=constraints_data.get("format"),
            max_items=constraints_data.get("max_items"),
            max_words=constraints_data.get("max_words"),
            max_words_per_item=constraints_data.get("max_words_per_item"),
            required_elements=constraints_data.get("required_elements") or [],
            tone=constraints_data.get("tone"),
        )
        sections.append(
            SectionPlan(
                section_key=entry["section_key"],
                prompt_text=prompts.get(entry["section_key"], ""),
                writer_brief=WriterBrief(
                    task=brief_data["task"],
                    output_format=brief_data.get("output_format", "unspecified"),
                    constraints=constraints,
                ),
                critic_checklist=entry.get("critic_checklist", []),
            )
        )

    return sections


async def run_writer(
    transcript: str,
    work_plan: WorkPlan,
    writer_agent: Any,
) -> SectionDraft:
    """Write all sections of the document based on the work plan.

    Returns a dict mapping section_key -> draft text.
    """
    user_payload = {
        "transcript": transcript,
        "work_plan": _serialise_work_plan(work_plan),
    }

    result = await writer_agent.run(json.dumps(user_payload, ensure_ascii=False))

    return json.loads(_read_response_text(result, "Writer"))


# ---------------------------------------------------------------------------
# Critic
# ---------------------------------------------------------------------------

CRITIC_SYSTEM_PROMPT = """\
You are a strict technical editor. For each section answer its checklist questions with yes or no.
A section passes only if every question is yes.
Do not add criteria outside the checklist.
Return JSON:
{
  "all_pass": true|false,
  "sections": {
    "<key>": { "pass": true|false, "checklist": { "<question>": true|false }, "issues": ["<failed question>"] }
  }
}\
"""


async def run_critic(
    draft: SectionDraft,
    work_plan: WorkPlan,
    critic_agent: Any,
) -> CriticVerdict:
    """Audit the draft sections against the critic checklists in the work plan.

    Returns a CriticVerdict indicating which sections pass/fail.
    """
    user_payload = {
        "draft": draft,
        "work_plan": _serialise_work_plan(work_plan),
    }

    result = await critic_agent.run(json.dumps(user_payload, ensure_ascii=False))
    parsed = json.loads(_read_response_text(result, "Critic"))

    sections: dict[str, SectionVerdict] = {}
    for key, data in parsed.get("sections", {}).items():
        sections[key] = SectionVerdict(
            passed=data.get("pass", True),
            checklist=data.get("checklist", {}),
            issues=data.get("issues", []),
        )

    return CriticVerdict(
        all_pass=parsed.get("all_pass", True),
        sections=sections,
    )


# ---------------------------------------------------------------------------
# Rewriter
# ---------------------------------------------------------------------------

REWRITER_SYSTEM_PROMPT = """\
You are a precise editor. Rewrite only the sections marked failed in the verdict.
Fix only the specific failed checklist items. Do not alter passing sections. Do not add new content.
Return JSON with only corrected sections: { "<section_key>": "<corrected_text>", ... }\
"""


async def run_rewriter(
    draft: SectionDraft,
    verdict: CriticVerdict,
    work_plan: WorkPlan,
    rewriter_agent: Any,
) -> SectionDraft:
    """Rewrite only the failing sections based on the critic verdict.

    Returns a dict with corrected section drafts (only the ones that failed).
    """
    # Build a minimal verdict payload for the model
    verdict_payload: dict[str, Any] = {
        "all_pass": verdict.all_pass,
        "sections": {},
    }
    for key, sv in verdict.sections.items():
        verdict_payload["sections"][key] = {
            "pass": sv.passed,
            "checklist": sv.checklist,
            "issues": sv.issues,
        }

    user_payload = {
        "draft": draft,
        "verdict": verdict_payload,
        "work_plan": _serialise_work_plan(work_plan),
    }

    result = await rewriter_agent.run(json.dumps(user_payload, ensure_ascii=False))

    return json.loads(_read_response_text(result, "Rewriter"))
