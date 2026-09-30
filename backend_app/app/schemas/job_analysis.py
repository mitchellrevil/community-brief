"""Job analysis API schemas."""

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str = Field(..., description="Role: 'user' or 'assistant'")
    content: str = Field(..., description="Message content")


class ReprocessRequest(BaseModel):
    instructions: str | None = None
    prompt_category_id: str | None = None
    prompt_subcategory_id: str | None = None
    create_new_job: bool = False
