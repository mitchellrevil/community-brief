import logging
import json
import os
import sys
from unittest.mock import Mock

pkg_root = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
if pkg_root not in sys.path:
    sys.path.insert(0, pkg_root)

from services.blob_processing_service import BlobProcessingService
from services.speaker_identification_service import SpeakerIdentificationService


TRANSCRIPT = (
    "--- Speaker 1 @ 00:00:00.120 ---\n"
    "  [00:00:00.120] I am Jane and I will chair this meeting.\n"
    "--- Speaker 2 @ 00:00:05.000 ---\n"
    "  [00:00:05.000] I am the allocated social worker.\n"
)


def _analysis_service_with_response(response_text: str):
    response = Mock()
    response.output_text = response_text
    provider = Mock()
    provider.client.responses.create.return_value = response
    analysis_service = Mock()
    analysis_service._get_provider.return_value = provider
    return analysis_service


def test_identify_rewrites_high_confidence_name(caplog):
    caplog.set_level(logging.INFO)
    analysis_service = _analysis_service_with_response(
        '{"speakers":[{"speaker_id":"1","name":"Jane Smith","role":"Chair","confidence":0.93,"evidence":"introduced herself"}]}'
    )

    updated, metadata = SpeakerIdentificationService(
        analysis_service=analysis_service,
    ).identify(TRANSCRIPT, session_data={"chair": "Jane Smith"})

    assert "--- Speaker 1: Jane Smith @ 00:00:00.120 ---" in updated
    assert metadata["applied"] is True
    create_kwargs = analysis_service._get_provider.return_value.client.responses.create.call_args.kwargs
    assert create_kwargs["reasoning"] == {"effort": "low"}
    assert create_kwargs["max_output_tokens"] == 16000
    assert create_kwargs["text"]["format"]["type"] == "json_schema"
    assert create_kwargs["text"]["format"]["name"] == "speaker_identification"
    assert create_kwargs["text"]["format"]["strict"] is True
    payload = json.loads(create_kwargs["input"][1]["content"])
    system_prompt = create_kwargs["input"][0]["content"]
    assert "Name of Manager" in system_prompt
    assert "Name of Staff" in system_prompt
    assert payload["pre_session_form_inputs"] == {"chair": "Jane Smith"}
    assert "session_data" not in payload
    assert "speaker_identification.prompt_submitted" in caplog.text
    assert "model=gpt-5.6-luna" in caplog.text
    assert "speaker_ids=[\"1\", \"2\"]" in caplog.text
    assert "speaker_identification.response_received" in caplog.text


def test_identify_falls_back_to_role_when_name_is_uncertain():
    analysis_service = _analysis_service_with_response(
        '{"speakers":[{"speaker_id":"2","name":"Sam Lee","role":"Social worker","confidence":0.42,"evidence":"allocated social worker"}]}'
    )

    updated, _metadata = SpeakerIdentificationService(
        analysis_service=analysis_service,
    ).identify(TRANSCRIPT, session_data={"attendees": ["Sam Lee"]})

    assert "--- Speaker 1: Participant 1 @ 00:00:00.120 ---" in updated
    assert "--- Speaker 2: Social worker @ 00:00:05.000 ---" in updated
    assert "Sam Lee" not in updated


def test_identify_uses_participant_fallback_when_model_output_is_malformed():
    analysis_service = _analysis_service_with_response("not json")

    updated, metadata = SpeakerIdentificationService(
        analysis_service=analysis_service,
    ).identify(TRANSCRIPT)

    assert "--- Speaker 1: Participant 1 @ 00:00:00.120 ---" in updated
    assert "--- Speaker 2: Participant 2 @ 00:00:05.000 ---" in updated
    assert metadata["applied"] is True


def test_blob_processing_does_not_call_speaker_model_when_prompt_flag_is_missing():
    analysis_service = Mock()
    service = BlobProcessingService(
        storage_service_factory=Mock(),
        transcription_service_factory=Mock(),
        analysis_service_factory=Mock(),
    )

    updated = service.apply_speaker_identification(
        formatted_text=TRANSCRIPT,
        file_doc={"id": "job-1", "transcription_file_path": "https://storage/transcript.txt"},
        prompt_metadata={},
        config=Mock(),
        cosmos_service=Mock(),
        storage_service=Mock(),
        analysis_service=analysis_service,
        job_id="job-1",
        correlation_id="corr-1",
    )

    assert updated == TRANSCRIPT
    analysis_service._get_provider.assert_not_called()
