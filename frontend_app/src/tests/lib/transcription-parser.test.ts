import { describe, expect, test } from 'vitest';
import { parseTranscription } from '@/lib/transcription-parser';

describe('parseTranscription', () => {
  test('parses named speaker headers without changing speaker ids', () => {
    const parsed = parseTranscription(
      [
        '--- Speaker 1: Jane Smith @ 00:00:00.120 ---',
        '  [00:00:00.120] Hello',
        '--- Speaker 2 @ 00:00:05.000 ---',
        '  [00:00:05.000] Hi',
      ].join('\n')
    );

    expect(parsed.speakers.map((speaker) => speaker.id)).toEqual(['1', '2']);
    expect(parsed.speakers.map((speaker) => speaker.label)).toEqual(['Jane Smith', 'Speaker 2']);
    expect(parsed.segments[0].speakerLabel).toBe('Jane Smith');
    expect(parsed.isValid).toBe(true);
  });
});
