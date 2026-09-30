import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAudioAnalyzer } from "@/hooks/useAudioAnalyzer";

describe("useAudioAnalyzer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps recording usable when Web Audio initialization fails", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          throw new DOMException("Audio context limit reached", "NotSupportedError");
        }
      },
    );

    const stream = {} as MediaStream;
    const { result } = renderHook(() => useAudioAnalyzer(stream));

    expect(result.current).toEqual({ currentLevel: 0, maxLevel: 0 });
    expect(warning).toHaveBeenCalledWith(
      "Audio analysis is unavailable:",
      expect.any(DOMException),
    );
  });

  it("reports RMS levels and releases audio resources on unmount", () => {
    let animationCallback: FrameRequestCallback | undefined;
    const cancelAnimationFrame = vi.fn();
    const disconnect = vi.fn();
    const close = vi.fn(() => Promise.resolve());
    const getByteTimeDomainData = vi.fn((samples: Uint8Array) => {
      samples.set([128, 192, 64, 128]);
    });

    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      animationCallback = callback;
      return 1;
    }));
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
    vi.stubGlobal(
      "AudioContext",
      class {
        createAnalyser() {
          return {
            fftSize: 0,
            smoothingTimeConstant: 0,
            frequencyBinCount: 4,
            getByteTimeDomainData,
          };
        }

        createMediaStreamSource() {
          return { connect: vi.fn(), disconnect };
        }

        close = close;
      },
    );

    const { result, unmount } = renderHook(() =>
      useAudioAnalyzer({} as MediaStream),
    );

    act(() => animationCallback?.(100));

    expect(result.current.currentLevel).toBeCloseTo(70.71, 1);
    expect(result.current.maxLevel).toBe(result.current.currentLevel);

    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(disconnect).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });
});