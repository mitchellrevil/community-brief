export interface RecordingSettings {
  mime_type?: string;
  source_mime_type?: string;
  sample_rate_hz?: number;
  channels?: number;
  codec?: string;
  bitrate_kbps?: number;
}

export interface AudioUploadMetadata {
  audio_duration_seconds?: number;
  audio_duration_minutes?: number;
  recording_settings?: RecordingSettings;
}
