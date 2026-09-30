from types import SimpleNamespace

from app.services.agent_chat.runner_registry import AgUiAgentRunnerRegistry


def test_registry_remembers_adapter_thread_id():
    registry = AgUiAgentRunnerRegistry()
    key = ("job-analysis", "job-1")

    assert registry.thread_id_for(key, "job-1") == "job-1"

    registry.remember_event_thread_id(key, SimpleNamespace(thread_id="response-thread-1"))

    assert registry.thread_id_for(key, "job-1") == "response-thread-1"
