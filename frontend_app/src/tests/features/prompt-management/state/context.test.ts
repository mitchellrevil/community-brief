import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for PromptManagementContext Memoization
 *
 * These tests verify that:
 * 1. PromptManagementContext value is memoized with useMemo
 * 2. Callbacks in context use useCallback for stability
 */

describe('PromptManagementContext Memoization', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  describe('PromptManagementContext Provider', () => {
    it('should export PromptManagementProvider', async () => {
      const { PromptManagementProvider } = await import('@/features/prompt-management/state/context');
      expect(PromptManagementProvider).toBeDefined();
      expect(typeof PromptManagementProvider).toBe('function');
    });

    it('should export usePromptManagement hook', async () => {
      const { usePromptManagement } = await import('@/features/prompt-management/state/context');
      expect(usePromptManagement).toBeDefined();
      expect(typeof usePromptManagement).toBe('function');
    });

    it('should use useCallback for all action functions', async () => {
      const source = await import('@/features/prompt-management/state/context?raw').then((m) => m.default);

      // Verify useCallback is imported and used
      expect(source).toContain('useCallback');

      // Check key callbacks are wrapped
      expect(source).toContain('const refreshData = useCallback');
      expect(source).toContain('const toggleExpanded = useCallback');
      expect(source).toContain('const createCategory = useCallback');
      expect(source).toContain('const createPrompt = useCallback');
    });

    it('should memoize context value with useMemo', async () => {
      const source = await import('@/features/prompt-management/state/context?raw').then((m) => m.default);

      // Context value should be wrapped in useMemo
      expect(source).toMatch(/const\s+contextValue\s*[:=]/);
      expect(source).toContain('useMemo');
      
      // Verify the context value is created with useMemo, not just assigned
      expect(source).toMatch(/const\s+contextValue\s*=\s*useMemo/);
    });
  });

  describe('Context Value Stability', () => {
    it('PromptManagement context should have stable callback references', async () => {
      const source = await import('@/features/prompt-management/state/context?raw').then((m) => m.default);

      // toggleExpanded should use useCallback
      expect(source).toContain('const toggleExpanded = useCallback(');
      
      // Other callbacks may have specific deps but should still use useCallback
      expect(source).toContain('const refreshData = useCallback(');
      expect(source).toContain('const createCategory = useCallback(');
      expect(source).toContain('const createPrompt = useCallback(');
    });
  });

  describe('useMemo Dependencies', () => {
    it('PromptManagement useMemo should include data dependencies', async () => {
      const source = await import('@/features/prompt-management/state/context?raw').then((m) => m.default);

      // The useMemo should include the actual data that consumers need
      expect(source).toContain('useMemo');
      
      // Should be dependent on data, not recreating on every render
      expect(source).toContain('const contextValue = useMemo');
      // Verify it has a dependency array with core data
      expect(source).toContain('categories,');
      expect(source).toContain('prompts,');
    });
  });
});
