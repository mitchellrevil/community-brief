from services.analysis_providers.responses_provider import ResponsesProvider


def test_split_context_with_new_terminology():
    """Test that _split_context_payload correctly processes renamed keys."""
    provider = ResponsesProvider.__new__(ResponsesProvider)

    ctx = {
        "base_prompt": "This is the base system prompt",
        "user_prompt": "This is the user-specific prompt",
        "instructions": "Additional instructions here",
        "session_data": {"meetingType": "standup", "attendees": ["Alice", "Bob"]},
    }

    instructions_text, context_text = provider._split_context_payload(ctx)

    # Check instructions section includes user_prompt
    assert "USER PROMPT:" in instructions_text
    assert "This is the user-specific prompt" in instructions_text
    
    # Check instructions section includes additional instructions
    assert "ADDITIONAL INSTRUCTIONS:" in instructions_text
    assert "Additional instructions here" in instructions_text
    
    # Check instructions section includes session_data
    assert "SESSION DATA:" in instructions_text
    assert "meetingType" in instructions_text
    assert "standup" in instructions_text
    
    # Check context section includes base_prompt
    assert "BASE PROMPT:" in context_text
    assert "This is the base system prompt" in context_text


def test_split_context_with_base_prompt_only():
    """Test context with only base_prompt (original system prompt)."""
    provider = ResponsesProvider.__new__(ResponsesProvider)

    ctx = {"base_prompt": "Original prompt only"}

    instructions_text, context_text = provider._split_context_payload(ctx)

    assert instructions_text == ""
    assert "BASE PROMPT:" in context_text
    assert "Original prompt only" in context_text


def test_split_context_with_user_prompt_only():
    """Test context with only user_prompt (job-specific prompt)."""
    provider = ResponsesProvider.__new__(ResponsesProvider)

    ctx = {"user_prompt": "Job-specific prompt"}

    instructions_text, context_text = provider._split_context_payload(ctx)

    assert "USER PROMPT:" in instructions_text
    assert "Job-specific prompt" in instructions_text
    assert context_text == ""


def test_split_context_with_session_data_only():
    """Test context with only session_data."""
    provider = ResponsesProvider.__new__(ResponsesProvider)

    ctx = {"session_data": {"key": "value"}}

    instructions_text, context_text = provider._split_context_payload(ctx)

    assert "SESSION DATA:" in instructions_text
    assert "key" in instructions_text
    assert context_text == ""


def test_split_context_string_passthrough():
    """Test that string context is passed through to context_text."""
    provider = ResponsesProvider.__new__(ResponsesProvider)
    
    instructions_text, context_text = provider._split_context_payload(" hello ")
    
    assert instructions_text == ""
    assert context_text == "hello"


def test_split_context_none():
    """Test that None context returns empty strings."""
    provider = ResponsesProvider.__new__(ResponsesProvider)
    
    instructions_text, context_text = provider._split_context_payload(None)
    
    assert instructions_text == ""
    assert context_text == ""


def test_split_context_preserves_extra_keys():
    """Test that extra keys not in the standard set are preserved in context."""
    provider = ResponsesProvider.__new__(ResponsesProvider)

    ctx = {
        "user_prompt": "Main prompt",
        "custom_field": "custom value",
        "another_field": 123
    }

    instructions_text, context_text = provider._split_context_payload(ctx)

    assert "USER PROMPT:" in instructions_text
    assert "ADDITIONAL CONTEXT:" in context_text
    assert "custom_field" in context_text
    assert "custom value" in context_text
