/**
 * Tests for display name utility functions
 */

import { describe, expect, test } from 'vitest';

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

describe('Module exports verification', () => {
  test('display-name-utils.ts should export getDisplayName', async () => {
    const displayNameUtils = await import('@/lib/display-name-utils');
    
    expect(typeof displayNameUtils.getDisplayName).toBe('function');
  });
});
