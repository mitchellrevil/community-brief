from __future__ import annotations

from collections import OrderedDict
from collections.abc import Hashable
from typing import Any


MAX_AG_UI_AGENT_RUNNERS = 500


class AgUiAgentRunnerRegistry:
    def __init__(self, *, max_runners: int = MAX_AG_UI_AGENT_RUNNERS) -> None:
        self.max_runners = max_runners
        self._runners: OrderedDict[Hashable, Any] = OrderedDict()
        self._thread_ids: dict[Hashable, str] = {}

    def get_runner(self, key: Hashable, agent: Any) -> Any:
        try:
            from agent_framework_ag_ui import AgentFrameworkAgent
        except (ImportError, ModuleNotFoundError) as exc:  # pragma: no cover
            raise RuntimeError("Microsoft Agent Framework AG-UI integration is not installed") from exc

        runner = self._runners.pop(key, None)
        if runner is None:
            runner = AgentFrameworkAgent(agent, require_confirmation=True)
        else:
            runner.agent = agent

        self._runners[key] = runner
        while len(self._runners) > self.max_runners:
            evicted_key, _ = self._runners.popitem(last=False)
            self._thread_ids.pop(evicted_key, None)
        return runner

    def thread_id_for(self, key: Hashable, default: str) -> str:
        return self._thread_ids.get(key, default)

    def remember_event_thread_id(self, key: Hashable, event: Any) -> None:
        thread_id = getattr(event, "thread_id", None) or getattr(event, "threadId", None)
        if thread_id:
            self._thread_ids[key] = str(thread_id)

    def discard(self, key: Hashable) -> None:
        self._runners.pop(key, None)
        self._thread_ids.pop(key, None)

    def clear(self) -> None:
        self._runners.clear()
        self._thread_ids.clear()


ag_ui_agent_runners = AgUiAgentRunnerRegistry()

