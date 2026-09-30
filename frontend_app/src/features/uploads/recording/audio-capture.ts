export type RecordingMode = "microphone" | "hybrid";

export interface RecordingCapture {
  recordingStream: MediaStream;
  micMonitorStream: MediaStream;
  systemMonitorStream: MediaStream | null;
  systemAudioAvailable: boolean;
  voiceIsolationApplied: boolean;
  cleanup: () => void;
}

interface CreateRecordingCaptureOptions {
  mode: RecordingMode;
  voiceIsolation: boolean;
  onSourceEnded: () => void;
}

export async function createRecordingCapture({
  mode,
  voiceIsolation,
  onSourceEnded,
}: CreateRecordingCaptureOptions): Promise<RecordingCapture> {
  const cleanupTasks: Array<() => void> = [];
  let recordingStream: MediaStream | null = null;
  let sourceEnded = false;

  const watchSource = (stream: MediaStream) => {
    const handleEnded = () => {
      if (sourceEnded) return;
      sourceEnded = true;
      onSourceEnded();
    };
    stream.getTracks().forEach((track) => {
      track.addEventListener("ended", handleEnded, { once: true });
      cleanupTasks.push(() => track.removeEventListener("ended", handleEnded));
    });
  };

  const cleanup = () => cleanupTasks.splice(0).reverse().forEach((task) => task());

  try {
    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: voiceIsolation,
      },
    });
    cleanupTasks.push(() => stopStream(micStream));
    watchSource(micStream);

    const micRecordingStream = micStream;
    let displayStream: MediaStream | null = null;
    let systemMonitorStream: MediaStream | null = null;
    let systemAudioAvailable = false;

    if (mode === "hybrid") {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true,
      });
      cleanupTasks.push(() => stopStream(displayStream));
      watchSource(displayStream);

      const systemTracks = getAudioTracks(displayStream);
      systemAudioAvailable = systemTracks.length > 0;
      systemMonitorStream = systemAudioAvailable ? new MediaStream(systemTracks) : null;
    }

    if (mode === "hybrid" && systemMonitorStream) {
      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();
      audioContext.createMediaStreamSource(micRecordingStream).connect(destination);
      audioContext.createMediaStreamSource(systemMonitorStream).connect(destination);
      recordingStream = destination.stream;
      cleanupTasks.push(() => {
        stopStream(destination.stream);
        audioContext.close().catch(() => {});
      });
    } else {
      recordingStream = micRecordingStream;
    }

    return {
      recordingStream,
      micMonitorStream: micRecordingStream,
      systemMonitorStream,
      systemAudioAvailable,
      voiceIsolationApplied: voiceIsolation,
      cleanup,
    };
  } catch (error) {
    cleanup();
    throw error;
  }
}

function getAudioTracks(stream: MediaStream): Array<MediaStreamTrack> {
  const explicitTracks = stream.getAudioTracks();
  if (explicitTracks.length) return explicitTracks;
  return stream.getTracks().filter((track) => track.kind === "audio");
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}
