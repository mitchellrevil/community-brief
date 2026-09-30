from __future__ import annotations

from typing import Any, Mapping


def should_use_template_agent_workflow(
    prompt_metadata: Mapping[str, Any] | None,
) -> bool:
    return bool(
        prompt_metadata
        and prompt_metadata.get("analysis_workflow", "standard") == "structured_review"
    )
