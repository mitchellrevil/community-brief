from unittest.mock import Mock


def _make_fakes() -> tuple:
    """Return (FakeClient class, FakeAgent instance, created-kwargs dict)."""
    created: dict = {}

    class FakeAgent:
        def __init__(self, *, name, instructions):
            created["agent_kwargs"] = {"name": name, "instructions": instructions}

    class FakeClient:
        def __init__(self, *, project_endpoint, model, credential):
            created["client_kwargs"] = {
                "project_endpoint": project_endpoint,
                "model": model,
                "credential": credential,
            }

        def as_agent(self, *, name, instructions):
            return FakeAgent(name=name, instructions=instructions)

    return FakeClient, FakeAgent, created


def test_build_planner_agent_uses_foundry_client(monkeypatch):
    FakeClient, FakeAgent, created = _make_fakes()

    import services.enhanced_reasoning.agents as agents

    monkeypatch.setattr(agents, "_get_foundry_client_class", lambda: FakeClient)

    credential = object()
    config = Mock(
        azure_openai_endpoint="https://test-openai.cognitiveservices.azure.com/",
        azure_openai_version="2025-11-13",
    )

    planner_agent = agents.build_planner_agent(config, credential)

    assert isinstance(planner_agent, FakeAgent)
    assert created["client_kwargs"] == {
        "project_endpoint": "https://test-openai.cognitiveservices.azure.com",
        "model": agents.ENHANCED_REASONING_MODELS["planner"],
        "credential": credential,
    }
    assert created["agent_kwargs"]["name"] == "Planner"
    assert "document planning assistant" in created["agent_kwargs"]["instructions"]


def test_build_writer_agent_uses_correct_model(monkeypatch):
    FakeClient, FakeAgent, created = _make_fakes()

    import services.enhanced_reasoning.agents as agents

    monkeypatch.setattr(agents, "_get_foundry_client_class", lambda: FakeClient)

    config = Mock(
        azure_openai_endpoint="https://test-openai.cognitiveservices.azure.com",
        azure_openai_version="2025-11-13",
    )

    writer_agent = agents.build_writer_agent(config)

    assert isinstance(writer_agent, FakeAgent)
    assert created["client_kwargs"]["model"] == agents.ENHANCED_REASONING_MODELS["writer"]
    assert created["agent_kwargs"]["name"] == "Writer"


def test_build_critic_agent_uses_correct_model(monkeypatch):
    FakeClient, FakeAgent, created = _make_fakes()

    import services.enhanced_reasoning.agents as agents

    monkeypatch.setattr(agents, "_get_foundry_client_class", lambda: FakeClient)

    config = Mock(
        azure_openai_endpoint="https://test-openai.cognitiveservices.azure.com",
        azure_openai_version="2025-11-13",
    )

    critic_agent = agents.build_critic_agent(config)

    assert created["client_kwargs"]["model"] == agents.ENHANCED_REASONING_MODELS["critic"]
    assert created["agent_kwargs"]["name"] == "Critic"


def test_build_rewriter_agent_uses_correct_model(monkeypatch):
    FakeClient, FakeAgent, created = _make_fakes()

    import services.enhanced_reasoning.agents as agents

    monkeypatch.setattr(agents, "_get_foundry_client_class", lambda: FakeClient)

    config = Mock(
        azure_openai_endpoint="https://test-openai.cognitiveservices.azure.com",
        azure_openai_version="2025-11-13",
    )

    rewriter_agent = agents.build_rewriter_agent(config)

    assert created["client_kwargs"]["model"] == agents.ENHANCED_REASONING_MODELS["rewriter"]
    assert created["agent_kwargs"]["name"] == "Rewriter"


def test_missing_endpoint_raises(monkeypatch):
    FakeClient, _, _ = _make_fakes()

    import services.enhanced_reasoning.agents as agents
    import pytest

    monkeypatch.setattr(agents, "_get_foundry_client_class", lambda: FakeClient)

    config = Mock(azure_openai_endpoint="", azure_openai_version="2025-11-13")

    with pytest.raises(ValueError, match="AZURE_OPENAI_ENDPOINT"):
        agents.build_planner_agent(config)
