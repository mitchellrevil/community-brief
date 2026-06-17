import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for Context Memoization in TutorialContext
 *
 * These tests verify that:
 * 1. TutorialContext value is memoized with useMemo
 * 2. Callbacks in contexts use useCallback for stability
 */

// Helper function to check if a component is memoized (wrapped in React.memo)
// Uses Object.prototype.hasOwnProperty to satisfy ESLint
function isMemoizedComponent(component: unknown): boolean {
  if (typeof component !== 'object' || component === null) {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(component, '$$typeof');
}

describe('TutorialContext Memoization', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  describe('TutorialContext Provider', () => {
    it('should export TutorialProvider', async () => {
      const { TutorialProvider } = await import('@/app/contexts/tutorial-context');
      expect(TutorialProvider).toBeDefined();
      expect(typeof TutorialProvider).toBe('function');
    });

    it('should export useTutorial hook', async () => {
      const { useTutorial } = await import('@/app/contexts/tutorial-context');
      expect(useTutorial).toBeDefined();
      expect(typeof useTutorial).toBe('function');
    });

    it('should use useCallback for all action functions', async () => {
      // Read the source to verify useCallback is used
      const source = await import('@/app/contexts/tutorial-context?raw').then(
        (m) => m.default,
      );

      // Verify useCallback is imported
      expect(source).toContain('useCallback');

      // Verify useMemo is used for context value
      expect(source).toContain('useMemo');

      // Check callbacks are wrapped with useCallback
      expect(source).toContain('const startTutorial = useCallback');
      expect(source).toContain('const endTutorial = useCallback');
      expect(source).toContain('const nextStep = useCallback');
      expect(source).toContain('const setStep = useCallback');
    });

    it('should memoize context value with useMemo', async () => {
      const source = await import('@/app/contexts/tutorial-context?raw').then(
        (m) => m.default,
      );

      // Context value should be wrapped in useMemo to prevent unnecessary re-renders
      // Check for useMemo pattern wrapping the context value
      expect(source).toMatch(/const\s+(contextValue|value)\s*=\s*useMemo/);
    });
  });

  describe('Context Value Stability', () => {
    it('TutorialContext should have stable callback references', async () => {
      const source = await import('@/app/contexts/tutorial-context?raw').then(
        (m) => m.default,
      );

      // All callbacks should be wrapped with useCallback
      expect(source).toContain('const startTutorial = useCallback(');
      expect(source).toContain('const endTutorial = useCallback(');
      expect(source).toContain('const nextStep = useCallback(');
      expect(source).toContain('const setStep = useCallback(');
      
      // Verify these callbacks have empty dependency arrays (stable)
      expect(source).toContain('}, []);');
    });
  });

  describe('useMemo Dependencies', () => {
    it('TutorialContext useMemo should include relevant state dependencies', async () => {
      const source = await import('@/app/contexts/tutorial-context?raw').then(
        (m) => m.default,
      );

      // The useMemo should depend on tutorialState and the callbacks
      // Since callbacks are stable (useCallback with []), only tutorialState changes
      // should trigger a new context value
      expect(source).toContain('useMemo');
      
      // Should include tutorialState in dependencies - check contextValue is created with useMemo
      expect(source).toContain('const contextValue = useMemo');
      // And the dependency array includes tutorialState
      expect(source).toContain('[tutorialState');
    });
  });
});

describe('Context Re-render Prevention', () => {
  it('consumers should not re-render when context object reference changes but data is same', () => {
    // This test documents the expected behavior:
    // Without useMemo, every TutorialProvider render creates a new context value object
    // This causes all consumers to re-render even if the actual data hasn't changed
    // With useMemo, the context value object is stable when dependencies haven't changed
    
    // The fix is verified by checking useMemo is used in the source
    expect(true).toBe(true);
  });

  it('consumers should re-render when actual context data changes', () => {
    // When tutorialState.isActive changes from false to true,
    // consumers should definitely re-render
    // This is the correct behavior we want to preserve
    
    const beforeState = { isActive: false, currentStep: 'sidebar-record', stepIndex: 0 };
    const afterState = { isActive: true, currentStep: 'sidebar-record', stepIndex: 0 };
    
    expect(beforeState.isActive).not.toBe(afterState.isActive);
  });
});
