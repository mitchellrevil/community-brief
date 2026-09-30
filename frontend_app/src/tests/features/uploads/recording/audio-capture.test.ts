import { afterEach, describe, expect, it, vi } from "vitest";
import { createRecordingCapture } from "@/features/uploads/recording/audio-capture";

class FakeTrack extends EventTarget {
  stop = vi.fn();

  constructor(readonly kind: "audio" | "video") {
    super();
  }
}

class FakeStream {
  constructor(private readonly tracks: Array<FakeTrack> = []) {}

  getTracks() {
    return this.tracks;
  }

  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === "audio");
  }
}

describe("createRecordingCapture", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("observes original hybrid sources and removes listeners before cleanup", async () => {
    const micTrack = new FakeTrack("audio");
    const systemAudioTrack = new FakeTrack("audio");
    const displayVideoTrack = new FakeTrack("video");
    const destinationTrack = new FakeTrack("audio");
    const micStream = new FakeStream([micTrack]);
    const displayStream = new FakeStream([systemAudioTrack, displayVideoTrack]);
    const destinationStream = new FakeStream([destinationTrack]);
    const close = vi.fn(() => Promise.resolve());
    const onSourceEnded = vi.fn();

    vi.stubGlobal("MediaStream", FakeStream);
    vi.stubGlobal(
      "AudioContext",
      class {
        createMediaStreamDestination() {
          return { stream: destinationStream };
        }

        createMediaStreamSource() {
          return { connect: vi.fn() };
        }

        close = close;
      },
    );
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(() => Promise.resolve(micStream)),
        getDisplayMedia: vi.fn(() => Promise.resolve(displayStream)),
      },
    });

    const capture = await createRecordingCapture({
      mode: "hybrid",
      voiceIsolation: false,
      onSourceEnded,
    });

    displayVideoTrack.dispatchEvent(new Event("ended"));
    systemAudioTrack.dispatchEvent(new Event("ended"));
    expect(onSourceEnded).toHaveBeenCalledTimes(1);

    capture.cleanup();
    micTrack.dispatchEvent(new Event("ended"));

    expect(onSourceEnded).toHaveBeenCalledTimes(1);
    expect(micTrack.stop).toHaveBeenCalled();
    expect(systemAudioTrack.stop).toHaveBeenCalled();
    expect(displayVideoTrack.stop).toHaveBeenCalled();
    expect(destinationTrack.stop).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });
});
