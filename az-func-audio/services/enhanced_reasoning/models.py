from __future__ import annotations
from dataclasses import dataclass, field


@dataclass
class PromptConstraints:
    """Local copy — mirrors backend_app model, no Pydantic dependency."""
    format: str | None = None           # "bullets" | "prose" | "table"
    max_items: int | None = None
    max_words: int | None = None
    max_words_per_item: int | None = None
    required_elements: list[str] = field(default_factory=list)
    tone: str | None = None

    @classmethod
    def from_dict(cls, d: dict) -> "PromptConstraints":
        return cls(
            format=d.get("format"),
            max_items=d.get("max_items"),
            max_words=d.get("max_words"),
            max_words_per_item=d.get("max_words_per_item"),
            required_elements=d.get("required_elements") or [],
            tone=d.get("tone"),
        )
    


@dataclass
class WriterBrief:
    task: str
    output_format: str
    constraints: PromptConstraints


@dataclass
class SectionPlan:
    section_key: str
    prompt_text: str
    writer_brief: WriterBrief
    critic_checklist: list[str]


@dataclass
class SectionVerdict:
    passed: bool
    checklist: dict[str, bool]
    issues: list[str]


@dataclass
class CriticVerdict:
    all_pass: bool
    sections: dict[str, SectionVerdict]


@dataclass
class PipelineMetadata:
    iterations: int
    flagged_sections: list[str] = field(default_factory=list)


WorkPlan = list[SectionPlan]
SectionDraft = dict[str, str]

# Model assignments
ENHANCED_REASONING_MODELS = {
    "planner":  "gpt-5.4-nano",
    "writer":   "gpt-5.5",
    "critic":   "gpt-5.4",
    "rewriter": "gpt-5.5",
}
