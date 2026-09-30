from __future__ import annotations

from collections.abc import Sequence
from typing import Any


def normalize_ag_ui_messages(
    ag_ui_messages: Sequence[dict[str, Any]] | None,
    *,
    preserve_tool_history: bool = False,
) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    for item in ag_ui_messages or []:
        normalized = dict(item)
        normalized["role"] = str(normalized.get("role", "user"))
        if "content" in normalized:
            normalized["content"] = str(normalized.get("content") or "")
        elif not _has_non_text_ag_ui_content(normalized):
            normalized["content"] = ""
        if not preserve_tool_history:
            normalized = _without_tool_history(normalized)
            if normalized is None:
                continue
        if normalized.get("content") or _has_non_text_ag_ui_content(normalized):
            messages.append(normalized)
    return messages


def legacy_chat_messages(
    conversation_history: Sequence[Any],
    message: str,
) -> list[dict[str, str]]:
    messages = [
        {
            "role": str(message_value(item, "role", "user")),
            "content": str(message_value(item, "content", "")),
        }
        for item in conversation_history
        if message_value(item, "content", None)
    ]
    if message:
        messages.append({"role": "user", "content": message})
    return messages


def message_value(message: Any, key: str, default: Any) -> Any:
    if isinstance(message, dict):
        return message.get(key, default)
    return getattr(message, key, default)


def _has_non_text_ag_ui_content(message: dict[str, Any]) -> bool:
    return any(message.get(key) for key in ("tool_calls", "toolCalls", "toolCallId", "tool_call_id"))


def _without_tool_history(message: dict[str, Any]) -> dict[str, Any] | None:
    if message.get("role") == "tool" or message.get("toolCallId") or message.get("tool_call_id"):
        return None

    if message.get("tool_calls") or message.get("toolCalls"):
        message = dict(message)
        message.pop("tool_calls", None)
        message.pop("toolCalls", None)
        if not message.get("content"):
            return None
    return message

