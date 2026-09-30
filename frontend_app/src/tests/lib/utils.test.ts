/**
 * Tests for Tailwind utility functions
 */

import { describe, expect, test } from 'vitest';

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

describe('Module exports verification', () => {
  test('utils.ts should export cn', async () => {
    const utils = await import('@/lib/utils');
    
    expect(typeof utils.cn).toBe('function');
  });
});
