import { describe, expect, it } from 'vitest';

import {
  getAttemptFileName,
  getDisplayFilename,
  getFileType,
  normalizeAnalysisAttempts,
} from '@/components/lazy/documentViewerAttempts';

describe('documentViewerAttempts', () => {
  it('normalizes attempts with fallback numbering', () => {
    const attempts = normalizeAnalysisAttempts([
      { analysis_file_path: '/analysis/first.docx' },
      { attempt: 4, analysis_file_path: '/analysis/fourth.docx', created_at: '2026-03-06T01:00:00Z' },
    ]);

    expect(attempts).toEqual([
      { attempt: 1, analysis_file_path: '/analysis/first.docx', created_at: undefined },
      { attempt: 4, analysis_file_path: '/analysis/fourth.docx', created_at: '2026-03-06T01:00:00Z' },
    ]);
  });

  it('extracts display filename from URL and local path formats', () => {
    expect(getDisplayFilename('https://blob.example.com/path/file-v2.docx?sv=abc')).toBe('file-v2.docx');
    expect(getDisplayFilename('C:\\data\\analysis\\run-2.txt')).toBe('run-2.txt');
    expect(getDisplayFilename(undefined)).toBe('Unknown file');
  });

  it('detects file types from extension', () => {
    expect(getFileType('/analysis/latest.docx')).toBe('docx');
    expect(getFileType('/analysis/latest.pdf')).toBe('pdf');
    expect(getFileType('/analysis/latest.txt?token=123')).toBe('txt');
    expect(getFileType('/analysis/latest.md?token=123')).toBe('md');
    expect(getFileType('/analysis/latest')).toBe('unknown');
  });

  it('builds attempt-specific download names', () => {
    expect(getAttemptFileName('analysis.docx', 2)).toBe('analysis_v2.docx');
    expect(getAttemptFileName('analysis.md', 2)).toBe('analysis_v2.docx');
    expect(getAttemptFileName('analysis', 3)).toBe('analysis_v3');
  });
});
