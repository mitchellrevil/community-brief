from __future__ import annotations

import json
from typing import Any


def ag_ui_sse_event(event: Any) -> str:
    if hasattr(event, "model_dump_json"):
        payload = event.model_dump_json(by_alias=True, exclude_none=True)
    else:
        payload = json.dumps(event)
    return f"data: {payload}\n\n"


def json_sse_event(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def run_error_sse_event(message: str, thread_id: str, run_id: str | None) -> str:
    return json_sse_event(
        {
            "type": "RUN_ERROR",
            "threadId": thread_id,
            "runId": run_id,
            "message": message,
        }
    )

