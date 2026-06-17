from types import MappingProxyType

from services.analysis_providers.chat_completions_provider import ChatCompletionsProvider
from services.analysis_providers.responses_provider import ResponsesProvider


PROVIDER_REGISTRY = MappingProxyType(
    {
        "responses": ResponsesProvider,
        "chat_completions": ChatCompletionsProvider,
    }
)


def get_analysis_provider_registry() -> MappingProxyType:
    return PROVIDER_REGISTRY
