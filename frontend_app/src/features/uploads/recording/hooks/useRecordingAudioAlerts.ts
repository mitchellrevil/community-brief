import { useEffect, useRef, useState } from "react";

export type RecordingAudioAlert = "paused-speech" | "no-microphone-input";

export const NO_MIC_INPUT_WARNING_MS = 150_000;
export const PAUSED_SPEECH_WARNING_DELAY_MS = 500;

const MIC_SPEECH_THRESHOLD = 5;
const AUDIO_CHECK_INTERVAL_MS = 250;

interface UseRecordingAudioAlertsOptions {
  currentLevel: number;
  isRecording: boolean;
  isPaused: boolean;
}

export function useRecordingAudioAlerts({
  currentLevel,
  isRecording,
  isPaused,
}: UseRecordingAudioAlertsOptions) {
  const [alert, setAlert] = useState<RecordingAudioAlert | null>(null);
  const currentLevelRef = useRef(currentLevel);
  const lastMicInputAtRef = useRef(Date.now());
  const lastNoInputAlertAtRef = useRef(0);
  const pausedSpeechStartedAtRef = useRef<number | null>(null);
  const pausedSpeechAlertedRef = useRef(false);

  useEffect(() => {
    currentLevelRef.current = currentLevel;
  }, [currentLevel]);

  useEffect(() => {
    if (!isRecording) {
      setAlert(null);
      pausedSpeechStartedAtRef.current = null;
      pausedSpeechAlertedRef.current = false;
      lastNoInputAlertAtRef.current = 0;
      return;
    }

    lastMicInputAtRef.current = Date.now();
    pausedSpeechStartedAtRef.current = null;
    pausedSpeechAlertedRef.current = false;
    setAlert(null);

    const checkAudio = () => {
      const now = Date.now();
      const hasMicInput = currentLevelRef.current > MIC_SPEECH_THRESHOLD;

      if (isPaused) {
        if (!hasMicInput) {
          pausedSpeechStartedAtRef.current = null;
          pausedSpeechAlertedRef.current = false;
          return;
        }

        pausedSpeechStartedAtRef.current ??= now;
        if (
          !pausedSpeechAlertedRef.current &&
          now - pausedSpeechStartedAtRef.current >=
            PAUSED_SPEECH_WARNING_DELAY_MS
        ) {
          pausedSpeechAlertedRef.current = true;
          setAlert("paused-speech");
        }
        return;
      }

      if (hasMicInput) {
        lastMicInputAtRef.current = now;
        lastNoInputAlertAtRef.current = 0;
        setAlert((current) =>
          current === "no-microphone-input" ? null : current,
        );
        return;
      }

      const silenceDuration = now - lastMicInputAtRef.current;
      const timeSinceLastAlert = now - lastNoInputAlertAtRef.current;
      if (
        silenceDuration >= NO_MIC_INPUT_WARNING_MS &&
        (lastNoInputAlertAtRef.current === 0 ||
          timeSinceLastAlert >= NO_MIC_INPUT_WARNING_MS)
      ) {
        lastNoInputAlertAtRef.current = now;
        setAlert("no-microphone-input");
      }
    };

    const interval = window.setInterval(checkAudio, AUDIO_CHECK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [isRecording, isPaused]);

  return {
    alert,
    dismissAlert: () => setAlert(null),
  };
}
