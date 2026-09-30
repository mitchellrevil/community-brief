from __future__ import annotations

from openai import OpenAI

from core.logging import get_logger, setup_logging


logger = get_logger(__name__)


def run_interactive_responses_chat(
    *,
    endpoint: str,
    api_key: str,
    deployment_name: str,
) -> None:
    client = OpenAI(base_url=endpoint, api_key=api_key)
    previous_response_id = None
    logger.info(
        "responses_helper.started",
        endpoint=endpoint,
        deployment_name=deployment_name,
    )

    while (message := input("Enter your message ('exit' to quit): ").strip()).lower() != "exit":
        response = client.responses.create(
            model=deployment_name,
            input=[{"role": "user", "content": message}],
            **({"previous_response_id": previous_response_id} if previous_response_id else {}),
            reasoning={"effort": "high"},
            text={"verbosity": "low"},
        )

        logger.info(
            "responses_helper.response",
            response_text=response.output_text,
        )
        previous_response_id = response.id


def main() -> None:
    setup_logging(format_json=False)
    run_interactive_responses_chat(
        endpoint="https://.services.ai.azure.com/openai/v1/",
        api_key="",
        deployment_name="gpt-5.1",
    )


if __name__ == "__main__":
    main()
