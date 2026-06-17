from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel


class PromptConstraints(BaseModel):
    format: Optional[Literal["bullets", "prose", "table"]] = None
    max_items: Optional[int] = None
    max_words: Optional[int] = None
    max_words_per_item: Optional[int] = None
    required_elements: Optional[list[str]] = None
    tone: Optional[str] = None
