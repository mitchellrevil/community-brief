import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

/**
 * Tests for useMemoizedCallbacks hook
 */

describe('useMemoizedCallbacks Hook', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  it('should export useMemoizedCallbacks hook', async () => {
    const { useMemoizedCallbacks } = await import('@/hooks/useMemoizedCallbacks');
    expect(useMemoizedCallbacks).toBeDefined();
    expect(typeof useMemoizedCallbacks).toBe('function');
  });

  it('should create stable callback references', async () => {
    const { useMemoizedCallbacks } = await import('@/hooks/useMemoizedCallbacks');

    const mockHandler1 = vi.fn();
    const mockHandler2 = vi.fn();

    const { result, rerender } = renderHook(
      ({ handlers }) => useMemoizedCallbacks(handlers),
      {
        initialProps: {
          handlers: {
            onViewDetails: mockHandler1,
            onPlay: mockHandler2,
          },
        },
      },
    );

    const firstRender = result.current;

    // Rerender with new function references (but same logic)
    rerender({
      handlers: {
        onViewDetails: vi.fn(),
        onPlay: vi.fn(),
      },
    });

    const secondRender = result.current;

    // Callbacks should be stable (same reference)
    expect(firstRender.onViewDetails).toBe(secondRender.onViewDetails);
    expect(firstRender.onPlay).toBe(secondRender.onPlay);
  });

  it('should maintain callback functionality', async () => {
    const { useMemoizedCallbacks } = await import('@/hooks/useMemoizedCallbacks');

    const mockHandler = vi.fn();

    const { result } = renderHook(() =>
      useMemoizedCallbacks({
        onAction: mockHandler,
      }),
    );

    // Call the memoized callback
    result.current.onAction();

    expect(mockHandler).toHaveBeenCalledTimes(1);
  });

  it('should update callback when dependencies change via setter', async () => {
    const { useMemoizedCallbacks } = await import('@/hooks/useMemoizedCallbacks');

    let capturedValue = 'initial';
    const handler1 = () => capturedValue;

    const { result, rerender } = renderHook(
      ({ handler }) =>
        useMemoizedCallbacks({
          getValue: handler,
        }),
      {
        initialProps: { handler: handler1 },
      },
    );

    // Update the captured value
    capturedValue = 'updated';
    const handler2 = () => capturedValue;

    rerender({ handler: handler2 });

    // The callback should use the latest handler
    expect(result.current.getValue()).toBe('updated');
  });
});
