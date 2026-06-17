/**
 * Tests for error utility functions
 */

import { describe, expect, test } from 'vitest';

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

describe('Module exports verification', () => {
  test('errors module should export normalizeError', async () => {
    const errorUtils = await import('@/lib/errors');

    expect(typeof errorUtils.normalizeError).toBe('function');
  });
});
