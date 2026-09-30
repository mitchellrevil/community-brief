"""Small, bounded model probes using only server-configured Azure credentials."""

import asyncio
from contextlib import AsyncExitStack

from azure.core.exceptions import ClientAuthenticationError
from azure.identity.aio import DefaultAzureCredential, get_bearer_token_provider
from openai import APIConnectionError, APIStatusError, APITimeoutError, AsyncOpenAI

from ..core.logging import get_logger
from ..schemas.inference_catalog import ModelConnectionRequest, ModelConnectionResult

logger = get_logger(__name__)

PROBE_TIMEOUT_SECONDS = 20
PROBE_MAX_OUTPUT_TOKENS = 16
PROBE_INPUT = "Reply with OK."


class InferenceConnectionService:
    def __init__(
        self,
        *,
        azure_endpoint: str,
        api_key: str | None,
        managed_identity_client_id: str | None = None,
    ) -> None:
        self.azure_endpoint = azure_endpoint
        self.api_key = api_key
        self.managed_identity_client_id = managed_identity_client_id

    async def test_connection(
        self, request: ModelConnectionRequest
    ) -> ModelConnectionResult:
        endpoint = (self.azure_endpoint or "").rstrip("/")
        if not endpoint:
            return ModelConnectionResult(
                status="error", message="The Azure OpenAI endpoint is not configured."
            )
        base_url = (
            endpoint if endpoint.endswith("/openai/v1") else f"{endpoint}/openai/v1"
        )
        try:
            # The deadline also covers asynchronous managed-identity token acquisition.
            async with asyncio.timeout(PROBE_TIMEOUT_SECONDS), AsyncExitStack() as stack:
                api_key = self.api_key
                if not api_key:
                    credential = await stack.enter_async_context(
                        DefaultAzureCredential(
                            managed_identity_client_id=self.managed_identity_client_id
                        )
                    )
                    api_key = get_bearer_token_provider(
                        credential, "https://ai.azure.com/.default"
                    )
                client = await stack.enter_async_context(
                    AsyncOpenAI(
                        api_key=api_key,
                        base_url=base_url,
                        timeout=PROBE_TIMEOUT_SECONDS,
                        max_retries=0,
                    )
                )
                if request.provider == "responses":
                    response = await client.responses.create(
                        model=request.deployment,
                        input=PROBE_INPUT,
                        max_output_tokens=PROBE_MAX_OUTPUT_TOKENS,
                        store=False,
                    )
                    if response.status == "failed":
                        return ModelConnectionResult(
                            status="error",
                            message="The deployment received the test but could not complete it. Try again or check its configuration.",
                        )
                else:
                    await client.chat.completions.create(
                        model=request.deployment,
                        messages=[{"role": "user", "content": PROBE_INPUT}],
                        max_completion_tokens=PROBE_MAX_OUTPUT_TOKENS,
                        store=False,
                    )
            # A token-limited response still confirms that the deployment accepted
            # the request. This checks connectivity, not generated content quality.
            return ModelConnectionResult(
                status="success",
                message="Connection successful. The deployment accepted the test request.",
            )
        except (TimeoutError, APITimeoutError):
            message = "The connection test timed out. Try again or check the deployment."
        except ClientAuthenticationError:
            message = "Azure authentication failed. Check the application's configured credentials and model access."
        except APIStatusError as exc:
            if exc.status_code in (401, 403):
                message = "Azure authentication failed. Check the application's configured credentials and model access."
            elif exc.status_code == 404:
                message = "The deployment was not found. Check its name and selected request format."
            elif exc.status_code == 429:
                message = "The deployment is rate limited or has no available quota. Try again later."
            elif exc.status_code == 400:
                message = "The deployment did not accept the test request. Check its name and selected request format."
            else:
                message = "Azure could not complete the connection test. Try again later."
        except APIConnectionError:
            message = "Could not reach Azure OpenAI. Check the application's endpoint and network access."
        except Exception as exc:
            logger.warning(
                "inference_connection_test_failed", error_type=type(exc).__name__
            )
            message = "Could not complete the connection test. Check the application's Azure OpenAI configuration."
        return ModelConnectionResult(status="error", message=message)
