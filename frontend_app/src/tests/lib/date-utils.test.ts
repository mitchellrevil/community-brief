/**
 * Tests for utility functions consolidation
 * 
 * These tests verify:
 * 1. All utility functions work correctly after consolidation
 * 2. Import paths are working correctly
 * 3. No broken references
 */

import { describe, expect, test } from 'vitest';

describe('Date Utilities', () => {
  describe('formatDuration', () => {
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

  describe('formatDate', () => {
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

  describe('formatDateTime', () => {
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

  describe('parseDate', () => {
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

describe('Module exports verification', () => {
  test('date-utils.ts should export all required functions', async () => {
    const dateUtils = await import('@/lib/date-utils');
    
    expect(typeof dateUtils.parseDate).toBe('function');
    expect(typeof dateUtils.formatDate).toBe('function');
    expect(typeof dateUtils.formatDuration).toBe('function');
    expect(typeof dateUtils.formatDateTime).toBe('function');
  });
});
