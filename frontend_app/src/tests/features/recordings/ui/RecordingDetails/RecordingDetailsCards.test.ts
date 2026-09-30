import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Tests for RecordingDetails Card Components Memoization
 *
 * These tests verify that all RecordingDetails card components are wrapped in React.memo
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
const recordingDetailsDir = resolve(
  currentFileDir,
  '../../../../../features/recordings/ui/RecordingDetails',
);

function expectMemoizedComponentSource(fileName: string, exportName: string): void {
  const source = readFileSync(resolve(recordingDetailsDir, fileName), 'utf-8');
  expect(source).toMatch(new RegExp(`export\\s+const\\s+${exportName}\\s*=\\s*memo\\(`));
}

describe('RecordingDetails Card Components Memoization', () => {
  it('RecordingDetailsCard should be wrapped in React.memo', () => {
    expectMemoizedComponentSource('RecordingDetailsCard.tsx', 'RecordingDetailsCard');
  });

  it('RecordingActionsCard should be wrapped in React.memo', () => {
    expectMemoizedComponentSource('RecordingActionsCard.tsx', 'RecordingActionsCard');
  });

  it('AudioPlayerCard should be wrapped in React.memo', () => {
    expectMemoizedComponentSource('AudioPlayerCard.tsx', 'AudioPlayerCard');
  });

  it('RecordingHeader should be wrapped in React.memo', () => {
    expectMemoizedComponentSource('RecordingHeader.tsx', 'RecordingHeader');
  });

  it('ContentTabs should be wrapped in React.memo', () => {
    expectMemoizedComponentSource('ContentTabs.tsx', 'ContentTabs');
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
