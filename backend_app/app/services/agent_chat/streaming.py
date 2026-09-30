from __future__ import annotations

from collections.abc import AsyncIterator, Hashable, Sequence
from typing import Any

from ...core.logging import get_logger
from .runner_registry import ag_ui_agent_runners


logger = get_logger(__name__)
ORPHAN_TOOL_RESULT_ERROR = "No tool call found for function call output"


async def stream_agent_chat_events(
    *,
    runner_key: Hashable,
    agent: Any,
    thread_id: str,
    messages: Sequence[dict[str, Any]],
    run_id: str | None = None,
    state: dict[str, Any] | None = None,
    resume: Any | None = None,
) -> AsyncIterator[Any]:
    input_data: dict[str, Any] = {
        "thread_id": ag_ui_agent_runners.thread_id_for(runner_key, thread_id),
        "messages": list(messages),
    }
    if run_id:
        input_data["run_id"] = run_id
    if state:
        input_data["state"] = state
    if resume is not None:
        input_data["resume"] = resume

    runner = ag_ui_agent_runners.get_runner(runner_key, agent)
    try:
        async for event in runner.run(input_data):
            ag_ui_agent_runners.remember_event_thread_id(runner_key, event)
            yield event
    except Exception as exc:
        if ORPHAN_TOOL_RESULT_ERROR in str(exc):
            ag_ui_agent_runners.discard(runner_key)
            logger.warning(
                "ag_ui_runner_discarded_after_orphan_tool_result",
                runner_key=str(runner_key),
                error=str(exc),
            )
        raise

