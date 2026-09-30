import { describe, expect, test } from 'vitest';
import { parseTranscription } from '@/lib/transcription-parser';

describe('parseTranscription', () => {
  test('renders original Teams WebVTT cues with speakers and timestamps', () => {
    const parsed = parseTranscription([
      'WEBVTT', 'Kind: captions', '',
      'opaque-cue-id',
      '00:00:01.000 --> 00:00:02.500',
      '<v Alex &amp; Sam>Hello &amp; welcome</v>', '',
      '00:00:03.000 --> 00:00:04.000',
      '<v Jordan>Good morning</v>',
    ].join('\n'));

    expect(parsed.isValid).toBe(true);
    expect(parsed.segments.map((segment) => [segment.speakerLabel, segment.text, segment.startTime])).toEqual([
      ['Alex & Sam', 'Hello & welcome', 1],
      ['Jordan', 'Good morning', 3],
    ]);
    expect(parsed.totalDuration).toBe(4);
  });

  test('does not invent a speaker for unattributed Teams captions', () => {
    const parsed = parseTranscription([
      'WEBVTT', '',
      '00:00:01.000 --> 00:00:02.500',
      'Good morning', '',
      '00:00:03.000 --> 00:00:04.000',
      'Hello',
    ].join('\n'));

    expect(parsed.isValid).toBe(true);
    expect(parsed.speakers).toEqual([]);
    expect(parsed.segments.map((segment) => [segment.speakerLabel, segment.text])).toEqual([
      ['', 'Good morning'],
      ['', 'Hello'],
    ]);
  });

  test('shows speaker names from processed Teams VTT text', () => {
    const parsed = parseTranscription([
      '--- Alex (RESEARCH & SUPPORT) ---',
      '  First line',
      '  continues here.',
      '--- Jordan ---',
      '  Reply.',
      '--- Alex (RESEARCH & SUPPORT) ---',
      '  Follow-up.',
    ].join('\n'));

    expect(parsed.speakers.map((speaker) => speaker.label)).toEqual([
      'Alex (RESEARCH & SUPPORT)', 'Jordan',
    ]);
    expect(parsed.segments.map((segment) => segment.speakerLabel)).toEqual([
      'Alex (RESEARCH & SUPPORT)', 'Alex (RESEARCH & SUPPORT)',
      'Jordan', 'Alex (RESEARCH & SUPPORT)',
    ]);
    expect(parsed.segments.map((segment) => segment.text)).toEqual([
      'First line', 'continues here.', 'Reply.', 'Follow-up.',
    ]);
  });

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
