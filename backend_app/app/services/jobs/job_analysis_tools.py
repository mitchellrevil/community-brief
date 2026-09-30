from __future__ import annotations

from typing import Any, Callable


def build_job_analysis_tools(
    service: Any,
    *,
    job_id: str,
    current_user: dict[str, Any],
    on_analysis_update: Callable[[str], None] | None = None,
) -> list[Any]:
    try:
        from agent_framework import tool
    except (ImportError, ModuleNotFoundError) as exc:  # pragma: no cover - runtime dependency guard
        raise RuntimeError("Microsoft Agent Framework is not installed") from exc

    @tool(
        name="read_transcription",
        description="Read the current job transcription. The job id is already scoped by the server.",
    )
    async def read_transcription() -> str:
        return await service.read_transcription(job_id=job_id, current_user=current_user)

    @tool(
        name="read_analysis_markdown",
        description="Read the current job analysis Markdown when it is stored as analysis.md.",
    )
    async def read_analysis_markdown() -> str:
        return await service.read_analysis_markdown(job_id=job_id, current_user=current_user)

    @tool(
        name="apply_patch",
        description=(
            "Patch the current job's analysis.md by replacing one exact old_text block with new_text. "
            "No file path is accepted; edits are scoped to this job's analysis Markdown blob."
        ),
        approval_mode="always_require",
    )
    async def apply_patch(old_text: str, new_text: str, occurrence: int = 1) -> dict[str, Any]:
        result = await service.apply_analysis_patch(
            job_id=job_id,
            current_user=current_user,
            old_text=old_text,
            new_text=new_text,
            occurrence=occurrence,
        )
        updated_text = result.pop("analysis_text", None)
        if updated_text is not None and on_analysis_update is not None:
            on_analysis_update(updated_text)
        return result

    return [read_transcription, read_analysis_markdown, apply_patch]

