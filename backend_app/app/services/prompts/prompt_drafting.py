from __future__ import annotations


def draft_structured_prompt_text(title: str, section_briefs: str) -> str:
    clean_title = (title or "Meeting Summary").strip()
    sections = [
        line.strip(" -\t")
        for line in (section_briefs or "").splitlines()
        if line.strip(" -\t")
    ]
    if not sections:
        sections = ["Summary: Include the key points and decisions from the meeting."]

    lines = [
        f"# {clean_title}",
        "",
        "Use the transcript to produce a concise structured note. Do not invent details.",
    ]
    for section in sections:
        if ":" in section:
            heading, brief = section.split(":", 1)
        else:
            heading, brief = section, "Include only the transcript details relevant to this section."
        lines.extend(["", f"## {heading.strip()}", brief.strip()])
    return "\n".join(lines).strip()

