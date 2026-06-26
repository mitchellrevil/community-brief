/**
 * Transcription Parser Utility
 * Parses transcriptions with speaker labels, timestamps, and confidence scores
 * into structured, displayable segments
 */

export interface TranscriptionSegment {
  id: string;
  speakerId: string;
  speakerLabel: string;
  speakerColor: string;
  timestamp: string;
  startTime: number; // in seconds
  endTime: number; // in seconds
  text: string;
  confidence?: number;
  isHighConfidence: boolean;
}

export interface TranscriptionSpeaker {
  id: string;
  label: string;
  displayName?: string;
  color: string;
  segmentCount: number;
}

export interface ParsedTranscription {
  segments: Array<TranscriptionSegment>;
  speakers: Array<TranscriptionSpeaker>;
  totalDuration: number;
  isValid: boolean;
}

/**
 * Parse timestamp string (HH:MM:SS.mmm or MM:SS.mmm) to seconds
 */
export function parseTimestamp(timestampStr: string): number {
  try {
    const trimmed = timestampStr.trim();
    if (!trimmed) return 0;

    const parts = trimmed.split(':');
    if (parts.length < 2 || parts.length > 3) return 0;

    let hours = 0;
    let minutes = 0;
    let seconds = 0;

    if (parts.length === 3) {
      // HH:MM:SS.mmm format
      hours = parseInt(parts[0], 10) || 0;
      minutes = parseInt(parts[1], 10) || 0;
      const secondsAndMs = parts[2].split('.');
      seconds = parseInt(secondsAndMs[0], 10) || 0;
      const ms = parseInt(secondsAndMs[1], 10) || 0;
      const result = hours * 3600 + minutes * 60 + seconds + ms / 1000;
      return Number.isFinite(result) ? result : 0;
    } else {
      // MM:SS.mmm format
      minutes = parseInt(parts[0], 10) || 0;
      const secondsAndMs = parts[1].split('.');
      seconds = parseInt(secondsAndMs[0], 10) || 0;
      const ms = parseInt(secondsAndMs[1], 10) || 0;
      const result = minutes * 60 + seconds + ms / 1000;
      return Number.isFinite(result) ? result : 0;
    }
  } catch {
    return 0;
  }
}

/**
 * Format seconds to HH:MM:SS.mmm timestamp string
 */
export function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/**
 * Extract confidence score from text (looks for [Confidence: X.XX] pattern)
 */
export function extractConfidence(text: string): { text: string; confidence?: number } {
  const confidenceMatch = text.match(/\[Confidence:\s*([\d.]+)\]/);
  if (confidenceMatch) {
    const confidence = parseFloat(confidenceMatch[1]);
    const cleanText = text.replace(/\s*\[Confidence:\s*[\d.]+\]\s*/, '').trim();
    return { text: cleanText, confidence };
  }
  return { text };
}

/**
 * Generate speaker color based on speaker ID for visual distinction
 */
export function generateSpeakerColor(speakerId: string): string {
  const colors = [
    'bg-blue-500/20 text-blue-700 border-blue-200',      // Blue
    'bg-purple-500/20 text-purple-700 border-purple-200', // Purple
    'bg-pink-500/20 text-pink-700 border-pink-200',       // Pink
    'bg-green-500/20 text-green-700 border-green-200',    // Green
    'bg-orange-500/20 text-orange-700 border-orange-200', // Orange
    'bg-cyan-500/20 text-cyan-700 border-cyan-200',       // Cyan
    'bg-amber-500/20 text-amber-700 border-amber-200',    // Amber
    'bg-red-500/20 text-red-700 border-red-200',          // Red
  ];

  let hash = 0;
  for (let i = 0; i < speakerId.length; i++) {
    hash = ((hash << 5) - hash) + speakerId.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }

  return colors[Math.abs(hash) % colors.length];
}

/**
 * Main parser function for transcription text
 * Parses format like:
 * --- Speaker 1 @ 00:00:00.120 ---
 * --- Speaker 1: Jane Smith @ 00:00:00.120 ---
 * [00:00:00.120] text here [Confidence: 0.69]
 * [00:00:10.919] more text [Confidence: 0.78]
 */
export function parseTranscription(transcriptionText: string): ParsedTranscription {
  if (!transcriptionText || typeof transcriptionText !== 'string') {
    return {
      segments: [],
      speakers: [],
      totalDuration: 0,
      isValid: false,
    };
  }

  const segments: Array<TranscriptionSegment> = [];
  const speakersMap = new Map<string, TranscriptionSpeaker>();
  let maxEndTime = 0;
  let segmentId = 0;

  // Split by speaker sections
  const speakerSections = transcriptionText.split(/---\s*Speaker\s+(\d+|\w+)(?::\s*([^@\r\n]*?))?\s*@\s*([\d:.\s]+)\s*---/);

  // Process alternating speaker info and content
  for (let i = 1; i < speakerSections.length; i += 4) {
    const speakerId = speakerSections[i];
    const displayName = speakerSections[i + 1]?.trim() || undefined;
    const speakerContent = speakerSections[i + 3] || '';

    if (!speakerId || !speakerContent.trim()) continue;

    const speakerLabel = displayName || `Speaker ${speakerId}`;
    if (!speakersMap.has(speakerId)) {
      speakersMap.set(speakerId, {
        id: speakerId,
        label: speakerLabel,
        displayName,
        color: generateSpeakerColor(speakerId),
        segmentCount: 0,
      });
    }

    const speakerColor = speakersMap.get(speakerId)!.color;

    // Split content by timestamp lines
    const lines = speakerContent.split('\n').filter((line) => line.trim());

    for (const line of lines) {
      const timestampMatch = line.match(/\[\s*([\d:.\s]+)\s*\]\s*(.*)/);
      if (!timestampMatch) continue;

      const timestamp = timestampMatch[1].trim();
      let text = timestampMatch[2].trim();

      // Extract confidence if present
      const { text: cleanText, confidence } = extractConfidence(text);
      text = cleanText;

      if (!text) continue;

      const startTime = parseTimestamp(timestamp);
      maxEndTime = Math.max(maxEndTime, startTime);

      const segment: TranscriptionSegment = {
        id: `segment-${segmentId++}`,
        speakerId,
        speakerLabel,
        speakerColor,
        timestamp,
        startTime,
        endTime: startTime, // No end time in format, use same as start
        text,
        confidence,
        isHighConfidence: confidence ? confidence >= 0.75 : false,
      };

      segments.push(segment);
      const speaker = speakersMap.get(speakerId)!;
      speaker.segmentCount++;
    }
  }

  // If no segments found with the detailed format, try simple line-by-line parsing
  if (segments.length === 0) {
    const lines = transcriptionText.split('\n').filter((line) => line.trim());
    const defaultSpeakerId = '1';

    for (const line of lines) {
      if (line.startsWith('---')) continue; // Skip separator lines

      const { text: cleanText, confidence } = extractConfidence(line);
      const trimmedText = cleanText.trim();

      if (!trimmedText) continue;

      if (!speakersMap.has(defaultSpeakerId)) {
        speakersMap.set(defaultSpeakerId, {
          id: defaultSpeakerId,
          label: 'Speaker 1',
          color: generateSpeakerColor(defaultSpeakerId),
          segmentCount: 0,
        });
      }

      const defaultSpeakerColor = speakersMap.get(defaultSpeakerId)!.color;

      const segment: TranscriptionSegment = {
        id: `segment-${segmentId++}`,
        speakerId: defaultSpeakerId,
        speakerLabel: 'Speaker 1',
        speakerColor: defaultSpeakerColor,
        timestamp: '00:00:00.000',
        startTime: 0,
        endTime: 0,
        text: trimmedText,
        confidence,
        isHighConfidence: confidence ? confidence >= 0.75 : false,
      };

      segments.push(segment);
      const speaker = speakersMap.get(defaultSpeakerId)!;
      speaker.segmentCount++;
    }
  }

  return {
    segments,
    speakers: Array.from(speakersMap.values()),
    totalDuration: maxEndTime,
    isValid: segments.length > 0,
  };
}

/**
 * Filter segments by speaker
 */
export function filterSegmentsBySpeaker(
  segments: Array<TranscriptionSegment>,
  speakerId: string
): Array<TranscriptionSegment> {
  return segments.filter((seg) => seg.speakerId === speakerId);
}

/**
 * Filter segments by confidence threshold
 */
export function filterSegmentsByConfidence(
  segments: Array<TranscriptionSegment>,
  minConfidence: number
): Array<TranscriptionSegment> {
  return segments.filter(
    (seg) => seg.confidence === undefined || seg.confidence >= minConfidence
  );
}

/**
 * Search segments by text content
 */
export function searchSegments(
  segments: Array<TranscriptionSegment>,
  query: string
): Array<TranscriptionSegment> {
  const lowerQuery = query.toLowerCase();
  return segments.filter((seg) => seg.text.toLowerCase().includes(lowerQuery));
}

/**
 * Get time range for segments
 */
export function getSegmentTimeRange(
  segments: Array<TranscriptionSegment>
): { startTime: number; endTime: number } {
  if (segments.length === 0) {
    return { startTime: 0, endTime: 0 };
  }

  const startTime = Math.min(...segments.map((s) => s.startTime));
  const endTime = Math.max(...segments.map((s) => s.endTime || s.startTime));

  return { startTime, endTime };
}
