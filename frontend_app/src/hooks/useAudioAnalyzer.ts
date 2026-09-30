import { useEffect, useState } from "react";

export interface AudioMetrics {
  currentLevel: number;
  maxLevel: number;
}

interface UseAudioAnalyzerOptions {
  fftSize?: number;
  smoothingTimeConstant?: number;
  updateInterval?: number;
}

const EMPTY_METRICS: AudioMetrics = {
  currentLevel: 0,
  maxLevel: 0,
};

export function useAudioAnalyzer(
  stream: MediaStream | null,
  {
    fftSize = 2048,
    smoothingTimeConstant = 0.8,
    updateInterval = 50,
  }: UseAudioAnalyzerOptions = {},
): AudioMetrics {
  const [metrics, setMetrics] = useState<AudioMetrics>(EMPTY_METRICS);

  useEffect(() => {
    if (!stream) {
      setMetrics(EMPTY_METRICS);
      return;
    }

    let audioContext: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let animationFrame: number | null = null;
    let lastUpdate = 0;
    let maxLevel = 0;

    try {
      audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      source = audioContext.createMediaStreamSource(stream);
      analyser.fftSize = fftSize;
      analyser.smoothingTimeConstant = smoothingTimeConstant;
      source.connect(analyser);

      const samples = new Uint8Array(analyser.frequencyBinCount);
      const analyze = (timestamp: number) => {
        if (timestamp - lastUpdate < updateInterval) {
          animationFrame = requestAnimationFrame(analyze);
          return;
        }
        lastUpdate = timestamp;

        try {
          analyser.getByteTimeDomainData(samples);
        } catch (error) {
          console.warn("Audio analysis stopped:", error);
          animationFrame = null;
          return;
        }

        let squaredAmplitudeSum = 0;
        for (const sample of samples) {
          const amplitude = (sample - 128) / 128;
          squaredAmplitudeSum += amplitude * amplitude;
        }

        const rootMeanSquare = Math.sqrt(squaredAmplitudeSum / samples.length);
        const currentLevel = Math.min(100, rootMeanSquare * 200);
        maxLevel = Math.max(maxLevel, currentLevel);
        setMetrics({ currentLevel, maxLevel });
        animationFrame = requestAnimationFrame(analyze);
      };

      animationFrame = requestAnimationFrame(analyze);
    } catch (error) {
      console.warn("Audio analysis is unavailable:", error);
    }

    return () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      source?.disconnect();
      audioContext?.close().catch(() => {});
    };
  }, [stream, fftSize, smoothingTimeConstant, updateInterval]);

  return metrics;
}