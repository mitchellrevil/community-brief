"""Orchestration service for the enhanced reasoning pipeline.

Composes Planner -> Writer -> Critic -> Rewriter loop -> Assembler.
"""
from __future__ import annotations

from typing import Any

import structlog

from config import AppConfig
from services.enhanced_reasoning.models import (
    PipelineMetadata,
    PromptConstraints,
    SectionDraft,
    WorkPlan,
)
from services.enhanced_reasoning.agents import (
    build_critic_agent,
    build_planner_agent,
    build_rewriter_agent,
    build_work_plan,
    build_writer_agent,
    run_critic,
    run_rewriter,
    run_writer,
)

logger = structlog.get_logger(__name__)
MAX_CRITIC_CYCLES = 2


class EnhancedReasoningService:
    """Runs the full enhanced reasoning pipeline."""

    def __init__(self, config: AppConfig, credential: Any = None) -> None:
        self.config = config
        self._planner = build_planner_agent(config, credential)
        self._writer = build_writer_agent(config, credential)
        self._critic = build_critic_agent(config, credential)
        self._rewriter = build_rewriter_agent(config, credential)

    async def run(
        self,
        transcript: str,
        prompts: dict[str, str],
        prompt_constraints_raw: dict | None,
    ) -> tuple[str, PipelineMetadata]:
        """Run the full pipeline and return (final_document, metadata)."""
        # Deserialise constraints
        prompt_constraints: dict[str, PromptConstraints] = {
            k: PromptConstraints.from_dict(v)
            for k, v in (prompt_constraints_raw or {}).items()
        }

        # Stage 1 — Planner
        logger.info("enhanced_reasoning_stage_started", stage="planner")
        work_plan = await build_work_plan(self._planner, prompts, prompt_constraints)

        # Stage 2 — Writer
        logger.info("enhanced_reasoning_stage_started", stage="writer")
        draft = await run_writer(transcript, work_plan, self._writer)

        # Stage 3/4 — Critic -> Rewriter loop
        iterations = 0
        flagged: list[str] = []
        for cycle in range(MAX_CRITIC_CYCLES):
            iterations += 1
            logger.info(
                "enhanced_reasoning_stage_started",
                stage="critic",
                cycle=cycle + 1,
            )
            verdict = await run_critic(draft, work_plan, self._critic)
            if verdict.all_pass:
                flagged = []
                break
            logger.info(
                "enhanced_reasoning_stage_started",
                stage="rewriter",
                cycle=cycle + 1,
            )
            corrections = await run_rewriter(draft, verdict, work_plan, self._rewriter)
            draft.update(corrections)
            if cycle == MAX_CRITIC_CYCLES - 1:
                flagged = [k for k, v in verdict.sections.items() if not v.passed]
                logger.warning(
                    "enhanced_reasoning_sections_still_failing",
                    failed_count=len(flagged),
                    max_cycles=MAX_CRITIC_CYCLES,
                    flagged_sections=flagged,
                )

        # Stage 5 — Assemble
        document = _assemble(draft, work_plan)
        return document, PipelineMetadata(iterations=iterations, flagged_sections=flagged)


def _assemble(draft: SectionDraft, work_plan: WorkPlan) -> str:
    """Merge draft sections in work plan order with headings."""
    parts = []
    for section in work_plan:
        heading = section.section_key.replace("_", " ").title()
        content = draft.get(section.section_key, "")
        parts.append(f"## {heading}\n\n{content}")
    return "\n\n".join(parts)
