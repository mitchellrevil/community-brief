/**
 * Tests for file utility functions
 */

import { describe, expect, test } from 'vitest';

describe('File Utilities', () => {
  describe('getFileNameFromPath', () => {
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

describe('Module exports verification', () => {
  test('file-utils.ts should export all required functions', async () => {
    const fileUtils = await import('@/lib/file-utils');
    
    expect(typeof fileUtils.isAudioFile).toBe('function');
    expect(typeof fileUtils.getFileNameFromPath).toBe('function');
    expect(typeof fileUtils.formatFileSize).toBe('function');
  });
});
