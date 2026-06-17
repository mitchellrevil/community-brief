# Azure Functions Audio Pipeline

Serverless event-driven pipeline for processing audio, text, and document uploads in Community Brief. Provides transcription via Azure Speech Batch API and analysis via Azure OpenAI Responses API with real-time status updates to Cosmos DB.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Technology Stack](#technology-stack)
- [Transcription Pipeline](#transcription-pipeline)
- [Analysis Pipeline](#analysis-pipeline)
- [Service Modules](#service-modules)
- [Cosmos Schema](#cosmos-schema)
- [Logging](#logging)
- [Retry & Error Handling](#retry--error-handling)
- [Managed Identity](#managed-identity)
- [Configuration](#configuration)
- [Security Controls](#security-controls)
- [Testing Strategy](#testing-strategy)
- [Integration with Backend/Frontend](#integration-with-backendfrontend)
- [Known Limitations](#known-limitations)
- [System-Generated Artifacts](#system-generated-artifacts)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### Blob Trigger Pipeline

The Azure Functions app responds to blob creation events in the blob container configured by `AZURE_STORAGE_RECORDINGS_CONTAINER`.

```
User Upload → Blob Storage → Blob Trigger (function_app.py)
                                    ↓
                      ┌─────────────┴─────────────┐
                      │  Process Audio/Text/Doc   │
                      └─────────────┬─────────────┘
                                    ↓
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
   Audio Files              Text Files              Document Files
    (.wav, .mp3)          (.txt, .srt)            (.pdf, .docx)
        │                          │                          │
        ↓                          ↓                          ↓
Azure Speech Service      Text Extraction          PDF/DOCX Parser
Batch Transcription      UTF-8 Normalization      Text Extraction
        │                          │                          │
        └──────────────────────────┼──────────────────────────┘
                                   ↓
                    Store Transcription/Text in Blob
                    Update Cosmos: status=transcribed
                                   ↓
                          Azure OpenAI Analysis
                        (Responses API + Reasoning)
                                   ↓
                      Generate & Upload DOCX Analysis
                      Update Cosmos: status=completed
```

### HTTP Reprocess Endpoint

The `/api/reprocess-analysis` HTTP endpoint allows regenerating analysis with different prompts or instructions:

```
Backend POST Request → ReprocessAnalysis HTTP Function
                                ↓
                    Retrieve Job + Transcription
                                ↓
                    Apply New Prompt/Instructions
                                ↓
                        Azure OpenAI Analysis
                                ↓
            Create New Job (if requested) OR Update Existing
                                ↓
                    Return Analysis File URL + Metadata
```

### Key Components

- **Blob Trigger Function**: `blob_trigger()` in [function_app.py](function_app.py)
- **HTTP Reprocess Function**: `reprocess_analysis_http()` in [function_app.py](function_app.py)
- **Service Layer**: Singleton DI pattern via [core/dependencies.py](core/dependencies.py)
- **Status Management**: Canonical statuses in [core/job_status.py](core/job_status.py)
- **Structured Logging**: JSON logs with correlation IDs in [core/logging.py](core/logging.py)

---

## Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Runtime | Python | 3.11 |
| Functions Runtime | Azure Functions | v4 |
| Transcription | Azure Speech Batch API | v3.2 |
| Analysis | Azure OpenAI Responses API | 2025-03-01-preview |
| Storage | Azure Blob Storage | SDK 12.25+ |
| Database | Azure Cosmos DB | SDK 4.9+ |
| Document Generation | python-docx | 1.1.2 |
| Authentication | Azure Identity (DefaultAzureCredential) | 1.21+ |
| Testing | pytest + pytest-asyncio | Latest |

### Python Dependencies

See [requirements.txt](requirements.txt) for the complete dependency list. Key packages:

- `azure-functions`: Functions runtime bindings
- `azure-identity`: Managed identity authentication
- `azure-storage-blob`: Blob storage operations
- `azure-cosmos`: Cosmos DB operations
- `openai==1.99.2`: Azure OpenAI Responses API client
- `python-docx`: DOCX generation for analysis outputs
- `markdown-it-py`: Markdown parsing for formatted documents
- `pytest`: Testing framework

---

## Transcription Pipeline

### Azure Speech Transcription APIs

Audio files (.wav, .mp3, .m4a, .ogg, .opus, .flac, .aac, .wma, .webm, .spx) are transcribed using a hybrid Azure Speech integration that prefers the Fast Transcription API when the file is safely within limits and falls back to the Batch Transcription API v3.2 when it is not.

### Transcription Workflow

Implemented in [services/fast_transcription_service.py](services/fast_transcription_service.py):

1. **Submit Job**: Upload blob URL to Speech Service
   ```python
   transcription_id = transcription_service.submit_transcription_job(blob_url)
   ```

2. **Poll Status**: Long-polling with 20s intervals (default timeout: 5 hours)
   ```python
   status_data = transcription_service.check_status(transcription_id, timeout=18000)
   ```

3. **Retrieve Results**: Fetch transcription JSON and format text
   ```python
   formatted_text = transcription_service.get_results(status_data)
   ```

### Features

- **Speaker Diarization**: Identifies up to 10 speakers (configurable via `AZURE_SPEECH_MAX_SPEAKERS`)
- **Word-Level Timestamps**: Extracts timestamps in HH:MM:SS.mmm format when available
- **Multi-Language Support**: Auto-detection with fallback locales (en-GB, en-US, zu-ZA, af-ZA)
- **Confidence Scoring**: Flags low-confidence phrases (<0.8) in output
- **Error Recovery**: Exponential backoff on transient failures

### Fast Transcription API

For short audio files (<2 hours), the pipeline can use the Fast Transcription API for near-real-time results:

- **Configuration**: Set `ENABLE_FAST_TRANSCRIPTION=true` and `FAST_TRANSCRIPTION_THRESHOLD_MINUTES=120`
- **Implementation**: [services/fast_transcription_service.py](services/fast_transcription_service.py)
- **Trade-offs**: Lower latency but less robust for long files or poor audio quality

### Transcription Output Format

```
--- Speaker 1 @ 00:00:03.320 ---
  [00:00:03.320] Welcome to today's meeting.
  [00:00:08.150] Let's start with the agenda.

--- Speaker 2 @ 00:00:12.480 ---
  [00:00:12.480] Thanks for joining everyone.
  [00:00:15.920] I'd like to propose we discuss the budget first. [Confidence: 0.75]
```

Transcriptions are saved as `.txt` blobs with the `__SYS__` tag to prevent reprocessing.

---

## Analysis Pipeline

### Azure OpenAI Responses API

The pipeline uses the [Azure OpenAI Responses API](https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/responses) for structured analysis of transcriptions/documents. This API provides extended reasoning capabilities and structured output formatting.

### Analysis Workflow

Implemented in [services/analysis_service.py](services/analysis_service.py):

1. **Prepare Context**: Merge user prompts, instructions, and session data
   ```python
   ai_context = _build_ai_context(
       user_prompt=prompt_text,
       instructions=instructions,
       session_data=session_data
   )
   ```

2. **Call Responses API**: Submit conversation + context with model/reasoning settings
   ```python
   response = client.responses.create(
       model=analysis_model or config.azure_openai_deployment,
       input=input_messages,
       reasoning={"effort": analysis_reasoning},  # Optional: "low", "medium", "high"
       instructions=instructions_text
   )
   ```

3. **Parse Response**: Extract text from nested output structure
   ```python
   # Structure: response.output -> messages -> content -> text
   for output_item in response.output:
       for content_item in output_item.content:
           if content_item.type == "output_text":
               text_parts.append(content_item.text)
   ```

4. **Generate DOCX**: Convert Markdown-formatted analysis to formatted Word document
   ```python
   analysis_blob_url = storage_service.generate_and_upload_docx(
       analysis_text, 
       f"{base_name}__SYS___analysis.docx"
   )
   ```

### Prompt Inference Settings (Phase 4)

Per-prompt configuration of OpenAI model and reasoning level:

- **Model Selection**: `analysis_model` field in prompt document (e.g., "gpt-5.1", "gpt-4.1")
- **Reasoning Level**: `analysis_reasoning` field ("low", "medium", "high", or null to disable)
- **Verbosity**: `analysis_verbosity` field ("concise", "detailed") for output length control

**Fallback Logic**: If prompt-level settings are missing, falls back to config defaults:
- `AZURE_OPENAI_DEPLOYMENT` (default model)
- `ENABLE_REASONING` + `REASONING_LEVEL` (default reasoning)

**Model Capability Detection**: Reasoning/verbosity parameters only sent to compatible models (gpt-5.x). Incompatible models (gpt-4.1) silently skip these parameters to prevent API errors.

### Base System Prompt

Defined in [services/analysis_providers/responses_provider.py](services/analysis_providers/responses_provider.py):

```python
BASE_SYSTEM_PROMPT = (
    "You are a professional meeting analyst. Convert the provided meeting transcript into a "
    "well-structured document using Markdown formatting compatible with Microsoft Word. "
    "Use **bold** for key terms and numbered lists (1., 2., 3.) for sequential items. "
    "Write in British English. Do NOT fabricate information. Adapt structure based on context."
)
```

### Analysis Output Format

The pipeline generates DOCX files with:

- **Markdown Formatting**: Headers, bold, italic, lists, code blocks
- **Word-Compatible Styling**: Uses python-docx + markdown-it-py for AST-based rendering
- **Structured Sections**: Adapts to meeting type (e.g., "Key Decisions", "Action Items")
- **Quote Preservation**: Maintains speaker attributions and direct quotes
- **PII Redaction**: Sensitive data marked as [redacted] when detected

Analysis documents are saved with the `__SYS__` tag to prevent blob trigger loops.

---

## Service Modules

The pipeline follows a **singleton dependency injection** pattern with service caching:

### Core Services

#### 1. TranscriptionService

[services/fast_transcription_service.py](services/fast_transcription_service.py)

- **Purpose**: Hybrid Azure Speech Fast and Batch transcription integration
- **Key Methods**:
  - `submit_transcription_job(blob_url, file_size_bytes, audio_duration_minutes)`: Route to Fast or Batch and submit the job
  - `check_status(transcription_id, timeout, interval)`: Poll for completion
  - `get_results(status_data)`: Fetch, normalize, and validate transcription text
- **Dependencies**: Azure Blob Storage metadata and downloads
- **Error Handling**: Raises `TranscriptionServiceError` on API failures

#### 2. AnalysisService

[services/analysis_service.py](services/analysis_service.py)

- **Purpose**: Orchestrator that selects and delegates to analysis providers
- **Key Methods**:
  - `analyze_conversation(conversation, context, provider_name, analysis_model, analysis_reasoning, analysis_verbosity)`: Delegates analysis to selected provider
  - `_get_provider(provider_name)`: Selects provider from registry with fallback to config default
  - `get_supported_providers()`: Returns list of available provider names
- **Provider Selection**: Implements precedence logic (explicit parameter → config default)
- **Dependencies**: Receives provider registry from dependency injection
- **Error Handling**: Raises `ValueError` for unknown providers with helpful message listing supported providers

Provider implementations handle the actual API calls:
- **ResponsesProvider** ([services/analysis_providers/responses_provider.py](services/analysis_providers/responses_provider.py)): Azure OpenAI Responses API with reasoning/verbosity
- **ChatCompletionsProvider** ([services/analysis_providers/chat_completions_provider.py](services/analysis_providers/chat_completions_provider.py)): Azure OpenAI Chat Completions API

#### 3. StorageService

[services/storage_service.py](services/storage_service.py)

- **Purpose**: Azure Blob Storage operations
- **Key Methods**:
  - `upload_text(container_name, blob_name, text_content)`: Upload text blob
  - `generate_and_upload_docx(analysis_text, blob_url)`: Create formatted DOCX
  - `download_text_from_blob(blob_url)`: Retrieve text blob content
  - `generate_sas_url(blob_url, expiry_hours)`: Create time-limited SAS token
- **Features**: Markdown → DOCX conversion with AST parsing (markdown-it-py)
- **Error Handling**: Raises `StorageServiceError` on storage failures

#### 4. CosmosService

[services/cosmos_service.py](services/cosmos_service.py)

- **Purpose**: Cosmos DB job/prompt document management
- **Key Methods**:
  - `get_file_by_blob_url(blob_url)`: Lookup job by file path
  - `update_job_status(job_id, status, **kwargs)`: Update job status + metadata
  - `get_prompts(subcategory_id)`: Retrieve prompt text
  - `get_prompt_metadata(subcategory_id)`: Retrieve full prompt with inference settings
  - `upsert_job(job)`: Insert or update job document
- **History Tracking**: Maintains `analysis_attempts` array for reprocess audit trail
- **Error Handling**: Raises `CosmosServiceError` on DB failures

#### 5. FileProcessingService

[services/file_processing_service.py](services/file_processing_service.py)

- **Purpose**: Text/document extraction (PDF, DOCX, TXT)
- **Key Methods**:
  - `process_file(blob_url, extension)`: Extract text from document
  - `get_file_type(extension)`: Classify file as audio/text/document
- **Supported Formats**: .txt, .srt, .vtt, .json, .md, .rtf, .csv, .pdf, .doc, .docx
- **System Tag**: Defines `SYSTEM_GENERATED_TAG = "__SYS__"`

### Dependency Injection

[core/dependencies.py](core/dependencies.py) provides singleton service instances:

```python
from core import get_blob_storage_service, get_transcription_service, get_analysis_service

storage_service = get_blob_storage_service()      # Cached singleton
transcription_service = get_transcription_service()  # Cached singleton
analysis_service = get_analysis_service()        # Cached singleton
```

**Benefits**:
- Avoids re-authenticating on every request
- Shares credential provider across services
- Simplifies testing with `clear_service_cache()`

---

## Cosmos Schema

### Job Document Structure

Stored in `{prefix}jobs` container (default: `voice_jobs`):

```json
{
  "id": "uuid-v4",
  "type": "job",
  "user_id": "user-oid",
  "user_email": "user@example.com",
  "file_name": "recording.mp3",
  "file_path": "https://storage.blob.core.windows.net/recordings/2026-01-31/recording.mp3",
  "displayname": "Customer Call Recording",
  "status": "completed",
  "transcription_id": "speech-api-job-id",
  "transcription_file_path": "https://.../recording__SYS___transcription.txt",
  "analysis_file_path": "https://.../recording__SYS___analysis.docx",
  "analysis_provider": "responses",
  "analysis_attempts": [
    {
      "attempt": 1,
      "analysis_file_path": "https://.../recording__SYS___analysis.docx",
      "analysis_provider": "responses",
      "created_at": "2026-01-31T10:30:00Z",
      "created_by": "initial"
    }
  ],
  "analysis_latest_attempt": 1,
  "analysis_in_progress": false,
  "analysis_started_at": "2026-01-31T11:59:45Z",
  "analysis_completed_at": "2026-01-31T12:00:15Z",
  "prompt_category_id": "meetings",
  "prompt_subcategory_id": "team-standup",
  "pre_session_form_data": {
    "meeting_type": "standup",
    "attendees": ["Alice", "Bob"]
  },
  "audio_duration_minutes": 15.5,
  "created_at": "2026-01-31T10:00:00Z",
  "updated_at": "2026-01-31T12:00:15Z",
  "error_message": null
}
```

### Job Status Transitions

Defined in [core/job_status.py](core/job_status.py):

```
UPLOADED → TRANSCRIBING → TRANSCRIBED → ANALYSING → COMPLETED
                                                  └→ FAILED
                                                  └→ ERROR
```

**Status Definitions**:

| Status | Description | Terminal? |
|--------|-------------|-----------|
| `uploaded` | Job created, blob uploaded | No |
| `transcribing` | Transcription/text extraction in progress | No |
| `transcribed` | Transcription complete, ready for analysis | No |
| `analysing` | OpenAI analysis in progress | No |
| `completed` | Job fully processed | **Yes** |
| `failed` | Processing failed (recoverable) | **Yes** |
| `error` | Unexpected error (non-recoverable) | **Yes** |

**Important**: These statuses are canonical and must match [backend_app/app/models/job.py](../backend_app/app/models/job.py) for SSE streaming to work correctly.

### Prompt Document Structure

Stored in `{prefix}prompts` container (default: `voice_prompts`):

```json
{
  "id": "prompt-uuid",
  "type": "prompt",
  "category_id": "meetings",
  "subcategory_id": "team-standup",
  "subcategory_name": "Team Standup",
  "prompt_text": "Summarize this team standup meeting...",
  "analysis_model": "gpt-5.1",
  "analysis_reasoning": "medium",
  "analysis_verbosity": "detailed",
  "analysis_provider": "responses",
  "created_at": "2026-01-15T09:00:00Z",
  "updated_at": "2026-01-31T14:30:00Z"
}
```

**Provider Selection Fields**:

- `analysis_provider` (optional, string): Override default provider for this prompt
  - **Allowed Values**: `"responses"`, `"chat_completions"`
  - **Default**: Uses `AZURE_OPENAI_DEFAULT_PROVIDER` if not specified
  - **Use Case**: Force Chat Completions for simple prompts to reduce cost/latency
  
- `analysis_model` (optional, string): Model deployment name override
  - **Example**: `"gpt-5.1"`, `"gpt-4.1"`, `"gpt-5-mini"`
  - **Default**: Uses `AZURE_OPENAI_DEPLOYMENT` if not specified
  
- `analysis_reasoning` (optional, string): Reasoning effort level
  - **Allowed Values**: `"low"`, `"medium"`, `"high"`, `null`
  - **Default**: Uses `ENABLE_REASONING` + `REASONING_LEVEL` if not specified
  - **Note**: Only works with Responses provider + o-series models
  
- `analysis_verbosity` (optional, string): Output detail level
  - **Allowed Values**: `"concise"`, `"detailed"`, `null`
  - **Default**: No verbosity control if not specified
  - **Note**: Only works with Responses provider

**Retrieval**: Use `CosmosService.get_prompt_metadata(subcategory_id)` to load full prompt with provider settings.

### Idempotency Guards

The blob trigger function **skips processing** if job status is already:
- `completed`
- `transcribing`
- `transcribed`
- `analysing`

This prevents duplicate processing when blobs are re-uploaded or functions retry.

---

## Logging

### Structured Logging

All logs use a structured format with correlation IDs for end-to-end tracing.

**Setup**: [core/logging.py](core/logging.py)

```python
from core import setup_logging, get_logger, redact, preview

setup_logging(level="INFO", format_json=False)  # Text format for Azure Functions
logger = get_logger(__name__)

logger.info(
    "Processing file",
    extra={
        "correlation_id": correlation_id,
        "job_id": job_id,
        "file_type": file_type,
        "blob_path": blob_path
    }
)
```

### Log Levels

Controlled via `LOG_LEVEL` environment variable:

- `DEBUG`: Verbose service-level logs (API requests, token acquisition)
- `INFO`: Standard lifecycle events (job started, status transitions, completion)
- `WARNING`: Recoverable issues (missing optional fields, fallback logic)
- `ERROR`: Failures requiring attention (API errors, processing failures)

### PII Redaction

Use utility functions to prevent leaking sensitive data:

```python
from core import redact, preview

# Redact tokens/keys (keep first 6 chars)
logger.info("Token acquired", extra={"token": redact(token, keep=6)})
# Output: "Token acquired" {"token": "abc123…[redacted]"}

# Preview long text (prevent logging full transcripts)
logger.debug("Transcript", extra={"text": preview(transcription, n=150)})
# Output: "Transcript" {"text": "This is a sample transcript..."}
```

### Correlation IDs

Every blob trigger and HTTP request generates a unique correlation ID:

```python
correlation_id = str(uuid.uuid4())
logger.info("Request started", extra={"correlation_id": correlation_id})
```

**HTTP Reprocess**: Accepts `x-correlation-id` header from backend for cross-service tracing.

### Application Insights Integration

Logs are automatically ingested by Azure Application Insights via the Functions runtime.

**Query Example** (Kusto):
```kusto
traces
| where customDimensions.correlation_id == "abc-123-xyz"
| project timestamp, message, job_id=customDimensions.job_id
| order by timestamp asc
```

---

## Retry & Error Handling

### Error Handling Strategy

1. **Catch All Exceptions**: Top-level try/catch in `blob_trigger()` and `reprocess_analysis_http()`
2. **Mark Job as Failed**: Always update Cosmos status to `failed` or `error` with error message
3. **Log with Context**: Include correlation_id, job_id, blob_path in error logs
4. **Clear Progress Flags**: Set `analysis_in_progress=False` on errors to prevent stuck UI
5. **Re-raise for Retry**: Let Azure Functions retry transient failures automatically

**Example**:
```python
try:
    # Processing logic
    analysis_result = analysis_service.analyze_conversation(...)
except Exception as e:
    logger.error("Analysis failed", exc_info=True, extra={"correlation_id": correlation_id})
    cosmos_service.update_job_status(job_id, JobStatus.FAILED, error_message=str(e))
    raise  # Trigger Azure Functions retry
```

### Timeout Protection

**Problem**: Azure Functions has a 60-minute timeout, but Speech Batch API can take up to 5 hours for long audio files.

**Solution**: 60-minute timeout enforced with `asyncio.wait_for(timeout=3600)` in `blob_trigger()`:

```python
loop.run_until_complete(
    asyncio.wait_for(
        _process_blob_with_timeout(myblob, correlation_id, blob_url, blob_path),
        timeout=3600  # 60 minutes
    )
)
```

**On Timeout**:
1. Job status updated to `failed` with message: "Processing timeout: exceeded 60 minute limit"
2. Error logged with correlation_id
3. Function execution terminates

**Implication**: Audio files longer than ~2 hours may timeout before transcription completes. See [Known Limitations](#known-limitations).

### Blob trigger: resilient job lookup

**Problem**: The blob trigger can fire before the backend has finished creating the corresponding job document in Cosmos DB (race condition).

**Solution**: The blob processor retries the Cosmos lookup a small number of times and performs a suffix-based fallback lookup if an exact match is not found. Configuration (environment variables):

- `BLOB_TRIGGER_LOOKUP_RETRIES` (default: `6`) — number of attempts to wait for the job document
- `BLOB_TRIGGER_LOOKUP_DELAY_SECONDS` (default: `2`) — seconds to wait between attempts

If the job still cannot be found after retries the function logs and raises an error (job is marked as failed). This change reduces transient failures when the backend writes job records slightly after the blob is created.

### Circuit Breaker Pattern

Services implement exponential backoff on transient API failures:

**TranscriptionService**:
```python
try:
    response = requests.get(status_endpoint, headers=headers)
    response.raise_for_status()
except requests.exceptions.RequestException as e:
    logger.error("Status check failed", exc_info=True)
    time.sleep(min(interval * 2, 60))  # Backoff up to 60s
```

**AnalysisService**: Relies on OpenAI SDK's built-in retry logic.

### Custom Exceptions

- `TranscriptionServiceError`: Raised by transcription_service.py
- `AnalysisServiceError`: Raised by analysis_service.py
- `StorageServiceError`: Raised by storage_service.py
- `CosmosServiceError`: Raised by cosmos_service.py

All inherit from Python's `Exception` and include context messages.

---

## Managed Identity

### DefaultAzureCredential

All Azure service authentication uses [DefaultAzureCredential](https://learn.microsoft.com/en-us/python/api/azure-identity/azure.identity.defaultazurecredential) from `azure-identity`:

```python
from azure.identity import DefaultAzureCredential

credential = DefaultAzureCredential()
```

**Credential Chain** (priority order):
1. **Environment Variables**: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_CLIENT_SECRET`
2. **Managed Identity**: System-assigned or user-assigned identity in Azure
3. **Azure CLI**: `az login` credentials (local development)
4. **Visual Studio Code**: VS Code Azure account
5. **Interactive Browser**: Fallback for local development

### Service Connections

Each service receives the same credential instance:

- **Storage**: `BlobServiceClient(account_url, credential=credential)`
- **Cosmos**: `CosmosClient(url, credential=credential)`
- **Speech**: `credential.get_token("https://cognitiveservices.azure.com/.default")`
- **OpenAI**: `get_bearer_token_provider(credential, "https://ai.azure.com/.default")`

### Local Development

For local testing without managed identity:

1. **Option 1: Azure CLI**
   ```bash
   az login
   az account set --subscription "Your Subscription"
   ```

2. **Option 2: Environment Variables**
   ```bash
   export AZURE_CLIENT_ID="app-id"
   export AZURE_TENANT_ID="tenant-id"
   export AZURE_CLIENT_SECRET="<client-secret>"
   ```

3. **Option 3: API Keys** (not recommended for production)
   ```bash
   export AZURE_OPENAI_API_KEY="<api-key>"
   export AZURE_COSMOS_KEY="key"
   export AZURE_STORAGE_ACCOUNT_KEY="key"
   ```

### Production Deployment

1. **Enable System-Assigned Managed Identity** on Function App
2. **Assign RBAC Roles**:
   - **Storage**: "Storage Blob Data Contributor" on storage account
   - **Cosmos**: "Cosmos DB Built-in Data Contributor" (or use Cosmos Key)
   - **Speech**: "Cognitive Services User" on Speech resource
   - **OpenAI**: "Cognitive Services OpenAI User" on OpenAI resource

No secrets/keys needed when using managed identity in production.

---

## Configuration

### Environment Variables

Configured in [local.settings.json](local.settings.json) (local) or Function App Settings (Azure).

#### Required Settings

| Variable | Description | Example |
|----------|-------------|---------|
| `AZURE_COSMOS_ENDPOINT` | Cosmos DB account URL | `https://cosmos-dev.documents.azure.com:443/` |
| `AZURE_COSMOS_DB` | Cosmos database name | `VoiceDB` |
| `AZURE_STORAGE_ACCOUNT_URL` | Blob storage account URL | `https://storageaccount.blob.core.windows.net` |
| `AZURE_STORAGE_RECORDINGS_CONTAINER` | Blob container for uploads | `recordingscontainer` |
| `AZURE_SPEECH_DEPLOYMENT` | Speech service resource name | `communitydevspeechservice` |
| `AZURE_OPENAI_ENDPOINT` | OpenAI endpoint URL | `https://ai-dev.cognitiveservices.azure.com/` |
| `AZURE_OPENAI_DEPLOYMENT` | OpenAI model deployment name | `gpt-5.1` |
| `AZURE_OPENAI_API_VERSION` | OpenAI API version | `2025-03-01-preview` |

#### Optional Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `AZURE_COSMOS_DB_PREFIX` | `voice_` | Container name prefix |
| `AZURE_OPENAI_DEFAULT_PROVIDER` | `responses` | Default analysis provider (responses or chat_completions) |
| `AZURE_SPEECH_TRANSCRIPTION_LOCALE` | `en-GB` | Primary transcription language |
| `AZURE_SPEECH_CANDIDATE_LOCALES` | `en-GB,en-US,zu-ZA,af-ZA` | Language auto-detection pool |
| `AZURE_SPEECH_MAX_SPEAKERS` | `10` | Max speakers for diarization |
| `ENABLE_FAST_TRANSCRIPTION` | `true` | Use fast API for short audio |
| `FAST_TRANSCRIPTION_THRESHOLD_MINUTES` | `120` | Fast API threshold (minutes) |
| `ENABLE_REASONING` | `false` | Enable OpenAI reasoning by default |
| `REASONING_LEVEL` | `medium` | Default reasoning level (low/medium/high) |
| `LOG_LEVEL` | `INFO` | Logging verbosity |
| `FUNCTIONS_EXTENSION_VERSION` | `~4` | Azure Functions runtime version |
| `FUNCTIONS_WORKER_RUNTIME` | `python` | Language runtime |

### Configuration Class

[config.py](config.py) loads and validates settings:

```python
from config import AppConfig

config = AppConfig()
print(config.cosmos_endpoint)           # https://cosmos-dev.documents.azure.com:443/
print(config.supported_audio_extensions) # {'.wav', '.mp3', '.m4a', ...}
print(config.azure_openai_deployment)   # gpt-5.1
```

**Validation**: Raises `ValueError` if required settings are missing.

---

## Provider Architecture

The analysis pipeline uses a pluggable provider system to support multiple Azure OpenAI API surfaces, allowing flexibility in choosing the best API for different use cases.

### Available Providers

#### 1. Responses Provider (Default)

**API**: [Azure OpenAI Responses API](https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/responses)

- **API Version**: `2025-03-01-preview`
- **Capabilities**:
  - ✅ Supports `reasoning.effort` parameter (low/medium/high)
  - ✅ Supports `text.verbosity` parameter (concise/detailed)
  - ✅ Optimized for o-series models (gpt-5.1, gpt-5-mini, gpt-5-nano)
- **Use Cases**: Complex analysis requiring extended reasoning, structured outputs
- **Implementation**: [services/analysis_providers/responses_provider.py](services/analysis_providers/responses_provider.py)

#### 2. Chat Completions Provider

**API**: [Azure OpenAI Chat Completions API](https://learn.microsoft.com/en-us/azure/ai-services/openai/reference)

- **API Version**: Compatible with multiple versions
- **Capabilities**:
  - ❌ Does not support `reasoning.effort`
  - ❌ Does not support `text.verbosity`
  - ✅ Standard messages format (system/user/assistant)
  - ✅ Compatible with all OpenAI models
- **Use Cases**: Simple analysis, legacy model support, cost optimization
- **Implementation**: [services/analysis_providers/chat_completions_provider.py](services/analysis_providers/chat_completions_provider.py)

### Provider Selection Precedence

The analysis provider is determined using a three-tier precedence system:

1. **Explicit Provider Argument** (highest priority)
   - Direct `provider_name` parameter in service calls
   - Used for testing or explicit API selection

2. **Prompt Metadata Field**
   - `analysis_provider` field in prompt document (Cosmos DB)
   - Allows per-prompt provider override
   - Example: Use Chat Completions for simple summaries, Responses for complex analysis

3. **Environment Variable** (fallback)
   - `AZURE_OPENAI_DEFAULT_PROVIDER` config setting
   - Defaults to `"responses"` if not configured

**Provider Selection in Practice:**

The selection happens in two places:

1. **function_app.py** extracts provider from prompt metadata:
```python
# In blob trigger and reprocess flows
prompt_metadata = cosmos_service.get_prompt_metadata(prompt_subcategory_id)
analysis_provider = prompt_metadata.get("analysis_provider")

# Pass to analysis service
analysis_result = analysis_service.analyze_conversation(
    conversation=text,
    context=context,
    provider_name=analysis_provider  # None if not in prompt
)
```

2. **AnalysisService._get_provider()** applies fallback logic:
```python
def _get_provider(self, provider_name: Optional[str]) -> AnalysisProvider:
    # Use provided name, or fall back to config default
    selected = provider_name or self.config.default_analysis_provider
    
    if selected not in self.provider_registry:
        raise ValueError(f"Unknown provider: {selected}")
    
    provider_class = self.provider_registry[selected]
    return provider_class(self.client, self.config)
```

### Adding New Providers

To add a new analysis provider:

1. **Implement AnalysisProvider Protocol** in `services/analysis_providers/`:

```python
from services.interfaces import AnalysisProvider
from typing import Any, Dict, Optional

class MyCustomProvider:
    def __init__(self, client, config):
        self.client = client
        self.config = config
    
    def analyze(
        self,
        conversation: str,
        context: Any,
        model: Optional[str] = None,
        reasoning: Optional[str] = None,
        verbosity: Optional[str] = None
    ) -> Dict[str, Any]:
        """Analyze conversation using this provider's API."""
        # Build request using provider-specific format
        request_payload = self.build_request(
            conversation, context, model or self.config.azure_openai_deployment,
            reasoning, verbosity
        )
        
        # Call API (provider-specific method)
        response = self.client.custom_api.create(**request_payload)
        
        # Parse and return result
        analysis_text = self.parse_response(response)
        return {
            "analysis_text": analysis_text,
            "raw_response": response,
            "status": "success",
        }
    
    def build_request(
        self,
        conversation: str,
        context: Any,
        model: str,
        reasoning: Optional[str],
        verbosity: Optional[str]
    ) -> dict:
        # Build API request payload
        return {
            "model": model,
            # ... provider-specific payload
        }
    
    def parse_response(self, response) -> str:
        # Extract text from API response
        return response.choices[0].text
    
    def supports_reasoning(self) -> bool:
        return False  # or True if API supports reasoning
    
    def supports_verbosity(self) -> bool:
        return False  # or True if API supports verbosity
```

2. **Register in provider registry** (`core/dependencies.py`):

```python
_PROVIDER_REGISTRY_DICT = {
    "responses": ResponsesProvider,
    "chat_completions": ChatCompletionsProvider,
    "my_custom": MyCustomProvider,  # Add here
}
```

3. **Update Configuration**
   
   Add provider name to validation in [config.py](config.py):
   ```python
   allowed_providers = {"responses", "chat_completions", "my_custom"}
   ```

4. **Add Tests**
   
   Create tests in `tests/test_my_custom_provider.py`:
   - Unit tests for provider methods
   - Integration tests with blob trigger
   - Capability flag validation

### Provider Capabilities

Each provider declares capability flags to indicate API feature support:

**Reasoning Support** (`supports_reasoning()`):
- **True**: Provider API accepts `reasoning.effort` parameter
- **False**: Parameter is silently ignored to prevent API errors
- **Models**: Only o-series models (gpt-5.1, gpt-5-mini, gpt-5-nano) support reasoning

**Verbosity Support** (`supports_verbosity()`):
- **True**: Provider API accepts `text.verbosity` parameter
- **False**: Parameter is silently ignored
- **Values**: `"concise"` (brief outputs) or `"detailed"` (comprehensive outputs)

**Capability Checks** ([services/analysis_providers/responses_provider.py](services/analysis_providers/responses_provider.py)):
```python
if self.supports_reasoning() and analysis_reasoning:
    request_kwargs["reasoning"] = {"effort": analysis_reasoning}
else:
    logger.info("Reasoning not supported or disabled, skipping parameter")

if self.supports_verbosity() and analysis_verbosity:
    request_kwargs["text"] = {"verbosity": analysis_verbosity}
```

### Provider Metadata in Responses

All analysis operations include provider metadata in Cosmos DB for observability:

**Job Document** (`analysis_provider` field):
```json
{
  "id": "job-uuid",
  "analysis_provider": "responses",  // Provider used for latest analysis
  "analysis_attempts": [
    {
      "attempt": 1,
      "analysis_provider": "responses",  // Provider used for this attempt
      "analysis_file_path": "https://.../analysis.docx",
      "created_at": "2026-01-31T12:00:00Z"
    }
  ]
}
```

**HTTP Reprocess Response**:
```json
{
  "status": "success",
  "message": "Analysis reprocessed",
  "job_id": "job-uuid",
  "new_job_created": false,
  "analysis_file_path": "https://.../analysis.docx",
  "attempt_number": 2,
  "correlation_id": "trace-id"
}
```

This metadata enables:
- **Debugging**: Track which provider generated each analysis
- **A/B Testing**: Compare provider performance across jobs
- **Cost Attribution**: Correlate usage with billing data
- **Auditing**: Maintain history of provider changes

---

## Security Controls

### 1. Managed Identity (No Secrets in Code)

All Azure service authentication uses managed identity. No API keys or connection strings hardcoded or stored in code.

### 2. System-Generated Tag (`__SYS__`)

All pipeline-generated blobs (transcriptions, analyses, reprocess artifacts) include the `__SYS__` tag in their names. The blob trigger function checks for this tag and **skips processing** to prevent infinite loops:

```python
def is_system_generated_file(blob_name: str) -> bool:
    tag = get_system_generated_tag()  # Returns "__SYS__"
    return tag in blob_name
```

**Defense-in-Depth**: Additional pattern-based detection checks for `_reprocess_` and `analysis` in filenames as a fallback.

### 3. SAS Token Generation

The `StorageService.generate_sas_url()` method creates **time-limited, read-only** SAS tokens for blob access:

- **Expiry**: Default 1 hour (configurable)
- **Permissions**: Read-only (`BlobSasPermissions(read=True)`)
- **Scope**: Single blob (not container-level)
- **Preferred Method**: User delegation key (managed identity) over account key

**Usage**: Backend generates SAS URLs when returning analysis file paths to frontend.

### 4. PII Redaction in Logs

Use `redact()` and `preview()` helpers to prevent logging sensitive data:

```python
logger.info("Token acquired", extra={"token": redact(token)})
logger.debug("Transcript", extra={"text": preview(transcription, n=150)})
```

**Automatic Sanitization**: `sanitize_log_extra()` redacts keys containing "token", "key", "secret", "password", "sas".

### 5. Input Validation

- **File Extension Checks**: Only process whitelisted extensions (audio/text/document)
- **Blob URL Parsing**: Validates container/blob structure before processing
- **Prompt ID Validation**: Ensures prompt documents exist before analysis
- **Status Validation**: Only canonical statuses allowed (enforced by `JobStatus` class)

### 6. Error Message Sanitization

Error messages stored in Cosmos DB are stripped of:
- API tokens (via redaction)
- Full stack traces (only exception type + message logged)
- User input in sensitive contexts (passwords, API keys)

---

## Testing Strategy

### Test Framework

- **Framework**: pytest with pytest-asyncio
- **Coverage**: Run `pytest --cov=. --cov-report=html` to generate coverage reports
- **Mocking**: Uses `unittest.mock` and custom fixtures (see [tests/conftest.py](tests/conftest.py))

### Test Categories

#### 1. Unit Tests

Test individual service methods in isolation:

- [tests/test_fast_transcription_service.py](tests/test_fast_transcription_service.py): Hybrid transcription routing, parsing, and fallback behavior
- [tests/test_analysis_service_responses_api.py](tests/test_analysis_service_responses_api.py): AnalysisService Responses API integration
- [tests/test_analysis_service_prompt_inference.py](tests/test_analysis_service_prompt_inference.py): Prompt-level inference settings
- [tests/test_storage_service.py](tests/test_storage_service.py): StorageService blob operations
- [tests/test_cosmos_service.py](tests/test_cosmos_service.py): CosmosService DB operations
- [tests/test_job_status.py](tests/test_job_status.py): JobStatus constants and helpers

#### 2. Integration Tests

Test service interactions and workflow logic:

- [tests/test_integration.py](tests/test_integration.py): End-to-end blob trigger workflow
- [tests/test_reprocess_async.py](tests/test_reprocess_async.py): HTTP reprocess endpoint
- [tests/test_function_app_prompt_inference.py](tests/test_function_app_prompt_inference.py): Prompt settings in blob trigger
- [tests/test_text_processing_status.py](tests/test_text_processing_status.py): Text/document processing workflows
- [tests/test_timeout_handling.py](tests/test_timeout_handling.py): 60-minute timeout enforcement

#### 3. Regression Tests

Prevent reintroduction of past bugs:

- **System Tag Enforcement**: `test_blob_trigger_skips_tagged_reprocess_artifact()`
- **Idempotency Guards**: `test_blob_trigger_skips_completed_jobs()`
- **Status Canonicalization**: `test_text_processing_uses_canonical_statuses()`

### Running Tests

```bash
# All tests
pytest

# Specific test file
pytest tests/test_analysis_service_responses_api.py

# With coverage
pytest --cov=. --cov-report=html

# Verbose output
pytest -v -s
```

### Test Fixtures

[tests/conftest.py](tests/conftest.py) provides test fixtures:

- `mock_app_config`: Mocked AppConfig with test settings
- `mock_credential`: Mocked DefaultAzureCredential
- `mock_blob_service_client`: Mocked BlobServiceClient
- `mock_cosmos_client`: Mocked CosmosClient
- `mock_openai_client`: Mocked OpenAI client for Responses API

### CI/CD Integration

Tests run in Azure DevOps pipelines on every commit:

1. **Install Dependencies**: `pip install -r requirements.txt`
2. **Run Tests**: `pytest --cov=. --cov-report=xml`
3. **Publish Coverage**: Upload coverage.xml to Azure DevOps
4. **Gate Deployments**: Require >80% coverage and all tests passing

---

## Integration with Backend/Frontend

### Backend API Integration

The Azure Functions pipeline is invoked by the [FastAPI backend](../backend_app) in two ways:

#### 1. Automatic Processing (Blob Trigger)

**Flow**:
1. Frontend uploads file to blob storage via backend `/api/v1/jobs/upload` endpoint
2. Backend creates job document in Cosmos DB with `status=uploaded`
3. Blob creation event triggers `blob_trigger()` function
4. Function updates job status throughout processing lifecycle
5. Backend SSE endpoint streams status updates to frontend

**Backend Code**: [backend_app/app/routers/jobs_router.py](../backend_app/app/routers/jobs_router.py)

#### 2. Manual Reprocessing (HTTP Endpoint)

**Flow**:
1. Frontend requests reprocess via backend `/api/v1/jobs/{job_id}/reprocess` endpoint
2. Backend forwards request to Azure Functions `/api/reprocess-analysis` HTTP endpoint
3. Function regenerates analysis with new prompt/instructions
4. Backend receives response with new analysis file path
5. Frontend polls for updated job or receives SSE event

**Backend Code**: [backend_app/app/routers/jobs_router.py](../backend_app/app/routers/jobs_router.py) → `reprocess_job()`

**HTTP Contract**:
```json
// Request to Azure Functions
POST /api/reprocess-analysis
{
  "job_id": "uuid",
  "prompt_subcategory_id": "new-prompt-id",
  "instructions": "Focus on action items",
  "create_new_job": false,
  "user_id": "user-oid",
  "user_email": "user@example.com"
}

// Response from Azure Functions
{
  "status": "success",
  "message": "Analysis reprocessed",
  "job_id": "uuid",
  "new_job_created": false,
  "analysis_file_path": "https://.../analysis.docx",
  "attempt_number": 2,
  "correlation_id": "trace-id"
}
```

### Frontend Integration

The [TanStack Router frontend](../frontend_app) displays job status and analysis results:

1. **Job List**: Shows current status (uploaded/transcribing/analysing/completed/failed)
2. **Real-Time Updates**: SSE connection streams status changes from backend
3. **Analysis Download**: Generates SAS URL via backend for DOCX download
4. **Reprocess UI**: Form to regenerate analysis with different prompts

**Frontend Code**: [frontend_app/src/routes/jobs.tsx](../frontend_app/src/routes/jobs.tsx)

### Cosmos DB Shared Access

Both backend and Azure Functions read/write to the same Cosmos DB containers:

- **Jobs Container**: `voice_jobs` (job documents)
- **Prompts Container**: `voice_prompts` (prompt templates)
- **Users Container**: `voice_users` (user metadata)

**Consistency**: Both use the same `JobStatus` constants to ensure status compatibility.

### Error Propagation

Azure Functions errors are surfaced to users via:

1. **Cosmos Job Document**: `error_message` field populated on failure
2. **Backend API**: Returns error details in `/api/v1/jobs/{job_id}` response
3. **Frontend UI**: Displays error message in job detail view
4. **Application Insights**: Logs available for debugging

---

## Known Limitations

### 1. 60-Minute Function Timeout vs 5-Hour Transcription Polling

**Problem**: Azure Functions enforces a maximum timeout of 60 minutes (configured as `01:00:00` in [host.json](host.json)), but Azure Speech Batch API can take up to 5 hours to transcribe long audio files (e.g., >2 hour recordings with poor audio quality).

**Manifestation**:
- Audio longer than ~2 hours may timeout before transcription completes
- Job status: `failed` with error message "Processing timeout: exceeded 60 minute limit"
- Transcription job continues running in Speech Service (orphaned)

**Workarounds**:
1. **Fast Transcription API**: Enable `ENABLE_FAST_TRANSCRIPTION=true` for short files (<2 hours)
2. **Split Audio**: Pre-process long recordings into smaller chunks before upload
3. **Durable Functions** (future): Use Durable Functions to poll transcription status beyond 60 minutes
4. **Backend Polling** (future): Move transcription polling to backend with async job queue

**Current Mitigation**: Function logs timeout error and marks job as `failed` to prevent stuck UI state.

### 2. DOCX Generation Fallback to PDF

**Problem**: Markdown → DOCX conversion relies on `markdown-it-py` for AST parsing. If parsing fails (malformed Markdown, unsupported syntax), DOCX generation crashes.

**Fallback**: Catch DOCX errors and regenerate as PDF instead:

```python
try:
    docx_blob_url = storage_service.generate_and_upload_docx(analysis_text, blob_name)
except Exception as docx_error:
    logger.warning("DOCX generation failed, falling back to PDF")
    pdf_blob_url = storage_service.generate_and_upload_pdf(analysis_text, blob_name)
```

**Trade-off**: PDF outputs lack formatting (plain text only) but ensure analysis is always delivered.

### 3. Fast Transcription API Instability

**Problem**: The Fast Transcription API (real-time streaming endpoint) has lower reliability than Batch API for:
- Poor audio quality
- Multi-speaker scenarios
- Long recordings

**Current Strategy**:
- Use Fast API only for files < 2 hours (`FAST_TRANSCRIPTION_THRESHOLD_MINUTES=120`)
- Fall back to Batch API if Fast API fails
- Log Fast API errors for monitoring

### 4. Reasoning API Model Support

**Problem**: Only OpenAI o-series models (gpt-5.1, gpt-5-mini, gpt-5-nano) support the `reasoning.effort` parameter in Responses API. Earlier models (gpt-4.1) reject this parameter with API errors.

**Mitigation**: `AnalysisService` checks model capability before sending reasoning parameter:

```python
reasoning_capable_models = {"gpt-5.1", "gpt-5-mini", "gpt-5-nano"}
if model in reasoning_capable_models:
    request_kwargs["reasoning"] = {"effort": analysis_reasoning}
else:
    logger.warning(f"Model {model} does not support reasoning - ignoring setting")
```

---

## System-Generated Artifacts

### System Tag Pattern

To prevent infinite processing loops, all system-generated artifacts include the `__SYS__` tag in their blob names:

```
{base_name}__SYS___transcription.txt
{base_name}__SYS___analysis.docx
{base_name}__SYS___reprocess_{timestamp}_{suffix}.docx
```

**Tag Constant**: Defined in [services/file_processing_service.py](services/file_processing_service.py):
```python
SYSTEM_GENERATED_TAG = "__SYS__"
```

### Detection Logic

The blob trigger function checks for system tags using two methods:

**1. Primary: Tag Presence**
```python
def is_system_generated_file(blob_name: str) -> bool:
    tag = get_system_generated_tag()  # Returns "__SYS__"
    return tag in blob_name
```

**2. Fallback: Pattern Detection (Defense-in-Depth)**
```python
def _is_reprocess_artifact(blob_path: str) -> bool:
    blob_path_lower = blob_path.lower()
    has_reprocess_pattern = "_reprocess_" in blob_path_lower or "analysis" in blob_path_lower
    is_analysis_format = blob_path_lower.endswith((".docx", ".pdf"))
    return has_reprocess_pattern and is_analysis_format
```

### Reprocess Naming Convention

When the reprocess HTTP endpoint regenerates an analysis, it uses this pattern:

```python
def _build_analysis_blob_name(blob_url: str) -> str:
    relative_path = _strip_container_path(blob_url)
    folder, filename = os.path.split(relative_path)
    base = os.path.splitext(filename)[0]
    tag = get_system_generated_tag()  # "__SYS__"
    timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    suffix = uuid.uuid4().hex[:8]
    new_filename = f"{base}{tag}_reprocess_{timestamp}_{suffix}.docx"
    return f"{folder}/{new_filename}" if folder else new_filename
```

**Example**: `customer_call.mp3` → `customer_call__SYS___reprocess_20260131120000_abc12345.docx`

### Why This Matters

**Before Phase 2**: Reprocess artifacts lacked system tags, causing:
- Blob trigger reprocessing DOCX files as audio
- Invalid job status updates
- `failed` status in Cosmos DB

**After Phase 2**: Tagged artifacts are skipped by blob trigger, preventing loops and invalid states.

---

## Troubleshooting

### Job Stuck in `transcribing` Status

**Symptoms**:
- Job status remains `transcribing` for >1 hour
- Frontend UI shows loading spinner indefinitely
- No error message in Cosmos DB

**Diagnosis**:
1. Check Application Insights for correlation_id:
   ```kusto
   traces
   | where customDimensions.job_id == "job-id"
   | where message contains "Transcription" or message contains "timeout"
   | project timestamp, message, customDimensions
   ```

2. Check if timeout occurred:
   ```kusto
   traces | where message contains "Processing timeout"
   ```

3. Check Speech Service job status via Azure Portal:
   - Navigate to Speech resource → Batch Transcriptions
   - Find job by `transcription_id` from Cosmos DB

**Solutions**:
- If timeout: Audio file too long, consider splitting or using Fast API
- If Speech job failed: Check audio format/quality, try re-uploading
- If Speech job succeeded but status not updated: Manually trigger reprocess

### Reprocess Creates Infinite Loop

**Symptoms**:
- Multiple reprocess attempts created automatically
- Blob trigger processing DOCX files
- Many `failed` jobs in Cosmos DB

**Diagnosis**:
1. Check blob name for `__SYS__` tag:
   ```kusto
   traces
   | where message contains "Skipping system-generated file"
   | project customDimensions.blob_path
   ```

2. Verify blob trigger logs:
   ```kusto
   traces
   | where message contains "BLOB TRIGGER STARTED"
   | project customDimensions.blob_path
   ```

**Solutions**:
- Verify `_build_analysis_blob_name()` calls `get_system_generated_tag()`
- Check for regressions in system tag logic (run `test_reprocess_async.py`)
- Manually delete orphaned artifacts without tags

### Analysis Errors with OpenAI API

**Symptoms**:
- Job status: `failed`
- Error message: "Analysis failed: ..."
- OpenAI API errors in Application Insights

**Diagnosis**:
1. Check API error details:
   ```kusto
   traces
   | where message contains "Analysis failed"
   | project timestamp, customDimensions.error_details
   ```

2. Common error types:
   - **401 Unauthorized**: Managed identity not configured, or wrong scope
   - **400 Bad Request**: Invalid parameters (e.g., reasoning on gpt-4.1)
   - **429 Rate Limited**: Too many concurrent requests
   - **500 Server Error**: Azure OpenAI service issue

**Solutions**:
- **401**: Assign "Cognitive Services OpenAI User" role to Function App managed identity
- **400**: Check model compatibility (reasoning requires gpt-5.x)
- **429**: Implement exponential backoff or increase quota
- **500**: Retry or contact Azure support

### Managed Identity Authentication Failures

**Symptoms**:
- Error: "Failed to acquire authentication token"
- Error: "DefaultAzureCredential failed to retrieve a token"

**Diagnosis**:
1. Check credential chain logs:
   ```kusto
   traces
   | where message contains "DefaultAzureCredential"
   | project timestamp, message, customDimensions
   ```

2. Verify RBAC assignments:
   - Function App → Identity → System assigned → Enabled?
   - Target resource → IAM → Role assignments → Check for Function App identity

**Solutions Local**:
- Run `az login` and `az account set` before local testing
- Set `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_CLIENT_SECRET` environment variables
- Fall back to API keys (not recommended)

**Solutions Azure**:
- Enable system-assigned managed identity on Function App
- Assign required roles (see [Managed Identity](#managed-identity) section)
- Wait 5-10 minutes for role propagation

### DOCX Generation Failures

**Symptoms**:
- Job completed but analysis file is PDF instead of DOCX
- Log warning: "DOCX generation failed, falling back to PDF"

**Diagnosis**:
1. Check storage service logs:
   ```kusto
   traces
   | where message contains "DOCX generation failed"
   | project timestamp, customDimensions
   ```

2. Common causes:
   - Markdown parsing errors (unsupported syntax)
   - Missing `markdown-it-py` dependency
   - Memory limits (very large analyses)

**Solutions**:
- Improve analysis formatting instructions (avoid complex Markdown)
- Update `markdown-it-py` to latest version
- Accept PDF fallback as acceptable degradation

### SAS URL Errors

**Symptoms**:
- Frontend shows "Failed to download file"
- Error: "Failed to generate SAS URL"

**Diagnosis**:
1. Check storage service logs:
   ```kusto
   traces
   | where message contains "SAS" or message contains "generate_sas_url"
   | project timestamp, message, customDimensions
   ```

2. Common causes:
   - Missing "Storage Blob Data Contributor" role
   - Invalid blob URL format
   - Account key not configured (when using account key method)

**Solutions**:
- Prefer user delegation key (managed identity) over account key
- Assign "Storage Blob Data Contributor" to Function App identity
- Verify blob URL format: `https://{account}.blob.core.windows.net/{container}/{blob}`

---

For detailed setup instructions, see [QUICKSTART.md](QUICKSTART.md).

For backend integration details, see [backend_app/README.md](../backend_app/README.md).

For infrastructure deployment, see [infra/README.md](../infra/README.md).
