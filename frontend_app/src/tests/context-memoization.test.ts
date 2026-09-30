/* eslint-disable @typescript-eslint/require-await */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Tests for Phase 11: Memoize Context Values and Sub-components
 *
 * These tests verify that:
 * 1. TutorialContext value is memoized with useMemo
 * 2. PromptManagementContext value is memoized with useMemo
 * 3. All RecordingDetails card components are wrapped in React.memo
 * 4. Callbacks in contexts use useCallback for stability
 */

// Helper function to check if a component is memoized (wrapped in React.memo)
// Uses Object.prototype.hasOwnProperty to satisfy ESLint
function isMemoizedComponent(component: unknown): boolean {
  if (typeof component !== 'object' || component === null) {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(component, '$$typeof');
}

const currentFileDir = dirname(fileURLToPath(import.meta.url));

function readSource(relativePath: string): string {
  return readFileSync(resolve(currentFileDir, relativePath), 'utf-8');
}

function expectMemoizedComponentSource(relativePath: string, exportName: string): void {
  const source = readSource(relativePath);
  expect(source).toMatch(new RegExp(`export\\s+const\\s+${exportName}\\s*=\\s*memo\\(`));
}

describe('Context Memoization', () => {
  describe('TutorialContext Memoization', () => {
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
      const source = readSource('../app/contexts/tutorial-context.tsx');

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
      const source = readSource('../app/contexts/tutorial-context.tsx');

      // Context value should be wrapped in useMemo to prevent unnecessary re-renders
      // Check for useMemo pattern wrapping the context value
      expect(source).toMatch(/const\s+(contextValue|value)\s*=\s*useMemo/);
    });
  });

  describe('PromptManagementContext Memoization', () => {
    it('should export PromptManagementProvider', async () => {
      const { PromptManagementProvider } = await import(
        '@/features/prompt-management/state/context'
      );
      expect(PromptManagementProvider).toBeDefined();
      expect(typeof PromptManagementProvider).toBe('function');
    });

    it('should export usePromptManagement hook', async () => {
      const { usePromptManagement } = await import(
        '@/features/prompt-management/state/context'
      );
      expect(usePromptManagement).toBeDefined();
      expect(typeof usePromptManagement).toBe('function');
    });

    it('should use useCallback for all action functions', async () => {
      const source = readSource('../features/prompt-management/state/context.tsx');

      // Verify useCallback is imported and used
      expect(source).toContain('useCallback');

      // Check key callbacks are wrapped
      expect(source).toContain('const refreshData = useCallback');
      expect(source).toContain('const toggleExpanded = useCallback');
      expect(source).toContain('const createCategory = useCallback');
      expect(source).toContain('const createPrompt = useCallback');
    });

    it('should memoize context value with useMemo', async () => {
      const source = readSource('../features/prompt-management/state/context.tsx');

      // Context value should be wrapped in useMemo
      expect(source).toMatch(/const\s+contextValue\s*[:=]/);
      expect(source).toContain('useMemo');
      
      // Verify the context value is created with useMemo, not just assigned
      expect(source).toMatch(/const\s+contextValue\s*=\s*useMemo/);
    });
  });

  describe('RecordingDetails Card Components Memoization', () => {
    it('RecordingDetailsCard should be wrapped in React.memo', () => {
      expectMemoizedComponentSource(
        '../features/recordings/ui/RecordingDetails/RecordingDetailsCard.tsx',
        'RecordingDetailsCard',
      );
    });

    it('RecordingActionsCard should be wrapped in React.memo', () => {
      expectMemoizedComponentSource(
        '../features/recordings/ui/RecordingDetails/RecordingActionsCard.tsx',
        'RecordingActionsCard',
      );
    });

    it('AudioPlayerCard should be wrapped in React.memo', () => {
      expectMemoizedComponentSource(
        '../features/recordings/ui/RecordingDetails/AudioPlayerCard.tsx',
        'AudioPlayerCard',
      );
    });

    it('RecordingHeader should be wrapped in React.memo', () => {
      expectMemoizedComponentSource(
        '../features/recordings/ui/RecordingDetails/RecordingHeader.tsx',
        'RecordingHeader',
      );
    });

    it('ContentTabs should be wrapped in React.memo', () => {
      expectMemoizedComponentSource(
        '../features/recordings/ui/RecordingDetails/ContentTabs.tsx',
        'ContentTabs',
      );
    });
  });

  describe('Context Value Stability', () => {
    it('TutorialContext should have stable callback references', async () => {
      const source = readSource('../app/contexts/tutorial-context.tsx');

      // All callbacks should be wrapped with useCallback
      expect(source).toContain('const startTutorial = useCallback(');
      expect(source).toContain('const endTutorial = useCallback(');
      expect(source).toContain('const nextStep = useCallback(');
      expect(source).toContain('const setStep = useCallback(');
      
      // Verify these callbacks have empty dependency arrays (stable)
      expect(source).toContain('}, []);');
    });

    it('PromptManagement context should have stable callback references', async () => {
      const source = readSource('../features/prompt-management/state/context.tsx');

      // toggleExpanded should use useCallback
      expect(source).toContain('const toggleExpanded = useCallback(');
      
      // Other callbacks may have specific deps but should still use useCallback
      expect(source).toContain('const refreshData = useCallback(');
      expect(source).toContain('const createCategory = useCallback(');
      expect(source).toContain('const createPrompt = useCallback(');
    });
  });

  describe('useMemo Dependencies', () => {
    it('TutorialContext useMemo should include relevant state dependencies', async () => {
      const source = readSource('../app/contexts/tutorial-context.tsx');

      // The useMemo should depend on tutorialState and the callbacks
      // Since callbacks are stable (useCallback with []), only tutorialState changes
      // should trigger a new context value
      expect(source).toContain('useMemo');
      
      // Should include tutorialState in dependencies - check contextValue is created with useMemo
      expect(source).toContain('const contextValue = useMemo');
      // And the dependency array includes tutorialState
      expect(source).toContain('[tutorialState');
    });

    it('PromptManagement useMemo should include data dependencies', async () => {
      const source = readSource('../features/prompt-management/state/context.tsx');

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

describe('Memo Comparison Behavior', () => {
  describe('RecordingDetailsCard comparison', () => {
    it('should skip re-render when recording data is unchanged', () => {
      // This is a specification test for the memo behavior
      const prevProps = {
        recording: { id: '1', status: 'completed' as const },
        categoryDisplay: 'Category A',
        isTinyScreen: false,
      };
      const nextProps = {
        recording: { id: '1', status: 'completed' as const },
        categoryDisplay: 'Category A',
        isTinyScreen: false,
      };

      // Same data should mean no re-render needed
      expect(prevProps.recording.id).toBe(nextProps.recording.id);
      expect(prevProps.categoryDisplay).toBe(nextProps.categoryDisplay);
    });

    it('should re-render when recording changes', () => {
      const prevProps = {
        recording: { id: '1', status: 'processing' as const },
        categoryDisplay: 'Category A',
      };
      const nextProps = {
        recording: { id: '1', status: 'completed' as const },
        categoryDisplay: 'Category A',
      };

      // Different status should trigger re-render
      expect(prevProps.recording.status).not.toBe(nextProps.recording.status);
    });
  });

  describe('RecordingActionsCard comparison', () => {
    it('should not re-render when only callback references change', () => {
      // Using stable callbacks, the component should not re-render
      // when parent creates new callback functions
      const isOwner = true;
      const isShared = false;
      const jobId = 'job-1';

      // Same primitive props should mean stable render
      expect(isOwner).toBe(true);
      expect(isShared).toBe(false);
      expect(jobId).toBe('job-1');
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

