/**
 * Tests for utility functions consolidation (Phase 7)
 * 
 * These tests verify:
 * 1. All utility functions work correctly after consolidation
 * 2. Import paths are working correctly
 * 3. No broken references
 */

import { describe, expect, test } from 'vitest';

describe('Date Utilities Consolidation', () => {
  describe('formatDuration (from date-utils.ts)', () => {
    test('should format seconds into M:SS format', async () => {
      const { formatDuration } = await import('@/lib/date-utils');
      
      expect(formatDuration(0)).toBe('0:00');
      expect(formatDuration(5)).toBe('0:05');
      expect(formatDuration(65)).toBe('1:05');
      expect(formatDuration(125)).toBe('2:05');
    });
    
    test('should format hours correctly into H:MM:SS format', async () => {
      const { formatDuration } = await import('@/lib/date-utils');
      
      expect(formatDuration(3600)).toBe('1:00:00');
      expect(formatDuration(3665)).toBe('1:01:05');
      expect(formatDuration(7325)).toBe('2:02:05');
    });
    
    test('should handle null, undefined, and NaN', async () => {
      const { formatDuration } = await import('@/lib/date-utils');
      
      expect(formatDuration(null)).toBe('-');
      expect(formatDuration(undefined)).toBe('-');
      expect(formatDuration(NaN)).toBe('-');
    });
  });

  describe('formatDate (from date-utils.ts)', () => {
    test('should format date input to localized date string', async () => {
      const { formatDate } = await import('@/lib/date-utils');
      
      // Test with a known date (Jan 15, 2025)
      const dateMs = new Date('2025-01-15T12:00:00Z').getTime();
      const result = formatDate(dateMs);
      
      // Should contain the month, day, and year
      expect(result).toMatch(/Jan/);
      expect(result).toMatch(/15/);
      expect(result).toMatch(/2025/);
    });
    
    test('should return "-" for null/undefined', async () => {
      const { formatDate } = await import('@/lib/date-utils');
      
      expect(formatDate(null)).toBe('-');
      expect(formatDate(undefined)).toBe('-');
      expect(formatDate('')).toBe('-');
    });
    
    test('should handle timestamp in seconds (unix timestamp)', async () => {
      const { formatDate } = await import('@/lib/date-utils');
      
      // Unix timestamp for Jan 15, 2025 (seconds)
      const timestampSeconds = 1736942400;
      const result = formatDate(timestampSeconds);
      
      expect(result).toMatch(/Jan/);
      expect(result).toMatch(/2025/);
    });
  });

  describe('formatDateTime (from date-utils.ts)', () => {
    test('should format date and time together', async () => {
      const { formatDateTime } = await import('@/lib/date-utils');
      
      const dateMs = new Date('2025-01-15T14:30:00Z').getTime();
      const result = formatDateTime(dateMs);
      
      // Should contain "at" and both date and time parts
      expect(result).toContain(' at ');
      expect(result).toMatch(/Jan/);
      expect(result).toMatch(/2025/);
    });
    
    test('should return "-" for invalid input', async () => {
      const { formatDateTime } = await import('@/lib/date-utils');
      
      expect(formatDateTime(null)).toBe('-');
      expect(formatDateTime(undefined)).toBe('-');
    });
  });

  describe('parseDate (from date-utils.ts)', () => {
    test('should parse milliseconds timestamp', async () => {
      const { parseDate } = await import('@/lib/date-utils');
      
      const ms = 1736942400000; // Jan 15, 2025
      const date = parseDate(ms);
      
      expect(date).toBeInstanceOf(Date);
      expect(date?.getFullYear()).toBe(2025);
    });
    
    test('should parse seconds timestamp (auto-detect)', async () => {
      const { parseDate } = await import('@/lib/date-utils');
      
      const seconds = 1736942400; // Jan 15, 2025
      const date = parseDate(seconds);
      
      expect(date).toBeInstanceOf(Date);
      expect(date?.getFullYear()).toBe(2025);
    });
    
    test('should parse ISO date string', async () => {
      const { parseDate } = await import('@/lib/date-utils');
      
      const date = parseDate('2025-01-15T12:00:00Z');
      
      expect(date).toBeInstanceOf(Date);
      expect(date?.getFullYear()).toBe(2025);
    });
    
    test('should return null for invalid input', async () => {
      const { parseDate } = await import('@/lib/date-utils');
      
      expect(parseDate(null)).toBeNull();
      expect(parseDate(undefined)).toBeNull();
      expect(parseDate('')).toBeNull();
      expect(parseDate('invalid-date')).toBeNull();
    });
  });
});

describe('Display Name Utilities', () => {
  describe('getDisplayName', () => {
    test('should return displayname if present', async () => {
      const { getDisplayName } = await import('@/lib/display-name-utils');
      
      const job = { displayname: 'My Recording', file_name: 'audio.mp3' };
      expect(getDisplayName(job)).toBe('My Recording');
    });
    
    test('should fall back to file_name if no displayname', async () => {
      const { getDisplayName } = await import('@/lib/display-name-utils');
      
      const job = { file_name: 'audio.mp3' };
      expect(getDisplayName(job)).toBe('audio.mp3');
    });
    
    test('should return "Untitled Recording" as fallback', async () => {
      const { getDisplayName } = await import('@/lib/display-name-utils');
      
      const job = {};
      expect(getDisplayName(job)).toBe('Untitled Recording');
    });
  });
});

describe('File Utilities', () => {
  describe('getFileNameFromPath (from file-utils.ts)', () => {
    test('should extract filename from URL', async () => {
      const { getFileNameFromPath } = await import('@/lib/file-utils');
      
      expect(getFileNameFromPath('https://example.com/path/to/file.mp3')).toBe('file.mp3');
    });
    
    test('should handle query parameters', async () => {
      const { getFileNameFromPath } = await import('@/lib/file-utils');
      
      expect(getFileNameFromPath('https://example.com/file.mp3?token=abc123')).toBe('file.mp3');
    });
    
    test('should return "Unknown File" for undefined', async () => {
      const { getFileNameFromPath } = await import('@/lib/file-utils');
      
      expect(getFileNameFromPath(undefined)).toBe('Unknown File');
    });
  });
  
  describe('isAudioFile', () => {
    test('should return true for audio file extensions', async () => {
      const { isAudioFile } = await import('@/lib/file-utils');
      
      expect(isAudioFile('recording.mp3')).toBe(true);
      expect(isAudioFile('audio.wav')).toBe(true);
      expect(isAudioFile('music.ogg')).toBe(true);
      expect(isAudioFile('podcast.m4a')).toBe(true);
    });
    
    test('should return false for non-audio files', async () => {
      const { isAudioFile } = await import('@/lib/file-utils');
      
      expect(isAudioFile('document.pdf')).toBe(false);
      expect(isAudioFile('image.png')).toBe(false);
      expect(isAudioFile('video.mp4')).toBe(false);
    });
    
    test('should handle undefined', async () => {
      const { isAudioFile } = await import('@/lib/file-utils');
      
      expect(isAudioFile(undefined)).toBe(false);
    });
  });
  
  describe('formatFileSize', () => {
    test('should format bytes correctly', async () => {
      const { formatFileSize } = await import('@/lib/file-utils');
      
      expect(formatFileSize(0)).toBe('0 B');
      expect(formatFileSize(500)).toBe('500 B');
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(1048576)).toBe('1 MB');
      expect(formatFileSize(1073741824)).toBe('1 GB');
    });
  });
});

describe('Error Utilities', () => {
  describe('getMessageFromError', () => {
    test('should extract message from error object', async () => {
      const { normalizeError } = await import('@/lib/errors');

      const errorWithMessage = { message: 'Something went wrong' };
      expect(normalizeError(errorWithMessage).userMessage).toBe('Something went wrong');
    });

    test('should return default message for unknown error', async () => {
      const { normalizeError } = await import('@/lib/errors');

      expect(normalizeError({}).userMessage).toBe('An unexpected error occurred');
      expect(normalizeError(123).userMessage).toBe('An unexpected error occurred');
    });
  });
});

describe('Utils (Tailwind)', () => {
  describe('cn function', () => {
    test('should merge class names', async () => {
      const { cn } = await import('@/lib/utils');
      
      const result = cn('px-2', 'py-2');
      expect(result).toContain('px-2');
      expect(result).toContain('py-2');
    });
    
    test('should handle conflicting Tailwind classes', async () => {
      const { cn } = await import('@/lib/utils');
      
      // Later class should win
      const result = cn('px-2', 'px-4');
      expect(result).toBe('px-4');
    });
    
    test('should handle conditional classes', async () => {
      const { cn } = await import('@/lib/utils');
      
      // eslint-disable-next-line no-constant-binary-expression, @typescript-eslint/no-unnecessary-condition
      const result = cn('base', false && 'hidden', true && 'visible');
      expect(result).toBe('base visible');
    });
  });
});

describe('date.ts was removed (consolidated into date-utils.ts)', () => {
  // The formatTime function from date.ts has been consolidated
  // into formatDuration in date-utils.ts - verify the replacement works
  test('formatDuration should work as the replacement for old formatTime', async () => {
    const { formatDuration } = await import('@/lib/date-utils');
    
    // Test the same cases that date.ts formatTime handled
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(125)).toBe('2:05');
  });
});

describe('Module exports verification', () => {
  test('date-utils.ts should export all required functions', async () => {
    const dateUtils = await import('@/lib/date-utils');
    
    expect(typeof dateUtils.parseDate).toBe('function');
    expect(typeof dateUtils.formatDate).toBe('function');
    expect(typeof dateUtils.formatDuration).toBe('function');
    expect(typeof dateUtils.formatDateTime).toBe('function');
  });
  
  test('file-utils.ts should export all required functions', async () => {
    const fileUtils = await import('@/lib/file-utils');
    
    expect(typeof fileUtils.isAudioFile).toBe('function');
    expect(typeof fileUtils.getFileNameFromPath).toBe('function');
    expect(typeof fileUtils.formatFileSize).toBe('function');
  });
  
  test('display-name-utils.ts should export getDisplayName', async () => {
    const displayNameUtils = await import('@/lib/display-name-utils');
    
    expect(typeof displayNameUtils.getDisplayName).toBe('function');
  });
  
  test('errors module should export normalizeError', async () => {
    const errorUtils = await import('@/lib/errors');

    expect(typeof errorUtils.normalizeError).toBe('function');
  });
  
  test('utils.ts should export cn', async () => {
    const utils = await import('@/lib/utils');
    
    expect(typeof utils.cn).toBe('function');
  });
});
