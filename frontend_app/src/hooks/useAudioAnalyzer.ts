import { useEffect, useRef, useState } from 'react';

/**
 * Real-time audio metrics from the analyzer.
 */
export interface AudioMetrics {
  /** Current instantaneous audio level (0-100) */
  currentLevel: number;
  /** Maximum level reached during recording (0-100) */
  maxLevel: number;
  /** Peak level with slow decay for visual reference (0-100) */
  peakLevel: number;
  /** Running average level for smoothing (0-100) */
  averageLevel: number;
  /** Number of times signal has clipped */
  clipCount: number;
  /** True if audio level has been below threshold for extended period */
  silenceDetected: boolean;
  /** Overall audio quality assessment based on levels */
  quality: 'excellent' | 'good' | 'fair' | 'poor' | 'silent';
}

/**
 * Configuration options for the audio analyzer.
 */
interface UseAudioAnalyzerOptions {
  /** FFT size for frequency analysis (default: 2048) */
  fftSize?: number;
  /** Smoothing constant 0-1, higher = smoother (default: 0.8) */
  smoothingTimeConstant?: number;
  /** Minimum power value in dB (default: -90) */
  minDecibels?: number;
  /** Maximum power value in dB (default: -10) */
  maxDecibels?: number;
  /** Milliseconds between metric updates (default: 50ms = 20fps) */
  updateInterval?: number;
  /** Rate at which peak indicator decays (default: 0.98) */
  peakDecayRate?: number;
  /** Level below which is considered silence (default: 5) */
  silenceThreshold?: number;
  /** Milliseconds of silence before flagging (default: 2000) */
  silenceDuration?: number;
}

const DEFAULT_OPTIONS: Required<UseAudioAnalyzerOptions> = {
  fftSize: 2048,
  smoothingTimeConstant: 0.8,
  minDecibels: -90,
  maxDecibels: -10,
  updateInterval: 50,
  peakDecayRate: 0.98,
  silenceThreshold: 5,
  silenceDuration: 2000,
};

/**
 * Hook for real-time audio analysis during recording.
 *
 * Provides comprehensive audio metrics including levels, peaks, and quality
 * assessment. Uses the Web Audio API's AnalyserNode for efficient real-time
 * audio processing with configurable sensitivity.
 *
 * @description Analyzes a MediaStream in real-time, calculating RMS levels,
 * detecting silence, tracking clipping, and assessing overall audio quality.
 * Automatically cleans up AudioContext resources on unmount.
 *
 * @param {MediaStream | null} stream - The media stream to analyze (from getUserMedia)
 * @param {UseAudioAnalyzerOptions} [options] - Configuration options
 *
 * @returns {AudioMetrics} Real-time audio metrics updated at the configured interval
 *
 * @example
 * ```tsx
 * import { useAudioAnalyzer } from '@/hooks/useAudioAnalyzer';
 *
 * function AudioRecorder() {
 *   const [stream, setStream] = useState<MediaStream | null>(null);
 *   const metrics = useAudioAnalyzer(stream, {
 *     updateInterval: 50,
 *     silenceThreshold: 10,
 *   });
 *
 *   return (
 *     <div>
 *       <LevelMeter level={metrics.currentLevel} peak={metrics.peakLevel} />
 *       <QualityIndicator quality={metrics.quality} />
 *       {metrics.silenceDetected && (
 *         <span className="text-yellow-500">No audio detected</span>
 *       )}
 *       {metrics.clipCount > 0 && (
 *         <span className="text-red-500">Audio clipping detected!</span>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Custom configuration for speech recording
 * const metrics = useAudioAnalyzer(stream, {
 *   silenceThreshold: 8,
 *   silenceDuration: 3000,  // 3 seconds of silence to detect pause
 *   updateInterval: 100,    // Slower updates for less CPU usage
 * });
 * ```
 *
 * @see {@link AudioMetrics} for the returned metrics structure
 */
export function useAudioAnalyzer(
  stream: MediaStream | null,
  options: UseAudioAnalyzerOptions = {}
) {
  const [metrics, setMetrics] = useState<AudioMetrics>({
    currentLevel: 0,
    maxLevel: 0,
    peakLevel: 0,
    averageLevel: 0,
    clipCount: 0,
    silenceDetected: false,
    quality: 'silent',
  });

  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const metricsRef = useRef<AudioMetrics>(metrics);
  const lastUpdateRef = useRef<number>(0);
  const silenceStartRef = useRef<number | null>(null);
  const levelHistoryRef = useRef<Array<number>>([]);

  // Merge options with defaults
  const opts = { ...DEFAULT_OPTIONS, ...options };

  useEffect(() => {
    if (!stream) {
      // Cleanup when stream is removed
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        try {
          if (audioContextRef.current.state !== 'closed') {
            // close() returns a Promise; ensure errors don't bubble
            audioContextRef.current.close().catch(() => {});
          }
        } catch (err) {
          // Defensive: some browsers may throw if context already closed
          console.warn('AudioContext close error (cleanup no stream):', err);
        }
      }
      analyserRef.current = null;
      audioContextRef.current = null;
      dataArrayRef.current = null;
      
      // Reset metrics
      setMetrics({
        currentLevel: 0,
        maxLevel: 0,
        peakLevel: 0,
        averageLevel: 0,
        clipCount: 0,
        silenceDetected: false,
        quality: 'silent',
      });
      
      return;
    }

    // Create audio context and analyser
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);

    // Configure analyser
    analyser.fftSize = opts.fftSize;
    analyser.smoothingTimeConstant = opts.smoothingTimeConstant;
    analyser.minDecibels = opts.minDecibels;
    analyser.maxDecibels = opts.maxDecibels;

    // Connect nodes
    source.connect(analyser);

    // Create data array for time domain data
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // Store refs
    analyserRef.current = analyser;
    audioContextRef.current = audioContext;
    dataArrayRef.current = dataArray;

    // Analysis loop
    const analyze = () => {
      const now = Date.now();
      
      // Throttle updates based on updateInterval
      if (now - lastUpdateRef.current < opts.updateInterval) {
        animationFrameRef.current = requestAnimationFrame(analyze);
        return;
      }
      lastUpdateRef.current = now;

      if (!analyserRef.current || !dataArrayRef.current) {
        return;
      }

      // Get time domain data (waveform)
      // Use 'any' cast to avoid TypeScript's ArrayBuffer vs SharedArrayBuffer generic mismatch
      analyserRef.current.getByteTimeDomainData(dataArrayRef.current as any);

      // Calculate RMS (root mean square) level
      let sum = 0;
      let max = 0;
      let clipping = false;

      for (const sample of dataArrayRef.current) {
        // Convert from 0-255 to -1 to 1
        const normalized = (sample - 128) / 128;
        const absolute = Math.abs(normalized);
        
        sum += absolute * absolute;
        max = Math.max(max, absolute);

        // Detect clipping (values at extremes)
        if (sample <= 1 || sample >= 254) {
          clipping = true;
        }
      }

      // Calculate RMS and convert to percentage (no aggressive scaling)
      const rms = Math.sqrt(sum / dataArrayRef.current.length);
      const currentLevel = Math.min(100, rms * 200); // Gentle scaling for normal speech
      const instantMax = Math.min(100, max * 150); // Peak level

      // Update metrics
      const newMetrics = { ...metricsRef.current };

      // Current level (instantaneous)
      newMetrics.currentLevel = currentLevel;

      // Update max level (never decreases)
      newMetrics.maxLevel = Math.max(newMetrics.maxLevel, instantMax);

      // Update peak level (slow decay)
      if (instantMax > newMetrics.peakLevel) {
        newMetrics.peakLevel = instantMax;
      } else {
        newMetrics.peakLevel *= opts.peakDecayRate;
      }

      // Update level history for averaging (keep last 20 samples)
      levelHistoryRef.current.push(currentLevel);
      if (levelHistoryRef.current.length > 20) {
        levelHistoryRef.current.shift();
      }

      // Calculate running average
      const sum_avg = levelHistoryRef.current.reduce((a, b) => a + b, 0);
      newMetrics.averageLevel = sum_avg / levelHistoryRef.current.length;

      // Track clipping
      if (clipping) {
        newMetrics.clipCount++;
      }

      // Silence detection
      if (currentLevel < opts.silenceThreshold) {
        if (silenceStartRef.current === null) {
          silenceStartRef.current = now;
        } else if (now - silenceStartRef.current > opts.silenceDuration) {
          newMetrics.silenceDetected = true;
        }
      } else {
        silenceStartRef.current = null;
        newMetrics.silenceDetected = false;
      }

      // Quality assessment
      if (newMetrics.silenceDetected || newMetrics.averageLevel < 5) {
        newMetrics.quality = 'silent';
      } else if (newMetrics.clipCount > 10 || newMetrics.averageLevel > 80) {
        newMetrics.quality = 'poor'; // Too loud, likely clipping
      } else if (newMetrics.averageLevel < 15) {
        newMetrics.quality = 'poor'; // Too quiet
      } else if (newMetrics.averageLevel < 25) {
        newMetrics.quality = 'fair';
      } else if (newMetrics.averageLevel < 50) {
        newMetrics.quality = 'good';
      } else {
        newMetrics.quality = 'excellent';
      }

      // Update state
      metricsRef.current = newMetrics;
      setMetrics(newMetrics);

      animationFrameRef.current = requestAnimationFrame(analyze);
    };

    // Start analysis
    animationFrameRef.current = requestAnimationFrame(analyze);

    // Cleanup
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        try {
          if (audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(() => {});
          }
        } catch (err) {
          console.warn('AudioContext close error (effect cleanup):', err);
        }
      }
    };
  }, [stream, opts.fftSize, opts.smoothingTimeConstant, opts.minDecibels, opts.maxDecibels, opts.updateInterval, opts.peakDecayRate, opts.silenceThreshold, opts.silenceDuration]);

  return metrics;
}
