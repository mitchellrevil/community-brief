const AUDIO_EXTENSIONS_BY_MIME: Record<string, string> = {
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/x-wav": "wav",
  "audio/vnd.wave": "wav",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "video/mp4": "mp4",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "audio/webm": "webm",
  "video/webm": "webm",
};

export function getAudioFileExtension(mimeType: string): string | undefined {
  return AUDIO_EXTENSIONS_BY_MIME[mimeType.split(";")[0].trim().toLowerCase()];
}

/** Align known audio names with their MIME type without reading or converting bytes. */
export function normalizeAudioFilename(file: File): File {
  const extension = getAudioFileExtension(file.type);
  if (!extension || file.name.toLowerCase().endsWith(`.${extension}`)) return file;
  const stem = file.name.replace(/\.[^./\\]+$/, "");
  return new File([file], `${stem}.${extension}`, {
    type: file.type,
    lastModified: file.lastModified,
  });
}
