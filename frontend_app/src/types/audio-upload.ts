export interface RecordingSettings {
  mime_type?: string;
  source_mime_type?: string;
  sample_rate_hz?: number;
  channels?: number;
  codec?: string;
  bitrate_kbps?: number;
  capture_mode?: "microphone" | "hybrid";
  system_audio_requested?: boolean;
  system_audio_captured?: boolean;
  voice_isolation_enabled?: boolean;
  voice_isolation_applied?: boolean;
  mix_strategy?: "single_mixed_track";
}

/**
 * Client-side acceptance facts retained until the job is created. The server
 * supplies the accepting user from its authenticated request context.
 */
export interface RecordingConsentEvidence {
  accepted: true;
  policy_version: string;
  accepted_at: string;
}

export const RECORDING_CONSENT_POLICY_VERSION = "recording-disclaimer-v1";

export interface AudioUploadMetadata {
  audio_duration_seconds?: number;
  audio_duration_minutes?: number;
  recording_settings?: RecordingSettings;
  recording_consent?: RecordingConsentEvidence;
}
